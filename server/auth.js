// Contas, senhas, sessões e permissões.
// Senha nunca é guardada em texto: fica como hash scrypt com sal próprio.
import crypto from "node:crypto";
import { db, agora, novoId } from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT DEFAULT '',
  email TEXT UNIQUE,
  telefone TEXT DEFAULT '',
  senha TEXT DEFAULT '',
  papel TEXT DEFAULT 'corretor',
  ativo INTEGER DEFAULT 1,
  criado_em TEXT,
  ultimo_acesso TEXT
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  criado_em TEXT,
  expira_em TEXT
);

CREATE TABLE IF NOT EXISTS codigos_recuperacao (
  email TEXT PRIMARY KEY,
  codigo TEXT,
  expira_em TEXT,
  tentativas INTEGER DEFAULT 0
);
`);

/* ---------------- papéis ---------------- */
export const PAPEIS = {
  admin:      { nome: "Administrador", pode: ["tudo"] },
  gerente:    { nome: "Gerente",       pode: ["leads", "imoveis", "conversas", "chatbot", "captacao", "gerencia"] },
  corretor:   { nome: "Corretor",      pode: ["leads", "imoveis", "conversas", "chatbot", "captacao"] },
  assistente: { nome: "Assistente",    pode: ["leads", "conversas"] },
  cliente:    { nome: "Cliente",       pode: ["imoveis"] },
};

export function podeAcessar(usuario, area) {
  if (!usuario || !usuario.ativo) return false;
  const p = PAPEIS[usuario.papel];
  if (!p) return false;
  return p.pode.includes("tudo") || p.pode.includes(area);
}

/* ---------------- senha ---------------- */
function embaralhar(senha, sal) {
  return crypto.scryptSync(String(senha), sal, 64).toString("hex");
}

export function criarHash(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  return sal + ":" + embaralhar(senha, sal);
}

export function conferirSenha(senha, guardado) {
  if (!guardado || !guardado.includes(":")) return false;
  const [sal, hash] = guardado.split(":");
  const teste = embaralhar(senha, sal);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(teste, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- usuários ---------------- */
const limpo = (u) => (u ? { ...u, senha: undefined, ativo: !!u.ativo } : null);

export function contarUsuarios() {
  return db.prepare("SELECT COUNT(*) AS t FROM usuarios").get().t;
}

export function listarUsuarios() {
  return db.prepare("SELECT * FROM usuarios ORDER BY criado_em").all().map(limpo);
}

export function lerUsuarioPorEmail(email) {
  return db.prepare("SELECT * FROM usuarios WHERE lower(email) = lower(?)").get(String(email || "").trim());
}

export function lerUsuario(id) {
  return db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
}

export function criarUsuario({ nome, email, senha, papel = "corretor", telefone = "" }) {
  email = String(email || "").trim().toLowerCase();
  if (!email.includes("@")) throw new Error("E-mail inválido.");
  if (String(senha || "").length < 6) throw new Error("A senha precisa de pelo menos 6 caracteres.");
  if (!PAPEIS[papel]) throw new Error("Papel desconhecido.");
  if (lerUsuarioPorEmail(email)) throw new Error("Já existe uma conta com esse e-mail.");
  const u = {
    id: novoId(), nome: String(nome || "").trim() || email.split("@")[0],
    email, telefone: String(telefone || ""), senha: criarHash(senha),
    papel, ativo: 1, criado_em: agora(), ultimo_acesso: "",
  };
  db.prepare(`INSERT INTO usuarios (id,nome,email,telefone,senha,papel,ativo,criado_em,ultimo_acesso)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(u.id, u.nome, u.email, u.telefone, u.senha, u.papel, u.ativo, u.criado_em, u.ultimo_acesso);
  return limpo(u);
}

export function atualizarUsuario(id, { nome, papel, ativo, telefone, senha }) {
  const u = lerUsuario(id);
  if (!u) throw new Error("Usuário não encontrado.");
  if (papel && !PAPEIS[papel]) throw new Error("Papel desconhecido.");
  if (senha !== undefined && senha !== "" && String(senha).length < 6)
    throw new Error("A senha precisa de pelo menos 6 caracteres.");
  db.prepare(`UPDATE usuarios SET nome = ?, telefone = ?, papel = ?, ativo = ?, senha = ? WHERE id = ?`)
    .run(nome ?? u.nome, telefone ?? u.telefone, papel ?? u.papel,
         ativo === undefined ? u.ativo : (ativo ? 1 : 0),
         senha ? criarHash(senha) : u.senha, id);
  if (ativo === false) encerrarSessoesDe(id);
  return limpo(lerUsuario(id));
}

export function apagarUsuario(id) {
  encerrarSessoesDe(id);
  db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
}

export function trocarSenhaPorEmail(email, novaSenha) {
  const u = lerUsuarioPorEmail(email);
  if (!u) throw new Error("Conta não encontrada.");
  if (String(novaSenha).length < 6) throw new Error("A senha precisa de pelo menos 6 caracteres.");
  db.prepare("UPDATE usuarios SET senha = ? WHERE id = ?").run(criarHash(novaSenha), u.id);
  encerrarSessoesDe(u.id);
  return true;
}

/* ---------------- sessões ---------------- */
const DIAS = 14;

export function abrirSessao(usuarioId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + DIAS * 864e5).toISOString();
  db.prepare("INSERT INTO sessoes (token, usuario_id, criado_em, expira_em) VALUES (?,?,?,?)")
    .run(token, usuarioId, agora(), expira);
  db.prepare("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?").run(agora(), usuarioId);
  return { token, expira };
}

export function usuarioDaSessao(token) {
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessoes WHERE token = ?").get(token);
  if (!s) return null;
  if (new Date(s.expira_em) < new Date()) { encerrarSessao(token); return null; }
  const u = lerUsuario(s.usuario_id);
  return u && u.ativo ? limpo(u) : null;
}

export function encerrarSessao(token) {
  db.prepare("DELETE FROM sessoes WHERE token = ?").run(token);
}

export function encerrarSessoesDe(usuarioId) {
  db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").run(usuarioId);
}

/* ---------------- código de recuperação ---------------- */
export function gerarCodigo(email) {
  const u = lerUsuarioPorEmail(email);
  if (!u) return null;                       // não revela se a conta existe
  const codigo = String(crypto.randomInt(100000, 999999));
  const expira = new Date(Date.now() + 20 * 60e3).toISOString();
  db.prepare(`INSERT INTO codigos_recuperacao (email, codigo, expira_em, tentativas)
    VALUES (?,?,?,0) ON CONFLICT(email) DO UPDATE SET
    codigo = excluded.codigo, expira_em = excluded.expira_em, tentativas = 0`)
    .run(u.email, codigo, expira);
  return { codigo, usuario: limpo(u) };
}

export function conferirCodigo(email, codigo) {
  const e = String(email || "").trim().toLowerCase();
  const r = db.prepare("SELECT * FROM codigos_recuperacao WHERE email = ?").get(e);
  if (!r) return { ok: false, erro: "Peça um código novo." };
  if (new Date(r.expira_em) < new Date()) return { ok: false, erro: "O código expirou. Peça outro." };
  if (r.tentativas >= 5) return { ok: false, erro: "Muitas tentativas. Peça um código novo." };
  if (String(codigo).trim() !== r.codigo) {
    db.prepare("UPDATE codigos_recuperacao SET tentativas = tentativas + 1 WHERE email = ?").run(e);
    return { ok: false, erro: "Código incorreto." };
  }
  return { ok: true };
}

export function queimarCodigo(email) {
  db.prepare("DELETE FROM codigos_recuperacao WHERE email = ?")
    .run(String(email || "").trim().toLowerCase());
}

/* ---------------- cookie ---------------- */
export const COOKIE = "royal_sessao";

export function lerCookie(req, nome) {
  const bruto = req.headers.cookie || "";
  for (const parte of bruto.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return decodeURIComponent(v.join("="));
  }
  return "";
}
