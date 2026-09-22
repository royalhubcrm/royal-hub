import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

/**
 * Painel lateral (lead, imóvel, importação). Usa o <dialog> nativo do
 * navegador: prende o foco lá dentro, fecha com Esc e devolve o foco para
 * quem abriu — acessibilidade de graça.
 */
@Component({
  selector: 'app-gaveta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg class="gaveta" [class.larga]="larga()" [attr.aria-labelledby]="idTitulo"
            (cancel)="$event.preventDefault(); fechar.emit()" (click)="cliqueFora($event)">
      <div class="gaveta-corpo">
        <header>
          <h2 [id]="idTitulo">{{ titulo() }}</h2>
          <button type="button" class="btn fantasma pequeno" (click)="fechar.emit()">Fechar <span aria-hidden="true">✕</span></button>
        </header>
        <div class="gaveta-conteudo"><ng-content /></div>
        <ng-content select="[rodape]" />
      </div>
    </dialog>
  `,
  styles: `
    .gaveta {
      margin: 0 0 0 auto; height: 100dvh; max-height: 100dvh; width: min(560px, 100vw); max-width: 100vw;
      padding: 0; border: 0; box-shadow: -8px 0 24px rgba(15, 27, 45, .18); background: var(--superficie);
      &.larga { width: min(760px, 100vw); }
      &::backdrop { background: rgba(15, 27, 45, .42); }
      &[open] { animation: entra .16s ease-out; }
    }
    @keyframes entra { from { transform: translateX(24px); } }
    .gaveta-corpo { display: flex; flex-direction: column; height: 100%; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 20px; border-bottom: 1px solid var(--slate-200);
      h2 { font-size: 16px; } }
    .gaveta-conteudo { flex: 1; overflow-y: auto; padding: 18px 20px 24px; }
    :host ::ng-deep [rodape] { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      padding: 12px 20px; border-top: 1px solid var(--slate-200); background: var(--slate-100); }
  `,
})
export class Gaveta {
  readonly titulo = input.required<string>();
  readonly aberta = input(false);
  readonly larga = input(false);
  readonly fechar = output<void>();

  protected readonly idTitulo = 'gaveta-' + Math.random().toString(36).slice(2, 8);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const d = this.dlg().nativeElement;
      if (this.aberta() && !d.open) d.showModal();
      if (!this.aberta() && d.open) d.close();
    });
  }

  /** Clique no fundo escuro (fora do painel) fecha. */
  protected cliqueFora(ev: MouseEvent) {
    if (ev.target === this.dlg().nativeElement) this.fechar.emit();
  }
}
