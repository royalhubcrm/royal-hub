export type Temperatura = 'quente' | 'morno' | 'frio';

export const TEMPERATURAS: { valor: Temperatura; rotulo: string }[] = [
  { valor: 'quente', rotulo: 'Quente' },
  { valor: 'morno', rotulo: 'Morno' },
  { valor: 'frio', rotulo: 'Frio' },
];

export const rotuloTemperatura = (t: string) => TEMPERATURAS.find((x) => x.valor === t)?.rotulo ?? t;

export const ORIGENS = ['Facebook Ads', 'Instagram Ads', 'Formulário', 'WhatsApp', 'Indicação', 'Portal', 'Planilha', 'Manual'];

export interface Lead {
  id: string;
  nome: string;
  empresa: string | null;
  email: string | null;
  telefone: string | null;
  status: string;
  temperatura: Temperatura;
  valor_estimado: number;
  origem: string;
  campanha: string;
  interesse: string;
  obs: string;
  imoveis: string[];
  responsavel_id: string | null;
  posicao: number;
  data_criacao: string;
  atualizado_em: string;
}

/** O que o formulário do lead edita. */
export type LeadEditavel = Pick<Lead, 'nome'> &
  Partial<Pick<Lead, 'empresa' | 'email' | 'telefone' | 'status' | 'temperatura' | 'valor_estimado'
    | 'origem' | 'campanha' | 'interesse' | 'obs' | 'imoveis' | 'responsavel_id'>>;

export type ColunaOrdenavel = 'nome' | 'status' | 'temperatura' | 'valor_estimado' | 'data_criacao';

export interface FiltroLeads {
  pagina: number;          // começa em 1
  porPagina: number;
  busca?: string;          // nome, telefone, e-mail, interesse ou campanha
  status?: string;
  temperatura?: string;
  responsavel?: string;    // id, ou 'ninguem'
  ordenarPor?: ColunaOrdenavel;
  crescente?: boolean;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Historico {
  id: number;
  texto: string;
  autor_id: string | null;
  criado_em: string;
}
