import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Barras dos leads por dia. O desenho é decorativo para o leitor de tela;
 * os números vão numa tabela escondida logo abaixo (mesma informação).
 */
@Component({
  selector: 'app-grafico-barras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grafico" aria-hidden="true">
      @for (b of barras(); track b.dia) {
        <div class="coluna" [title]="b.rotulo + ': ' + b.n + ' lead(s)'">
          <span class="n">{{ b.n || '' }}</span>
          <span class="barra" [style.height.%]="b.altura" [class.zero]="!b.n"></span>
          <span class="dia">{{ b.curto }}</span>
        </div>
      }
    </div>
    <table class="sr-only">
      <caption>{{ titulo() }}</caption>
      <thead><tr><th scope="col">Dia</th><th scope="col">Leads</th></tr></thead>
      <tbody>@for (b of barras(); track b.dia) { <tr><td>{{ b.rotulo }}</td><td>{{ b.n }}</td></tr> }</tbody>
    </table>
  `,
  styles: `
    .grafico { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 6px; height: 160px; align-items: end; }
    .coluna { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 100%; min-width: 0; overflow: hidden; }
    @media (max-width: 520px) { .grafico { gap: 3px; } .dia { font-size: 9px; } }
    .barra { width: 100%; max-width: 28px; background: var(--azul-500); border-radius: 3px 3px 0 0; min-height: 3px;
      &.zero { background: var(--slate-200); } }
    .n { font: 500 11px/1 var(--mono); color: var(--slate-700); min-height: 11px; }
    .dia { font: 400 10px/1 var(--mono); color: var(--slate-500); white-space: nowrap; }
    @media (max-width: 520px) { .coluna:nth-child(odd) .dia { visibility: hidden; } }
  `,
})
export class GraficoBarras {
  readonly serie = input.required<{ dia: string; n: number }[]>();
  readonly titulo = input('Leads por dia');

  protected readonly barras = computed(() => {
    const s = this.serie() ?? [];
    const max = Math.max(1, ...s.map((x) => x.n));
    return s.map((x) => {
      const [, m, d] = x.dia.split('-');
      return { ...x, altura: (x.n / max) * 82, curto: `${d}/${m}`, rotulo: `${d}/${m}` };
    });
  });
}
