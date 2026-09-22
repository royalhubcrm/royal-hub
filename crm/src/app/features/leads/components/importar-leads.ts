import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LeadsService } from '../../../core/services/leads.service';
import { AvisosService } from '../../../core/ui/avisos.service';
import { Gaveta } from '../../../shared/ui/gaveta';
import { lerLeadsDaPlanilha } from '../../../shared/util/planilha';

/** Cola da planilha → confere quantos vão entrar → importa. */
@Component({
  selector: 'app-importar-leads',
  imports: [FormsModule, Gaveta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-gaveta titulo="Importar leads de planilha" [aberta]="aberta()" (fechar)="fechar.emit()">
      <div class="pilha">
        <ol class="passos">
          <li>Abra a planilha (Excel ou Google Sheets) e selecione tudo, <b>com a linha de cabeçalho</b>.</li>
          <li>Copie (Ctrl+C) e cole no campo abaixo (Ctrl+V).</li>
          <li>Confira o resumo e clique em Importar. Telefones que já existem são ignorados.</li>
        </ol>
        <div class="campo">
          <label for="imp-texto">Dados da planilha</label>
          <textarea id="imp-texto" rows="10" class="mono" [ngModel]="texto()" (ngModelChange)="texto.set($event)"
                    [placeholder]="exemplo" aria-describedby="imp-resumo"></textarea>
        </div>
        <p id="imp-resumo" class="aviso info" role="status">
          @if (!texto().trim()) { Colunas reconhecidas: nome, telefone, e-mail, interesse, origem, campanha, temperatura e etapa. }
          @else {
            <b>{{ leitura().leads.length }}</b> lead(s) para importar
            @if (leitura().repetidosNaPlanilha) { · {{ leitura().repetidosNaPlanilha }} repetido(s) na própria planilha }
            @if (leitura().ignorados) { · {{ leitura().ignorados }} linha(s) sem nome e sem telefone }
          }
        </p>
        @if (resultado()) { <p class="aviso" [class.erro]="!!falhas().length" role="alert">{{ resultado() }}</p> }
        @if (falhas().length) {
          <details><summary>Ver o que falhou</summary><ul>@for (f of falhas(); track f) { <li class="pequeno">{{ f }}</li> }</ul></details>
        }
      </div>
      <div rodape>
        <button type="button" class="btn primario" (click)="importar()" [disabled]="ocupado() || !leitura().leads.length">
          {{ ocupado() ? 'Importando ' + feitos() + ' de ' + leitura().leads.length + '…' : 'Importar' }}
        </button>
        <button type="button" class="btn" (click)="fechar.emit()">Fechar</button>
      </div>
    </app-gaveta>
  `,
  styles: `.passos { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; color: var(--slate-700); }`,
})
export class ImportarLeads {
  readonly aberta = input(false);
  readonly fechar = output<void>();
  readonly importou = output<void>();

  private readonly leads = inject(LeadsService);
  private readonly avisos = inject(AvisosService);

  protected readonly exemplo = 'Nome\tTelefone\tInteresse\nMaria Silva\t34 99999-0000\tCasa 3 quartos no Canaã\nJoão Souza\t34 98888-1111\tApartamento até 250 mil';
  protected readonly texto = signal('');
  protected readonly leitura = computed(() => lerLeadsDaPlanilha(this.texto()));
  protected readonly ocupado = signal(false);
  protected readonly feitos = signal(0);
  protected readonly resultado = signal('');
  protected readonly falhas = signal<string[]>([]);

  protected async importar() {
    this.ocupado.set(true);
    this.resultado.set('');
    this.falhas.set([]);
    try {
      const r = await this.leads.importar(this.leitura().leads, (n) => this.feitos.set(n));
      this.resultado.set(`${r.novos} novo(s)` + (r.repetidos ? ` · ${r.repetidos} já existiam` : '') + (r.falhas.length ? ` · ${r.falhas.length} com erro` : '') + '.');
      this.falhas.set(r.falhas);
      if (r.novos) { this.avisos.ok(`${r.novos} lead(s) importado(s).`); this.importou.emit(); }
      if (!r.falhas.length) this.texto.set('');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.ocupado.set(false);
      this.feitos.set(0);
    }
  }
}
