import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  db, lerConfig, gravarConfig, agora, hoje, novoId,
  registrarHistorico, lerLead, listarLeads, listarImoveis,
  waSalvarMensagem, waConversas, waMensagens, waLerConversa,
  waDefinirBot, waMarcarLido, waPodeResponder, tokenInterno,
  salvarAgendamento, listarAgendamentos, mudarStatusAgendamento, agendamentoParecido,
  registrarInteresse, interessesPorConversa, todosInteresses, conversasParadas,
  salvarSite, lerSite, lerSitePorId, listarSites, apagarSite, imoveisDoSite, siteDoEndereco,
  salvarDuvida, duvidasAbertas, fecharDuvida,
  bancoBruto,
} from "./db.js";
import { sincronizarNoInicio, despedir, nuvemLigada, subirFotosLocais } from "./supabase.js";
import {
  PAPEIS, podeAcessar, criarUsuario, atualizarUsuario, apagarUsuario, listarUsuarios,
  contarUsuarios, lerUsuarioPorEmail, conferirSenha, abrirSessao, usuarioDaSessao,
  encerrarSessao, gerarCodigo, conferirCodigo, queimarCodigo, trocarSenhaPorEmail,
  COOKIE, lerCookie,
} from "./auth.js";
import { enviarEmail, emailConfigurado } from "./email.js";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = express();
const PORTA = Number(process.env.PORT) || 3000;
const SENHA = process.env.APP_SENHA || "";
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || "royal-webhook";
const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ==================== LOGIN E PERMISSÕES ==================== */
// Endereços que qualquer pessoa alcança, sem conta
const LIVRE = [
  /^\/login/, /^\/api\/auth\//, /^\/captar/, /^\/api\/captacao/,
  /^\/imovel\//, /^\/api\/webhook/, /^\/fotos\//, /^\/site\//, /^\/api\/site-publico\//, /^\/api\/site-daqui/,
  /^\/manifest/, /^\/sw\.js$/, /^\/icones\//,
  /\.css$/, /\.js$/, /\.png$/, /\.jpg$/, /\.jpeg$/, /\.svg$/, /\.ico$/,
];
// a ponte do WhatsApp se identifica por um token próprio
const daPonte = (req) => req.headers["x-royal-token"] === tokenInterno();

// GET de um imóvel é público (a página do cliente usa)
function ehLivre(req) {
  if (LIVRE.some((r) => r.test(req.path))) return true;
  if (req.method === "GET" && /^\/api\/imoveis\/[^/]+$/.test(req.path)) return true;
  return false;
}

// Endereço próprio do cliente: o site dele responde já na raiz
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/site/")) return next();
  const site = siteDoEndereco(req.headers.host);
  if (!site || !site.publicado) return next();
  req.siteDoHost = site;
  if (req.path === "/" || /^\/imovel\/[^/]+$/.test(req.path))
    return res.sendFile(path.join(raiz, "public", "site.html"));
  next();
});

app.use((req, res, next) => {
  req.usuario = usuarioDaSessao(lerCookie(req, COOKIE));
  if (ehLivre(req)) return next();

  // a ponte do WhatsApp pode usar só as rotas de que precisa
  if (daPonte(req) && /^\/api\/(wa|chat|leads)/.test(req.path)) return next();

  if (!req.usuario) {
    if (req.path.startsWith("/api/")) return res.status(401).json({ erro: "Faça login." });
    return res.redirect("/login");
  }

  // quem pode o quê
  const area =
    req.path.startsWith("/api/usuarios") || req.path.startsWith("/api/config") ||
    req.path.startsWith("/api/sites") ? "admin" :
    req.path.startsWith("/api/leads") ? "leads" :
    req.path.startsWith("/api/imoveis") ? "imoveis" :
    req.path.startsWith("/api/wa") ? "conversas" :
    req.path.startsWith("/api/chat") ? "chatbot" :
    req.path.startsWith("/api/gerencia") || req.path.startsWith("/api/agendamentos") ? "gerencia" : "";

  if (area === "gerencia" && req.usuario.papel === "admin") return next();
  if (area === "admin" && req.usuario.papel !== "admin")
    return res.status(403).json({ erro: "Só o administrador pode fazer isso." });
  if (area && area !== "admin" && !podeAcessar(req.usuario, area))
    return res.status(403).json({ erro: "Seu perfil não tem acesso a essa parte." });

  next();
});

app.get("/login", (req, res) => res.sendFile(path.join(raiz, "public", "login.html")));

app.get("/api/auth/estado", (req, res) =>
  res.json({
    usuario: req.usuario || null,
    primeiroAcesso: contarUsuarios() === 0,
    emailConfigurado: emailConfigurado(),
    papeis: Object.fromEntries(Object.entries(PAPEIS).map(([k, v]) => [k, v.nome])),
  }));

// primeiro administrador — só funciona enquanto não existir ninguém
app.post("/api/auth/primeiro-acesso", (req, res) => {
  try {
    if (contarUsuarios() > 0) return res.status(400).json({ erro: "O sistema já tem contas." });
    const u = criarUsuario({ ...req.body, papel: "admin" });
    const { token } = abrirSessao(u.id);
    res.cookie?.(COOKIE, token);
    res.set("Set-Cookie", biscoito(req, token));
    res.json({ usuario: u });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

app.post("/api/auth/entrar", (req, res) => {
  const { email, senha } = req.body || {};
  const u = lerUsuarioPorEmail(email);
  if (!u || !conferirSenha(senha || "", u.senha))
    return res.status(401).json({ erro: "E-mail ou senha incorretos." });
  if (!u.ativo) return res.status(403).json({ erro: "Esta conta está desativada." });
  const { token } = abrirSessao(u.id);
  res.set("Set-Cookie", biscoito(req, token));
  res.json({ usuario: { ...u, senha: undefined } });
});

app.post("/api/auth/sair", (req, res) => {
  encerrarSessao(lerCookie(req, COOKIE));
  res.set("Set-Cookie", COOKIE + "=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

// esqueci a senha: manda código de 6 dígitos
app.post("/api/auth/esqueci", async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const r = gerarCodigo(email);
  if (r) {
    const texto = `Olá ${r.usuario.nome},\n\nSeu código para criar uma senha nova no Royal Hub é:\n\n` +
      `    ${r.codigo}\n\nEle vale por 20 minutos. Se não foi você que pediu, ignore este e-mail.`;
    try {
      if (emailConfigurado()) await enviarEmail({ para: r.usuario.email, assunto: "Código para recuperar sua senha", texto });
      else console.log("\n  [recuperação de senha] código de " + r.usuario.email + ": " + r.codigo + "\n");
    } catch (e) {
      console.log("\n  [recuperação] não consegui enviar o e-mail (" + e.message + ")");
      console.log("  código de " + r.usuario.email + ": " + r.codigo + "\n");
    }
  }
  // resposta igual existindo ou não a conta, para não entregar quem tem cadastro
  res.json({ ok: true, porEmail: emailConfigurado() });
});

app.post("/api/auth/redefinir", (req, res) => {
  const { email, codigo, senha } = req.body || {};
  const c = conferirCodigo(email, codigo);
  if (!c.ok) return res.status(400).json({ erro: c.erro });
  try {
    trocarSenhaPorEmail(email, senha);
    queimarCodigo(email);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

/* ==================== USUÁRIOS (só administrador) ==================== */
app.get("/api/usuarios", (req, res) => res.json(listarUsuarios()));

app.post("/api/usuarios", (req, res) => {
  try { res.json(criarUsuario(req.body || {})); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

app.put("/api/usuarios/:id", (req, res) => {
  try { res.json(atualizarUsuario(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

app.delete("/api/usuarios/:id", (req, res) => {
  if (req.params.id === req.usuario?.id)
    return res.status(400).json({ erro: "Você não pode apagar a própria conta." });
  apagarUsuario(req.params.id);
  res.json({ ok: true });
});

// Permite que a página da Chave7 (aberta no seu navegador) envie imóveis para cá
app.use("/api/imoveis/importar", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "content-type");
  res.set("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ==================== IMÓVEIS ==================== */
app.get("/api/imoveis", (req, res) => res.json(listarImoveis()));

app.get("/api/imoveis/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM imoveis WHERE id = ? OR codigo = ?").get(req.params.id, req.params.id);
  m ? res.json(m) : res.status(404).json({ erro: "Imóvel não encontrado." });
});

app.post("/api/imoveis", (req, res) => {
  const m = normalizarImovel(req.body);
  if (!m.codigo) return res.status(400).json({ erro: "Informe o código do imóvel." });
  salvarImovel(m);
  res.json(m);
});

app.post("/api/imoveis/importar", (req, res) => {
  const itens = Array.isArray(req.body.itens) ? req.body.itens : [];
  let n = 0;
  for (const bruto of itens) {
    const m = normalizarImovel(bruto);
    if (!m.codigo) continue;
    salvarImovel(m);
    n++;
  }
  res.json({ importados: n, total: listarImoveis().length });
});

app.delete("/api/imoveis/:id", (req, res) => {
  db.prepare("DELETE FROM imoveis WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

function normalizarImovel(o = {}) {
  const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
  const codigo = String(o.codigo || o.cod || o.id || "").trim();
  return {
    id: codigo, codigo,
    tipo: String(o.tipo || "").trim(),
    bairro: String(o.bairro || "").trim(),
    cidade: String(o.cidade || "Uberlândia").trim(),
    preco: num(o.preco), quartos: num(o.quartos), suites: num(o.suites),
    vagas: num(o.vagas), area: num(o.area),
    foto: String(o.foto || "").trim(),
    link: String(o.link || "").trim(),
    descricao: String(o.descricao || "").trim(),
    status: String(o.status || "Disponível").trim(),
    atualizado_em: agora(),
  };
}
function salvarImovel(m) {
  db.prepare(`INSERT INTO imoveis
    (id,codigo,tipo,bairro,cidade,preco,quartos,suites,vagas,area,foto,link,descricao,status,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      codigo=excluded.codigo, tipo=excluded.tipo, bairro=excluded.bairro, cidade=excluded.cidade,
      preco=excluded.preco, quartos=excluded.quartos, suites=excluded.suites, vagas=excluded.vagas,
      area=excluded.area, foto=excluded.foto, link=excluded.link, descricao=excluded.descricao,
      status=excluded.status, atualizado_em=excluded.atualizado_em`)
    .run(m.id, m.codigo, m.tipo, m.bairro, m.cidade, m.preco, m.quartos, m.suites,
         m.vagas, m.area, m.foto, m.link, m.descricao, m.status, m.atualizado_em);
}

/* ==================== LEADS ==================== */
app.get("/api/leads", (req, res) => res.json(listarLeads()));
app.get("/api/leads/:id", (req, res) => {
  const l = lerLead(req.params.id);
  l ? res.json(l) : res.status(404).json({ erro: "Lead não encontrado." });
});

app.post("/api/leads", (req, res) => {
  const b = req.body || {};
  const existente = b.id ? lerLead(b.id) : null;
  const l = {
    id: b.id || novoId(),
    nome: String(b.nome || "").trim(),
    telefone: String(b.telefone || "").trim(),
    email: String(b.email || "").trim(),
    origem: String(b.origem || "").trim(),
    campanha: String(b.campanha || "").trim(),
    interesse: String(b.interesse || "").trim(),
    temperatura: b.temperatura || "Morno",
    estagio: b.estagio || "Novo",
    obs: String(b.obs || ""),
    imoveis: JSON.stringify(Array.isArray(b.imoveis) ? b.imoveis : []),
    criado_em: existente?.criado_em || b.criado_em || hoje(),
    atualizado_em: agora(),
  };
  db.prepare(`INSERT INTO leads
    (id,nome,telefone,email,origem,campanha,interesse,temperatura,estagio,obs,imoveis,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      nome=excluded.nome, telefone=excluded.telefone, email=excluded.email, origem=excluded.origem,
      campanha=excluded.campanha, interesse=excluded.interesse, temperatura=excluded.temperatura,
      estagio=excluded.estagio, obs=excluded.obs, imoveis=excluded.imoveis, atualizado_em=excluded.atualizado_em`)
    .run(l.id, l.nome, l.telefone, l.email, l.origem, l.campanha, l.interesse,
         l.temperatura, l.estagio, l.obs, l.imoveis, l.criado_em, l.atualizado_em);

  if (!existente) registrarHistorico(l.id, "Lead criado (" + (l.origem || "manual") + ")");
  else if (existente.estagio !== l.estagio)
    registrarHistorico(l.id, "Estágio: " + existente.estagio + " → " + l.estagio);

  res.json(lerLead(l.id));
});

app.delete("/api/leads/:id", (req, res) => {
  db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM historico WHERE lead_id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/leads/:id/nota", (req, res) => {
  const texto = String(req.body?.texto || "").trim();
  if (!texto) return res.status(400).json({ erro: "Escreva a anotação." });
  registrarHistorico(req.params.id, texto);
  res.json(lerLead(req.params.id));
});


// Importa uma lista de leads (colada da planilha ou em JSON)
function separarLinha(linha) {
  if (linha.includes("\t")) return linha.split("\t");
  if (linha.includes(";")) return linha.split(";");
  // vírgula respeitando aspas
  const partes = []; let atual = "", aspas = false;
  for (const c of linha) {
    if (c === '"') aspas = !aspas;
    else if (c === "," && !aspas) { partes.push(atual); atual = ""; }
    else atual += c;
  }
  partes.push(atual);
  return partes;
}

const semAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

app.post("/api/leads/importar", (req, res) => {
  let itens = Array.isArray(req.body?.itens) ? req.body.itens : null;

  if (!itens) {
    const texto = String(req.body?.texto || "").trim();
    if (!texto) return res.status(400).json({ erro: "Cole a planilha ou envie a lista." });
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
    if (linhas.length < 1) return res.status(400).json({ erro: "Nada para importar." });

    // descobre as colunas pelo cabeçalho
    const cab = separarLinha(linhas[0]).map(semAcento);
    const acha = (...nomes) => cab.findIndex((c) => nomes.some((n) => c.includes(n)));
    const col = {
      nome: acha("nome", "cliente", "contato"),
      telefone: acha("telefone", "whats", "celular", "fone", "tel"),
      email: acha("email", "e-mail"),
      interesse: acha("interesse", "imovel", "procura", "busca", "observ", "obs"),
      origem: acha("origem", "fonte", "canal"),
      temperatura: acha("temperatura", "status", "classific"),
      estagio: acha("estagio", "etapa", "funil"),
    };
    const temCabecalho = col.nome >= 0 || col.telefone >= 0;
    const corpo = temCabecalho ? linhas.slice(1) : linhas;

    itens = corpo.map((l) => {
      const p = separarLinha(l).map((x) => x.replace(/^"|"$/g, "").trim());
      if (!temCabecalho) {
        // sem cabeçalho: adivinha pelo formato (o que tem muitos dígitos é telefone)
        const tel = p.find((x) => (x.match(/\d/g) || []).length >= 8) || "";
        const mail = p.find((x) => x.includes("@")) || "";
        const nome = p.find((x) => x && x !== tel && x !== mail) || "";
        return { nome, telefone: tel, email: mail, interesse: p.filter(x => x && x!==nome && x!==tel && x!==mail).join(" ") };
      }
      const v = (i) => (i >= 0 ? p[i] || "" : "");
      return {
        nome: v(col.nome), telefone: v(col.telefone), email: v(col.email),
        interesse: v(col.interesse), origem: v(col.origem),
        temperatura: v(col.temperatura), estagio: v(col.estagio),
      };
    });
  }

  const TEMPS = ["Quente", "Morno", "Frio"];
  const ETAPAS = ["Novo", "Em contato", "Visita", "Proposta", "Fechado", "Perdido"];
  const existentes = listarLeads();
  let novos = 0, repetidos = 0, ignorados = 0;

  for (const o of itens) {
    const nome = String(o.nome || "").trim();
    const telefone = String(o.telefone || "").trim();
    if (!nome && !telefone) { ignorados++; continue; }

    const soDigitos = telefone.replace(/\D/g, "");
    const repetido = existentes.find((l) =>
      (soDigitos && String(l.telefone).replace(/\D/g, "") === soDigitos) ||
      (!soDigitos && nome && semAcento(l.nome) === semAcento(nome)));
    if (repetido) { repetidos++; continue; }

    const temp = TEMPS.find((t) => semAcento(t) === semAcento(o.temperatura)) || "Morno";
    const etapa = ETAPAS.find((e) => semAcento(e) === semAcento(o.estagio)) || "Novo";
    const id = novoId();
    db.prepare(`INSERT INTO leads (id,nome,telefone,email,origem,campanha,interesse,temperatura,estagio,obs,imoveis,criado_em,atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, nome || telefone, telefone, String(o.email || ""),
           String(o.origem || "Planilha"), "", String(o.interesse || ""),
           temp, etapa, "", "[]", hoje(), agora());
    registrarHistorico(id, "Importado de planilha");
    existentes.push({ id, nome, telefone });
    novos++;
  }
  res.json({ novos, repetidos, ignorados, total: listarLeads().length });
});

/* ==================== CAPTAÇÃO (formulário público) ==================== */
app.post("/api/captacao", (req, res) => {
  const b = req.body || {};
  if (!b.nome || !b.telefone) return res.status(400).json({ erro: "Preencha nome e WhatsApp." });
  const id = novoId();
  db.prepare(`INSERT INTO leads (id,nome,telefone,email,origem,campanha,interesse,temperatura,estagio,obs,imoveis,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(b.nome).trim(), String(b.telefone).trim(), String(b.email || ""),
         "Formulário", String(b.campanha || ""), String(b.interesse || ""),
         "Morno", "Novo", "", "[]", hoje(), agora());
  registrarHistorico(id, "Entrou pelo formulário público");
  res.json({ ok: true });
});

/* ==================== WEBHOOK META (Facebook / Instagram) ==================== */
// Verificação do Facebook
app.get("/api/webhook/meta", (req, res) => {
  if (req.query["hub.verify_token"] === WEBHOOK_TOKEN) return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

// Recebe o lead (do Facebook, Make, Zapier, n8n...)
app.post("/api/webhook/meta", (req, res) => {
  const token = req.query.token || req.headers["x-token"];
  if (token !== WEBHOOK_TOKEN) return res.status(401).json({ erro: "Token inválido." });

  const b = req.body || {};
  // Formato do Lead Ads: field_data: [{name, values:[...]}]
  const campos = {};
  if (Array.isArray(b.field_data)) for (const f of b.field_data) campos[f.name] = (f.values || [])[0] || "";

  const nome = b.nome || b.full_name || campos.full_name || campos.nome || "";
  const telefone = b.telefone || b.phone_number || campos.phone_number || campos.telefone || "";
  const email = b.email || campos.email || "";
  const interesse = b.interesse || campos.interesse || campos.mensagem || "";
  const campanha = b.campanha || b.ad_name || b.campaign_name || "";

  if (!nome && !telefone) return res.status(400).json({ erro: "Lead sem nome e sem telefone." });

  const id = novoId();
  db.prepare(`INSERT INTO leads (id,nome,telefone,email,origem,campanha,interesse,temperatura,estagio,obs,imoveis,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(nome), String(telefone), String(email), b.origem || "Facebook Ads",
         String(campanha), String(interesse), "Morno", "Novo", "", "[]", hoje(), agora());
  registrarHistorico(id, "Lead recebido do anúncio" + (campanha ? " — " + campanha : ""));
  res.json({ ok: true, id });
});

// Cookie de sessão: dura 90 dias, então o login fica salvo no aparelho.
// Em endereço https (Render, domínio próprio) vai com Secure.
function biscoito(req, token) {
  const https = req.secure || req.headers["x-forwarded-proto"] === "https";
  return COOKIE + "=" + token + "; HttpOnly; Path=/; Max-Age=" + 90 * 86400 +
    "; SameSite=Lax" + (https ? "; Secure" : "");
}

/* ==================== CONFIG ==================== */
app.get("/api/config", (req, res) =>
  res.json({ ...lerConfig(), iaLigada: Boolean(process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) }));
app.put("/api/config", (req, res) => res.json(gravarConfig(req.body || {})));

/* ============ ASSINATURA DOS DADOS ============
   O painel pergunta aqui antes de baixar as listas grandes. Se a assinatura
   for a mesma de antes, ele usa o que já está guardado no navegador e não
   faz requisição à toa. */
const resumo = (tabela, coluna = "atualizado_em") => {
  const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(${coluna}),'') AS u FROM ${tabela}`).get();
  return r.n + "|" + r.u;
};

const impressao = (texto) => {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

app.get("/api/versao", (req, res) => {
  const cfg = lerConfig();
  delete cfg.tokenInterno;
  res.json({
    imoveis: resumo("imoveis"),
    leads: resumo("leads"),
    sites: resumo("sites"),
    usuarios: resumo("usuarios", "ultimo_acesso"),
    config: impressao(JSON.stringify(cfg)),
    nuvem: nuvemLigada(),
  });
});

/* ==================== CHATBOT ==================== */
function estiloDoCorretor() {
  const arq = path.join(raiz, "server", "estilo.md");
  try { return fs.existsSync(arq) ? fs.readFileSync(arq, "utf8").trim() : ""; }
  catch { return ""; }
}

// ---- data e hora reais, fuso de Brasília ----
const emUberlandia = (opcoes) =>
  new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...opcoes });

const horaDeUberlandia = () => emUberlandia({ hour: "2-digit", minute: "2-digit" });
const dataPorExtenso = () =>
  emUberlandia({ weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

function amanhaPorExtenso() {
  const d = new Date(Date.now() + 864e5);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" });
}

function diaDaSemanaAgora() {
  const n = emUberlandia({ weekday: "short" }).toLowerCase();
  return n.startsWith("dom") ? 0 : n.startsWith("seg") ? 1 : n.startsWith("ter") ? 2
    : n.startsWith("qua") ? 3 : n.startsWith("qui") ? 4 : n.startsWith("sex") ? 5 : 6;
}

function saudacaoAgora() {
  const h = Number(new Date().toLocaleString("en-US",
    { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// Escolhe quais imóveis entram no prompt. Mandar a carteira inteira é caro e
// atrapalha: aqui vai só o que tem a ver com o que o cliente falou.
const semAcentoSimples = (t) =>
  String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function imoveisQueServem(procura = "") {
  const todos = listarImoveis();
  if (!todos.length) return [];
  const texto = semAcentoSimples(procura);
  if (!texto) return todos.slice(0, 60);

  // código citado tem prioridade absoluta
  const codigos = new Set((texto.match(/\b\d{4}\b/g) || []));
  const citados = todos.filter((m) => codigos.has(String(m.codigo)));

  let teto = 0;
  const mMil = texto.match(/(\d{2,4})\s*(mil|k)\b/);
  const mReal = texto.match(/r?\$?\s*([\d.]{6,})/);
  if (mMil) teto = Number(mMil[1]) * 1000;
  else if (mReal) teto = Number(mReal[1].replace(/\./g, ""));

  const mQ = texto.match(/(\d)\s*(quarto|qto|dorm)/);
  const quartos = mQ ? Number(mQ[1]) : 0;

  const tipo = /\bcasa/.test(texto) ? "Casa"
    : /apartamento|apto|\bap\b/.test(texto) ? "Apartamento"
    : /lote|terreno/.test(texto) ? "Lote/Terreno"
    : /chacara/.test(texto) ? "Chácara" : "";

  const bairros = [...new Set(todos.map((m) => m.bairro).filter(Boolean))]
    .filter((b) => texto.includes(semAcentoSimples(b)));

  const combina = (m) =>
    (!teto || (m.preco && m.preco <= teto * 1.1)) &&
    (!quartos || (m.quartos || 0) >= quartos) &&
    (!tipo || m.tipo === tipo) &&
    (!bairros.length || bairros.includes(m.bairro));

  const achados = todos.filter(combina);
  const escolhidos = [...citados, ...achados.filter((m) => !codigos.has(String(m.codigo)))];
  // sem nada específico, mostra um apanhado geral para ela não ficar cega
  return (escolhidos.length ? escolhidos : todos).slice(0, 40);
}

/* ==========================================================================
   O system prompt do chatbot. Montado a cada mensagem, com três partes:
   as regras daqui, o arquivo server/estilo.md (a sua voz) e a carteira.
   ========================================================================== */
function instrucoes(procura = "") {
  const c = lerConfig();
  const assistente = c.assistente || "Camila";
  const empresa = c.empresa || "Royal Negócios Imobiliários";
  const corretor = c.corretor || "Ricardo";
  const endereco = c.endereco || "R. José Nonato Ribeiro, 428 — Cazeca, Uberlândia-MG, 38400-066";

  // a carteira vem filtrada pelo que o cliente falou; sem filtro, os primeiros 60
  const ficha = (m) =>
    `${m.codigo} | ${m.tipo || "?"} | ${m.bairro || "?"}${m.cidade ? ", " + m.cidade : ""} | ` +
    `${m.preco ? "R$ " + m.preco.toLocaleString("pt-BR") : "sob consulta"} | ` +
    `${m.quartos} qto, ${m.suites} suíte, ${m.vagas} vaga, ${m.area} m²` +
    `${m.descricao ? " | " + m.descricao.slice(0, 120) : ""}`;

  const lista = imoveisQueServem(procura);
  const carteira = lista.map(ficha).join("\n") || "(carteira vazia)";
  const fimDeSemana = [0, 6].includes(diaDaSemanaAgora());

  return `[AGORA — data real do sistema, absoluta; nunca calcule nem presuma]
Hoje é ${dataPorExtenso()}, ${horaDeUberlandia()} em Uberlândia. Amanhã é ${amanhaPorExtenso()}.
O cumprimento certo neste momento é "${saudacaoAgora()}".${fimDeSemana ? "\nHoje é fim de semana — o escritório está fechado; não marque atendimento para hoje." : ""}

Você é a ${assistente}, assistente do corretor ${corretor} na ${empresa}, em Uberlândia-MG, no WhatsApp. Fala no feminino ("obrigada"). Seu objetivo é levar a conversa até um ATENDIMENTO PRESENCIAL no escritório, com dia e hora marcados — é sentando com o ${corretor} que o negócio anda. Puxe pra lá com leveza, sem pressão: quem dá o ritmo é o cliente.

═══ 1. O CLIENTE CONDUZ ═══
- Responda o que ele trouxe e PARE. Uma mensagem faz UMA coisa: nunca duas perguntas juntas, nunca cumprimento + imóvel + pergunta no mesmo texto.
- Se vierem várias linhas de uma vez, responda à intenção mais recente do bloco todo, não só ao cumprimento.
- "oi", "?", "bom dia" abrindo conversa: cumprimente e pergunte UMA coisa leve. Mas se o assunto já foi resolvido e vem agradecimento, despedida ou emoji sozinho ("obrigado", "valeu", "tá bom", 👍): responda curto e caloroso e ENCERRE ("Imagina, tô por aqui se precisar"). Nunca reabra o assunto — reagir errado a uma despedida entrega que é automático.
- NUNCA REINICIE O ATENDIMENTO. Se ele corrigir um dado (bairro, valor, quartos, dia, horário) ou mudar de assunto e voltar, isso não zera nada: confirme só o item corrigido numa frase curta ("Anotei, até 250 então") e SIGA de onde vocês estavam. É proibido re-perguntar região, faixa de preço ou quantos quartos depois que ele já disse, e proibido reapresentar imóveis do zero.
- Depois de mostrar o imóvel, convide para o atendimento presencial. Se ele hesitar ("vou pensar", achou caro, "depois"): reforce UMA vez, leve, e deixe a porta aberta ("quando quiser dar uma passada aqui é só me chamar"). Nunca insista repetindo nem soe vendedora.

═══ 2. COMO VOCÊ FALA ═══
- Fale como gente ("a gente atende até as 18h", nunca "nosso horário de expediente é"), com contrações (pra, tá, tbm).
- PROIBIDO tom de call center ("Como posso ajudá-lo?", "Estou à disposição", "Prezado").
- Espelhe a energia dele: se é seco, seja curta. Nunca repita frase já usada nem comece duas mensagens igual.
- Emoji na minoria das mensagens, no máximo 1, nunca em duas seguidas.
- Na PRIMEIRA mensagem da conversa: cumprimente pelo horário e diga quem é ("${saudacaoAgora()}! Aqui é a ${assistente}, da ${empresa}"). Havendo conversa anterior, continue de onde parou: nunca recomece com "oi, tudo bem" nem repita seu nome. Se já sabe o nome dele, USE e nunca pergunte de novo.
- Se perguntarem se é robô, admita leve ("Sou a assistente virtual da ${empresa}, mas pode falar comigo normal") e siga.
- Se ele pedir para falar com o ${corretor} ou com uma pessoa: "Claro, já passo pro ${corretor} continuar com você" e pare por aí.

═══ 3. FORMATAÇÃO WHATSAPP ═══
Negrito *texto* (UM asterisco, NUNCA **). Itálico _texto_. Nunca use #, ---, crase, ** nem marcador de lista ("* ", "- ", "• "). Linha em branco separa MENSAGENS: use só quando os assuntos forem distintos — a maioria das respostas é uma mensagem só.

═══ 4. ${empresa.toUpperCase()} — FATOS ═══
Escritório: ${endereco}. Atendimento presencial apenas com hora marcada, de segunda a sexta.
${c.whats ? "WhatsApp: " + c.whats + "." : ""}
Responda com segurança se ele perguntar, mas nunca puxe esses assuntos sozinha:
- QUEM É: "Sou a ${assistente}, assistente do ${corretor}, proprietário da ${empresa}."
- PRIMEIRO IMÓVEL: quem está comprando o primeiro imóvel tem 50% de desconto na documentação. Esse é o único desconto que existe e pode ser dito com segurança.
- RENDA INFORMAL / AUTÔNOMO: não trava. "Consegue sim" — o ${corretor} é especialista em formalização de renda. Para comprovar: 6 meses de extrato bancário, ou contracheque.
- APROVAÇÃO DE CRÉDITO: se ele não tem, não é problema — "o ${corretor} resolve isso pra você". Nunca prometa que vai ser aprovado.
- ENTRADA, RENDA NECESSÁRIA, PARCELA, PRAZO, CUSTAS: não responda por mensagem. Desvie com leveza para o presencial ("esses números o ${corretor} prefere te passar pessoalmente, pra entender certinho o seu caso") e puxe o horário.

═══ 5. CARTEIRA ═══
Estes são os ÚNICOS imóveis que existem — vêm do sistema, em tempo real:
${carteira}

- NUNCA invente imóvel, bairro, metragem, quarto, vaga ou preço. Se for citar um dado, copie exatamente o que está na linha acima.
- Imóvel que não aparece nessa lista não existe pra você. Não comente status, não diga "vou confirmar": redirecione com leveza para um que existe.
- Sempre cite o código ao indicar um imóvel. No máximo DOIS imóveis por mensagem.

═══ 6. DESCOBRIR ANTES DE OFERECER ═══
A primeira coisa a descobrir é a REGIÃO (ou a faixa de preço). Pergunte isso antes de falar de imóvel nenhum — uma pergunta só, reagindo antes ao que ele disse.
- Cliente que só disse "quero comprar uma casa", "oi" ou "vi seu anúncio" ainda NÃO disse nada. NÃO ofereça imóvel, preço, foto nem link nessa hora.
- Com a região (ou o valor) na mão, aí sim mostre no máximo dois imóveis que BATEM com o que ele pediu. Se nada bate, diga que não tem no momento e ofereça avisar quando entrar.
- Exceção: se ele já citou um imóvel, um código ou o anúncio de um imóvel específico, fale desse imóvel na hora.
- Para mandar a foto, emita o marcador da seção 12. Nunca escreva "aqui está a foto" nem descreva em palavras que enviou algo.

═══ 7. VALORES ═══
Preço vem SEMPRE da carteira acima — nunca de memória, nunca do histórico, nunca arredondado. Fale o preço quando apresentar o imóvel ou quando ele perguntar; junto dele cabe o gancho do primeiro imóvel ("se for seu primeiro imóvel, a documentação sai com 50% de desconto").
Nunca invente desconto, promoção, parcelamento, valor de entrada ou condição de pagamento. Se ele travar no preço ou achar caro, não negocie: convide com leveza para o atendimento presencial, que é onde o ${corretor} monta o cenário.

═══ 8. NUNCA INVENTE ═══
Só afirme o que está escrito aqui. Se ele perguntar algo que não está — condomínio, IPTU, documentação específica do imóvel, aceitar FGTS, permuta, financiamento de um banco específico, se aceita pet, o que mais tem no bairro — acolha, diga que confirma com o ${corretor} e emita [DUVIDA_RICARDO]{"pergunta":"<resumo curto>"} — o cliente nunca vê isso.
Exemplo: "aceita FGTS?" → "Essa eu confirmo com o ${corretor} pra não te passar errado, já te aviso." [DUVIDA_RICARDO]{"pergunta":"Cliente quer saber se aceita FGTS"}

═══ 9. A DÚVIDA DELE VEM PRIMEIRO ═══
Se ele perguntar algo ainda não respondido, responda ANTES da sua próxima pergunta do fluxo, direto e curto ("Tem sim, 2 vagas! E qual região te atende melhor ?").

═══ 10. MARCAR O ATENDIMENTO ═══
Colete só o que FALTA, uma coisa por vez, reagindo antes.
- NOME: se já sabe, confirme embutido, não pergunte.
- DIA: se ele JÁ disse ("amanhã", "sexta", "dia 12"), NÃO pergunte o dia de novo — pergunte só o horário. Vale o inverso. Nunca presuma "hoje" se ele não disse.
- Atendimento só de segunda a sexta. Antes de aceitar QUALQUER data, confira no bloco [AGORA] em que dia da semana ela cai — inclusive quando ele disser "amanhã". Se cair sábado ou domingo, não marque: diga com leveza e ofereça o próximo dia útil, com data.
- Proponha horário concreto, inclusive quebrado ("18:30 fica bom ?"). Datas sempre em DD/MM.

Confirmação (mensagem separada, varie a introdução):
*Nome:* [nome]
*Data:* [DD/MM]
*Horário:* [horário]
*Imóvel de interesse:* [tipo no bairro — cód. XXXX]
*Local:* ${endereco}
Feche pedindo confirmação (varie: "Pode confirmar ?", "Ficou certo ?").

Só DEPOIS que ele confirmar, acrescente [AGENDAMENTO_CONFIRMADO]{"nome":"...","data":"AAAA-MM-DD","hora":"HH:MM","codigo":"XXXX"} — nunca antes da confirmação, nunca duas vezes, nunca junto de foto.

═══ 11. MEMÓRIA DO CLIENTE ═══
Sempre que descobrir um dado durável, acrescente no FINAL da resposta, em linha própria:
[PERFIL]{"nome":"...","regiao":"...","teto":250000,"quartos":N,"tipo":"Casa|Apartamento|Lote/Terreno|Chácara","aprovacao":"sim|nao","preferencias":"..."}
Inclua só os campos que descobriu. "teto" = quanto ele pode pagar, só o número. "preferencias" = texto livre com o resto. Assim que souber o nome, salve, pra nunca mais perguntar.

═══ 12. CÓDIGOS INTERNOS ═══
O cliente NUNCA vê: o sistema apaga antes de enviar. Formato exato, nunca dois iguais no mesmo texto.
[ENVIAR_FOTO_IMOVEL_XXXX] manda a foto e a ficha do imóvel de código XXXX · [AGENDAMENTO_CONFIRMADO]{...} avisa o ${corretor} do atendimento · [DUVIDA_RICARDO]{...} pergunta sem resposta · [PERFIL]{...} salva os dados do cliente.
Emitir o marcador é o ÚNICO jeito de mandar foto. Nunca descreva em palavras uma ação do sistema.

═══ 13. GERAL ═══
Sempre português, natural, sem pressão. Fora do horário comercial, não trate como impeditivo: converse normal e marque para o próximo dia útil.
${c.estilo ? "\nObservação do " + corretor + ": " + c.estilo : ""}

${estiloDoCorretor() ? "═══ 14. O JEITO DO " + corretor.toUpperCase() + " (siga fielmente, inclusive o modo de escrever) ═══\n" + estiloDoCorretor() : ""}`;
}

// Groq — alternativa gratuita (chave em console.groq.com/keys)
let groqModelo = null;

async function groqDescobrirModelo(chave) {
  const r = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { authorization: "Bearer " + chave },
  });
  if (!r.ok) throw new Error("Groq /models " + r.status + ": " + (await r.text()).slice(0, 200));
  const ids = ((await r.json()).data || []).map((m) => m.id);
  const serve = (id) => !/whisper|tts|guard|embed|vision|safety|prompt/i.test(id);
  const nota = (id) => (/70b|120b|maverick/i.test(id) ? 3 : /17b|32b|scout/i.test(id) ? 2 : 1);
  const bons = ids.filter(serve).sort((a, b) => nota(b) - nota(a));
  if (!bons.length) throw new Error("Nenhum modelo de conversa disponível nesta conta Groq.");
  console.log("  Groq: usando o modelo " + bons[0]);
  return bons[0];
}

async function pedirGroq(mensagens, maxTokens = 600, procura = "") {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) throw new Error("Sem GROQ_API_KEY.");

  const chamar = async (modelo) => {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + chave },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: [{ role: "system", content: instrucoes(procura) }, ...mensagens],
      }),
    });
    if (!r.ok) {
      const txt = (await r.text()).slice(0, 300);
      const err = new Error("Groq " + r.status + ": " + txt);
      err.modeloInvalido = r.status === 404 || /model_not_found|decommissioned/i.test(txt);
      throw err;
    }
    const j = await r.json();
    const t = (j.choices?.[0]?.message?.content || "").trim();
    if (!t) throw new Error("Groq devolveu resposta vazia.");
    return t;
  };

  const preferido = groqModelo || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  try {
    const t = await chamar(preferido);
    groqModelo = preferido;
    return t;
  } catch (e) {
    if (!e.modeloInvalido) throw e;
    groqModelo = await groqDescobrirModelo(chave);
    return await chamar(groqModelo);
  }
}

// Google Gemini — alternativa gratuita (chave em aistudio.google.com)
async function pedirGemini(mensagens, maxTokens = 600, procura = "") {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new Error("Sem GEMINI_API_KEY.");
  const modelo = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucoes(procura) }] },
        contents: mensagens.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
    }
  );
  if (!r.ok) throw new Error("Gemini " + r.status + ": " + (await r.text()).slice(0, 300));
  const j = await r.json();
  const t = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n").trim();
  if (!t) throw new Error("Gemini devolveu resposta vazia.");
  return t;
}

// Usa a Anthropic se houver chave; senão tenta o Gemini.
async function pedirIA(mensagens, maxTokens = 600, procura = "") {
  const tentativas = [];
  if (process.env.ANTHROPIC_API_KEY) tentativas.push(pedirClaude);
  if (process.env.GROQ_API_KEY) tentativas.push(pedirGroq);
  if (process.env.GEMINI_API_KEY) tentativas.push(pedirGemini);
  if (!tentativas.length) throw new Error("Nenhuma chave de IA configurada no .env.");
  let ultimo;
  for (const tentar of tentativas) {
    try { return await tentar(mensagens, maxTokens, procura); }
    catch (e) { ultimo = e; }
  }
  throw ultimo;
}

async function pedirClaude(mensagens, maxTokens = 600, procura = "") {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error("Configure ANTHROPIC_API_KEY no arquivo .env para o chatbot funcionar.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system: instrucoes(procura),
      messages: mensagens,
    }),
  });
  if (!r.ok) throw new Error("Anthropic " + r.status + ": " + (await r.text()).slice(0, 300));
  const j = await r.json();
  return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
}


/* ============ RESPOSTA SEM IA (funciona sem chave da Anthropic) ============ */
function respostaLocal(mensagens) {
  const c = lerConfig();
  const ultima = String(mensagens.filter(m => m.role === "user").pop()?.content || "").toLowerCase();
  const jaFalou = mensagens.filter(m => m.role === "assistant").length > 0;
  const tem = (...ps) => ps.some(x => ultima.includes(x));

  // critérios ditos pelo cliente
  let teto = 0;
  const mMil = ultima.match(/(\d{2,3})\s*(mil|k)\b/);
  const mReal = ultima.match(/r?\$?\s*([\d.]{6,})/);
  if (mMil) teto = Number(mMil[1]) * 1000;
  else if (mReal) teto = Number(mReal[1].replace(/\./g, ""));
  const mQ = ultima.match(/(\d)\s*(quarto|qto|dorm)/);
  const quartos = mQ ? Number(mQ[1]) : 0;
  const tipo = tem("casa") ? "Casa" : tem("apartamento", "apto", "ap ") ? "Apartamento"
    : tem("lote", "terreno") ? "Lote/Terreno" : tem("chácara", "chacara") ? "Chácara" : "";

  const todos = listarImoveis();
  const bairro = (todos.map(m => m.bairro).filter(Boolean)
    .find(b => b && ultima.includes(b.toLowerCase())) || "");

  // Só oferece imóvel quando o cliente deu um critério de verdade:
  // região, faixa de preço ou número de quartos. Só dizer "quero uma casa" não basta.
  const criterioForte = Boolean(teto || quartos || bairro);

  if (!jaFalou && !criterioForte)
    return `${saudacaoAgora()}, tudo joia ?`;

  if (tipo && !criterioForte)
    return `Qual região de Uberlândia mais te atende ?`;

  if (criterioForte) {
    let achados = todos.filter(m =>
      (!teto || (m.preco && m.preco <= teto)) &&
      (!quartos || m.quartos >= quartos) &&
      (!tipo || m.tipo === tipo) &&
      (!bairro || m.bairro === bairro));
    achados.sort((a, b) => (b.preco || 0) - (a.preco || 0));
    const dois = achados.slice(0, 2);
    if (dois.length) {
      const linhas = dois.map(m =>
        `${m.codigo} — ${m.tipo} no ${m.bairro}, ${m.quartos || 0} quartos, ${m.area || "?"}m², ` +
        `${(m.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`);
      const abre = dois.length > 1 ? "Tenho essas duas pra você:" : "Tenho essa pra você:";
      return `${abre}\n\n${linhas.join("\n")}\n\nJá chegou a fazer sua aprovação?`;
    }
    return "Nessa faixa não tenho nada pronto agora, mas chega imóvel novo toda semana.\nQuer que eu te avise quando entrar algo assim ?";
  }

  if (tem("aprova", "financia", "renda", "entrada", "parcela", "custas", "prazo", "documenta"))
    return "Esses detalhes eu prefiro te passar no atendimento presencial, eu preciso entender certinho os valores que você espera, como podemos fazer isso, prazos, custas e etc.\nQuando fica melhor pra você ?";

  if (tem("endereço", "endereco", "escritório", "escritorio", "onde fica", "onde voces", "onde vocês"))
    return `Ficamos na R. José Nonato Ribeiro, 428 - Cazeca, Uberlândia - MG.\nNosso atendimento presencial é apenas com horário marcado, quando fica melhor pra você ?`;

  if (tem("marcar", "agendar", "visita", "horário", "horario", "amanhã", "amanha"))
    return "Combinado. Amanhã no mesmo horário ou você prefere mais tarde ?";

  if (tem("valor", "preço", "preco", "quanto"))
    return "Te passo agora.\nQual região mais te atende hoje ?";

  if (!jaFalou)
    return `${saudacaoAgora()}, tudo joia ?`;

  return "Qual região mais te atende hoje ?";
}

/* ============ CÓDIGOS INTERNOS DA RESPOSTA ============
   A IA escreve marcadores no meio do texto para pedir coisas ao sistema:
   foto de um imóvel, agendamento confirmado, dado do cliente, dúvida para o
   corretor. Aqui eles são lidos e APAGADOS — o cliente nunca vê. */
function lerMarcadores(bruto) {
  let texto = String(bruto || "");
  const fotos = [];
  const perfis = [];
  const duvidas = [];
  let agendamento = null;

  texto = texto.replace(/\[ENVIAR_FOTO_IMOVEL[_\s-]*(\d{3,6})\]/gi, (_, codigo) => {
    if (!fotos.includes(codigo)) fotos.push(codigo);
    return "";
  });

  const comJson = (nome, aoAchar) => {
    const re = new RegExp("\\[" + nome + "\\]\\s*(\\{[\\s\\S]*?\\})", "gi");
    texto = texto.replace(re, (_, json) => {
      try { aoAchar(JSON.parse(json)); } catch { /* json torto: ignora */ }
      return "";
    });
    // marcador solto, sem json
    texto = texto.replace(new RegExp("\\[" + nome + "\\]", "gi"), "");
  };

  comJson("AGENDAMENTO_CONFIRMADO", (o) => { agendamento = o; });
  comJson("PERFIL", (o) => perfis.push(o));
  comJson("DUVIDA_RICARDO", (o) => duvidas.push(o));
  comJson("DUVIDA_EQUIPE", (o) => duvidas.push(o));          // aceita o nome antigo

  texto = texto.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
  return { texto, fotos, agendamento, perfis, duvidas };
}

// aplica no sistema o que a IA pediu
function aplicarMarcadores(m, { jid = "", nome = "", telefone = "" }) {
  const lead = jid
    ? db.prepare("SELECT * FROM leads WHERE telefone = ?").get(telefone || jid.split("@")[0])
    : null;

  for (const p of m.perfis) {
    if (!lead) continue;
    const partes = [];
    if (p.regiao) partes.push("região: " + p.regiao);
    if (p.teto) partes.push("até R$ " + Number(p.teto).toLocaleString("pt-BR"));
    if (p.quartos) partes.push(p.quartos + " quartos");
    if (p.tipo) partes.push(p.tipo);
    if (p.aprovacao) partes.push("aprovação: " + p.aprovacao);
    if (p.preferencias) partes.push(p.preferencias);
    const resumo = partes.join(" · ");
    db.prepare("UPDATE leads SET nome = ?, interesse = ?, atualizado_em = ? WHERE id = ?")
      .run(p.nome || lead.nome, resumo || lead.interesse, agora(), lead.id);
    if (resumo) registrarHistorico(lead.id, "A assistente anotou: " + resumo);
  }

  if (m.agendamento) {
    const a = m.agendamento;
    if (!agendamentoParecido(jid, a.data || "", a.hora || "")) {
      salvarAgendamento({
        jid, lead_id: lead?.id || "", nome: a.nome || nome || lead?.nome || "",
        telefone: telefone || (jid ? jid.split("@")[0] : ""),
        data: a.data || "", hora: a.hora || "",
        local: lerConfig().endereco || "Escritório",
        como: "A assistente fechou na conversa" + (a.codigo ? " (imóvel " + a.codigo + ")" : ""),
        marcado_por: "bot",
      });
      if (a.codigo) registrarInteresse(jid, String(a.codigo), lead?.id || "", "agendamento");
      if (lead) registrarHistorico(lead.id, `Atendimento marcado pela assistente: ${a.data || "?"} ${a.hora || ""}`);
    }
  }

  for (const d of m.duvidas) {
    salvarDuvida({ jid, leadId: lead?.id || "", nome: nome || lead?.nome || "", pergunta: d.pergunta || d.duvida || "" });
  }

  for (const codigo of m.fotos) registrarInteresse(jid, String(codigo), lead?.id || "", "foto");
  return m;
}

app.post("/api/chat", async (req, res) => {
  try {
    const cru = (req.body?.mensagens || []).filter((m) => m && m.texto);
    const msgs = cru.map((m) => ({ role: m.papel === "bot" ? "assistant" : "user", content: String(m.texto) }));
    if (!msgs.length) return res.status(400).json({ erro: "Sem mensagem." });

    // o que o cliente falou, para escolher quais imóveis entram no prompt
    const procura = cru.filter((m) => m.papel !== "bot").map((m) => m.texto).join(" ").slice(-1200);
    const { jid = "", nome = "", telefone = "" } = req.body || {};

    let bruto, semIA = false, motivo = "";
    try {
      bruto = await pedirIA(msgs, 600, procura);
    } catch (e) {
      console.error("[chat] IA indisponível:", e.message);
      bruto = respostaLocal(msgs); semIA = true; motivo = e.message.slice(0, 300);
    }

    const m = lerMarcadores(bruto);
    try { aplicarMarcadores(m, { jid, nome, telefone }); }
    catch (e) { console.error("[chat] marcador:", e.message); }

    const resposta = { texto: m.texto || "Me conta o que você procura que eu te ajudo.", fotos: m.fotos };
    if (m.agendamento) resposta.agendamento = m.agendamento;
    if (m.duvidas.length) resposta.duvidas = m.duvidas;
    if (semIA) { resposta.semIA = true; resposta.motivo = motivo; }
    res.json(resposta);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/api/leads/:id/sugestao", async (req, res) => {
  try {
    const l = lerLead(req.params.id);
    if (!l) return res.status(404).json({ erro: "Lead não encontrado." });
    const p = `Escreva a PRIMEIRA mensagem de WhatsApp para este lead que acabou de chegar de um anúncio. ` +
      `Use o primeiro nome dele. Máximo 4 linhas. Não use emoji.\n` +
      `Nome: ${l.nome || "(não informado)"}\nInteresse: ${l.interesse || "não informado"}\n` +
      `Origem: ${l.origem} ${l.campanha}\nAnotações: ${l.obs || "—"}`;
    const texto = await pedirIA([{ role: "user", content: p }], 400);
    res.json({ texto });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});


/* ==================== WHATSAPP (conversas e controle) ==================== */
app.get("/api/wa/conversas", (req, res) => res.json(waConversas()));

app.get("/api/wa/conversas/:jid/mensagens", (req, res) => {
  waMarcarLido(req.params.jid);
  res.json(waMensagens(req.params.jid));
});

// liga/desliga o bot numa conversa
app.post("/api/wa/conversas/:jid/bot", (req, res) => {
  const ativo = req.body?.ativo !== false;
  res.json(waDefinirBot(req.params.jid, ativo, ativo ? "" : ""));
});

// a ponte pergunta se pode responder
app.get("/api/wa/pode/:jid", (req, res) => res.json(waPodeResponder(req.params.jid, String(req.query.primeira || ""))));

// a ponte registra toda mensagem que passa pelo WhatsApp
app.post("/api/wa/mensagem", (req, res) => {
  const { jid, de, texto, nome, pausarHoras } = req.body || {};
  if (!jid || !texto) return res.status(400).json({ erro: "jid e texto são obrigatórios." });
  waSalvarMensagem(jid, de || "cliente", texto, nome || "");
  // mensagem enviada por você no celular: o bot recua sozinho
  if (de === "voce") {
    const ate = new Date(Date.now() + (Number(pausarHoras) || 6) * 3600e3).toISOString();
    waDefinirBot(jid, true, ate);
  }
  res.json({ ok: true, estado: waPodeResponder(jid) });
});



/* ============ A IA LÊ A CONVERSA E ANOTA O QUE FICOU COMBINADO ============ */
function proximaData(diaSemana, base = new Date()) {
  const d = new Date(base);
  const alvo = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"].indexOf(diaSemana);
  if (alvo < 0) return "";
  let delta = (alvo - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dataRelativa(texto) {
  const t = String(texto || "").toLowerCase();
  const d = new Date();
  if (/\bhoje\b/.test(t)) return d.toISOString().slice(0, 10);
  if (/amanh[ãa]/.test(t)) { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  const dia = t.match(/\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)\b/);
  if (dia) return proximaData(dia[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace("terca", "terça").replace("sabado", "sábado"));
  const br = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (br) {
    const ano = br[3] ? (br[3].length === 2 ? "20" + br[3] : br[3]) : String(new Date().getFullYear());
    return `${ano}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`;
  }
  return "";
}


// Sem IA disponível: lê a conversa por conta própria procurando hora combinada
function agendamentoPorTexto(msgs) {
  const CONFIRMA = /\b(sim|combinado|fechado|pode ser|isso|ok|perfeito|confirmo|t[áa]|blz|beleza)\b/i;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.de === "cliente" && CONFIRMA.test(m.texto)) {
      // procura a hora proposta nas mensagens anteriores
      for (let j = i; j >= Math.max(0, i - 6); j--) {
        const hm = String(msgs[j].texto).match(/\b(\d{1,2})[:h](\d{2})\b/);
        if (!hm) continue;
        const contexto = msgs.slice(Math.max(0, j - 3), i + 1).map((x) => x.texto).join(" ");
        return {
          hora: String(hm[1]).padStart(2, "0") + ":" + hm[2],
          data: dataRelativa(contexto),
          trecho: String(msgs[j].texto).slice(0, 200),
        };
      }
    }
  }
  return null;
}

async function analisarConversa(jid, nome = "", telefone = "") {
  const msgs = waMensagens(jid, 30);
  if (!msgs.length) return { nada: true };
  const conversa = msgs.map((m) =>
    (m.de === "cliente" ? "CLIENTE: " : m.de === "bot" ? "CORRETOR(bot): " : "CORRETOR: ") + m.texto).join("\n");

  // 1) imóveis citados — direto do texto, sem depender da IA
  const codigos = new Set();
  for (const m of msgs) for (const c of String(m.texto).match(/\b\d{4}\b/g) || []) {
    if (db.prepare("SELECT 1 FROM imoveis WHERE codigo = ?").get(c)) codigos.add(c);
  }
  for (const c of codigos) registrarInteresse(jid, c);

  // 2) agendamento — a IA lê a conversa e devolve JSON
  let agendamento = null;
  const falouDeHorario = /combinado|marcad|agendad|te espero|fica bom|\d{1,2}[:h]\d{0,2}/i.test(conversa);
  if (falouDeHorario) {
    const pedido =
      "Leia a conversa entre um corretor e um cliente e responda SÓ com um JSON, sem explicação.\n" +
      'Formato: {"marcou": true|false, "quando": "texto como foi dito", "hora": "HH:MM", ' +
      '"local": "onde", "trecho": "a frase que fechou o compromisso", "temperatura": "Quente|Morno|Frio"}\n' +
      'marcou = true apenas se cliente e corretor concordaram com dia/hora de um atendimento.\n\n' + conversa;
    try {
      const bruto = await pedirIA([{ role: "user", content: pedido }], 300);
      const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1));
      if (j.marcou) {
        const data = dataRelativa(j.quando) || dataRelativa(j.trecho) || "";
        const hora = (String(j.hora || "").match(/\d{1,2}[:h]\d{2}/) || [""])[0].replace("h", ":");
        if (!agendamentoParecido(jid, data, hora)) {
          agendamento = salvarAgendamento({
            jid, nome, telefone, data, hora,
            local: j.local || "Escritório — R. José Nonato Ribeiro, 428, Cazeca",
            como: String(j.trecho || "").slice(0, 300),
            marcado_por: "bot", status: "Marcado",
          });
        }
      }
      if (j.temperatura) {
        const lead = db.prepare("SELECT id FROM leads WHERE telefone = ?").get(telefone || jid.split("@")[0]);
        if (lead) db.prepare("UPDATE leads SET temperatura = ? WHERE id = ?").run(j.temperatura, lead.id);
      }
    } catch { /* IA fora do ar: cai na leitura por texto, abaixo */ }

    if (!agendamento) {
      const t = agendamentoPorTexto(msgs);
      if (t && !agendamentoParecido(jid, t.data, t.hora)) {
        agendamento = salvarAgendamento({
          jid, nome, telefone, data: t.data, hora: t.hora,
          local: "Escritório — R. José Nonato Ribeiro, 428, Cazeca",
          como: t.trecho, marcado_por: "bot", status: "Marcado",
        });
      }
    }
  }

  return { imoveis: [...codigos], agendamento };
}

/* ==================== AGENDA E GERÊNCIA ==================== */
app.get("/api/agendamentos", (req, res) => res.json(listarAgendamentos()));

app.post("/api/agendamentos", (req, res) => {
  const a = salvarAgendamento({ ...req.body, marcado_por: req.body?.marcado_por || (req.usuario?.nome || "manual") });
  res.json(a);
});

app.put("/api/agendamentos/:id", (req, res) =>
  res.json(mudarStatusAgendamento(req.params.id, String(req.body?.status || "Marcado"))));

app.get("/api/gerencia/resumo", (req, res) => {
  const agenda = listarAgendamentos();
  const hoje10 = hoje();
  const proximos = agenda.filter((a) => a.status !== "Cancelado" && (!a.data || a.data >= hoje10));
  const paradas = conversasParadas(Number(req.query.dias) || 2)
    .filter((c) => c.ultimo_de === "cliente");
  res.json({
    agenda, proximos, interesses: todosInteresses(), paradas, duvidas: duvidasAbertas(),
    numeros: {
      marcados: agenda.filter((a) => a.status === "Marcado").length,
      compareceram: agenda.filter((a) => a.status === "Compareceu").length,
      faltaram: agenda.filter((a) => a.status === "Faltou").length,
      pelaIA: agenda.filter((a) => a.marcado_por === "bot").length,
    },
  });
});

// marca uma dúvida como respondida (e guarda o que você respondeu)
app.post("/api/gerencia/duvida/:id", (req, res) => {
  try { res.json(fecharDuvida(req.params.id, req.body?.resposta || "")); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

// gera a mensagem de retomada para um cliente parado
app.post("/api/gerencia/retomar/:jid", async (req, res) => {
  const jid = req.params.jid;
  const msgs = waMensagens(jid, 14);
  const c = waLerConversa(jid);
  const dias = Math.max(1, Math.round((Date.now() - new Date(c?.atualizado_em || Date.now())) / 864e5));
  const conversa = msgs.map((m) => (m.de === "cliente" ? "CLIENTE: " : "CORRETOR: ") + m.texto).join("\n");
  const pedido =
    `Esta conversa parou há ${dias} dia(s) e o cliente ficou sem resposta. ` +
    `Escreva APENAS a mensagem curta de retomada, no estilo do corretor, retomando de onde parou ` +
    `e propondo um horário concreto de atendimento. Nada de saudação genérica longa.\n\n` + conversa;
  try {
    const texto = await pedirIA([{ role: "user", content: pedido }], 300);
    res.json({ texto, dias });
  } catch {
    const nome = (c?.nome || "").split(" ")[0];
    res.json({ dias, texto: `Fala ${nome}, tudo joia ?\nConsegui separar umas opções novas pra você. Amanhã as 18:30 fica bom ?` });
  }
});

app.get("/api/gerencia/conversa/:jid", (req, res) =>
  res.json({
    mensagens: waMensagens(req.params.jid, 400),
    interesses: interessesPorConversa(req.params.jid),
    agenda: listarAgendamentos().filter((a) => a.jid === req.params.jid),
  }));

// a ponte manda a conversa para a IA extrair agendamento e imóveis
app.post("/api/wa/analisar", async (req, res) => {
  const { jid, nome, telefone } = req.body || {};
  try { res.json(await analisarConversa(jid, nome, telefone)); }
  catch (e) { res.json({ erro: e.message }); }
});


/* ==================== FOTOS ==================== */
const PASTA_FOTOS = path.join(raiz, "data", "fotos");
fs.mkdirSync(PASTA_FOTOS, { recursive: true });
app.use("/fotos", express.static(PASTA_FOTOS, { maxAge: "7d" }));
app.use("/fotos", express.static(path.join(raiz, "public", "fotos"), { maxAge: "7d" }));

// baixa para dentro do sistema as fotos que ainda estão em endereço de fora
app.post("/api/imoveis/baixar-fotos", async (req, res) => {
  const lista = db.prepare("SELECT id, codigo, foto FROM imoveis WHERE foto LIKE 'http%'").all();
  let ok = 0, falhou = 0;
  const up = db.prepare("UPDATE imoveis SET foto = ?, link = '', atualizado_em = ? WHERE id = ?");
  for (const m of lista) {
    const arq = m.codigo + ".jpg";
    const destino = path.join(PASTA_FOTOS, arq);
    try {
      if (!fs.existsSync(destino)) {
        const r = await fetch(m.foto);
        if (!r.ok) throw new Error("HTTP " + r.status);
        fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
      }
      up.run("/fotos/" + arq, agora(), m.id);
      ok++;
    } catch { falhou++; }
  }
  db.prepare("UPDATE imoveis SET link = '' WHERE link LIKE '%chave7%'").run();
  res.json({ baixadas: ok, falharam: falhou, total: lista.length });
});

// manda as fotos que ainda são arquivo local para o Storage do Supabase
app.post("/api/imoveis/fotos-nuvem", async (req, res) => {
  if (!nuvemLigada()) return res.status(400).json({ erro: "Supabase não configurado." });
  try {
    res.json(await subirFotosLocais(bancoBruto, fs, path,
      [PASTA_FOTOS, path.join(raiz, "public", "fotos")]));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

/* ==================== SITES DOS CLIENTES ==================== */
const CORES = { dourado: "#C9A227", azul: "#2F6FB5", verde: "#2E8B63", vinho: "#8E2F3F",
  preto: "#E8E4DA", laranja: "#D4762A", roxo: "#6B4E9B", terra: "#A6703F" };

// transforma a descrição em texto livre numa configuração de site
async function desenharSite(descricao, base = {}) {
  const pedido =
    "Você configura sites de imobiliária. Leia o pedido e responda SÓ com JSON, sem comentário.\n" +
    'Formato: {"nome":"", "titulo":"chamada principal curta", "subtitulo":"uma linha", ' +
    '"sobre":"parágrafo curto de apresentação", "cor":"#RRGGBB", "fundo":"escuro|claro", ' +
    '"fonte":"classica|moderna", "filtro":{"cidade":"","tipos":[],"bairros":[],"precoMin":0,"precoMax":0,"somenteComFoto":true}}\n' +
    "Tipos possíveis: Casa, Apartamento, Lote/Terreno, Chácara, Duplex, Jardim.\n" +
    "Se o pedido não disser algo, escolha o que combina com o resto.\n\nPEDIDO: " + descricao;
  try {
    const bruto = await pedirIA([{ role: "user", content: pedido }], 700);
    const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1));
    return { ...base, ...j, descricao_pedida: descricao };
  } catch {
    // sem IA: monta a partir de palavras-chave do próprio pedido
    const t = String(descricao).toLowerCase();
    const cor = Object.entries(CORES).find(([k]) => t.includes(k))?.[1] || base.cor || "#C9A227";
    const tipos = [];
    for (const [p, tipo] of [["casa", "Casa"], ["apartamento", "Apartamento"], ["terreno", "Lote/Terreno"],
      ["lote", "Lote/Terreno"], ["chácara", "Chácara"], ["chacara", "Chácara"]])
      if (t.includes(p) && !tipos.includes(tipo)) tipos.push(tipo);
    const cidade = (t.match(/em ([a-zà-ú ]{3,25})/) || [])[1]?.trim();
    return {
      ...base, cor, fundo: t.includes("claro") ? "claro" : "escuro",
      fonte: t.includes("moderna") || t.includes("moderno") ? "moderna" : "classica",
      filtro: { ...(base.filtro || {}), tipos, cidade: cidade || base.filtro?.cidade || "", somenteComFoto: true },
      descricao_pedida: descricao,
    };
  }
}

app.get("/api/sites", (req, res) => {
  const base = process.env.DOMINIO_BASE || "";
  res.json(listarSites().map((s) => ({
    ...s,
    enderecos: [
      (process.env.URL_PUBLICA || "") + "/site/" + s.slug,
      base ? "https://" + s.slug + "." + base : "",
      s.dominio ? "https://" + s.dominio : "",
    ].filter(Boolean),
  })));
});

app.post("/api/sites/desenhar", async (req, res) => {
  try { res.json(await desenharSite(String(req.body?.descricao || ""), req.body?.base || {})); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

app.post("/api/sites", (req, res) => {
  try { res.json(salvarSite(req.body || {})); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

app.delete("/api/sites/:id", (req, res) => { apagarSite(req.params.id); res.json({ ok: true }); });

// ---- lado público ----
app.get("/site/:slug", (req, res) => res.sendFile(path.join(raiz, "public", "site.html")));
app.get("/site/:slug/imovel/:codigo", (req, res) => res.sendFile(path.join(raiz, "public", "site.html")));

// usado quando o site é aberto pelo endereço próprio
// o site do cliente também pode ser instalado como aplicativo
function manifestoDoSite(site, raiz) {
  return {
    name: site.nome, short_name: (site.nome || "Imóveis").slice(0, 12),
    description: site.subtitulo || site.titulo || "Imóveis disponíveis",
    start_url: raiz || "/", scope: raiz || "/",
    display: "standalone", orientation: "portrait",
    background_color: site.fundo === "claro" ? "#FAF8F4" : "#0C0B09",
    theme_color: site.cor || "#C9A227", lang: "pt-BR",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icones/icone-mascara.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

app.get("/site/:slug/manifest.json", (req, res) => {
  const s = lerSite(req.params.slug);
  if (!s || !s.publicado) return res.status(404).json({ erro: "Site não encontrado." });
  res.json(manifestoDoSite(s, "/site/" + s.slug));
});

app.get("/manifest-site.json", (req, res) => {
  const s = siteDoEndereco(req.headers.host);
  if (!s || !s.publicado) return res.status(404).json({ erro: "Site não encontrado." });
  res.json(manifestoDoSite(s, "/"));
});

app.get("/api/site-daqui", (req, res) => {
  const site = siteDoEndereco(req.headers.host);
  if (!site || !site.publicado) return res.status(404).json({ erro: "Site não encontrado." });
  res.json({ site, imoveis: imoveisDoSite(site.slug) });
});

app.get("/api/site-publico/:slug", (req, res) => {
  const s = lerSite(req.params.slug);
  if (!s || !s.publicado) return res.status(404).json({ erro: "Site não encontrado." });
  res.json({ site: s, imoveis: imoveisDoSite(req.params.slug) });
});

/* ==================== ESTÁTICOS ==================== */
app.use(express.static(path.join(raiz, "public"), {
  etag: true,
  maxAge: 0,
  setHeaders: (res) => res.set("Cache-Control", "no-cache"),
}));
app.get("/captar", (req, res) => res.sendFile(path.join(raiz, "public", "captar.html")));
app.get("/imovel/:codigo", (req, res) => res.sendFile(path.join(raiz, "public", "imovel.html")));
app.use((req, res) => res.sendFile(path.join(raiz, "public", "index.html")));

// Antes de abrir a porta: alinhar com o Supabase.
// Se a nuvem tem dado, ela manda. Se está vazia, o que existe aqui sobe pra lá.
await sincronizarNoInicio(bancoBruto);

// As fotos que ainda estão em arquivo sobem para o Storage, em segundo plano.
const PASTAS_DE_FOTO = [PASTA_FOTOS, path.join(raiz, "public", "fotos")];
if (nuvemLigada())
  subirFotosLocais(bancoBruto, fs, path, PASTAS_DE_FOTO,
    (feitas, total) => console.log(`  Supabase: fotos ${feitas}/${total}`))
    .then((r) => { if (r.subidas) console.log(`  Supabase: ${r.subidas} fotos agora estão na nuvem`); })
    .catch(() => {});

for (const sinal of ["SIGINT", "SIGTERM"])
  process.on(sinal, async () => { await despedir(); process.exit(0); });

app.listen(PORTA, () => {
  console.log("\n  ROYAL HUB rodando");
  console.log("  Painel:      http://localhost:" + PORTA);
  console.log("  Captação:    http://localhost:" + PORTA + "/captar");
  console.log("  Webhook:     POST http://localhost:" + PORTA + "/api/webhook/meta?token=" + WEBHOOK_TOKEN);
  console.log("  Banco:       " + (nuvemLigada() ? "Supabase (nuvem) + cópia local" : "só local (data/royal.db)"));
  console.log("  Chatbot IA:  " + (process.env.ANTHROPIC_API_KEY ? "ligado (" + MODELO + ")" : process.env.GROQ_API_KEY ? "ligado (Groq)" : process.env.GEMINI_API_KEY ? "ligado (Gemini)" : "sem chave — respondendo pelo modo local") + "\n");
});
