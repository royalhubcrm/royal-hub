import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Config, ProvedorIA } from '../../core/models/config.model';
import { ConfigService } from '../../core/services/config.service';
import { AvisosService } from '../../core/ui/avisos.service';

interface Variavel { nome: string; descricao: string }
interface RespostaPrompt {
  padrao: string; atual: string; previa: string; variaveis: Variavel[];
  modelos: Record<ProvedorIA, string>; provedores: ProvedorIA[]; listas: Record<ProvedorIA, string[]>;
}

const NOMES: Record<ProvedorIA, string> = { groq: 'Groq', gemini: 'Gemini', anthropic: 'Claude' };

/**
 * Aba "Configurar" da Assistente (só o administrador): quando ela responde,
 * a personalidade (nome, fatos, jeito de falar), qual IA responde e — para
 * quem quiser ir fundo — o texto completo das instruções.
 */
@Component({
  selector: 'app-assistente-config',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!carregado()) { <p class="mudo" role="status">Carregando…</p> } @else {
      <div class="colunas">
        <div class="coluna">
          <section class="cartao" aria-labelledby="t-regras">
            <header>
              <h2 id="t-regras">Quando ela responde</h2>
              <span class="etiqueta sem-ponto" [class.ok]="f.bot_ligado" [class.frio]="!f.bot_ligado">{{ f.bot_ligado ? 'Ligada' : 'Desligada' }}</span>
            </header>
            <form class="pilha" (ngSubmit)="salvar(['bot_modo', 'bot_hora_inicio', 'bot_hora_fim', 'bot_numeros'])">
              <div class="campo">
                <label for="r-modo">Quem ela atende</label>
                <select id="r-modo" name="modo" [(ngModel)]="f.bot_modo">
                  <option value="anuncio">Só quem chega pelo anúncio</option>
                  <option value="novos">Contatos novos</option>
                  <option value="todos">Todo mundo</option>
                </select>
              </div>
              <div class="grade-campos">
                <div class="campo"><label for="r-ini">Das</label><input id="r-ini" type="time" name="ini" [(ngModel)]="f.bot_hora_inicio" /></div>
                <div class="campo">
                  <label for="r-fim">Até</label>
                  <input id="r-fim" type="time" name="fim" [(ngModel)]="f.bot_hora_fim" aria-describedby="r-hora-ajuda" />
                  <span class="ajuda" id="r-hora-ajuda">Em branco = o dia inteiro.</span>
                </div>
              </div>
              <div class="campo">
                <label for="r-numeros">Só estes números (modo teste)</label>
                <input id="r-numeros" name="numeros" [(ngModel)]="f.bot_numeros" placeholder="34 99999-0000, 34 98888-1111" aria-describedby="r-num-ajuda" />
                <span class="ajuda" id="r-num-ajuda">Com números aqui, o resto espera você.</span>
              </div>
              <div><button class="btn primario" type="submit" [disabled]="salvando()">Salvar</button></div>
            </form>
          </section>

          <section class="cartao" aria-labelledby="t-pers">
            <h2 id="t-pers">Personalidade</h2>
            <form class="pilha" (ngSubmit)="salvar(['assistente', 'fatos', 'estilo'])">
              <div class="campo"><label for="a-nome">Nome</label><input id="a-nome" name="assistente" [(ngModel)]="f.assistente" /></div>
              <div class="campo">
                <label for="a-fatos">O que ela pode afirmar</label>
                <textarea id="a-fatos" name="fatos" rows="5" [(ngModel)]="f.fatos" aria-describedby="a-fatos-ajuda"></textarea>
                <span class="ajuda" id="a-fatos-ajuda">Uma regra por linha: desconto, documentação, financiamento. Fora disso ela deixa a pergunta para você na Agenda.</span>
              </div>
              <div class="campo">
                <label for="a-estilo">Como ela fala</label>
                <textarea id="a-estilo" name="estilo" rows="6" [(ngModel)]="f.estilo" aria-describedby="a-estilo-ajuda"
                          placeholder="Ex.: chama pelo nome, fala curto, usa 'a gente'."></textarea>
                <span class="ajuda" id="a-estilo-ajuda">Cole mensagens suas: ela imita o jeito.</span>
              </div>
              <div><button class="btn primario" type="submit" [disabled]="salvando()">Salvar</button></div>
            </form>
          </section>
        </div>

        <section class="cartao prompt" aria-labelledby="t-modelo">
          <h2 id="t-modelo">Quem responde</h2>
          <form class="pilha" (ngSubmit)="salvarModelo()">
            <div class="grade-campos">
              <div class="campo">
                <label for="ac-prov">IA</label>
                <select id="ac-prov" name="provedor" [ngModel]="provedor()" (ngModelChange)="provedor.set($event)" aria-describedby="ac-prov-ajuda">
                  <option value="auto">Automático</option>
                  @for (p of provedores(); track p) { <option [value]="p">{{ nome(p) }}</option> }
                </select>
                <span class="ajuda" id="ac-prov-ajuda">
                  @if (!provedores().length) { Nenhuma chave configurada nas funções. }
                  @else if (provedor() === 'auto') { Tenta na ordem {{ ligadas() }}; se uma falhar, passa para a próxima. }
                  @else { Se falhar, cai para as outras. }
                </span>
              </div>
              <div class="campo">
                <label for="ac-modelo">Modelo</label>
                <select id="ac-modelo" name="modelo" class="mono" [ngModel]="escolhaModelo()" (ngModelChange)="escolherModelo($event)"
                        [disabled]="provedor() === 'auto'" aria-describedby="ac-modelo-ajuda">
                  <option value="">Padrão{{ provedor() !== 'auto' && modelos()[provedor()] ? ' (' + modelos()[provedor()] + ')' : '' }}</option>
                  @for (m of listaDoProvedor(); track m) { <option [value]="m">{{ m }}</option> }
                  <option value="__outro">Outro…</option>
                </select>
                @if (escolhaModelo() === '__outro') {
                  <input name="modelo-outro" class="mono" [ngModel]="modelo()" (ngModelChange)="modelo.set($event)" placeholder="nome exato do modelo" aria-label="Nome do modelo" />
                }
                <span class="ajuda" id="ac-modelo-ajuda">
                  @if (provedor() === 'auto') { @for (p of provedores(); track p) { <span class="mono">{{ nome(p) }} = {{ modelos()[p] }}</span>{{ $last ? '' : ' · ' }} } }
                  @else { Lista viva da API: modelo que sai do ar some daqui. }
                </span>
              </div>
            </div>

            <details class="avancado" [open]="personalizado()">
              <summary>
                Instruções completas
                <span class="etiqueta sem-ponto" [class.ok]="!personalizado()" [class.morno]="personalizado()">{{ personalizado() ? 'Personalizadas' : 'Padrão' }}</span>
              </summary>
              <p class="mudo pequeno">O texto que a IA lê antes de cada resposta. As variáveis entre chaves são preenchidas na hora; clique numa para inserir.</p>
              <div class="variaveis" role="list" aria-label="Variáveis disponíveis">
                @for (v of variaveis(); track v.nome) {
                  <button type="button" class="chip" role="listitem" (click)="inserir(v.nome)" [title]="v.descricao">{{ '{{' + v.nome + '}}' }}</button>
                }
              </div>
              <div class="campo">
                <label for="ac-texto" class="sr-only">Texto das instruções</label>
                <textarea #caixa id="ac-texto" name="prompt" class="mono" rows="22" spellcheck="false" [ngModel]="texto()" (ngModelChange)="texto.set($event)"></textarea>
                <span class="ajuda">{{ texto().length }} caracteres.</span>
              </div>
              <div class="linha">
                <button type="button" class="btn pequeno" (click)="verPrevia()" [disabled]="vendoPrevia()">{{ vendoPrevia() ? 'Montando…' : 'Prévia' }}</button>
                <button type="button" class="btn pequeno fantasma" (click)="restaurar()" [disabled]="texto() === padrao()">Voltar ao padrão</button>
              </div>
              @if (previa()) {
                <details class="previa" open>
                  <summary>Como a IA recebe (com dois imóveis de exemplo)</summary>
                  <pre>{{ previa() }}</pre>
                </details>
              }
            </details>

            <div><button class="btn primario" type="submit" [disabled]="salvando()">Salvar</button></div>
          </form>
        </section>
      </div>
    }
  `,
  styles: `
    .colunas { display: grid; gap: 16px; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); align-items: start; }
    .coluna { display: flex; flex-direction: column; gap: 16px; .cartao + .cartao { margin-top: 0; } }
    .cartao > header { margin-bottom: 12px; }
    .avancado { border: 1px solid var(--slate-200); border-radius: var(--raio); padding: 10px 12px; display: flex; flex-direction: column; gap: 10px;
      > summary { cursor: pointer; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      &:not([open]) > summary { margin: 0; } }
    .variaveis { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { all: unset; cursor: pointer; font: 500 11.5px/1 var(--mono); padding: 5px 8px; border-radius: 999px;
      background: var(--azul-100); color: var(--navy-700); border: 1px solid var(--azul-200);
      &:hover { background: var(--azul-200); } &:focus-visible { box-shadow: var(--foco); } }
    textarea.mono { font: 12.5px/1.5 var(--mono); }
    .previa { border: 1px solid var(--slate-200); border-radius: var(--raio); padding: 8px 12px;
      summary { cursor: pointer; font-size: 13px; font-weight: 500; }
      pre { margin: 10px 0 0; white-space: pre-wrap; font: 12px/1.5 var(--mono); color: var(--slate-700); max-height: 420px; overflow-y: auto; } }
    @media (max-width: 960px) { .colunas { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class AssistenteConfig {
  private readonly cfg = inject(ConfigService);
  private readonly avisos = inject(AvisosService);
  private readonly caixa = viewChild<ElementRef<HTMLTextAreaElement>>('caixa');

  protected readonly carregado = signal(false);
  protected readonly salvando = signal(false);
  protected readonly vendoPrevia = signal(false);
  protected readonly padrao = signal('');
  protected readonly texto = signal('');
  protected readonly previa = signal('');
  protected readonly variaveis = signal<Variavel[]>([]);
  protected readonly provedores = signal<ProvedorIA[]>([]);
  protected readonly modelos = signal<Record<string, string>>({});
  protected readonly listas = signal<Record<string, string[]>>({});
  /** O que está escolhido na lista: '' = padrão, '__outro' = digitado à mão, ou o nome do modelo. */
  protected readonly escolhaModelo = signal('');
  protected readonly provedor = signal<Config['ia_provedor']>('auto');
  protected readonly listaDoProvedor = computed(() => (this.provedor() === 'auto' ? [] : this.listas()[this.provedor()] ?? []));
  protected readonly modelo = signal('');
  protected readonly personalizado = computed(() => this.texto().trim() !== '' && this.texto() !== this.padrao());

  /** Regras e personalidade (campos simples da config). */
  protected f: Partial<Config> = {};

  constructor() { void this.carregar(); }

  private async carregar() {
    try {
      const [c, r] = await Promise.all([this.cfg.garantir(), this.cfg.ia<RespostaPrompt>({ acao: 'prompt' })]);
      this.f = { ...c };
      this.padrao.set(r.padrao);
      this.texto.set(r.atual || r.padrao);
      this.variaveis.set(r.variaveis);
      this.provedores.set(r.provedores);
      this.modelos.set(r.modelos);
      this.listas.set(r.listas ?? {});
      this.provedor.set(c.ia_provedor || 'auto');
      this.modelo.set(c.ia_modelo || '');
      const lista = this.listas()[c.ia_provedor] ?? [];
      this.escolhaModelo.set(!c.ia_modelo ? '' : lista.includes(c.ia_modelo) ? c.ia_modelo : '__outro');
      this.carregado.set(true);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected nome(p: string) { return NOMES[p as ProvedorIA] ?? p; }
  protected escolherModelo(v: string) {
    this.escolhaModelo.set(v);
    if (v !== '__outro') this.modelo.set(v);
  }
  protected ligadas() { return this.provedores().map((p) => this.nome(p)).join(' → '); }

  /** Insere {{variavel}} onde o cursor está. */
  protected inserir(nome: string) {
    const el = this.caixa()?.nativeElement;
    const marca = `{{${nome}}}`;
    if (!el) return this.texto.update((t) => t + marca);
    const ini = el.selectionStart ?? el.value.length;
    const fim = el.selectionEnd ?? ini;
    this.texto.set(el.value.slice(0, ini) + marca + el.value.slice(fim));
    setTimeout(() => { el.focus(); el.setSelectionRange(ini + marca.length, ini + marca.length); });
  }

  protected async restaurar() {
    if (this.personalizado() && !(await this.avisos.confirmar('Voltar ao texto padrão?', { texto: 'O texto personalizado some da caixa (só some do banco quando você salvar).', confirmar: 'Restaurar' }))) return;
    this.texto.set(this.padrao());
  }

  protected async verPrevia() {
    this.vendoPrevia.set(true);
    try {
      const r = await this.cfg.ia<RespostaPrompt>({ acao: 'prompt', texto: this.texto() });
      this.previa.set(r.previa);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.vendoPrevia.set(false);
    }
  }

  /** Salva só os campos do cartão que foi enviado. */
  protected async salvar(campos: (keyof Config)[]) {
    const parcial = Object.fromEntries(campos.map((k) => [k, this.f[k]])) as Partial<Config>;
    if ('bot_hora_inicio' in parcial) parcial.bot_hora_inicio = parcial.bot_hora_inicio || null;
    if ('bot_hora_fim' in parcial) parcial.bot_hora_fim = parcial.bot_hora_fim || null;
    await this.gravar(parcial);
  }

  protected async salvarModelo() {
    // texto igual ao padrão é gravado vazio: assim melhorias futuras do padrão valem sem mexer aqui
    const prompt_base = this.texto() === this.padrao() ? '' : this.texto();
    await this.gravar({ prompt_base, ia_provedor: this.provedor(), ia_modelo: this.provedor() === 'auto' ? '' : this.modelo().trim() });
  }

  private async gravar(parcial: Partial<Config>) {
    this.salvando.set(true);
    try {
      const c = await this.cfg.salvar(parcial);
      this.f = { ...this.f, ...c };
      this.avisos.ok('Salvo. Teste na aba ao lado.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }
}
