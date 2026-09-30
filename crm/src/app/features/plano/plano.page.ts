import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/services/config.service';
import { GrupoPlano, PlanoService } from '../../core/services/plano.service';
import { AvisosService } from '../../core/ui/avisos.service';

/**
 * PDF Personalizado: o plano estratégico de 6 páginas que o corretor entrega ao cliente.
 * Você digita o código do imóvel (ou o nome do empreendimento), o sistema preenche o que
 * já sabe da carteira e dos books, você completa os números e baixa o PDF.
 */
@Component({
  selector: 'app-plano',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabecalho-pagina">
      <div>
        <h1>PDF Personalizado</h1>
        <p>O plano do cliente em 6 páginas, com a sua marca. Comece pelo código do imóvel.</p>
      </div>
    </header>

    <section class="cartao" aria-labelledby="t-busca">
      <h2 id="t-busca">De qual imóvel é o plano?</h2>
      <form class="linha-busca" (ngSubmit)="buscar()">
        <div class="campo cresce">
          <label for="p-busca">Código do imóvel ou nome do empreendimento</label>
          <input id="p-busca" name="busca" [(ngModel)]="busca" placeholder="8685  ·  Chelsea  ·  Los Cabos"
                 aria-describedby="p-busca-ajuda" />
          <span class="ajuda" id="p-busca-ajuda">O que o sistema souber já vem preenchido; o resto você completa.</span>
        </div>
        <button class="btn primario" type="submit" [disabled]="buscando()">{{ buscando() ? 'Procurando…' : 'Buscar' }}</button>
      </form>
      @if (achou()) { <p class="encontrado" role="status">{{ achou() }}</p> }
      @else if (procurou()) { <p class="mudo" role="status">Não achei esse código nem esse empreendimento — pode preencher à mão.</p> }
    </section>

    @if (grupos.length) {
      <form (ngSubmit)="gerar()">
        <div class="grade">
          @for (g of grupos; track g.grupo) {
            <section class="cartao" [attr.aria-label]="g.grupo">
              <h2>{{ g.grupo }}</h2>
              <div class="pilha">
                @for (c of g.campos; track c[0]) {
                  <div class="campo">
                    <label [attr.for]="'c-' + c[0]">{{ c[1] }}</label>
                    <input [id]="'c-' + c[0]" [name]="c[0]" [placeholder]="c[2]"
                           [ngModel]="dados()[c[0]] ?? ''" (ngModelChange)="mudar(c[0], $event)" />
                  </div>
                }
              </div>
            </section>
          }
        </div>
        <div class="rodape-acoes">
          <button class="btn primario" type="submit" [disabled]="gerando()">{{ gerando() ? 'Montando o PDF…' : 'Gerar o PDF' }}</button>
          <span class="mudo pequeno">Precisa, no mínimo, do nome do cliente.</span>
        </div>
      </form>
    }
  `,
  styles: `
    .linha-busca { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap;
      .cresce { flex: 1 1 320px; } button { margin-top: 22px; } }
    .encontrado { margin: 10px 0 0; font-weight: 500; color: var(--verde-700, inherit); }
    .grade { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; margin-top: 16px; }
    .rodape-acoes { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
  `,
})
export default class PlanoPage {
  private readonly servico = inject(PlanoService);
  private readonly cfg = inject(ConfigService);
  private readonly avisos = inject(AvisosService);

  protected busca = '';
  protected readonly grupos: GrupoPlano[];
  protected readonly dados = signal<Record<string, string>>({});
  protected readonly achou = signal('');
  protected readonly procurou = signal(false);
  protected readonly buscando = signal(false);
  protected readonly gerando = signal(false);

  constructor() {
    this.grupos = this.servico.grupos;
    void this.buscar(true);
  }

  protected mudar(chave: string, valor: string) {
    this.dados.update((d) => ({ ...d, [chave]: valor }));
  }

  protected async buscar(inicial = false) {
    this.buscando.set(true);
    try {
      const c = await this.cfg.garantir().catch(() => null);
      const r = await this.servico.preencher(inicial ? '' : this.busca, c as any);
      // o que veio do sistema entra por cima; o que você já digitou fica
      this.dados.update((d) => ({ ...d, ...r.dados }));
      this.achou.set(r.achou ?? '');
      if (!inicial) this.procurou.set(true);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.buscando.set(false);
    }
  }

  protected async gerar() {
    if (!String(this.dados()['nome'] ?? '').trim()) {
      return this.avisos.erro(new Error('Escreva o nome do cliente — é o que abre o plano.'));
    }
    this.gerando.set(true);
    try {
      const arquivo = await this.servico.gerar(this.dados());
      const endereco = URL.createObjectURL(arquivo);
      const a = document.createElement('a');
      a.href = endereco;
      a.download = `plano-${String(this.dados()['nome']).split(/\s+/)[0].toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(endereco), 4000);
      this.avisos.ok('PDF baixado.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.gerando.set(false);
    }
  }
}
