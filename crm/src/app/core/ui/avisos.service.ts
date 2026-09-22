import { Injectable, signal } from '@angular/core';
import { erroAmigavel } from '../supabase/supabase.client';

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro';
}

export interface Pergunta {
  titulo: string;
  texto?: string;
  confirmar: string;
  perigo: boolean;
  responder: (sim: boolean) => void;
}

/**
 * Avisos rápidos ("Lead salvo") e perguntas de confirmação ("Excluir?").
 * Os avisos são lidos pelo leitor de tela (região aria-live no app.html).
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  readonly avisos = signal<Aviso[]>([]);
  readonly pergunta = signal<Pergunta | null>(null);
  private seq = 0;

  ok(texto: string) { this.mostrar(texto, 'ok'); }

  erro(e: unknown) { this.mostrar(erroAmigavel(e), 'erro'); }

  private mostrar(texto: string, tipo: Aviso['tipo']) {
    const id = ++this.seq;
    this.avisos.update((l) => [...l.slice(-2), { id, texto, tipo }]);
    setTimeout(() => this.fechar(id), tipo === 'erro' ? 8000 : 4000);
  }

  fechar(id: number) { this.avisos.update((l) => l.filter((a) => a.id !== id)); }

  /** Copia para a área de transferência e avisa. */
  copiar(texto: string, aviso = 'Copiado.') {
    void navigator.clipboard?.writeText(texto).then(() => this.ok(aviso), () => this.mostrar('Não deu para copiar. Selecione o texto e use Ctrl+C.', 'erro'));
  }

  /** Pergunta antes de uma ação sem volta. Resolve true se a pessoa confirmou. */
  confirmar(titulo: string, opcoes: { texto?: string; confirmar?: string; perigo?: boolean } = {}): Promise<boolean> {
    return new Promise((resolver) => {
      this.pergunta.set({
        titulo,
        texto: opcoes.texto,
        confirmar: opcoes.confirmar ?? 'Confirmar',
        perigo: opcoes.perigo ?? true,
        responder: (sim) => { this.pergunta.set(null); resolver(sim); },
      });
    });
  }
}
