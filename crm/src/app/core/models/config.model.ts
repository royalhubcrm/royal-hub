export type ModoBot = 'anuncio' | 'novos' | 'todos';
export type ProvedorIA = 'groq' | 'gemini' | 'anthropic';

export interface Config {
  empresa_id: string;
  corretor: string;
  creci: string;
  whats: string;
  endereco: string;
  cidade: string;
  assistente: string;
  estilo: string;
  fatos: string;
  bot_ligado: boolean;
  bot_modo: ModoBot;
  bot_hora_inicio: string | null;
  bot_hora_fim: string | null;
  bot_numeros: string;
  wa_numero_id: string;
  wa_verificacao: string;
  wa_configurado: boolean;
  /** Conversas → Assistente: o texto do prompt (vazio = padrão) e quem responde. */
  prompt_base: string;
  ia_provedor: 'auto' | ProvedorIA;
  ia_modelo: string;
}
