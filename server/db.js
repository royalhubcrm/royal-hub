// Banco local em SQLite, usando o módulo nativo do Node (sem compilar nada).
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pastaDados = path.join(raiz, "data");
if (!fs.existsSync(pastaDados)) fs.mkdirSync(pastaDados, { recursive: true });

export const db = new DatabaseSync(path.join(pastaDados, "royal.db"));

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS imoveis (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  tipo TEXT DEFAULT '',
  bairro TEXT DEFAULT '',
  cidade TEXT DEFAULT 'Uberlândia',
  preco INTEGER DEFAULT 0,
  quartos INTEGER DEFAULT 0,
  suites INTEGER DEFAULT 0,
  vagas INTEGER DEFAULT 0,
  area INTEGER DEFAULT 0,
  foto TEXT DEFAULT '',
  link TEXT DEFAULT '',
  descricao TEXT DEFAULT '',
  status TEXT DEFAULT 'Disponível',
  atualizado_em TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  nome TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  origem TEXT DEFAULT '',
  campanha TEXT DEFAULT '',
  interesse TEXT DEFAULT '',
  temperatura TEXT DEFAULT 'Morno',
  estagio TEXT DEFAULT 'Novo',
  obs TEXT DEFAULT '',
  imoveis TEXT DEFAULT '[]',
  criado_em TEXT,
  atualizado_em TEXT
);

CREATE TABLE IF NOT EXISTS historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL,
  data TEXT,
  texto TEXT
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  nome TEXT DEFAULT '',
  titulo TEXT DEFAULT '',
  subtitulo TEXT DEFAULT '',
  sobre TEXT DEFAULT '',
  cor TEXT DEFAULT '#C9A227',
  fundo TEXT DEFAULT 'escuro',
  fonte TEXT DEFAULT 'classica',
  whats TEXT DEFAULT '',
  email TEXT DEFAULT '',
  endereco TEXT DEFAULT '',
  creci TEXT DEFAULT '',
  filtro TEXT DEFAULT '{}',
  secoes TEXT DEFAULT '[]',
  descricao_pedida TEXT DEFAULT '',
  dominio TEXT DEFAULT '',
  publicado INTEGER DEFAULT 1,
  criado_em TEXT,
  atualizado_em TEXT
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id TEXT PRIMARY KEY,
  jid TEXT DEFAULT '',
  lead_id TEXT DEFAULT '',
  nome TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  data TEXT DEFAULT '',        -- AAAA-MM-DD
  hora TEXT DEFAULT '',        -- HH:MM
  local TEXT DEFAULT '',
  como TEXT DEFAULT '',        -- o trecho da conversa que fechou
  marcado_por TEXT DEFAULT 'bot',
  status TEXT DEFAULT 'Marcado',
  criado_em TEXT
);

CREATE TABLE IF NOT EXISTS interesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT DEFAULT '',
  lead_id TEXT DEFAULT '',
  codigo TEXT,
  origem TEXT DEFAULT 'conversa',
  criado_em TEXT
);

CREATE TABLE IF NOT EXISTS wa_conversas (
  jid TEXT PRIMARY KEY,
  nome TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  bot_ativo INTEGER DEFAULT 1,
  pausado_ate TEXT DEFAULT '',
  ultima TEXT DEFAULT '',
  nao_lidas INTEGER DEFAULT 0,
  atualizado_em TEXT
);

CREATE TABLE IF NOT EXISTS wa_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  de TEXT,              -- cliente | bot | voce
  texto TEXT,
  criado_em TEXT
);

CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT,
  papel TEXT,
  texto TEXT,
  criado_em TEXT
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE INDEX IF NOT EXISTS idx_hist_lead ON historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_imv_bairro ON imoveis(bairro);
`);

const CONFIG_PADRAO = {
  corretor: "Ricardo",
  creci: "",
  empresa: "Royal Negócios Imobiliários",
  whats: "",
  estilo: "",
  botLigado: "1",
  botModo: "novos",          // todos | novos | anuncio
  botHoraInicio: "",         // ex: 08:00 (vazio = sem limite)
  botHoraFim: "",            // ex: 20:00
};

export function lerConfig() {
  const linhas = db.prepare("SELECT chave, valor FROM config").all();
  const cfg = { ...CONFIG_PADRAO };
  for (const l of linhas) cfg[l.chave] = l.valor;
  return cfg;
}

export function gravarConfig(obj) {
  const stmt = db.prepare(
    "INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor"
  );
  for (const [k, v] of Object.entries(obj)) stmt.run(k, String(v ?? ""));
  return lerConfig();
}

// Token que a ponte do WhatsApp usa para falar com o sistema (gerado uma vez)
export function tokenInterno() {
  const cfg = lerConfig();
  if (cfg.tokenInterno) return cfg.tokenInterno;
  const t = crypto.randomUUID();
  gravarConfig({ tokenInterno: t });
  return t;
}

export const agora = () => new Date().toISOString();
export const hoje = () => new Date().toISOString().slice(0, 10);
export const novoId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function registrarHistorico(leadId, texto) {
  db.prepare("INSERT INTO historico (lead_id, data, texto) VALUES (?, ?, ?)").run(
    leadId,
    hoje(),
    texto
  );
}

export function lerLead(id) {
  const l = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
  if (!l) return null;
  return hidratarLead(l);
}

export function hidratarLead(l) {
  return {
    ...l,
    imoveis: JSON.parse(l.imoveis || "[]"),
    historico: db
      .prepare("SELECT data, texto FROM historico WHERE lead_id = ? ORDER BY id")
      .all(l.id),
  };
}

export function listarLeads() {
  return db
    .prepare("SELECT * FROM leads ORDER BY criado_em DESC, rowid DESC")
    .all()
    .map(hidratarLead);
}

export function listarImoveis() {
  return db.prepare("SELECT * FROM imoveis ORDER BY preco ASC").all();
}


/* ==================== WHATSAPP ==================== */
export function waSalvarMensagem(jid, de, texto, nome = "") {
  const t = agora();
  db.prepare(`INSERT INTO wa_conversas (jid, nome, telefone, atualizado_em, ultima)
    VALUES (?,?,?,?,?)
    ON CONFLICT(jid) DO UPDATE SET
      nome = CASE WHEN excluded.nome <> '' THEN excluded.nome ELSE wa_conversas.nome END,
      ultima = excluded.ultima, atualizado_em = excluded.atualizado_em`)
    .run(jid, nome, jid.split("@")[0], t, String(texto).slice(0, 200));
  db.prepare("INSERT INTO wa_mensagens (jid, de, texto, criado_em) VALUES (?,?,?,?)")
    .run(jid, de, String(texto), t);
  if (de === "cliente")
    db.prepare("UPDATE wa_conversas SET nao_lidas = nao_lidas + 1 WHERE jid = ?").run(jid);
  return t;
}

export function waConversas() {
  return db.prepare("SELECT * FROM wa_conversas ORDER BY atualizado_em DESC LIMIT 200").all();
}

export function waMensagens(jid, limite = 200) {
  return db.prepare("SELECT * FROM wa_mensagens WHERE jid = ? ORDER BY id DESC LIMIT ?")
    .all(jid, limite).reverse();
}

export function waLerConversa(jid) {
  return db.prepare("SELECT * FROM wa_conversas WHERE jid = ?").get(jid);
}

export function waDefinirBot(jid, ativo, pausadoAte = "") {
  db.prepare(`INSERT INTO wa_conversas (jid, telefone, bot_ativo, pausado_ate, atualizado_em)
    VALUES (?,?,?,?,?)
    ON CONFLICT(jid) DO UPDATE SET bot_ativo = excluded.bot_ativo, pausado_ate = excluded.pausado_ate`)
    .run(jid, jid.split("@")[0], ativo ? 1 : 0, pausadoAte, agora());
  return waLerConversa(jid);
}

export function waMarcarLido(jid) {
  db.prepare("UPDATE wa_conversas SET nao_lidas = 0 WHERE jid = ?").run(jid);
}

// O bot pode responder nesta conversa agora?
export function waPodeResponder(jid, primeiraMensagem = "") {
  const cfg = lerConfig();
  if (cfg.botLigado !== "1") return { pode: false, motivo: "chatbot desligado no sistema" };

  // horário de atendimento
  if (cfg.botHoraInicio && cfg.botHoraFim) {
    const agoraHM = new Date().toTimeString().slice(0, 5);
    const dentro = cfg.botHoraInicio <= cfg.botHoraFim
      ? agoraHM >= cfg.botHoraInicio && agoraHM <= cfg.botHoraFim
      : agoraHM >= cfg.botHoraInicio || agoraHM <= cfg.botHoraFim;   // vira a noite
    if (!dentro) return { pode: false, motivo: "fora do horário de atendimento" };
  }

  const c = waLerConversa(jid);
  if (c && !c.bot_ativo) return { pode: false, motivo: "bot desligado nesta conversa" };
  if (c && c.pausado_ate && new Date(c.pausado_ate) > new Date())
    return { pode: false, motivo: "você está conduzindo esta conversa" };

  const modo = cfg.botModo || "novos";
  if (modo === "todos") return { pode: true };

  // quantas mensagens essa conversa já tinha antes de hoje
  const total = db.prepare("SELECT COUNT(*) AS t FROM wa_mensagens WHERE jid = ?").get(jid).t;
  const suas = db.prepare("SELECT COUNT(*) AS t FROM wa_mensagens WHERE jid = ? AND de = 'voce'").get(jid).t;

  if (modo === "anuncio") {
    // só atende quem chegou com a mensagem automática do anúncio
    const inicio = db.prepare("SELECT texto FROM wa_mensagens WHERE jid = ? ORDER BY id LIMIT 1").get(jid);
    const texto = String(inicio?.texto || primeiraMensagem || "").toLowerCase();
    const doAnuncio = /gostaria de receber mais informa|vi o an[úu]ncio|tenho interesse no im[óo]vel|vim pelo site/.test(texto);
    if (!doAnuncio) return { pode: false, motivo: "não veio de anúncio" };
    return { pode: true };
  }

  // modo "novos": só conversas sem histórico anterior com você
  if (suas > 0 && total > suas + 2)
    return { pode: false, motivo: "contato antigo — você já conversava com essa pessoa" };
  return { pode: true };
}


/* ==================== AGENDA E INTERESSES ==================== */
export function salvarAgendamento(a) {
  const id = a.id || novoId();
  db.prepare(`INSERT INTO agendamentos
    (id,jid,lead_id,nome,telefone,data,hora,local,como,marcado_por,status,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, hora=excluded.hora,
      local=excluded.local, status=excluded.status, como=excluded.como`)
    .run(id, a.jid || "", a.lead_id || "", a.nome || "", a.telefone || "",
         a.data || "", a.hora || "", a.local || "", a.como || "",
         a.marcado_por || "bot", a.status || "Marcado", a.criado_em || agora());
  return db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(id);
}

// evita gravar o mesmo compromisso duas vezes
export function agendamentoParecido(jid, data, hora) {
  return db.prepare("SELECT * FROM agendamentos WHERE jid = ? AND data = ? AND hora = ? AND status <> 'Cancelado'")
    .get(jid, data, hora);
}

export function listarAgendamentos() {
  return db.prepare("SELECT * FROM agendamentos ORDER BY data, hora").all();
}

export function mudarStatusAgendamento(id, status) {
  db.prepare("UPDATE agendamentos SET status = ? WHERE id = ?").run(status, id);
  return db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(id);
}

export function registrarInteresse(jid, codigo, leadId = "", origem = "conversa") {
  const existe = db.prepare("SELECT id FROM interesses WHERE jid = ? AND codigo = ?").get(jid, codigo);
  if (existe) return;
  db.prepare("INSERT INTO interesses (jid, lead_id, codigo, origem, criado_em) VALUES (?,?,?,?,?)")
    .run(jid, leadId, String(codigo), origem, agora());
}

export function interessesPorConversa(jid) {
  return db.prepare(`SELECT i.codigo, i.criado_em, m.tipo, m.bairro, m.preco, m.foto
    FROM interesses i LEFT JOIN imoveis m ON m.codigo = i.codigo
    WHERE i.jid = ? ORDER BY i.id DESC`).all(jid);
}

export function todosInteresses() {
  return db.prepare(`SELECT i.*, c.nome, c.telefone, m.tipo, m.bairro, m.preco
    FROM interesses i
    LEFT JOIN wa_conversas c ON c.jid = i.jid
    LEFT JOIN imoveis m ON m.codigo = i.codigo
    ORDER BY i.id DESC LIMIT 300`).all();
}

// conversas em que o cliente falou por último e ninguém respondeu mais
export function conversasParadas(dias = 2) {
  const limite = new Date(Date.now() - dias * 864e5).toISOString();
  return db.prepare(`
    SELECT c.*, (SELECT de FROM wa_mensagens WHERE jid = c.jid ORDER BY id DESC LIMIT 1) AS ultimo_de
    FROM wa_conversas c
    WHERE c.atualizado_em < ?
    ORDER BY c.atualizado_em DESC LIMIT 60`).all(limite);
}


/* ==================== SITES DOS CLIENTES ==================== */
// bancos antigos não têm a coluna de domínio
try { db.exec("ALTER TABLE sites ADD COLUMN dominio TEXT DEFAULT ''"); } catch {}

export function salvarSite(s) {
  const id = s.id || novoId();
  const slug = String(s.slug || s.nome || "site").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const existente = db.prepare("SELECT id FROM sites WHERE slug = ? AND id <> ?").get(slug, id);
  if (existente) throw new Error("Já existe um site com esse endereço (" + slug + ").");
  db.prepare(`INSERT INTO sites
    (id,slug,nome,titulo,subtitulo,sobre,cor,fundo,fonte,whats,email,endereco,creci,filtro,secoes,descricao_pedida,dominio,publicado,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      slug=excluded.slug, nome=excluded.nome, titulo=excluded.titulo, subtitulo=excluded.subtitulo,
      sobre=excluded.sobre, cor=excluded.cor, fundo=excluded.fundo, fonte=excluded.fonte,
      whats=excluded.whats, email=excluded.email, endereco=excluded.endereco, creci=excluded.creci,
      filtro=excluded.filtro, secoes=excluded.secoes, descricao_pedida=excluded.descricao_pedida,
      dominio=excluded.dominio, publicado=excluded.publicado, atualizado_em=excluded.atualizado_em`)
    .run(id, slug, s.nome || "", s.titulo || "", s.subtitulo || "", s.sobre || "",
         s.cor || "#C9A227", s.fundo || "escuro", s.fonte || "classica",
         s.whats || "", s.email || "", s.endereco || "", s.creci || "",
         typeof s.filtro === "string" ? s.filtro : JSON.stringify(s.filtro || {}),
         typeof s.secoes === "string" ? s.secoes : JSON.stringify(s.secoes || []),
         s.descricao_pedida || "", String(s.dominio || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
         s.publicado === false ? 0 : 1,
         s.criado_em || agora(), agora());
  return lerSite(slug);
}

const abrirSite = (r) => r ? {
  ...r, publicado: !!r.publicado,
  filtro: JSON.parse(r.filtro || "{}"), secoes: JSON.parse(r.secoes || "[]"),
} : null;

export function lerSite(slug) {
  return abrirSite(db.prepare("SELECT * FROM sites WHERE slug = ?").get(slug));
}
export function lerSitePorId(id) {
  return abrirSite(db.prepare("SELECT * FROM sites WHERE id = ?").get(id));
}
export function listarSites() {
  return db.prepare("SELECT * FROM sites ORDER BY criado_em DESC").all().map(abrirSite);
}
export function apagarSite(id) {
  db.prepare("DELETE FROM sites WHERE id = ?").run(id);
}

// imóveis que aparecem naquele site, conforme o filtro escolhido
export function imoveisDoSite(slug) {
  const s = lerSite(slug);
  if (!s) return [];
  const f = s.filtro || {};
  let lista = listarImoveis();
  if (f.cidade) lista = lista.filter((m) => (m.cidade || "").toLowerCase() === String(f.cidade).toLowerCase());
  if (f.tipos?.length) lista = lista.filter((m) => f.tipos.includes(m.tipo));
  if (f.bairros?.length) lista = lista.filter((m) => f.bairros.includes(m.bairro));
  if (f.precoMin) lista = lista.filter((m) => m.preco >= Number(f.precoMin));
  if (f.precoMax) lista = lista.filter((m) => m.preco <= Number(f.precoMax));
  if (f.somenteComFoto) lista = lista.filter((m) => m.foto);
  return lista;
}


// Descobre qual site responde por um endereço (domínio próprio ou subdomínio)
export function siteDoEndereco(host) {
  host = String(host || "").toLowerCase().split(":")[0];
  if (!host) return null;
  const proprio = db.prepare("SELECT * FROM sites WHERE dominio <> '' AND (dominio = ? OR dominio = ?)")
    .get(host, host.replace(/^www\./, ""));
  if (proprio) return abrirSite(proprio);

  const base = String(process.env.DOMINIO_BASE || "").toLowerCase();
  if (base && host.endsWith("." + base)) {
    const slug = host.slice(0, -(base.length + 1));
    if (slug && slug !== "www") return lerSite(slug);
  }
  return null;
}
