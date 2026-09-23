import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/services/config.service';
import { DEMO } from '../../core/supabase/demo';
import { AvisosService } from '../../core/ui/avisos.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

type Provedor = 'groq' | 'gemini' | 'anthropic';
const NOMES: Record<Provedor, string> = { groq: 'Groq', gemini: 'Gemini', anthropic: 'Claude' };

/** Os campos do [PERFIL], na ordem em que aparecem na ficha (os mesmos do prompt). */
const CAMPOS_PERFIL: { chave: string; rotulo: string; tipo?: 'dinheiro' }[] = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'idade', rotulo: 'Idade' },
  { chave: 'regiao', rotulo: 'Região' },
  { chave: 'tipo', rotulo: 'Tipo de imóvel' },
  { chave: 'quartos', rotulo: 'Quartos' },
  { chave: 'teto', rotulo: 'Teto de preço', tipo: 'dinheiro' },
  { chave: 'finalidade', rotulo: 'Finalidade' },
  { chave: 'pagamento', rotulo: 'Pagamento' },
  { chave: 'prazo', rotulo: 'Prazo' },
  { chave: 'familia', rotulo: 'Família' },
  { chave: 'preferencias', rotulo: 'Preferências' },
];

interface ImovelCitado { codigo: string; tipo?: string; bairro?: string; preco?: number; origem: 'opcoes' | 'foto' | 'agendamento' }
interface Agendamento { nome?: string; data?: string; hora?: string; codigo?: string }
/** O que a IA pediu ao sistema nesta resposta (o mesmo que grava no banco na conversa real). */
interface Marcadores { perfil: Record<string, unknown>; duvidas: string[]; agendamento: Agendamento | null; imoveis: ImovelCitado[] }
interface Fala { papel: 'cliente' | 'bot'; texto: string; acoes?: string[]; provedor?: Provedor; ms?: number; marcadores?: Marcadores }

/**
 * Simulador: você escreve como se fosse o cliente e vê o que a assistente
 * responderia — sem mandar nada para ninguém e sem gravar agenda. Ao lado, a
 * ficha que ela vai montando com o que o cliente conta (é o que, na conversa
 * real, vai para o lead, os interesses, as dúvidas e a agenda).
 */
@Component({
  selector: 'app-testar-assistente',
  imports: [FormsModule, BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="teste">
      <section class="chat" aria-label="Conversa de teste">
        <p class="mudo">Escreva como se fosse o cliente — "tem casa de 3 quartos até 600 mil?" — e veja a resposta.
          É só um teste: nada é enviado e nada é gravado. O jeito de falar se ajusta em "Assistente: prompt e modelo".</p>
        <div class="linha modelo">
          <label for="t-modelo">Responder com</label>
          <select id="t-modelo" [ngModel]="provedor()" name="modelo" (ngModelChange)="provedor.set($event)" aria-describedby="t-modelo-ajuda">
            <option value="">Automático (o configurado em "Assistente: prompt e modelo")</option>
            @for (p of disponiveis(); track p) { <option [value]="p">{{ nome(p) }}</option> }
          </select>
          <span class="ajuda" id="t-modelo-ajuda">
            @if (disponiveis().length) { Ligadas: {{ ligadas() }}. Mande a mesma pergunta em cada uma para comparar. }
            @else { Nenhuma chave de IA configurada nas funções (GROQ_API_KEY ou GEMINI_API_KEY). }
          </span>
        </div>
        <ol class="falas" #caixa aria-live="polite" aria-label="Mensagens">
          @for (f of falas(); track $index) {
            <li class="fala" [class.bot]="f.papel === 'bot'">
              <span class="autor">{{ f.papel === 'bot' ? 'Assistente' : 'Cliente (você)' }}@if (f.provedor) { <span class="quem">· {{ nome(f.provedor) }}@if (f.ms) { · {{ (f.ms / 1000).toFixed(1) }}s }</span> }</span>
              <p>{{ f.texto }}</p>
              @if (f.acoes?.length) {
                <ul class="acoes">@for (a of f.acoes; track a) { <li>{{ a }}</li> }</ul>
              }
            </li>
          } @empty {
            <li class="mudo pequeno">A conversa aparece aqui.</li>
          }
          @if (pensando()) { <li class="fala bot"><span class="autor">Assistente</span><p>Consultando a carteira…</p></li> }
        </ol>
        <form class="enviar" (ngSubmit)="enviar()">
          <label class="sr-only" for="t-msg">Mensagem do cliente</label>
          <input id="t-msg" name="msg" [(ngModel)]="texto" placeholder="Mensagem do cliente" autocomplete="off" />
          <button class="btn primario" type="submit" [disabled]="pensando()">Responder</button>
          <button class="btn" type="button" (click)="recomecar()" [disabled]="!falas().length">Recomeçar</button>
        </form>
      </section>

      <aside class="ficha" aria-label="O que a assistente está anotando" aria-live="polite">
        <header>
          <h2>O que ela está anotando</h2>
          <span class="mudo pequeno mono">{{ preenchidos() }} de {{ campos.length }} campos</span>
        </header>
        <p class="mudo pequeno">Em tempo real, a partir do [PERFIL] e dos códigos que a IA emite. Na conversa real isto vai para o lead (campo perfil), os interesses, as dúvidas e a agenda — é a base dos relatórios.</p>

        <dl class="perfil">
          @for (c of campos; track c.chave) {
            <div [class.novo]="mudouAgora().has(c.chave)" [class.vazio]="perfil()[c.chave] == null">
              <dt>{{ c.rotulo }}</dt>
              <dd>
                @if (perfil()[c.chave] != null) {
                  @if (c.tipo === 'dinheiro') { <span class="mono">{{ numero(perfil()[c.chave]) | brl }}</span> }
                  @else { {{ perfil()[c.chave] }} }
                } @else { <span class="mudo">—</span> }
              </dd>
            </div>
          }
        </dl>

        <h3>Imóveis de interesse <span class="mudo">({{ imoveis().length }})</span></h3>
        @if (imoveis().length) {
          <ul class="lista">
            @for (m of imoveis(); track m.codigo + m.origem) {
              <li><span class="mono">{{ m.codigo }}</span>
                <span class="principal">{{ m.tipo ? m.tipo + ' · ' + m.bairro : 'fora da carteira' }}<small>{{ rotuloOrigem(m.origem) }}</small></span>
                @if (m.preco) { <span class="mono pequeno">{{ m.preco | brl }}</span> }
              </li>
            }
          </ul>
        } @else { <p class="mudo pequeno">Nenhum ainda.</p> }

        <h3>Dúvidas para o corretor <span class="mudo">({{ duvidas().length }})</span></h3>
        @if (duvidas().length) {
          <ul class="duvidas">@for (d of duvidas(); track d) { <li>{{ d }}</li> }</ul>
        } @else { <p class="mudo pequeno">Nenhuma.</p> }

        <h3>Visita</h3>
        @if (agendamento(); as a) {
          <p class="visita"><b>{{ a.nome || perfil()['nome'] || 'Cliente' }}</b> · {{ a.data }} {{ a.hora }}@if (a.codigo) { · imóvel {{ a.codigo }} }</p>
        } @else { <p class="mudo pequeno">Não marcada.</p> }

        <div class="linha">
          <button type="button" class="btn pequeno" (click)="copiarJson()" [disabled]="!falas().length">Copiar como JSON</button>
        </div>
      </aside>
    </div>
  `,
  styles: `
    .teste { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 340px); gap: 16px; align-items: start; }
    .chat { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .falas { list-style: none; margin: 0; padding: 14px; min-height: 320px; max-height: 58dvh; overflow-y: auto;
      background: var(--superficie); border: 1px solid var(--slate-200); border-radius: var(--raio); display: flex; flex-direction: column; gap: 8px; }
    .fala { max-width: 80%; align-self: flex-start; padding: 8px 11px; border-radius: 8px; background: var(--slate-100);
      &.bot { align-self: flex-end; background: var(--azul-100); }
      p { white-space: pre-wrap; } .autor { font: 500 10.5px/1.3 var(--mono); text-transform: uppercase; color: var(--slate-500); } }
    .acoes { margin: 6px 0 0; padding-left: 16px; font-size: 12px; color: var(--navy-700); }
    .enviar { display: flex; gap: 8px; }
    .modelo { align-items: flex-start; gap: 4px 10px; label { font-size: 12px; font-weight: 500; color: var(--slate-700); min-height: var(--alvo); display: inline-flex; align-items: center; }
      select { width: auto; min-width: 220px; } .ajuda { flex-basis: 100%; font-size: 12px; color: var(--slate-500); } }
    .quem { font-weight: 400; color: var(--ouro-texto); }

    .ficha { position: sticky; top: 16px; background: var(--superficie); border: 1px solid var(--slate-200); border-radius: var(--raio); box-shadow: var(--sombra);
      padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
      > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      h2 { font-size: 13.5px; } h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--slate-600); margin-top: 6px; } }
    .perfil { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin: 0;
      > div { padding: 6px 8px; border-radius: 6px; background: var(--slate-100); transition: background .3s;
        &.vazio { background: transparent; border: 1px dashed var(--slate-200); }
        &.novo { background: var(--alerta-100); box-shadow: inset 0 0 0 1px var(--ouro-500); } }
      dt { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--slate-500); }
      dd { margin: 0; font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
      > div:last-child { grid-column: 1 / -1; } }
    .lista > * { padding: 6px 0; }
    .duvidas { margin: 0; padding-left: 16px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
    .visita { font-size: 13px; }
    @media (max-width: 960px) { .teste { grid-template-columns: minmax(0, 1fr); } .ficha { position: static; } }
  `,
})
export class TestarAssistente {
  private readonly cfg = inject(ConfigService);
  private readonly avisos = inject(AvisosService);
  private readonly caixa = viewChild<ElementRef<HTMLElement>>('caixa');

  protected readonly campos = CAMPOS_PERFIL;
  protected readonly falas = signal<Fala[]>([]);
  protected readonly pensando = signal(false);
  protected readonly provedor = signal<Provedor | ''>('');
  protected readonly disponiveis = signal<Provedor[]>([]);
  /** Campos do perfil que a última resposta mudou (ficam destacados). */
  protected readonly mudouAgora = signal<Set<string>>(new Set());
  protected texto = '';

  /** A ficha é a soma de tudo o que a IA emitiu na conversa, como no banco. */
  protected readonly perfil = computed(() => {
    const p: Record<string, unknown> = {};
    for (const f of this.falas()) for (const [k, v] of Object.entries(f.marcadores?.perfil ?? {})) if (v !== '' && v != null) p[k] = v;
    return p;
  });
  protected readonly imoveis = computed(() => {
    const vistos = new Map<string, ImovelCitado>();
    for (const f of this.falas()) for (const m of f.marcadores?.imoveis ?? []) vistos.set(m.codigo + m.origem, m);
    return [...vistos.values()];
  });
  protected readonly duvidas = computed(() => this.falas().flatMap((f) => f.marcadores?.duvidas ?? []));
  protected readonly agendamento = computed(() => this.falas().map((f) => f.marcadores?.agendamento).filter(Boolean).at(-1) ?? null);
  protected readonly preenchidos = computed(() => this.campos.filter((c) => this.perfil()[c.chave] != null).length);

  constructor() {
    // na demonstração não há função no servidor: mostra as duas para o layout
    if (DEMO) this.disponiveis.set(['groq', 'gemini']);
    else void this.cfg.ia<{ provedores: Provedor[] }>({ acao: 'provedores' }).then((r) => this.disponiveis.set(r.provedores)).catch(() => null);
  }

  protected nome(p: Provedor) { return NOMES[p] ?? p; }
  protected ligadas() { return this.disponiveis().map((p) => this.nome(p)).join(' e '); }
  protected numero(v: unknown) { return Number(String(v).replace(/[^\d]/g, '')) || 0; }
  protected rotuloOrigem(o: ImovelCitado['origem']) { return o === 'opcoes' ? 'mandaria nas opções' : o === 'foto' ? 'pediu a foto' : 'visita marcada'; }

  protected async enviar() {
    const t = this.texto.trim();
    if (!t) return;
    this.texto = '';
    this.falas.update((l) => [...l, { papel: 'cliente', texto: t }]);
    this.pensando.set(true);
    this.rolar();
    try {
      const antes = this.perfil();
      const r = await this.cfg.ia<{ texto: string; acoes?: string[]; provedor?: Provedor; ms?: number; marcadores?: Marcadores }>({
        acao: 'chat',
        provedor: this.provedor() || undefined,
        mensagens: this.falas().map((f) => ({ papel: f.papel, texto: f.texto })),
      });
      this.falas.update((l) => [...l, { papel: 'bot', texto: r.texto, acoes: r.acoes, provedor: r.provedor, ms: r.ms, marcadores: r.marcadores }]);
      const depois = this.perfil();
      this.mudouAgora.set(new Set(Object.keys(depois).filter((k) => depois[k] !== antes[k])));
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.pensando.set(false);
      this.rolar();
    }
  }

  protected recomecar() {
    this.falas.set([]);
    this.mudouAgora.set(new Set());
  }

  protected copiarJson() {
    this.avisos.copiar(JSON.stringify({ perfil: this.perfil(), imoveis: this.imoveis(), duvidas: this.duvidas(), agendamento: this.agendamento() }, null, 2), 'Ficha copiada.');
  }

  private rolar() {
    setTimeout(() => { const el = this.caixa()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
