export interface Conversa {
  id: string;
  telefone: string;
  nome: string;
  lead_id: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  bot_ativo: boolean;
  pausado_ate: string | null;
  nao_perturbe: boolean;
  ultima: string;
  ultimo_de: 'cliente' | 'bot' | 'voce' | null;
  nao_lidas: number;
  retomadas: number;
  atualizado_em: string;
}

export interface Mensagem {
  id: number;
  de: 'cliente' | 'bot' | 'voce';
  texto: string;
  criado_em: string;
}

export type StatusAgendamento = 'marcado' | 'compareceu' | 'faltou' | 'cancelado';

export interface Agendamento {
  id: string;
  conversa_id: string | null;
  lead_id: string | null;
  nome: string;
  telefone: string;
  data: string | null;
  hora: string | null;
  local: string;
  como: string;
  imovel: string;
  marcado_por: string;
  status: StatusAgendamento;
}

export interface Duvida {
  id: string;
  conversa_id: string | null;
  nome: string;
  pergunta: string;
  resposta: string;
  status: 'aberta' | 'respondida';
  criado_em: string;
}

export interface Interesse {
  id: number;
  conversa_id: string | null;
  lead_id: string | null;
  codigo: string;
  origem: string;
  tipo: string | null;
  bairro: string | null;
  preco: number | null;
  cliente: string | null;
  criado_em: string;
}

/** Estado da conversa em palavras (não só em cor). */
export function estadoConversa(c: Conversa): { texto: string; classe: string } {
  if (c.nao_perturbe) return { texto: 'Não perturbe', classe: 'frio' };
  if (!c.bot_ativo) return { texto: 'Assistente desligada', classe: 'frio' };
  if (c.pausado_ate && new Date(c.pausado_ate) > new Date()) return { texto: 'Você conduzindo', classe: 'morno' };
  return { texto: 'Assistente ativa', classe: 'ok' };
}
