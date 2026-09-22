import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { AvisosService } from '../../core/ui/avisos.service';

/** Mostra os avisos ("Salvo") e a pergunta de confirmação. Fica uma vez só, no app.html. */
@Component({
  selector: 'app-avisos-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="avisos" role="status" aria-live="polite">
      @for (a of avisos.avisos(); track a.id) {
        <div class="aviso-flutuante" [class.erro]="a.tipo === 'erro'">
          <span>{{ a.texto }}</span>
          <button type="button" class="btn fantasma pequeno" (click)="avisos.fechar(a.id)" aria-label="Fechar aviso">✕</button>
        </div>
      }
    </div>

    <dialog #dlg class="confirmar" aria-labelledby="confirmar-titulo" aria-describedby="confirmar-texto"
            (keydown.escape)="$event.preventDefault(); responder(false)" (cancel)="$event.preventDefault(); responder(false)" (close)="responder(false)">
      @if (avisos.pergunta(); as p) {
        <h2 id="confirmar-titulo">{{ p.titulo }}</h2>
        <p id="confirmar-texto">{{ p.texto }}</p>
        <div class="linha fim">
          <button type="button" class="btn" (click)="responder(false)" autofocus>Cancelar</button>
          <button type="button" class="btn" [class.perigo]="p.perigo" [class.primario]="!p.perigo" (click)="responder(true)">{{ p.confirmar }}</button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .avisos { position: fixed; right: 16px; bottom: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; max-width: min(420px, calc(100vw - 32px)); }
    .aviso-flutuante {
      display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 14px; border-radius: var(--raio);
      background: var(--navy-900); color: #fff; box-shadow: 0 6px 20px rgba(15, 27, 45, .25); font-size: 13px;
      &.erro { background: #6B2020; }
      span { flex: 1; }
      .btn { color: #fff; } .btn:hover { background: rgba(255, 255, 255, .12); }
    }
    .confirmar {
      border: 0; border-radius: 10px; padding: 20px; width: min(420px, calc(100vw - 32px));
      box-shadow: 0 12px 40px rgba(15, 27, 45, .3);
      &::backdrop { background: rgba(15, 27, 45, .42); }
      h2 { font-size: 16px; margin-bottom: 8px; }
      p { color: var(--slate-600); margin-bottom: 18px; }
      p:empty { display: none; }
    }
  `,
})
export class AvisosHost {
  protected readonly avisos = inject(AvisosService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const d = this.dlg().nativeElement;
      if (this.avisos.pergunta() && !d.open) d.showModal();
      if (!this.avisos.pergunta() && d.open) d.close();
    });
  }

  protected responder(sim: boolean) {
    this.avisos.pergunta()?.responder(sim);
  }
}
