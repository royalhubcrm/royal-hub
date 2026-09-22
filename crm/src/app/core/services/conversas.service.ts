import { Injectable, inject, signal } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Agendamento, Conversa, Duvida, Interesse, Mensagem, StatusAgendamento } from '../models/conversa.model';

/** WhatsApp (conversas e mensagens) e o que a assistente anotou (agenda, dúvidas, interesses). */
@Injectable({ providedIn: 'root' })
export class ConversasService {
  private readonly db = inject(SUPABASE);

  /** Total de mensagens não lidas (a bolinha do menu "Conversas"). */
  readonly naoLidas = signal(0);

  async contarNaoLidas() {
    const { data } = await this.db.from('conversas').select('nao_lidas').gt('nao_lidas', 0).limit(500);
    this.naoLidas.set((data ?? []).reduce((t, c: { nao_lidas: number }) => t + c.nao_lidas, 0));
  }

  async listar(): Promise<Conversa[]> {
    const { data, error } = await this.db.from('conversas_lista').select('*')
      .order('atualizado_em', { ascending: false }).limit(300);
    if (error) throw error;
    return (data ?? []) as Conversa[];
  }

  async mensagens(conversaId: string, limite = 300): Promise<Mensagem[]> {
    const { data, error } = await this.db.from('mensagens').select('id, de, texto, criado_em')
      .eq('conversa_id', conversaId).order('id', { ascending: false }).limit(limite);
    if (error) throw error;
    return ((data ?? []) as Mensagem[]).reverse();
  }

  async ajustar(id: string, campos: Partial<Pick<Conversa, 'bot_ativo' | 'nao_perturbe' | 'nao_lidas' | 'responsavel_id' | 'pausado_ate'>>) {
    const { error } = await this.db.from('conversas').update(campos).eq('id', id);
    if (error) throw error;
    if ('nao_lidas' in campos) void this.contarNaoLidas();
  }

  /** Manda uma mensagem sua pelo WhatsApp oficial (a assistente recua nessa conversa). */
  async enviar(conversaId: string, texto: string): Promise<void> {
    const { data, error } = await this.db.functions.invoke('whatsapp', { body: { acao: 'enviar', conversa_id: conversaId, texto } });
    if (error) throw new Error(await mensagemDaFuncao(error, 'Não consegui enviar pelo WhatsApp.'));
    if (data?.erro) throw new Error(data.erro);
  }

  aoMudar(aviso: () => void): () => void {
    const canal = this.db
      .channel('crm-conversas-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'crm', table: 'conversas' }, aviso)
      .on('postgres_changes', { event: 'INSERT', schema: 'crm', table: 'mensagens' }, aviso)
      .subscribe();
    return () => void this.db.removeChannel(canal);
  }

  // ------------------------------------------------------------ gerência
  async agenda(): Promise<Agendamento[]> {
    const { data, error } = await this.db.from('agendamentos').select('*')
      .order('data', { ascending: true, nullsFirst: false }).order('hora').limit(500);
    if (error) throw error;
    return (data ?? []) as Agendamento[];
  }

  async marcar(a: Partial<Agendamento>): Promise<void> {
    const { error } = await this.db.from('agendamentos').insert(a);
    if (error) throw error;
  }

  async statusAgendamento(id: string, status: StatusAgendamento) {
    const { error } = await this.db.from('agendamentos').update({ status }).eq('id', id);
    if (error) throw error;
  }

  async duvidasAbertas(): Promise<Duvida[]> {
    const { data, error } = await this.db.from('duvidas').select('*').eq('status', 'aberta')
      .order('criado_em', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []) as Duvida[];
  }

  async responderDuvida(id: string, resposta: string) {
    const { error } = await this.db.from('duvidas').update({ status: 'respondida', resposta }).eq('id', id);
    if (error) throw error;
  }

  async interesses(): Promise<Interesse[]> {
    const { data, error } = await this.db.from('interesses_detalhe').select('*')
      .order('criado_em', { ascending: false }).limit(300);
    if (error) throw error;
    return (data ?? []) as Interesse[];
  }
}

/** A Edge Function devolve {erro} no corpo; o supabase-js esconde isso dentro do error.context. */
export async function mensagemDaFuncao(error: unknown, padrao: string): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    const j = ctx ? await ctx.json() : null;
    if (j?.erro) return j.erro;
  } catch { /* segue */ }
  if (/Failed to send a request|FunctionsFetchError/i.test(String((error as Error)?.message ?? '')))
    return 'A função no Supabase ainda não foi publicada (veja o LEIA-ME, passo 4).';
  return padrao;
}
