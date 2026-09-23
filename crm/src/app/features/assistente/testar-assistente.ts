import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { EquipeService } from '../../core/services/equipe.service';
import { TesteAssistente, TesteEditavel, TestesAssistenteService } from '../../core/services/testes-assistente.service';
import { QuandoPipe } from '../../shared/pipes/formatos.pipe';
import { Gaveta } from '../../shared/ui/gaveta';
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
interface Fala { papel: 'cliente' | 'bot'; texto: string; acoes?: string[]; provedor?: Provedor; modelo?: string; ms?: number; marcadores?: Marcadores }

/**
 * Simulador: você escreve como se fosse o cliente e vê o que a assistente
 * responderia — sem mandar nada para ninguém e sem gravar agenda. Ao lado, a
 * ficha que ela vai montando com o que o cliente conta (é o que, na conversa
 * real, vai para o lead, os interesses, as dúvidas e a agenda).
 */
@Component({
  selector: 'app-testar-assistente',
  imports: [FormsModule, BrlPipe, QuandoPipe, Gaveta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="teste">
      <section class="chat" aria-label="Conversa de teste">
        <p class="mudo pequeno">Escreva como se fosse o cliente. Nada é enviado nem gravado.</p>
        <div class="linha modelo">
          <label for="t-modelo">Responder com</label>
          <select id="t-modelo" [ngModel]="provedor()" name="modelo" (ngModelChange)="provedor.set($event)" aria-describedby="t-modelo-ajuda">
            <option value="">Automático (o configurado)</option>
            @for (p of disponiveis(); track p) { <option [value]="p">{{ nome(p) }}</option> }
          </select>
          @if (provedor()) {
            <label for="t-versao" class="sr-only">Modelo</label>
            <select id="t-versao" class="mono" [ngModel]="modelo()" name="versao" (ngModelChange)="modelo.set($event)" title="Modelo do provedor">
              <option value="">padrão ({{ padrao()[provedor()] || '…' }})</option>
              @for (m of listas()[provedor()] ?? []; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          }
          <span class="ajuda" id="t-modelo-ajuda">
            @if (disponiveis().length) { Mande a mesma pergunta em cada modelo para comparar. }
            @else { Nenhuma chave de IA configurada nas funções. }
          </span>
        </div>
        <ol class="falas" #caixa aria-live="polite" aria-label="Mensagens">
          @for (f of falas(); track $index) {
            <li class="fala" [class.bot]="f.papel === 'bot'">
              <span class="autor">{{ f.papel === 'bot' ? 'Assistente' : 'Cliente (você)' }}@if (f.provedor) { <span class="quem">· {{ nome(f.provedor) }}@if (f.modelo) { <span class="mono"> {{ f.modelo }}</span> }@if (f.ms) { · {{ (f.ms / 1000).toFixed(1) }}s }</span> }</span>
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
          <button class="btn primario" type="submit" [disabled]="pensando()">Enviar</button>
          <button class="btn" type="button" (click)="abrirAnotacoes()" [disabled]="!falas().length" title="Guarda a conversa com prós, contras e o que mudar nas instruções">Salvar</button>
          <button class="btn fantasma" type="button" (click)="recomecar()" [disabled]="!falas().length">Limpar</button>
        </form>
        @if (aberto(); as t) {
          <p class="aviso info pequeno">Continuando <b>{{ t.titulo }}</b>. Salvar atualiza as anotações dele.
            <button type="button" class="btn pequeno fantasma" (click)="recomecar()">Começar outro</button></p>
        }

        <section class="salvos" aria-labelledby="t-salvos">
          <header>
            <h2 id="t-salvos">Diálogos salvos <span class="mudo">({{ salvos().length }})</span></h2>
          </header>
          @if (salvos().length) {
            <ul class="lista">
              @for (t of salvos(); track t.id) {
                <li class="salvo">
                  <details>
                    <summary>
                      <span class="titulo">{{ t.titulo || 'Sem título' }}</span>
                      @if (t.nota) { <span class="nota mono" [attr.aria-label]="'Nota ' + t.nota + ' de 5'">{{ estrelas(t.nota) }}</span> }
                      <span class="mudo pequeno">{{ t.falas.length }} msgs · {{ t.provedor ? nome(t.provedor) : 'auto' }}{{ t.modelo ? ' · ' + t.modelo : '' }} · {{ autor(t) }} · {{ t.criado_em | quando }}</span>
                    </summary>
                    <div class="detalhe">
                      @if (t.pros) { <p><b>Prós:</b> {{ t.pros }}</p> }
                      @if (t.contras) { <p><b>Contras:</b> {{ t.contras }}</p> }
                      @if (t.melhoria) { <p><b>Mudar nas instruções:</b> {{ t.melhoria }}</p> }
                      <p class="mudo pequeno">Instruções na hora do teste: {{ t.prompt_base ? 'personalizadas' : 'padrão' }}.</p>
                      <ol class="transcricao">
                        @for (f of t.falas; track $index) { <li [class.bot]="f.papel === 'bot'"><b>{{ f.papel === 'bot' ? 'Assistente' : 'Cliente' }}:</b> {{ f.texto }}</li> }
                      </ol>
                      <div class="linha">
                        <button type="button" class="btn pequeno" (click)="continuar(t)">Continuar</button>
                        <button type="button" class="btn pequeno" (click)="abrirAnotacoes(t)">Editar anotações</button>
                        <button type="button" class="btn pequeno perigo empurra" (click)="excluir(t)">Excluir</button>
                      </div>
                    </div>
                  </details>
                </li>
              }
            </ul>
          } @else { <p class="mudo pequeno">Nenhum ainda. Converse e clique em Salvar.</p> }
        </section>
      </section>

      <aside class="ficha" aria-label="O que a assistente está anotando" aria-live="polite">
        <header>
          <h2>Ficha do cliente</h2>
          <span class="mudo pequeno mono">{{ preenchidos() }} de {{ campos.length }} campos</span>
        </header>
        <p class="mudo pequeno">O que ela anota enquanto conversa. Na conversa real vai para o lead, os interesses, as dúvidas e a agenda.</p>

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
          <button type="button" class="btn pequeno" (click)="copiarJson()" [disabled]="!falas().length">Copiar JSON</button>
        </div>
      </aside>
    </div>

    <app-gaveta titulo="Salvar diálogo" [aberta]="anotando()" [sujo]="anotando()" (fechar)="anotando.set(false)">
      <form id="form-anotacoes" class="pilha" (ngSubmit)="salvarAnotacoes()" novalidate>
        <div class="campo">
          <label for="an-titulo" class="obrigatorio">Título</label>
          <input id="an-titulo" name="titulo" [(ngModel)]="an.titulo" required autofocus placeholder="Ex.: cliente com tudo na 1ª mensagem" />
        </div>
        <fieldset class="campo">
          <legend class="rotulo">Nota (1 = ruim, 5 = ótima)</legend>
          <div class="notas" role="radiogroup">
            @for (n of [1, 2, 3, 4, 5]; track n) {
              <label [class.marcado]="an.nota === n"><input type="radio" name="nota" [value]="n" [(ngModel)]="an.nota" />{{ n }}</label>
            }
          </div>
        </fieldset>
        <div class="campo">
          <label for="an-pros">Prós</label>
          <textarea id="an-pros" name="pros" rows="3" [(ngModel)]="an.pros" placeholder="Ex.: respondeu a dúvida antes de perguntar; anotou o perfil certo"></textarea>
        </div>
        <div class="campo">
          <label for="an-contras">Contras</label>
          <textarea id="an-contras" name="contras" rows="3" [(ngModel)]="an.contras" placeholder="Ex.: elogiou o bairro sem saber; convidou pra visita cedo demais"></textarea>
        </div>
        <div class="campo">
          <label for="an-melhoria">O que mudar nas instruções</label>
          <textarea id="an-melhoria" name="melhoria" rows="3" [(ngModel)]="an.melhoria" placeholder="Ex.: reforçar em NUNCA INVENTE que região é [DUVIDA]"></textarea>
        </div>
        <p class="mudo pequeno">Vai junto: as {{ falas().length }} mensagens, a ficha, o modelo e as instruções da hora.</p>
      </form>
      <div rodape>
        <button type="submit" form="form-anotacoes" class="btn primario" [disabled]="salvandoAnotacoes()">{{ salvandoAnotacoes() ? 'Salvando…' : 'Salvar' }}</button>
        <button type="button" class="btn" (click)="anotando.set(false)">Cancelar</button>
      </div>
    </app-gaveta>
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
    .salvos { margin-top: 8px; display: flex; flex-direction: column; gap: 8px;
      > header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; } h2 { font-size: 13.5px; } }
    .salvo { display: block; padding: 0; details { width: 100%; }
      summary { cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 9px 4px; list-style: none;
        &::-webkit-details-marker { display: none; } &::before { content: '▸'; color: var(--slate-400); } }
      details[open] summary::before { content: '▾'; }
      .titulo { font-weight: 600; } .nota { color: var(--ouro-texto); letter-spacing: .1em; }
      .detalhe { display: flex; flex-direction: column; gap: 8px; padding: 4px 4px 12px 18px; font-size: 13px; } }
    .transcricao { margin: 0; padding: 10px 12px; list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto;
      background: var(--slate-100); border-radius: 6px; font-size: 12.5px;
      li.bot { color: var(--navy-700); } }
    .notas { display: flex; border: 1px solid var(--slate-300); border-radius: 6px; overflow: hidden; width: fit-content;
      label { min-width: 44px; min-height: calc(var(--alvo) - 2px); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-left: 1px solid var(--slate-300); font-weight: 500;
        &:first-child { border-left: 0; } &.marcado { background: var(--primario); color: var(--sobre-primario); }
        input { position: absolute; opacity: 0; width: 1px; height: 1px; } &:has(input:focus-visible) { box-shadow: inset 0 0 0 2px var(--azul-500); } } }
    fieldset.campo { border: 0; margin: 0; padding: 0; } legend.rotulo { padding: 0; margin-bottom: 5px; }
    @media (max-width: 960px) { .teste { grid-template-columns: minmax(0, 1fr); } .ficha { position: static; } }
  `,
})
export class TestarAssistente {
  private readonly cfg = inject(ConfigService);
  private readonly avisos = inject(AvisosService);
  private readonly testes = inject(TestesAssistenteService);
  private readonly equipe = inject(EquipeService);
  private readonly auth = inject(AuthService);
  private readonly caixa = viewChild<ElementRef<HTMLElement>>('caixa');

  // ---- diálogos salvos com anotações
  protected readonly salvos = signal<TesteAssistente[]>([]);
  /** O diálogo salvo que está sendo continuado (salvar atualiza ele). */
  protected readonly aberto = signal<TesteAssistente | null>(null);
  protected readonly anotando = signal(false);
  protected readonly salvandoAnotacoes = signal(false);
  protected an: { id?: string; titulo: string; nota: number | null; pros: string; contras: string; melhoria: string } = this.anotacaoVazia();

  protected readonly campos = CAMPOS_PERFIL;
  protected readonly falas = signal<Fala[]>([]);
  protected readonly pensando = signal(false);
  protected readonly provedor = signal<Provedor | ''>('');
  protected readonly modelo = signal('');
  protected readonly disponiveis = signal<Provedor[]>([]);
  protected readonly listas = signal<Record<string, string[]>>({});
  protected readonly padrao = signal<Record<string, string>>({});
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
    void this.cfg.ia<{ provedores: Provedor[]; listas?: Record<string, string[]>; padrao?: Record<string, string> }>({ acao: 'provedores' })
      .then((r) => { this.disponiveis.set(r.provedores); this.listas.set(r.listas ?? {}); this.padrao.set(r.padrao ?? {}); })
      .catch(() => { if (DEMO) this.disponiveis.set(['groq', 'gemini']); });
    void this.carregarSalvos();
    void this.equipe.garantirPessoas().catch(() => null);
  }

  private async carregarSalvos() {
    try { this.salvos.set(await this.testes.listar()); } catch (e) { this.avisos.erro(e); }
  }

  protected estrelas(n: number) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
  protected autor(t: TesteAssistente) { return t.autor_id ? this.equipe.nomeDe(t.autor_id) || 'alguém da equipe' : 'sistema'; }
  private anotacaoVazia() { return { titulo: '', nota: null as number | null, pros: '', contras: '', melhoria: '' }; }

  /** Abre a gaveta para salvar a conversa atual (ou editar as anotações de um salvo). */
  protected abrirAnotacoes(t?: TesteAssistente) {
    const base = t ?? this.aberto();
    this.an = base
      ? { id: base.id, titulo: base.titulo, nota: base.nota, pros: base.pros, contras: base.contras, melhoria: base.melhoria }
      : { ...this.anotacaoVazia(), titulo: (this.falas()[0]?.texto ?? '').slice(0, 60) };
    if (t) this.aberto.set(t);
    this.anotando.set(true);
  }

  protected async salvarAnotacoes() {
    if (!this.an.titulo.trim()) return this.avisos.erro('Dê um título para achar depois.');
    this.salvandoAnotacoes.set(true);
    try {
      const editando = this.aberto();
      // anotações de um salvo, sem ter continuado a conversa: mantém as falas dele
      const falasAtuais = this.falas().length ? this.falas() : (editando?.falas ?? []);
      const cfg = this.cfg.config();
      const t: TesteEditavel = {
        id: this.an.id, titulo: this.an.titulo.trim(), nota: this.an.nota,
        pros: this.an.pros.trim(), contras: this.an.contras.trim(), melhoria: this.an.melhoria.trim(),
        provedor: this.provedor() || (this.falas().find((f) => f.provedor)?.provedor ?? ''),
        modelo: this.falas().length ? (this.modelo() || [...this.falas()].reverse().find((f) => f.modelo)?.modelo || '') : editando?.modelo ?? '',
        prompt_base: cfg?.prompt_base ?? editando?.prompt_base ?? '',
        // os marcadores vão junto: ao continuar o diálogo, a ficha se refaz
        falas: falasAtuais.map((f) => ({ papel: f.papel, texto: f.texto, provedor: f.provedor, modelo: f.modelo, ms: f.ms, acoes: f.acoes, marcadores: f.marcadores })),
        ficha: this.falas().length
          ? { perfil: this.perfil(), imoveis: this.imoveis(), duvidas: this.duvidas(), agendamento: this.agendamento() }
          : editando?.ficha ?? {},
      };
      const salvo = await this.testes.salvar(t);
      this.aberto.set(salvo);
      this.anotando.set(false);
      this.avisos.ok(this.an.id ? 'Anotações atualizadas.' : 'Diálogo salvo com as anotações.');
      await this.carregarSalvos();
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvandoAnotacoes.set(false);
    }
  }

  /** Recoloca um diálogo salvo no chat para seguir testando a partir dele. */
  protected continuar(t: TesteAssistente) {
    this.aberto.set(t);
    this.falas.set(t.falas.map((f) => ({ papel: f.papel, texto: f.texto, provedor: f.provedor as Provedor | undefined, modelo: f.modelo, ms: f.ms, acoes: f.acoes, marcadores: f.marcadores as Marcadores | undefined })));
    this.mudouAgora.set(new Set());
    if (t.provedor && (['groq', 'gemini', 'anthropic'] as string[]).includes(t.provedor)) { this.provedor.set(t.provedor as Provedor); this.modelo.set(t.modelo || ''); }
    this.rolar();
    document.getElementById('t-msg')?.focus();
  }

  protected async excluir(t: TesteAssistente) {
    if (!(await this.avisos.confirmar(`Excluir o diálogo "${t.titulo || 'sem título'}"?`, { texto: 'As anotações somem junto.', confirmar: 'Excluir' }))) return;
    try {
      await this.testes.remover(t.id);
      if (this.aberto()?.id === t.id) this.aberto.set(null);
      this.avisos.ok('Diálogo excluído.');
      await this.carregarSalvos();
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected nome(p: string) { return NOMES[p as Provedor] ?? p; }
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
      const r = await this.cfg.ia<{ texto: string; acoes?: string[]; provedor?: Provedor; modelo?: string; ms?: number; marcadores?: Marcadores }>({
        acao: 'chat',
        provedor: this.provedor() || undefined,
        modelo: (this.provedor() && this.modelo()) || undefined,
        mensagens: this.falas().map((f) => ({ papel: f.papel, texto: f.texto })),
      });
      this.falas.update((l) => [...l, { papel: 'bot', texto: r.texto, acoes: r.acoes, provedor: r.provedor, modelo: r.modelo, ms: r.ms, marcadores: r.marcadores }]);
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
    this.aberto.set(null);
  }

  protected copiarJson() {
    this.avisos.copiar(JSON.stringify({ perfil: this.perfil(), imoveis: this.imoveis(), duvidas: this.duvidas(), agendamento: this.agendamento() }, null, 2), 'Ficha copiada.');
  }

  private rolar() {
    setTimeout(() => { const el = this.caixa()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
