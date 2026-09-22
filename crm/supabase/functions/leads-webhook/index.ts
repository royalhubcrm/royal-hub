// Entrada de leads de anúncios (Make, Zapier, n8n ou o próprio Lead Ads do Meta).
//   POST .../functions/v1/leads-webhook?empresa=<slug>&token=<token>
//   { "nome": "...", "telefone": "...", "email": "...", "interesse": "...", "campanha": "..." }
// Telefone que já existe não duplica: vira uma anotação no histórico do lead.
import { ErroTela, admin, empresaPorSlug, json, responder } from '../_shared/comum.ts';

Deno.serve(responder(async (req) => {
  const url = new URL(req.url);
  const db = admin();
  const empresa = await empresaPorSlug(db, url.searchParams.get('empresa'));
  if (!empresa) throw new ErroTela('Empresa não encontrada.', 404);

  const { data: seg } = await db.from('config_segredos').select('webhook_token').eq('empresa_id', empresa.id).single();

  // o Meta confere o endereço uma vez, usando o token como palavra de verificação
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.verify_token') === seg?.webhook_token;
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '') : new Response('proibido', { status: 403 });
  }

  const token = url.searchParams.get('token') ?? req.headers.get('x-token');
  if (!token || token !== seg?.webhook_token) throw new ErroTela('Token inválido.', 401);

  const b = await req.json().catch(() => ({}));
  // formato do Lead Ads: field_data: [{ name, values: [...] }]
  const campos: Record<string, string> = {};
  if (Array.isArray(b.field_data)) for (const f of b.field_data) campos[f.name] = (f.values ?? [])[0] ?? '';

  const nome = b.nome ?? b.full_name ?? campos.full_name ?? campos.nome ?? '';
  const telefone = b.telefone ?? b.phone_number ?? campos.phone_number ?? campos.telefone ?? '';
  const email = b.email ?? campos.email ?? '';
  const interesse = b.interesse ?? campos.interesse ?? campos.mensagem ?? '';
  const campanha = b.campanha ?? b.ad_name ?? b.campaign_name ?? '';
  if (!nome && !telefone) throw new ErroTela('Lead sem nome e sem telefone.');

  const { data: id, error } = await db.rpc('entrada_lead', {
    p_empresa: empresa.id, p_nome: String(nome), p_telefone: String(telefone), p_email: String(email),
    p_interesse: String(interesse), p_campanha: String(campanha), p_origem: String(b.origem ?? 'Facebook Ads'),
  });
  if (error) throw new ErroTela(error.message);
  return json({ ok: true, id });
}));
