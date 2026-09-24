// WhatsApp: oficial (Cloud API da Meta) ou por QR code (ponte no computador).
//
//   GET  ?empresa=<slug>            → a Meta confere o endereço (palavra de verificação)
//   POST ?empresa=<slug>            → a Meta avisa que chegou mensagem: grava, cria o lead e a assistente responde
//   POST {acao:'enviar'}            → o painel manda uma mensagem sua (com o login de quem está no painel)
//   POST {acao:'retomadas'}         → o agendador (pg_cron) pede as cutucadas do dia; exige o header x-cron-secret
//   POST ?empresa=<slug> {acao:'ponte_mensagem'}  → a ponte (QR code) entrega uma mensagem que chegou; recebe o que responder
//   POST ?empresa=<slug> {acao:'ponte_pendentes'} → a ponte pergunta o que o painel e as retomadas deixaram para enviar
//   As ações da ponte exigem o header x-ponte-token = token do webhook da empresa (Ajustes → Captação).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ErroTela, admin, agoraSP, comoUsuario, configDa, empresaPorSlug, json, quemChamou, responder, telefoneChave, telefoneNormal } from '../_shared/comum.ts';
import { Msg, aplicarMarcadores, carteira, iaConfigurada, imoveisQueServem, instrucoes, leadDoTelefone, lerMarcadores, pedirIA, preferenciaIA } from '../_shared/ia.ts';

type DB = SupabaseClient<any, 'crm'>;
interface Empresa { id: string; nome: string }
const API = 'https://graph.facebook.com/v21.0';
const PAUSA_HORAS = 6;
const SITE = () => (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');

// ---------------------------------------------------------------- canais de envio
/** Por onde a mensagem sai: direto pela Meta, ou numa lista que a ponte entrega. */
interface Canal {
  texto(para: string, texto: string): Promise<void>;
  imagem(para: string, link: string, legenda: string): Promise<void>;
}
interface Envio { telefone: string; tipo: 'texto' | 'imagem'; texto: string; link?: string }

async function chamarMeta(cfg: Record<string, any>, corpo: Record<string, unknown>) {
  const r = await fetch(`${API}/${cfg.wa_numero_id}/messages`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + cfg.wa_token, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroTela('WhatsApp recusou (' + r.status + '): ' + (j?.error?.message ?? 'falhou'), 502);
  return j;
}
const canalMeta = (cfg: Record<string, any>): Canal => ({
  texto: async (para, texto) => { await chamarMeta(cfg, { to: para, type: 'text', text: { preview_url: true, body: texto.slice(0, 4000) } }); },
  imagem: async (para, link, legenda) => { await chamarMeta(cfg, { to: para, type: 'image', image: { link, caption: legenda.slice(0, 1000) } }); },
});
/** Junta os envios numa lista: a ponte recebe na resposta e manda pelo WhatsApp Web. */
function canalLista() {
  const envios: Envio[] = [];
  const canal: Canal = {
    texto: async (telefone, texto) => { envios.push({ telefone, tipo: 'texto', texto }); },
    imagem: async (telefone, link, texto) => { envios.push({ telefone, tipo: 'imagem', texto, link }); },
  };
  return { canal, envios };
}
/** Grava na fila do banco: a ponte busca depois (mensagens do painel e retomadas). */
const canalFila = (db: DB, empresaId: string, conversaId: string | null): Canal => ({
  texto: async (telefone, texto) => { await db.from('fila_whatsapp').insert({ empresa_id: empresaId, conversa_id: conversaId, telefone, tipo: 'texto', texto }); },
  imagem: async (telefone, link, texto) => { await db.from('fila_whatsapp').insert({ empresa_id: empresaId, conversa_id: conversaId, telefone, tipo: 'imagem', texto, link }); },
});
const usaPonte = (cfg: Record<string, any>) => cfg.wa_canal === 'ponte';
const metaPronta = (cfg: Record<string, any>) => !!(cfg.wa_configurado && cfg.wa_token);

// ---------------------------------------------------------------- conversa
async function conversaDo(db: DB, empresaId: string, telefone: string, nome: string) {
  const chave = telefoneChave(telefone);
  const { data } = await db.from('conversas').select('*').eq('empresa_id', empresaId).like('telefone', '%' + telefone.slice(-8));
  const achada = (data ?? []).find((c: any) => telefoneChave(c.telefone) === chave);
  if (achada) {
    if (nome && !achada.nome) await db.from('conversas').update({ nome }).eq('id', achada.id);
    return achada;
  }
  const { data: nova, error } = await db.from('conversas').insert({ empresa_id: empresaId, telefone, nome }).select('*').single();
  if (error) throw error;
  return nova;
}

async function gravar(db: DB, conversa: any, de: 'cliente' | 'bot' | 'voce', texto: string, autorId: string | null = null) {
  await db.from('mensagens').insert({ empresa_id: conversa.empresa_id, conversa_id: conversa.id, de, texto, autor_id: autorId });
  const campos: Record<string, unknown> = { ultima: texto.slice(0, 200), atualizado_em: new Date().toISOString() };
  if (de === 'cliente') campos.nao_lidas = (conversa.nao_lidas ?? 0) + 1;
  if (de === 'voce') { campos.pausado_ate = new Date(Date.now() + PAUSA_HORAS * 36e5).toISOString(); campos.nao_lidas = 0; }
  await db.from('conversas').update(campos).eq('id', conversa.id);
}

/** Acha ou cria o lead desse telefone e liga na conversa. */
async function ligarLead(db: DB, empresa: Empresa, conversa: any, tel: string, nome: string, texto: string) {
  let lead = await leadDoTelefone(db, empresa.id, tel);
  if (!lead) {
    const { data: id } = await db.rpc('entrada_lead', {
      p_empresa: empresa.id, p_nome: nome || tel, p_telefone: tel, p_interesse: texto.slice(0, 200), p_origem: 'WhatsApp',
    });
    lead = { id, nome: nome || tel, telefone: tel };
  }
  if (conversa.lead_id !== lead.id) await db.from('conversas').update({ lead_id: lead.id }).eq('id', conversa.id);
  return lead;
}

/** As regras da Assistente: ligada, modo teste, horário, conversa pausada, quem atender. */
async function podeResponder(db: DB, cfg: Record<string, any>, c: any): Promise<string | null> {
  if (!cfg.bot_ligado) return 'assistente desligada';
  const liberados = String(cfg.bot_numeros ?? '').split(/[,;\n]+/).map((n) => telefoneChave(n)).filter(Boolean);
  if (liberados.length && !liberados.includes(telefoneChave(c.telefone))) return 'fora da lista do modo teste';
  if (cfg.bot_hora_inicio && cfg.bot_hora_fim) {
    const a = agoraSP();
    const hm = `${String(a.getHours()).padStart(2, '0')}:${String(a.getMinutes()).padStart(2, '0')}`;
    const ini = String(cfg.bot_hora_inicio).slice(0, 5), fim = String(cfg.bot_hora_fim).slice(0, 5);
    const dentro = ini <= fim ? hm >= ini && hm <= fim : hm >= ini || hm <= fim;
    if (!dentro) return 'fora do horário';
  }
  if (!c.bot_ativo) return 'desligada nesta conversa';
  if (c.pausado_ate && new Date(c.pausado_ate) > new Date()) return 'você está conduzindo';
  if (cfg.bot_modo === 'todos') return null;

  const { data: msgs } = await db.from('mensagens').select('de, texto').eq('conversa_id', c.id).order('id').limit(50);
  const lista = msgs ?? [];
  if (cfg.bot_modo === 'anuncio') {
    const primeira = String(lista[0]?.texto ?? '').toLowerCase();
    return /gostaria de (receber )?mais informa|vi o an[úu]ncio|tenho interesse no im[óo]vel|vim pelo site/.test(primeira) ? null : 'não veio de anúncio';
  }
  // modo "novos": não atende quem você já atendia antes
  const suas = lista.filter((m: any) => m.de === 'voce').length;
  return suas > 0 && lista.length > suas + 2 ? 'contato antigo — você já conversava com essa pessoa' : null;
}

const PEDIU_PESSOA = /falar com (o |a )?(corretor|corretora|humano|gerente|dono|dona|respons[aá]vel)|atendente|pessoa de verdade|quero falar com algu[ée]m/i;

/** Chegou mensagem do cliente: grava, vira lead e, se as regras deixarem, a assistente responde pelo canal. */
async function atenderCliente(db: DB, empresa: Empresa, cfg: Record<string, any>, tel: string, nome: string, texto: string, canal: Canal, soTexto = true) {
  const conversa = await conversaDo(db, empresa.id, tel, nome);
  await gravar(db, conversa, 'cliente', texto);
  const lead = await ligarLead(db, empresa, conversa, tel, nome, texto);
  if (!soTexto) return 'só texto vai para a IA';
  if (PEDIU_PESSOA.test(texto)) {
    await db.from('conversas').update({ bot_ativo: false }).eq('id', conversa.id);
    return 'pediu atendimento humano — assistente desligada nesta conversa';
  }
  const motivo = await podeResponder(db, cfg, conversa);
  if (motivo) return motivo;
  if (!iaConfigurada()) return 'nenhuma chave de IA configurada';
  await responderComIA(db, empresa, cfg, { ...conversa, lead_id: lead.id }, lead.nome || nome, canal);
  return null;
}

// ---------------------------------------------------------------- mensagem chegando pela Meta
async function atender(db: DB, empresa: Empresa, corpo: any) {
  const cfg = await configDa(db, empresa.id);
  if (!metaPronta(cfg)) return;
  const canal = canalMeta(cfg);

  for (const entrada of corpo?.entry ?? []) for (const mudanca of entrada?.changes ?? []) {
    const v = mudanca?.value ?? {};
    const contatos = Object.fromEntries((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name ?? '']));

    // mensagens que VOCÊ mandou pelo app do celular (coexistência): a assistente recua
    for (const eco of v.message_echoes ?? []) {
      const tel = telefoneNormal(eco.to);
      const texto = eco.text?.body;
      if (!tel || !texto) continue;
      await gravar(db, await conversaDo(db, empresa.id, tel, ''), 'voce', texto);
    }

    for (const msg of v.messages ?? []) {
      const texto = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
        ?? (msg.type === 'image' ? '[foto]' : msg.type === 'audio' ? '[áudio]' : msg.type === 'document' ? '[documento]' : '');
      const tel = telefoneNormal(msg.from);
      if (!texto || !tel) continue;
      chamarMeta(cfg, { status: 'read', message_id: msg.id }).catch(() => null); // tique azul
      const soTexto = !(['image', 'audio', 'document', 'video', 'sticker'].includes(msg.type) && !msg.caption);
      const motivo = await atenderCliente(db, empresa, cfg, tel, contatos[msg.from] ?? '', texto, canal, soTexto);
      if (motivo) console.log(`sem resposta (${motivo})`);
    }
  }
}

async function responderComIA(db: DB, empresa: Empresa, cfg: Record<string, any>, conversa: any, nome: string, canal: Canal) {
  const { data: hist } = await db.from('mensagens').select('de, texto').eq('conversa_id', conversa.id).order('id', { ascending: false }).limit(12);
  const msgs: Msg[] = (hist ?? []).reverse().map((m: any) => ({ role: m.de === 'cliente' ? 'user' : 'assistant', content: m.texto }));
  const procura = (hist ?? []).filter((m: any) => m.de === 'cliente').map((m: any) => m.texto).join(' ').slice(-1200);
  const todos = await carteira(db, empresa.id);

  const m = lerMarcadores(await pedirIA(instrucoes(cfg, empresa.nome, imoveisQueServem(todos, procura)), msgs, 600, preferenciaIA(cfg)));
  const tel = conversa.telefone;

  if (m.texto) {
    for (const parte of m.texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) await canal.texto(tel, parte);
    await gravar(db, conversa, 'bot', m.texto);
  }

  await aplicarMarcadores(db, m, {
    empresaId: empresa.id, conversaId: conversa.id, leadId: conversa.lead_id, nome, telefone: tel, endereco: cfg.endereco ?? '',
  });

  // fotos e links: no lugar do PDF antigo, cada opção vai como foto + link da página do imóvel
  const escolhidos = [
    ...(m.opcoes ? imoveisQueServem(todos, procura, 3) : []),
    ...m.fotos.map((cod) => todos.find((x) => x.codigo === cod)).filter(Boolean),
  ].slice(0, 4) as typeof todos;
  for (const imv of escolhidos) {
    const legenda = `${imv.tipo} no ${imv.bairro} — cód. ${imv.codigo}` +
      (imv.preco ? `\nR$ ${Number(imv.preco).toLocaleString('pt-BR')}` : '') + (SITE() ? `\n${SITE()}/imovel/${imv.id}` : '');
    try {
      if (imv.fotos?.[0]) await canal.imagem(tel, imv.fotos[0], legenda);
      else await canal.texto(tel, legenda);
      await gravar(db, conversa, 'bot', legenda);
      if (m.opcoes) await db.from('interesses').insert({ empresa_id: empresa.id, conversa_id: conversa.id, lead_id: conversa.lead_id, codigo: imv.codigo, origem: 'opcoes' });
    } catch (e) { console.error('foto', (e as Error).message); }
  }
}

// ---------------------------------------------------------------- retomadas
function horarioDeRetomar() {
  const a = agoraSP();
  return !(a.getDay() === 0 || a.getDay() === 6 || a.getHours() < 9 || a.getHours() >= 19);
}

/** Clientes que pararam de responder há 2 dias: uma mensagem curta, no máximo 2 vezes. */
async function retomadasDa(db: DB, emp: Empresa, cfg: Record<string, any>, canalPara: (c: any) => Canal) {
  if (!cfg.bot_ligado) return 0;
  const corte = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data: lista } = await db.from('conversas_lista').select('*').eq('empresa_id', emp.id)
    .lt('atualizado_em', corte).eq('nao_perturbe', false).eq('bot_ativo', true).lt('retomadas', 2)
    .or(`ultima_retomada.is.null,ultima_retomada.lt.${corte}`).neq('ultimo_de', 'cliente').limit(5);
  let enviadas = 0;
  for (const c of lista ?? []) {
    const { data: hist } = await db.from('mensagens').select('de, texto').eq('conversa_id', c.id).order('id', { ascending: false }).limit(12);
    const conversa = (hist ?? []).reverse().map((m: any) => (m.de === 'cliente' ? 'CLIENTE: ' : 'VOCÊ: ') + m.texto).join('\n');
    let texto = `Oi ${String(c.nome || '').split(' ')[0]}, tudo bem? Separei umas opções novas que podem te interessar. Quer dar uma olhada?`;
    try {
      texto = lerMarcadores(await pedirIA(instrucoes(cfg, emp.nome, []), [{ role: 'user', content:
        'Esta conversa parou e o cliente ficou sem responder. Escreva APENAS a mensagem curta de retomada, retomando de onde parou ' +
        'e propondo um horário concreto. Uma ou duas linhas, sem cobrar o cliente, sem código interno.\n\n' + conversa }], 200, preferenciaIA(cfg))).texto || texto;
    } catch { /* usa o texto padrão */ }
    try {
      await canalPara(c).texto(c.telefone, texto);
      await gravar(db, c, 'bot', texto);
      await db.from('conversas').update({ retomadas: (c.retomadas ?? 0) + 1, ultima_retomada: new Date().toISOString() }).eq('id', c.id);
      enviadas++;
    } catch (e) { console.error('retomada', (e as Error).message); }
  }
  return enviadas;
}

/** O agendador: todas as empresas. Pela Meta manda na hora; pela ponte deixa na fila. */
async function retomadas(db: DB) {
  if (!horarioDeRetomar()) return { enviadas: 0, motivo: 'fora do horário comercial' };
  const { data: empresas } = await db.from('empresas').select('id, nome').eq('ativa', true);
  let enviadas = 0;
  for (const emp of empresas ?? []) {
    const cfg = await configDa(db, emp.id);
    if (usaPonte(cfg)) enviadas += await retomadasDa(db, emp, cfg, (c) => canalFila(db, emp.id, c.id));
    else if (metaPronta(cfg)) enviadas += await retomadasDa(db, emp, cfg, () => canalMeta(cfg));
  }
  return { enviadas };
}

// ---------------------------------------------------------------- ponte (QR code)
/** A ponte se identifica com o token do webhook da empresa (o mesmo de Ajustes → Captação). */
async function ponteAutorizada(db: DB, req: Request, empresa: Empresa) {
  const token = req.headers.get('x-ponte-token') ?? '';
  const { data: seg } = await db.from('config_segredos').select('webhook_token').eq('empresa_id', empresa.id).single();
  if (!token || !seg?.webhook_token || token !== seg.webhook_token) throw new ErroTela('Token da ponte inválido.', 401);
}

async function ponteMensagem(db: DB, empresa: Empresa, b: any) {
  const cfg = await configDa(db, empresa.id);
  const tel = telefoneNormal(b.telefone);
  const texto = String(b.texto ?? '').trim();
  if (!tel || !texto) throw new ErroTela('Faltou telefone ou texto.');
  const nome = String(b.nome ?? '').slice(0, 120);

  if (b.de === 'voce') { // você escreveu pelo celular: registra e a assistente recua
    await gravar(db, await conversaDo(db, empresa.id, tel, ''), 'voce', texto);
    return { envios: [], motivo: 'sua mensagem registrada; assistente pausada por ' + PAUSA_HORAS + 'h' };
  }
  if (!usaPonte(cfg)) return { envios: [], motivo: 'em Ajustes o WhatsApp está como oficial, não como ponte' };
  const { canal, envios } = canalLista();
  const motivo = await atenderCliente(db, empresa, cfg, tel, nome, texto, canal);
  return { envios, motivo };
}

/** A ponte conta em que pé está: 'qr' (com o código para a tela mostrar), 'ligada', 'caiu' ou 'saiu' (deslogou no celular). */
async function ponteEstado(db: DB, empresa: Empresa, b: any) {
  const agora = new Date().toISOString();
  const estado = String(b.estado ?? '');
  const campos: Record<string, unknown> =
    estado === 'qr' ? { ponte_qr: String(b.qr ?? '').slice(0, 1000), ponte_qr_em: agora }
    : estado === 'ligada' ? { ponte_qr: null, ponte_qr_em: null, ponte_visto_em: agora, ponte_numero: String(b.numero ?? '').replace(/\D/g, '').slice(0, 20) }
    : estado === 'saiu' ? { ponte_qr: null, ponte_qr_em: null, ponte_visto_em: null, ponte_numero: '' }
    : { ponte_qr: null, ponte_qr_em: null }; // caiu: mantém o visto_em, a tela avisa quando passar dos 3 min
  await db.from('config').update(campos).eq('empresa_id', empresa.id);
  return { ok: true };
}

/** O que a ponte precisa entregar: mensagens do painel e retomadas do dia. Marca como entregue ao devolver. */
async function pontePendentes(db: DB, empresa: Empresa) {
  const cfg = await configDa(db, empresa.id);
  await db.from('config').update({ ponte_visto_em: new Date().toISOString() }).eq('empresa_id', empresa.id);
  if (usaPonte(cfg) && horarioDeRetomar()) await retomadasDa(db, empresa, cfg, (c) => canalFila(db, empresa.id, c.id)).catch((e) => console.error('retomadas', e));
  const { data } = await db.from('fila_whatsapp').select('id, telefone, tipo, texto, link').eq('empresa_id', empresa.id).is('enviado_em', null).order('id').limit(20);
  const envios = data ?? [];
  if (envios.length) await db.from('fila_whatsapp').update({ enviado_em: new Date().toISOString() }).in('id', envios.map((e: any) => e.id));
  return { envios, canal: cfg.wa_canal ?? 'oficial', assistente_ligada: !!cfg.bot_ligado };
}

// ---------------------------------------------------------------- assinatura da Meta (opcional)
async function assinaturaOk(req: Request, bruto: string) {
  const segredo = Deno.env.get('META_APP_SECRET');
  if (!segredo) return true; // sem o segredo configurado, não confere (ver LEIA-ME)
  const recebida = (req.headers.get('x-hub-signature-256') ?? '').replace('sha256=', '');
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(bruto));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === recebida;
}

// ---------------------------------------------------------------- entrada
Deno.serve(responder(async (req) => {
  const url = new URL(req.url);
  const db = admin();

  if (req.method === 'GET') {
    const empresa = await empresaPorSlug(db, url.searchParams.get('empresa'));
    if (!empresa) return new Response('empresa não encontrada', { status: 404 });
    const cfg = await configDa(db, empresa.id);
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === cfg.wa_verificacao;
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '') : new Response('proibido', { status: 403 });
  }

  const bruto = await req.text();
  const corpo = JSON.parse(bruto || '{}');

  // ---- o painel mandando uma mensagem sua
  if (corpo.acao === 'enviar') {
    const eu = await quemChamou(req, db);
    const texto = String(corpo.texto ?? '').trim();
    if (!texto) throw new ErroTela('Escreva a mensagem.');
    // lida com o login de quem pediu: o RLS garante que a conversa é visível para essa pessoa
    const { data: visivel } = await comoUsuario(req).from('conversas').select('id').eq('id', corpo.conversa_id).maybeSingle();
    const { data: c } = await db.from('conversas').select('*').eq('id', corpo.conversa_id).maybeSingle();
    if (!visivel || !c || c.empresa_id !== eu.empresa_id) throw new ErroTela('Conversa não encontrada.', 404);
    const cfg = await configDa(db, eu.empresa_id);
    if (usaPonte(cfg)) await canalFila(db, eu.empresa_id, c.id).texto(c.telefone, texto);
    else if (metaPronta(cfg)) await canalMeta(cfg).texto(c.telefone, texto);
    else throw new ErroTela('Ligue o WhatsApp em Ajustes primeiro.');
    await gravar(db, c, 'voce', texto, eu.id);
    return json({ ok: true, pela_ponte: usaPonte(cfg) });
  }

  // ---- o agendador pedindo as retomadas
  if (corpo.acao === 'retomadas') {
    const segredo = Deno.env.get('CRON_SECRET');
    if (!segredo || req.headers.get('x-cron-secret') !== segredo) throw new ErroTela('proibido', 403);
    return json(await retomadas(db));
  }

  // ---- a ponte (QR code) conversando com o sistema
  if (corpo.acao === 'ponte_mensagem' || corpo.acao === 'ponte_pendentes' || corpo.acao === 'ponte_estado') {
    const empresa = await empresaPorSlug(db, url.searchParams.get('empresa'));
    if (!empresa) throw new ErroTela('Empresa não encontrada.', 404);
    await ponteAutorizada(db, req, empresa);
    if (corpo.acao === 'ponte_estado') return json(await ponteEstado(db, empresa, corpo));
    return json(corpo.acao === 'ponte_mensagem' ? await ponteMensagem(db, empresa, corpo) : await pontePendentes(db, empresa));
  }

  // ---- a Meta avisando que chegou mensagem
  if (!(await assinaturaOk(req, bruto))) return new Response('assinatura inválida', { status: 401 });
  const empresa = await empresaPorSlug(db, url.searchParams.get('empresa'));
  if (!empresa) return new Response('ok'); // responde 200 para a Meta não ficar reenviando
  const trabalho = atender(db, empresa, corpo).catch((e) => console.error('whatsapp:', e));
  // devolve 200 na hora (a Meta exige) e termina o atendimento em segundo plano
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(trabalho); else await trabalho;
  return new Response('ok');
}));
