import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { ConversaLida, contarFalas, lerArquivos, trechosParaTreino } from '../../shared/conversas-exportadas';

/**
 * "Aprender com as suas conversas": o administrador escolhe conversas exportadas do
 * WhatsApp (.zip ou .txt), o navegador lê e limpa os dados pessoais, e a IA devolve
 * um guia de estilo para colar no campo "Como ela fala". Nada é gravado sozinho.
 */
@Component({
  selector: 'app-aprender-conversas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="aprender" [open]="lidas().length > 0">
      <summary>Aprender com as suas conversas</summary>
      <p class="mudo pequeno">
        Escolha conversas exportadas do WhatsApp (o .zip do "Exportar conversa", ou o .txt de dentro dele).
        A leitura é feita aqui no seu navegador e os telefones, e-mails, CPF e links são apagados antes de a IA ver.
      </p>

      <div class="linha-botoes">
        <input type="file" id="ap-arquivos" multiple accept=".zip,.txt,.md" (change)="escolher($event)" />
        @if (lidas().length) {
          <button type="button" class="btn pequeno primario" (click)="aprender()" [disabled]="pensando()">
            {{ pensando() ? 'Lendo suas conversas…' : 'Aprender o meu jeito' }}
          </button>
          <button type="button" class="btn pequeno fantasma" (click)="limpar()">Limpar</button>
        }
      </div>

      @if (resumo(); as r) { <p class="mudo pequeno" role="status">{{ r }}</p> }

      @if (estilo()) {
        <div class="campo">
          <label for="ap-estilo">O jeito que a IA encontrou</label>
          <textarea id="ap-estilo" rows="12" [value]="estilo()" (input)="estilo.set($any($event.target).value)"></textarea>
          <span class="ajuda">Leia, corte o que não for você e clique em usar. Só depois de salvar é que passa a valer.</span>
        </div>
        <div class="linha-botoes">
          <button type="button" class="btn pequeno primario" (click)="usar()">Usar este texto em "Como ela fala"</button>
          <button type="button" class="btn pequeno fantasma" (click)="estilo.set('')">Descartar</button>
        </div>
      }
    </details>
  `,
  styles: `
    .aprender { border: 1px solid var(--slate-200); border-radius: var(--raio); padding: 10px 12px; margin-top: 4px;
      display: flex; flex-direction: column; gap: 10px;
      > summary { cursor: pointer; font-size: 13px; font-weight: 600; }
      &:not([open]) > summary { margin: 0; } }
    .linha-botoes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    input[type="file"] { font-size: 12.5px; max-width: 100%; }
    .pequeno { font-size: 12.5px; }
  `,
})
export class AprenderConversas {
  /** O guia de estilo aprovado pelo administrador. */
  readonly aprendido = output<string>();

  private readonly cfg = inject(ConfigService);
  private readonly avisos = inject(AvisosService);

  protected readonly lidas = signal<ConversaLida[]>([]);
  protected readonly estilo = signal('');
  protected readonly pensando = signal(false);

  protected readonly resumo = computed(() => {
    const l = this.lidas();
    if (!l.length) return '';
    const minhas = l.reduce((n, c) => n + c.falas.filter((f) => f.de === 'corretor').length, 0);
    return `${l.length} conversa(s), ${contarFalas(l)} mensagens — ${minhas} suas.`;
  });

  protected async escolher(ev: Event) {
    const alvo = ev.target as HTMLInputElement;
    const arquivos = [...(alvo.files ?? [])];
    if (!arquivos.length) return;
    try {
      const lidas = await lerArquivos(arquivos);
      if (!lidas.length) throw new Error('Não achei mensagens nesses arquivos. Exporte a conversa "sem mídia" e tente de novo.');
      this.lidas.set(lidas);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected limpar() { this.lidas.set([]); this.estilo.set(''); }

  protected async aprender() {
    const trechos = trechosParaTreino(this.lidas());
    if (trechos.length < 200) return this.avisos.erro(new Error('Veio pouca conversa para aprender. Escolha mais arquivos.'));
    this.pensando.set(true);
    try {
      const r = await this.cfg.ia<{ estilo: string }>({ acao: 'aprender', trechos });
      this.estilo.set(r.estilo ?? '');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.pensando.set(false);
    }
  }

  protected usar() {
    const t = this.estilo().trim();
    if (!t) return;
    this.aprendido.emit(t);
    this.avisos.ok('Copiado para "Como ela fala". Confira e salve o cartão.');
  }
}
