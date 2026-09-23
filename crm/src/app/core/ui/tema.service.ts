import { Injectable, effect, signal } from '@angular/core';

export type Tema = 'claro' | 'escuro';

const CHAVE = 'royal-tema';
const COR_BARRA: Record<Tema, string> = { claro: '#0F1B2D', escuro: '#0A1220' };

/**
 * Tema claro/escuro. Começa pelo que o sistema da pessoa prefere; quando ela
 * escolhe na tela, a escolha fica guardada no navegador. As cores em si estão
 * em styles.scss (<html data-tema="escuro"> troca as variáveis).
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly tema = signal<Tema>(this.inicial());

  constructor() {
    effect(() => {
      const t = this.tema();
      document.documentElement.dataset['tema'] = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_BARRA[t]);
    });
    // sem escolha guardada, acompanha o sistema em tempo real
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!this.guardado()) this.tema.set(e.matches ? 'escuro' : 'claro');
    });
  }

  alternar() {
    const t: Tema = this.tema() === 'escuro' ? 'claro' : 'escuro';
    this.tema.set(t);
    try { localStorage.setItem(CHAVE, t); } catch { /* navegador sem localStorage: vale só nesta visita */ }
  }

  private guardado(): Tema | null {
    try { const v = localStorage.getItem(CHAVE); return v === 'claro' || v === 'escuro' ? v : null; } catch { return null; }
  }

  private inicial(): Tema {
    return this.guardado() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
  }
}
