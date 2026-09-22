import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

/** Cartão de métrica: rótulo, número grande e uma linha de contexto. Vira link quando tem rota. */
@Component({
  selector: 'app-metrica',
  imports: [RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rota()) {
      <a class="metrica" [class.destaque]="destaque()" [routerLink]="rota()" [queryParams]="params()">
        <ng-container *ngTemplateOutlet="corpo" />
      </a>
    } @else {
      <div class="metrica" [class.destaque]="destaque()"><ng-container *ngTemplateOutlet="corpo" /></div>
    }
    <ng-template #corpo>
      <span class="rotulo">{{ rotulo() }}</span>
      <span class="valor" [style.color]="cor()">{{ valor() }}</span>
      @if (detalhe()) { <span class="detalhe">{{ detalhe() }}</span> }
    </ng-template>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .metrica {
      display: flex; flex-direction: column; gap: 4px; height: 100%; padding: 14px 16px;
      background: var(--superficie); border: 1px solid var(--slate-200); border-radius: var(--raio);
      box-shadow: var(--sombra); color: inherit; text-decoration: none;
      &.destaque { border-top: 3px solid var(--ouro-500); padding-top: 12px; }
    }
    a.metrica:hover { border-color: var(--slate-300); background: #FBFCFE; }
    .rotulo { font: 500 10.5px/1.2 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--slate-600); }
    .valor { font: 500 27px/1.1 var(--mono); letter-spacing: -.02em; color: var(--navy-900); }
    .detalhe { font-size: 12px; color: var(--slate-500); }
    @media (max-width: 400px) { .metrica { padding: 10px 12px; } .valor { font-size: 22px; } }
  `,
})
export class Metrica {
  readonly rotulo = input.required<string>();
  readonly valor = input.required<string | number>();
  readonly detalhe = input<string>('');
  readonly rota = input<string>('');
  readonly params = input<Record<string, string>>({});
  readonly destaque = input(false);
  readonly cor = input<string | null>(null);
}
