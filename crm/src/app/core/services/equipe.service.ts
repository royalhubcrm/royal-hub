import { Injectable, inject, signal } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Empresa, Equipe, Papel, Perfil } from '../models/pessoa.model';
import { mensagemDaFuncao } from './conversas.service';

const COLUNAS = 'id, empresa_id, nome, email, telefone, papel, equipe_id, ativo, dono, ultimo_acesso';

/** Pessoas, equipes e (para o dono da plataforma) empresas. */
@Injectable({ providedIn: 'root' })
export class EquipeService {
  private readonly db = inject(SUPABASE);

  /** Guardado para os seletores de "Responsável" não buscarem toda hora. */
  readonly pessoasCache = signal<Perfil[]>([]);

  async pessoas(): Promise<Perfil[]> {
    const { data, error } = await this.db.from('perfis').select(COLUNAS).order('nome');
    if (error) throw error;
    this.pessoasCache.set((data ?? []) as Perfil[]);
    return this.pessoasCache();
  }

  async garantirPessoas(): Promise<Perfil[]> {
    return this.pessoasCache().length ? this.pessoasCache() : this.pessoas();
  }

  nomeDe(id: string | null): string {
    return (id && this.pessoasCache().find((p) => p.id === id)?.nome) || '';
  }

  async salvarPessoa(id: string, campos: Partial<Pick<Perfil, 'nome' | 'telefone' | 'papel' | 'equipe_id' | 'ativo'>>) {
    const { error } = await this.db.from('perfis').update(campos).eq('id', id);
    if (error) throw error;
  }

  /** Criar conta, trocar senha e excluir passam pela Edge Function "usuarios" (precisa da chave secreta). */
  private async funcao(corpo: Record<string, unknown>) {
    const { data, error } = await this.db.functions.invoke('usuarios', { body: corpo });
    if (error) throw new Error(await mensagemDaFuncao(error, 'Não consegui falar com o servidor.'));
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  criarPessoa(p: { nome: string; email: string; senha: string; papel: Papel }) {
    return this.funcao({ acao: 'criar', ...p });
  }

  novaSenha(id: string, senha: string) {
    return this.funcao({ acao: 'senha', id, senha });
  }

  removerPessoa(id: string) {
    return this.funcao({ acao: 'remover', id });
  }

  // ------------------------------------------------------------ equipes
  async equipes(): Promise<Equipe[]> {
    const { data, error } = await this.db.from('equipes').select('id, nome, gerente_id').order('nome');
    if (error) throw error;
    return (data ?? []) as Equipe[];
  }

  async salvarEquipe(e: { id?: string; nome: string; gerente_id?: string | null }) {
    const { id, ...campos } = e;
    const { error } = id
      ? await this.db.from('equipes').update(campos).eq('id', id)
      : await this.db.from('equipes').insert(campos);
    if (error) throw error;
  }

  async removerEquipe(id: string) {
    const { error } = await this.db.from('equipes').delete().eq('id', id);
    if (error) throw error;
  }

  // ------------------------------------------------------------ empresas (dono)
  async empresas(): Promise<Empresa[]> {
    const { data, error } = await this.db.from('empresas').select('id, nome, slug, ativa, criado_em').order('nome');
    if (error) throw error;
    return (data ?? []) as Empresa[];
  }

  async ativarEmpresa(id: string, ativa: boolean) {
    const { error } = await this.db.from('empresas').update({ ativa }).eq('id', id);
    if (error) throw error;
  }

  novaEmpresa(p: { empresa: string; nome: string; email: string; senha: string }) {
    return this.funcao({ acao: 'nova_empresa', ...p });
  }
}
