import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { DEMO } from './demo';

/** true enquanto o environment.ts ainda tem os valores de exemplo. */
export const SUPABASE_CONFIGURADO =
  !!DEMO ||
  (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(environment.supabaseUrl) &&
    !environment.supabaseUrl.includes('SEU-PROJETO') &&
    environment.supabaseAnonKey.length > 40);

/** Um único cliente para o app inteiro, já apontando para o schema "crm". */
export const SUPABASE = new InjectionToken<SupabaseClient<any, 'crm'>>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    DEMO
      ? createClient(DEMO.url, DEMO.chave, {
          db: { schema: 'crm' },
          global: { fetch: DEMO.fetch },
          realtime: { transport: DEMO.WebSocket as never },
        })
      : createClient(
          SUPABASE_CONFIGURADO ? environment.supabaseUrl : 'https://exemplo.supabase.co',
          SUPABASE_CONFIGURADO ? environment.supabaseAnonKey : 'chave-de-exemplo',
          { db: { schema: 'crm' } },
        ),
});

/** Traduz os erros do Supabase/Postgres para uma frase que dá para mostrar na tela. */
export function erroAmigavel(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string } | null;
  const msg = err?.message ?? String(e ?? '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado.';
  if (err?.code === '23505' && /telefone/.test(msg + (err.details ?? ''))) return 'Já existe um cadastro com esse telefone.';
  if (err?.code === '23505' && /codigo/.test(msg + (err.details ?? ''))) return 'Já existe um imóvel com esse código.';
  if (err?.code === '23505' && /slug/.test(msg + (err.details ?? ''))) return 'Esse endereço já está em uso. Escolha outro.';
  if (err?.code === '23505') return 'Esse registro já existe.';
  if (err?.code === '23514' && /email/.test(msg)) return 'Confira o e-mail digitado.';
  if (err?.code === '23514' && /telefone/.test(msg)) return 'Confira o telefone: use DDD e só números.';
  if (err?.code === '23514') return 'Algum campo está com valor inválido.';
  if (err?.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para isso.';
  if (err?.code === 'PGRST205' || /schema must be one of/i.test(msg))
    return 'O banco ainda não está pronto: rode a migração e exponha o schema "crm" no Supabase.';
  if (err?.code === 'P0001') return msg; // mensagens que nós mesmos escrevemos no SQL
  return msg || 'Algo deu errado. Tente de novo.';
}
