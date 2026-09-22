export interface FiltroSite {
  tipos?: string[];
  cidade?: string;
  precoMax?: number;
}

export interface Site {
  id: string;
  slug: string;
  nome: string;
  titulo: string;
  subtitulo: string;
  sobre: string;
  cor: string;
  fundo: 'claro' | 'escuro';
  fonte: 'moderna' | 'classica';
  whats: string;
  email: string;
  endereco: string;
  creci: string;
  filtro: FiltroSite;
  dominio: string;
  publicado: boolean;
}

export type SiteEditavel = Omit<Site, 'id'> & { id?: string };

export function siteVazio(): SiteEditavel {
  return {
    slug: '', nome: '', titulo: '', subtitulo: '', sobre: '', cor: '#1E3A5F', fundo: 'claro',
    fonte: 'moderna', whats: '', email: '', endereco: '', creci: '', filtro: {}, dominio: '', publicado: true,
  };
}

/** Imóvel como aparece no site e na página pública. */
export interface ImovelVitrine {
  id: string;
  codigo: string;
  tipo: string;
  bairro: string;
  cidade: string;
  preco: number;
  quartos: number;
  suites: number;
  vagas: number;
  area: number;
  foto: string | null;
  finalidade: string;
}
