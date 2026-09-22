import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Teclado nas abas (padrão ARIA de tablist): setas trocam de aba, Home/End
 * vão para a primeira/última. Só uma aba fica no Tab; as outras ganham
 * tabindex="-1". Basta colocar appAbas no elemento com role="tablist".
 */
@Directive({
  selector: '[appAbas]',
})
export class AbasDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private abas(): HTMLElement[] {
    return [...this.el.querySelectorAll<HTMLElement>('[role="tab"]')];
  }

  @HostListener('keydown', ['$event'])
  tecla(ev: KeyboardEvent) {
    const abas = this.abas();
    const i = abas.indexOf(ev.target as HTMLElement);
    if (i < 0) return;
    const alvo = ev.key === 'ArrowRight' ? abas[(i + 1) % abas.length]
      : ev.key === 'ArrowLeft' ? abas[(i - 1 + abas.length) % abas.length]
      : ev.key === 'Home' ? abas[0]
      : ev.key === 'End' ? abas[abas.length - 1]
      : null;
    if (!alvo) return;
    ev.preventDefault();
    alvo.click(); // seleciona (o componente troca o painel)
    alvo.focus();
  }

  /** Depois de qualquer clique/seleção, só a aba ativa fica no caminho do Tab. */
  @HostListener('click')
  @HostListener('focusin')
  arrumarTabindex() {
    queueMicrotask(() => {
      for (const a of this.abas()) a.tabIndex = a.getAttribute('aria-selected') === 'true' ? 0 : -1;
    });
  }
}
