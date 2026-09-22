// Peças que todas as Edge Functions usam.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });

/** Erro que vira mensagem para a tela (status 400 por padrão). */
export class ErroTela extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

export function responder(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof ErroTela) return json({ erro: e.message }, e.status);
      console.error(e);
      return json({ erro: 'Erro no servidor: ' + ((e as Error).message ?? e) }, 500);
    }
  };
}

/** Cliente com a chave secreta (ignora o RLS). Só existe aqui no servidor. */
export function admin(): SupabaseClient<any, 'crm'> {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'crm' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente com o login de quem chamou: o RLS vale igual ao painel. */
export function comoUsuario(req: Request): SupabaseClient<any, 'crm'> {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    db: { schema: 'crm' },
    global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Perfil {
  id: string; empresa_id: string; nome: string; email: string; papel: string; ativo: boolean; dono: boolean;
}

/** Quem chamou (pelo token do login). Recusa quem não tem perfil ativo. */
export async function quemChamou(req: Request, db = admin()): Promise<Perfil> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new ErroTela('Entre no sistema primeiro.', 401);
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u.user) throw new ErroTela('Sessão expirada. Entre de novo.', 401);
  const { data: p } = await db.from('perfis')
    .select('id, empresa_id, nome, email, papel, ativo, dono, empresas!inner(ativa)')
    .eq('id', u.user.id).maybeSingle();
  if (!p || !p.ativo || !(p as any).empresas?.ativa) throw new ErroTela('Sua conta não tem acesso.', 403);
  return p as unknown as Perfil;
}

export async function empresaPorSlug(db: SupabaseClient<any, 'crm'>, slug: string | null) {
  if (!slug) return null;
  const { data } = await db.from('empresas').select('id, nome, slug, ativa').eq('slug', slug).maybeSingle();
  return data && data.ativa ? data : null;
}

export async function configDa(db: SupabaseClient<any, 'crm'>, empresaId: string) {
  const [{ data: c }, { data: s }] = await Promise.all([
    db.from('config').select('*').eq('empresa_id', empresaId).single(),
    db.from('config_segredos').select('*').eq('empresa_id', empresaId).single(),
  ]);
  return { ...(c ?? {}), ...(s ?? {}) } as Record<string, any>;
}

/** Mesmas regras do banco: só dígitos, 55 na frente, chave ignora o nono dígito. */
export function telefoneNormal(t: string | null | undefined): string | null {
  const d = String(t ?? '').replace(/\D/g, '');
  if (!d) return null;
  return d.length === 10 || d.length === 11 ? '55' + d : d;
}
export function telefoneChave(t: string | null | undefined): string | null {
  const d = telefoneNormal(t);
  if (!d) return null;
  return d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(0, 4) + d.slice(-8) : d;
}

export const agoraSP = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
