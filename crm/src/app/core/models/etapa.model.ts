export type TipoEtapa = 'aberta' | 'ganha' | 'perdida';

export interface EtapaPipeline {
  id: number;
  slug: string;
  nome: string;
  ordem: number;
  cor: string;
  probabilidade: number;
  tipo: TipoEtapa;
}

/** Linha da view crm.resumo_pipeline — uma por etapa ativa. */
export interface ResumoEtapa extends EtapaPipeline {
  quantidade: number;
  valor_total: number;
  valor_ponderado: number;
}
