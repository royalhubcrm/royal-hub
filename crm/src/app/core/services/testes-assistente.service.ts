import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';

export interface FalaSalva { papel: 'cliente' | 'bot'; texto: string; provedor?: string; ms?: number; acoes?: string[] }

/** Um diálogo de teste guardado com as anotações de quem testou. */
export interface TesteAssistente {
  id: string;
  autor_id: string | null;
  titulo: string;
  provedor: string;
  modelo: string;
  prompt_base: string;
  falas: FalaSalva[];
  ficha: Record<string, unknown>;
  nota: number | null;
  pros: string;
  contras: string;
  melhoria: string;
  criado_em: string;
  atualizado_em: string;
}

export type TesteEditavel = Omit<TesteAssistente, 'id' | 'autor_id' | 'criado_em' | 'atualizado_em'> & { id?: string };

/** Diálogos de teste da assistente, salvos para revisar o prompt depois. */
@Injectable({ providedIn: 'root' })
export class TestesAssistenteService {
  private readonly db = inject(SUPABASE);

  async listar(): Promise<TesteAssistente[]> {
    const { data, error } = await this.db.from('testes_assistente').select('*').order('criado_em', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []) as TesteAssistente[];
  }

  async salvar(t: TesteEditavel): Promise<TesteAssistente> {
    const { id, ...campos } = t;
    const consulta = id ? this.db.from('testes_assistente').update(campos).eq('id', id) : this.db.from('testes_assistente').insert(campos);
    const { data, error } = await consulta.select('*').single();
    if (error) throw error;
    return data as TesteAssistente;
  }

  async remover(id: string) {
    const { error } = await this.db.from('testes_assistente').delete().eq('id', id);
    if (error) throw error;
  }
}
