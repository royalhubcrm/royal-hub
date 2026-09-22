import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A marca do Royal Hub: coroa-casa em dourado + a palavra.
 * É um desenho vetorial (SVG), então fica nítido em qualquer tamanho, pesa
 * quase nada e funciona no fundo claro e no escuro. O arquivo original da
 * logo está em public/logo-royal.webp.
 */
@Component({
  selector: 'app-marca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="marca" [class.escuro]="escuro()" [style.--altura.px]="altura()">
      <svg class="coroa" viewBox="0 0 120 96" role="img" [attr.aria-label]="somenteSimbolo() ? 'Royal Hub' : null"
           [attr.aria-hidden]="somenteSimbolo() ? null : 'true'" focusable="false">
        <defs>
          <linearGradient [attr.id]="id" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" stop-color="#E0BE6B" />
            <stop offset="0.55" stop-color="#C9A227" />
            <stop offset="1" stop-color="#A97E1E" />
          </linearGradient>
        </defs>
        <g [attr.stroke]="'url(#' + id + ')'" [attr.fill]="'url(#' + id + ')'"
           stroke-width="6" stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="6">
          <!-- o telhado da casa, no meio da coroa -->
          <path d="M31 61 L60 22 L89 61" fill="none" stroke-width="6.5" />
          <!-- as duas pontas laterais, que cruzam o telhado e apontam para a base -->
          <path d="M19 70 L26 24 L58 81" fill="none" />
          <path d="M101 70 L94 24 L62 81" fill="none" />
          <!-- o arremate curvo da base -->
          <path d="M22 72 C33 81 46 85 57 84" fill="none" stroke-width="4.5" />
          <path d="M98 72 C87 81 74 85 63 84" fill="none" stroke-width="4.5" />
          <!-- as pérolas das pontas e da base -->
          <circle cx="60" cy="13" r="6.5" stroke="none" />
          <circle cx="26" cy="19" r="6" stroke="none" />
          <circle cx="94" cy="19" r="6" stroke="none" />
          <circle cx="60" cy="87" r="7" stroke="none" />
          <circle cx="17" cy="72" r="5.5" stroke="none" />
          <circle cx="103" cy="72" r="5.5" stroke="none" />
          <!-- a janelinha da casa -->
          <g stroke="none">
            <rect x="53.4" y="40" width="5.8" height="5.8" rx=".8" />
            <rect x="60.8" y="40" width="5.8" height="5.8" rx=".8" />
            <rect x="53.4" y="47.4" width="5.8" height="5.8" rx=".8" />
            <rect x="60.8" y="47.4" width="5.8" height="5.8" rx=".8" />
          </g>
        </g>
      </svg>
      @if (!somenteSimbolo()) {
        <span class="palavra"><b>Royal</b><i>Hub</i></span>
      }
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .marca { display: inline-flex; align-items: center; gap: .5em; line-height: 1; }
    .coroa { height: var(--altura, 34px); width: auto; display: block; }
    .palavra {
      display: inline-flex; align-items: baseline; gap: .28em;
      font-family: var(--serif); font-size: calc(var(--altura, 34px) * .5);
      font-weight: 600; letter-spacing: .07em; text-transform: uppercase; white-space: nowrap;
      b { font-weight: 600; color: var(--navy-900); }
      i { font-style: normal; font-weight: 600; color: #A97E1E; }
    }
    .escuro .palavra {
      b { color: #fff; }
      i { color: #E0BE6B; }
    }
  `,
})
export class Marca {
  /** Altura do símbolo em pixels; a palavra acompanha. */
  readonly altura = input(34);
  /** Em fundo escuro, a palavra fica branca e o "Hub" dourado claro. */
  readonly escuro = input(false);
  /** Só a coroa, sem a palavra (ícones e espaços apertados). */
  readonly somenteSimbolo = input(false);

  protected readonly id = 'ouro-' + Math.random().toString(36).slice(2, 8);
}
