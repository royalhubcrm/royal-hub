import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Empreendimento, EmpreendimentoEditavel } from '../models/empreendimento.model';

/** Os lançamentos (books das construtoras) que a assistente pode citar. */
@Injectable({ providedIn: 'root' })
export class EmpreendimentosService {
  private readonly db = inject(SUPABASE);

  async listar(): Promise<Empreendimento[]> {
    const { data, error } = await this.db.from('empreendimentos').select('*').order('nome');
    if (error) throw error;
    return (data ?? []) as Empreendimento[];
  }

  async salvar(e: EmpreendimentoEditavel): Promise<Empreendimento> {
    const { id, empresa_id, criado_em, atualizado_em, ...campos } = e as Empreendimento;
    const limpo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const consulta = id
      ? this.db.from('empreendimentos').update({ ...limpo, atualizado_em: new Date().toISOString() }).eq('id', id)
      : this.db.from('empreendimentos').insert(limpo);
    const { data, error } = await consulta.select('*').single();
    if (error) throw error;
    return data as Empreendimento;
  }

  async remover(id: string) {
    const { error } = await this.db.from('empreendimentos').delete().eq('id', id);
    if (error) throw error;
  }
}
