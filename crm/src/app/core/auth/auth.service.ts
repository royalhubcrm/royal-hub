import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { SUPABASE, SUPABASE_CONFIGURADO } from '../supabase/supabase.client';
import { Empresa, Papel, Perfil } from '../models/pessoa.model';

/**
 * Quem está logado. Guarda a sessão do Supabase Auth, o perfil (papel, equipe)
 * e a empresa. As telas perguntam aqui "posso mostrar isso?".
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE);
  private readonly router = inject(Router);

  readonly sessao = signal<Session | null>(null);
  readonly perfil = signal<Perfil | null>(null);
  readonly empresa = signal<Empresa | null>(null);

  readonly logado = computed(() => !!this.sessao());
  readonly papel = computed(() => this.perfil()?.papel ?? null);
  readonly primeiroNome = computed(() => (this.perfil()?.nome || '').split(' ')[0]);

  /** Resolve quando a primeira leitura da sessão terminou. */
  readonly pronto: Promise<void>;

  constructor() {
    this.pronto = SUPABASE_CONFIGURADO ? this.iniciar() : Promise.resolve();
  }

  private async iniciar() {
    const { data } = await this.db.auth.getSession();
    this.sessao.set(data.session);
    if (data.session) await this.carregarPerfil();

    this.db.auth.onAuthStateChange((evento, sessao) => {
      this.sessao.set(sessao);
      if (evento === 'PASSWORD_RECOVERY') void this.router.navigateByUrl('/redefinir-senha');
      if (evento === 'SIGNED_OUT') { this.perfil.set(null); this.empresa.set(null); }
      // não chamar o banco dentro do callback (recomendação do supabase-js): agenda para depois
      if (evento === 'SIGNED_IN' && sessao && !this.perfil()) setTimeout(() => void this.carregarPerfil());
    });
  }

  async carregarPerfil(): Promise<Perfil | null> {
    const uid = this.sessao()?.user.id;
    if (!uid) return null;
    const { data } = await this.db
      .from('perfis')
      .select('id, empresa_id, nome, email, telefone, papel, equipe_id, ativo, dono, ultimo_acesso, empresas(id, nome, slug, ativa, criado_em)')
      .eq('id', uid)
      .maybeSingle();
    if (!data) { this.perfil.set(null); this.empresa.set(null); return null; }
    const { empresas, ...perfil } = data as unknown as Perfil & { empresas: Empresa };
    this.perfil.set(perfil);
    this.empresa.set(empresas);
    void this.db.rpc('registrar_acesso');
    return perfil;
  }

  /** O papel de quem está logado está entre estes? */
  pode(...papeis: Papel[]): boolean {
    const p = this.papel();
    return !!p && papeis.includes(p);
  }

  async entrar(email: string, senha: string) {
    const { error } = await this.db.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) throw error;
    const { data } = await this.db.auth.getSession();
    this.sessao.set(data.session);
    return this.carregarPerfil();
  }

  async sair() {
    await this.db.auth.signOut();
    this.perfil.set(null);
    this.empresa.set(null);
    await this.router.navigateByUrl('/entrar');
  }

  async esqueciSenha(email: string) {
    const { error } = await this.db.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/redefinir-senha`,
    });
    if (error) throw error;
  }

  async trocarSenha(nova: string) {
    const { error } = await this.db.auth.updateUser({ password: nova });
    if (error) throw error;
  }

  async sistemaConfigurado(): Promise<boolean> {
    const { data } = await this.db.rpc('sistema_configurado');
    return data !== false;
  }

  async primeiroAcesso(empresa: string, nome: string) {
    const { error } = await this.db.rpc('primeiro_acesso', { p_empresa: empresa, p_nome: nome });
    if (error) throw error;
    return this.carregarPerfil();
  }
}
