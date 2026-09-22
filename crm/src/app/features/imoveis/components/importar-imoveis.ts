import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../../core/services/config.service';
import { ImoveisService } from '../../../core/services/imoveis.service';
import { AvisosService } from '../../../core/ui/avisos.service';
import { BrlPipe } from '../../../shared/pipes/brl.pipe';
import { Gaveta } from '../../../shared/ui/gaveta';
import { lerImoveisColados } from '../../../shared/util/planilha';

@Component({
  selector: 'app-importar-imoveis',
  imports: [FormsModule, Gaveta, BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-gaveta titulo="Importar imóveis" [aberta]="aberta()" (fechar)="fechar.emit()">
      <div class="pilha">
        <p>Cole uma linha por imóvel, separando os campos com ponto e vírgula, nesta ordem:</p>
        <p class="bloco-codigo">código; tipo; bairro; preço; quartos; suítes; vagas; área</p>
        <p class="mudo pequeno">Também aceita JSON (uma lista de imóveis). Código que já existe é <b>atualizado</b>; código novo é criado.</p>
        <div class="campo">
          <label for="ii-texto">Imóveis</label>
          <textarea id="ii-texto" rows="9" class="mono" [ngModel]="texto()" (ngModelChange)="texto.set($event)"
                    placeholder="8685; Casa; Jardim Karaíba; 890000; 3; 1; 2; 180"></textarea>
        </div>
        @if (itens().length) {
          <div class="tabela-rolagem">
            <table class="tabela">
              <caption class="sr-only">Prévia do que vai ser importado</caption>
              <thead><tr><th scope="col">Código</th><th scope="col">Tipo</th><th scope="col">Bairro</th><th scope="col" class="num">Preço</th></tr></thead>
              <tbody>
                @for (m of itens().slice(0, 8); track m.codigo) {
                  <tr><td class="mono">{{ m.codigo }}</td><td>{{ m.tipo }}</td><td>{{ m.bairro }}</td><td class="num">{{ m.preco | brl }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mudo pequeno" role="status">{{ itens().length }} imóvel(is) reconhecido(s){{ itens().length > 8 ? ' (mostrando 8)' : '' }}.</p>
        }
      </div>
      <div rodape>
        <button type="button" class="btn primario" (click)="importar()" [disabled]="ocupado() || !itens().length">
          {{ ocupado() ? 'Importando…' : 'Importar ' + itens().length }}
        </button>
      </div>
    </app-gaveta>
  `,
})
export class ImportarImoveis {
  readonly aberta = input(false);
  readonly fechar = output<void>();
  readonly importou = output<void>();

  private readonly srv = inject(ImoveisService);
  private readonly avisos = inject(AvisosService);
  private readonly config = inject(ConfigService);

  protected readonly texto = signal('');
  protected readonly ocupado = signal(false);
  protected readonly itens = computed(() => lerImoveisColados(this.texto(), this.config.config()?.cidade || 'Uberlândia'));

  protected async importar() {
    this.ocupado.set(true);
    try {
      const n = await this.srv.importar(this.itens());
      this.avisos.ok(`${n} imóvel(is) importado(s).`);
      this.texto.set('');
      this.importou.emit();
      this.fechar.emit();
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
