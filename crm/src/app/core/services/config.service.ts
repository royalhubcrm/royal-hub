import { Injectable, inject, signal } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Config } from '../models/config.model';
import { mensagemDaFuncao } from './conversas.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly db = inject(SUPABASE);

  /** Última configuração lida (nome do corretor, cidade padrão, regras da assistente…). */
  readonly config = signal<Config | null>(null);

  async carregar(): Promise<Config> {
    const { data, error } = await this.db.from('config').select('*').single();
    if (error) throw error;
    this.config.set(data as Config);
    return data as Config;
  }

  async garantir(): Promise<Config> {
    return this.config() ?? this.carregar();
  }

  async salvar(campos: Partial<Config>): Promise<Config> {
    const { empresa_id, wa_configurado, wa_numero_id, wa_verificacao, ...resto } = { ...campos } as Config;
    const empresa = empresa_id ?? this.config()?.empresa_id;
    const { data, error } = await this.db.from('config').update(resto).eq('empresa_id', empresa).select('*').single();
    if (error) throw error;
    this.config.set(data as Config);
    return data as Config;
  }

  async salvarWhatsapp(numeroId: string, token: string, verificacao: string) {
    const { error } = await this.db.rpc('salvar_whatsapp', { p_numero_id: numeroId, p_token: token, p_verificacao: verificacao });
    if (error) throw error;
    return this.carregar();
  }

  async tokenWebhook(trocar = false): Promise<string> {
    const { data, error } = await this.db.rpc('token_webhook', { p_trocar: trocar });
    if (error) throw error;
    return data as string;
  }

  /** Endereço das Edge Functions deste projeto (para mostrar os links de webhook e feed). */
  enderecoFuncao(nome: string): string {
    return `${environment.supabaseUrl}/functions/v1/${nome}`;
  }

  /** Assistente de IA (Edge Function "assistente"). */
  async ia<T = { texto: string }>(corpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.functions.invoke('assistente', { body: corpo });
    if (error) throw new Error(await mensagemDaFuncao(error, 'A assistente de IA não respondeu.'));
    if (data?.erro) throw new Error(data.erro);
    return data as T;
  }
}
