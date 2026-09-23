import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TemaService } from '../../core/ui/tema.service';

/** Botão "Modo escuro / Modo claro". No menu lateral fica claro sobre o azul-marinho. */
@Component({
  selector: 'app-botao-tema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tema" [class.claro]="claro()" [class.btn]="!claro()" [class.pequeno]="!claro()"
            (click)="tema.alternar()" [attr.aria-pressed]="tema.tema() === 'escuro'" [title]="titulo()">
      <svg aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        @if (tema.tema() === 'escuro') {
          <circle cx="10" cy="10" r="3.6" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        } @else {
          <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" />
        }
      </svg>
      <span>{{ tema.tema() === 'escuro' ? 'Modo claro' : 'Modo escuro' }}</span>
    </button>
  `,
  styles: `
    :host { display: inline-flex; }
    .tema { gap: 6px; }
    .tema.claro { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 8px; margin-left: -8px;
      border-radius: 6px; color: var(--lateral-texto); font-size: 12.5px;
      &:hover { color: var(--lateral-forte); background: rgba(255, 255, 255, .06); }
      &:focus-visible { box-shadow: 0 0 0 2px var(--ouro-300); } }
  `,
})
export class BotaoTema {
  protected readonly tema = inject(TemaService);
  /** Versão para fundo escuro (menu lateral). */
  readonly claro = input(false);
  protected titulo() { return this.tema.tema() === 'escuro' ? 'Voltar para o tema claro' : 'Usar o tema escuro'; }
}
