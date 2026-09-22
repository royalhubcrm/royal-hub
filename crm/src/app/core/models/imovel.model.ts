export type StatusImovel = 'disponivel' | 'reservado' | 'vendido' | 'inativo';

export const STATUS_IMOVEL: { valor: StatusImovel; rotulo: string }[] = [
  { valor: 'disponivel', rotulo: 'Disponível' },
  { valor: 'reservado', rotulo: 'Reservado' },
  { valor: 'vendido', rotulo: 'Vendido' },
  { valor: 'inativo', rotulo: 'Fora do ar' },
];

export const rotuloStatusImovel = (s: string) => STATUS_IMOVEL.find((x) => x.valor === s)?.rotulo ?? s;

export const TIPOS_IMOVEL = ['Casa', 'Apartamento', 'Sobrado', 'Cobertura', 'Lote/Terreno', 'Chácara',
  'Sala comercial', 'Ponto comercial', 'Galpão', 'Kitnet', 'Studio'];

export interface Imovel {
  id: string;
  codigo: string;
  tipo: string;
  finalidade: 'venda' | 'aluguel';
  status: StatusImovel;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  preco: number;
  condominio: number;
  iptu: number;
  quartos: number;
  suites: number;
  banheiros: number;
  vagas: number;
  area: number;
  descricao: string;
  fotos: string[];
  link: string;
  criado_em: string;
  atualizado_em: string;
}

export type ImovelEditavel = Omit<Imovel, 'id' | 'criado_em' | 'atualizado_em'>;

export function imovelVazio(cidade = 'Uberlândia'): ImovelEditavel {
  return {
    codigo: '', tipo: 'Casa', finalidade: 'venda', status: 'disponivel', cep: '', rua: '', numero: '',
    bairro: '', cidade, preco: 0, condominio: 0, iptu: 0, quartos: 0, suites: 0, banheiros: 0,
    vagas: 0, area: 0, descricao: '', fotos: [], link: '',
  };
}

/** O que os portais (ZAP, Viva Real, OLX) exigem para publicar — mesma regra do feed-portais. */
export const EXIGENCIAS_PORTAIS = { fotos: 5 };

export function pendenciasPortais(m: Imovel): string[] {
  const falta: string[] = [];
  if (m.fotos.length < EXIGENCIAS_PORTAIS.fotos) falta.push(`${EXIGENCIAS_PORTAIS.fotos - m.fotos.length} foto(s)`);
  if (!/^\d{8}$/.test(m.cep.replace(/\D/g, ''))) falta.push('CEP');
  if (!Number(m.preco)) falta.push('preço');
  if (!m.bairro) falta.push('bairro');
  if (!Number(m.area) && m.tipo !== 'Lote/Terreno') falta.push('área');
  return falta;
}
