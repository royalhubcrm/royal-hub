/** Forma do modo demonstração (ver demo.ts). */
export interface ModoDemo {
  url: string;
  chave: string;
  fetch: typeof fetch;
  WebSocket: unknown;
}
