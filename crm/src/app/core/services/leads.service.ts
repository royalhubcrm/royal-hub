import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { FiltroLeads, Historico, Lead, LeadEditavel, Pagina } from '../models/lead.model';
import { soDigitos } from '../../shared/util/telefone';

const COLUNAS =
  'id, nome, empresa, email, telefone, status, temperatura, valor_estimado, origem, campanha, interesse, obs, imoveis, responsavel_id, posicao, data_criacao, atualizado_em';

@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly db = inject(SUPABASE);

  /** Tabela de leads: uma página por vez, com o total para a paginação. */
  async listar(f: FiltroLeads): Promise<Pagina<Lead>> {
    const inicio = (f.pagina - 1) * f.porPagina;
    let consulta = this.db.from('leads').select(COLUNAS, { count: 'exact' });

    if (f.status) consulta = consulta.eq('status', f.status);
    if (f.temperatura) consulta = consulta.eq('temperatura', f.temperatura);
    if (f.responsavel === 'ninguem') consulta = consulta.is('responsavel_id', null);
    else if (f.responsavel) consulta = consulta.eq('responsavel_id', f.responsavel);

    // vírgula, parênteses e % quebrariam o filtro "or" do PostgREST
    const termo = f.busca?.trim().replace(/[,()%*]/g, ' ');
    if (termo) {
      const campos = ['nome', 'email', 'interesse', 'campanha', 'empresa'].map((c) => `${c}.ilike.%${termo}%`);
      const digitos = soDigitos(termo);
      if (digitos && digitos.length >= 4) campos.push(`telefone.like.%${digitos}%`);
      consulta = consulta.or(campos.join(','));
    }

    const { data, error, count } = await consulta
      .order(f.ordenarPor ?? 'data_criacao', { ascending: f.crescente ?? false })
      .order('id')
      .range(inicio, inicio + f.porPagina - 1);
    if (error) throw error;
    return { itens: (data ?? []) as Lead[], total: count ?? 0, pagina: f.pagina, porPagina: f.porPagina };
  }

  /** Kanban: todos os leads visíveis, já na ordem dos cards. */
  async doKanban(): Promise<Lead[]> {
    const { data, error } = await this.db.from('leads').select(COLUNAS).order('posicao').limit(2000);
    if (error) throw error;
    return (data ?? []) as Lead[];
  }

  async buscar(id: string): Promise<Lead | null> {
    const { data, error } = await this.db.from('leads').select(COLUNAS).eq('id', id).maybeSingle();
    if (error) throw error;
    return data as Lead | null;
  }

  /** Cria (sem id) ou atualiza (com id). */
  async salvar(id: string | null, campos: LeadEditavel): Promise<Lead> {
    const corpo = { ...campos, email: campos.email?.trim() || null, telefone: campos.telefone || null };
    const consulta = id
      ? this.db.from('leads').update(corpo).eq('id', id)
      : this.db.from('leads').insert(corpo);
    const { data, error } = await consulta.select(COLUNAS).single();
    if (error) throw error;
    return data as Lead;
  }

  /** Arrastar um card: troca a etapa e a posição numa gravação só. */
  async mover(id: string, status: string, posicao: number): Promise<void> {
    const { error } = await this.db.from('leads').update({ status, posicao }).eq('id', id);
    if (error) throw error;
  }

  async remover(id: string): Promise<void> {
    const { error } = await this.db.from('leads').delete().eq('id', id);
    if (error) throw error;
  }

  async historico(leadId: string): Promise<Historico[]> {
    const { data, error } = await this.db
      .from('historico').select('id, texto, autor_id, criado_em')
      .eq('lead_id', leadId).order('criado_em', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []) as Historico[];
  }

  async anotar(leadId: string, texto: string, autorId: string): Promise<void> {
    const { error } = await this.db.from('historico').insert({ lead_id: leadId, texto: texto.trim(), autor_id: autorId });
    if (error) throw error;
  }

  /**
   * Importação da planilha: grava um por um para que um telefone repetido
   * não derrube o lote inteiro. Devolve quantos entraram e quantos já existiam.
   */
  async importar(leads: LeadEditavel[], aoAvancar?: (feitos: number) => void) {
    let novos = 0, repetidos = 0;
    const falhas: string[] = [];
    for (let i = 0; i < leads.length; i += 8) {
      const lote = leads.slice(i, i + 8);
      const resultados = await Promise.all(lote.map((l) => this.db.from('leads').insert(l)));
      resultados.forEach((r, j) => {
        if (!r.error) novos++;
        else if (r.error.code === '23505') repetidos++;
        else falhas.push(`${lote[j].nome}: ${r.error.message}`);
      });
      aoAvancar?.(Math.min(i + 8, leads.length));
    }
    return { novos, repetidos, falhas };
  }

  /** Avisa quando qualquer lead muda (outro usuário, o WhatsApp…). Devolve a função para parar de ouvir. */
  aoMudar(aviso: () => void): () => void {
    const canal = this.db
      .channel('crm-leads-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'crm', table: 'leads' }, aviso)
      .subscribe();
    return () => void this.db.removeChannel(canal);
  }
}
