import { Injectable, inject, signal } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { EtapaPipeline, ResumoEtapa } from '../models/etapa.model';

export interface Painel {
  total: number;
  no_mes: number;
  quentes: number;
  abertos: number;
  fechados: number;
  em_aberto: number;
  imoveis: number;
  vgv: number;
  agenda_hoje: number;
  duvidas: number;
  serie: { dia: string; n: number }[];
  recentes: { id: string; nome: string; temperatura: string; interesse: string; origem: string; status: string; data_criacao: string }[];
  procurados: { codigo: string; n: number; tipo: string | null; bairro: string | null }[];
}

@Injectable({ providedIn: 'root' })
export class PipelineService {
  private readonly db = inject(SUPABASE);

  /** As etapas mudam pouco: ficam guardadas depois da primeira leitura. */
  readonly etapasCache = signal<EtapaPipeline[]>([]);

  async etapas(): Promise<EtapaPipeline[]> {
    if (this.etapasCache().length) return this.etapasCache();
    const { data, error } = await this.db
      .from('etapas_pipeline')
      .select('id, slug, nome, ordem, cor, probabilidade, tipo')
      .eq('ativa', true)
      .order('ordem');
    if (error) throw error;
    this.etapasCache.set((data ?? []) as EtapaPipeline[]);
    return this.etapasCache();
  }

  nomeDaEtapa(slug: string): string {
    return this.etapasCache().find((e) => e.slug === slug)?.nome ?? slug;
  }

  /** Quantidade e valor por etapa — topo das colunas do Kanban e funil. */
  async resumo(): Promise<ResumoEtapa[]> {
    const { data, error } = await this.db.from('resumo_pipeline').select('*');
    if (error) throw error;
    return (data ?? []) as ResumoEtapa[];
  }

  /** Todos os números do Dashboard numa chamada só. */
  async painel(): Promise<Painel> {
    const { data, error } = await this.db.rpc('painel');
    if (error) throw error;
    return data as Painel;
  }
}
