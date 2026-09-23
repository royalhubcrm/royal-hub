import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Config, ProvedorIA } from '../../core/models/config.model';
import { ConfigService } from '../../core/services/config.service';
import { AvisosService } from '../../core/ui/avisos.service';

interface Variavel { nome: string; descricao: string }
interface RespostaPrompt {
  padrao: string; atual: string; previa: string; variaveis: Variavel[];
  modelos: Record<ProvedorIA, string>; provedores: ProvedorIA[];
}

const NOMES: Record<ProvedorIA, string> = { groq: 'Groq', gemini: 'Gemini', anthropic: 'Claude' };

/**
 * Aba "Assistente" de Conversas: qual IA responde e o texto do "manual"
 * (system prompt) que ela segue. Só o administrador vê.
 */
@Component({
  selector: 'app-assistente-config',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!carregado()) { <p class="mudo" role="status">Carregando…</p> } @else {
      <div class="colunas">
        <section class="cartao" aria-labelledby="t-modelo">
          <h2 id="t-modelo">Quem responde</h2>
          <div class="pilha">
            <div class="campo">
              <label for="ac-prov">Provedor de IA</label>
              <select id="ac-prov" name="provedor" [ngModel]="provedor()" (ngModelChange)="provedor.set($event)" aria-describedby="ac-prov-ajuda">
                <option value="auto">Automático — tenta na ordem Groq, Claude, Gemini</option>
                @for (p of provedores(); track p) { <option [value]="p">{{ nome(p) }} primeiro (cai para os outros se falhar)</option> }
              </select>
              <span class="ajuda" id="ac-prov-ajuda">
                @if (provedores().length) { Chaves ligadas nas funções: {{ ligadas() }}. }
                @else { Nenhuma chave configurada (GROQ_API_KEY, GEMINI_API_KEY ou ANTHROPIC_API_KEY). }
              </span>
            </div>
            <div class="campo">
              <label for="ac-modelo">Modelo</label>
              <input id="ac-modelo" name="modelo" class="mono" [ngModel]="modelo()" (ngModelChange)="modelo.set($event)"
                     [placeholder]="provedor() === 'auto' ? 'padrão de cada provedor' : 'padrão: ' + (modelos()[provedor()] || '')"
                     [disabled]="provedor() === 'auto'" aria-describedby="ac-modelo-ajuda" />
              <span class="ajuda" id="ac-modelo-ajuda">Em branco usa o padrão. Padrões atuais:
                @for (p of provedores(); track p) { <span class="mono">{{ nome(p) }} = {{ modelos()[p] }}</span>{{ $last ? '' : ' · ' }} }
              </span>
            </div>
          </div>
        </section>

        <section class="cartao prompt" aria-labelledby="t-prompt">
          <header>
            <h2 id="t-prompt">System prompt (o manual da assistente)</h2>
            <span class="etiqueta sem-ponto" [class.ok]="!personalizado()" [class.morno]="personalizado()">{{ personalizado() ? 'Personalizado' : 'Padrão do sistema' }}</span>
          </header>
          <p class="mudo pequeno">É o texto que a IA recebe antes de cada resposta, no WhatsApp e no teste. As variáveis entre chaves são preenchidas na hora
            com os dados de Ajustes (nome da assistente, fatos, estilo) e com a carteira. Clique numa variável para inserir.</p>
          <div class="variaveis" role="list" aria-label="Variáveis disponíveis">
            @for (v of variaveis(); track v.nome) {
              <button type="button" class="chip" role="listitem" (click)="inserir(v.nome)" [title]="v.descricao">{{ '{{' + v.nome + '}}' }}</button>
            }
          </div>
          <div class="campo">
            <label for="ac-texto" class="sr-only">Texto do system prompt</label>
            <textarea #caixa id="ac-texto" name="prompt" class="mono" rows="26" spellcheck="false" [ngModel]="texto()" (ngModelChange)="texto.set($event)"></textarea>
            <span class="ajuda">{{ texto().length }} caracteres.</span>
          </div>
          <div class="linha">
            <button type="button" class="btn primario" (click)="salvar()" [disabled]="salvando()">{{ salvando() ? 'Salvando…' : 'Salvar' }}</button>
            <button type="button" class="btn" (click)="verPrevia()" [disabled]="vendoPrevia()">{{ vendoPrevia() ? 'Montando…' : 'Ver como a IA recebe' }}</button>
            <button type="button" class="btn fantasma empurra" (click)="restaurar()" [disabled]="texto() === padrao()">Restaurar padrão</button>
          </div>
          @if (previa()) {
            <details class="previa" open>
              <summary>Prévia montada agora, com dois imóveis de exemplo da carteira</summary>
              <pre>{{ previa() }}</pre>
            </details>
          }
        </section>
      </div>
    }
  `,
  styles: `
    .colunas { display: grid; gap: 16px; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); align-items: start; }
    .cartao + .cartao { margin-top: 0; }
    .prompt { display: flex; flex-direction: column; gap: 10px; > header { margin-bottom: 0; } }
    .variaveis { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { all: unset; cursor: pointer; font: 500 11.5px/1 var(--mono); padding: 5px 8px; border-radius: 999px;
      background: var(--azul-100); color: var(--navy-700); border: 1px solid #C9D9EA;
      &:hover { background: #D9E6F3; } &:focus-visible { box-shadow: var(--foco); } }
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
  protected readonly provedor = signal<Config['ia_provedor']>('auto');
  protected readonly modelo = signal('');

  protected readonly personalizado = computed(() => this.texto().trim() !== '' && this.texto() !== this.padrao());

  constructor() { void this.carregar(); }

  private async carregar() {
    try {
      const [c, r] = await Promise.all([this.cfg.garantir(), this.cfg.ia<RespostaPrompt>({ acao: 'prompt' })]);
      this.padrao.set(r.padrao);
      this.texto.set(r.atual || r.padrao);
      this.variaveis.set(r.variaveis);
      this.provedores.set(r.provedores);
      this.modelos.set(r.modelos);
      this.provedor.set(c.ia_provedor || 'auto');
      this.modelo.set(c.ia_modelo || '');
      this.carregado.set(true);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected nome(p: ProvedorIA) { return NOMES[p] ?? p; }
  protected ligadas() { return this.provedores().map((p) => this.nome(p)).join(', '); }

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

  protected async salvar() {
    this.salvando.set(true);
    try {
      // texto igual ao padrão é gravado vazio: assim melhorias futuras do padrão valem sem mexer aqui
      const prompt_base = this.texto() === this.padrao() ? '' : this.texto();
      await this.cfg.salvar({ prompt_base, ia_provedor: this.provedor(), ia_modelo: this.provedor() === 'auto' ? '' : this.modelo().trim() });
      this.avisos.ok('Assistente atualizada. Teste na aba ao lado.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }
}
