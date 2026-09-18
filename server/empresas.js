// Cadastro das empresas que usam o sistema.
//
// Cada empresa tem um código próprio, gerado aleatoriamente no cadastro, e um
// banco de dados só dela. Para entrar, a pessoa informa o código, o e-mail e a
// senha: o código diz de qual empresa é a conta, o e-mail e a senha dizem quem
// é a pessoa — e o perfil guardado nela (corretor, gerente, administrador) diz
// o que ela pode ver. Nada precisa ser escolhido na tela: o sistema reconhece.
//
// Este arquivo cuida só do cadastro central. Os dados de cada empresa ficam em
// data/empresas/<id>.db, isolados: uma empresa nunca alcança a outra.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// ROYAL_DATA permite rodar os testes num diretório separado, sem tocar no seu banco
export const PASTA_DADOS = process.env.ROYAL_DATA
  ? path.resolve(process.env.ROYAL_DATA)
  : path.join(raiz, "data");
export const PASTA_EMPRESAS = path.join(PASTA_DADOS, "empresas");
for (const p of [PASTA_DADOS, PASTA_EMPRESAS]) if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });

export const central = new DatabaseSync(path.join(PASTA_DADOS, "central.db"));

central.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,
  codigo TEXT UNIQUE,
  nome TEXT DEFAULT '',
  responsavel TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  plano TEXT DEFAULT 'teste',
  arquivo TEXT DEFAULT '',
  ativo INTEGER DEFAULT 1,
  observacao TEXT DEFAULT '',
  valor INTEGER DEFAULT 0,
  vencimento TEXT DEFAULT '',
  tolerancia INTEGER DEFAULT 5,
  ultimo_pagamento TEXT DEFAULT '',
  criado_em TEXT
);

CREATE TABLE IF NOT EXISTS donos (
  id TEXT PRIMARY KEY,
  nome TEXT DEFAULT '',
  email TEXT UNIQUE,
  senha TEXT DEFAULT '',
  criado_em TEXT,
  ultimo_acesso TEXT
);

CREATE TABLE IF NOT EXISTS sessoes_dono (
  token TEXT PRIMARY KEY,
  dono_id TEXT NOT NULL,
  criado_em TEXT,
  expira_em TEXT
);
`);

// colunas que entraram depois
for (const [coluna, tipo] of [
  ["valor", "INTEGER DEFAULT 0"], ["vencimento", "TEXT DEFAULT ''"],
  ["tolerancia", "INTEGER DEFAULT 5"], ["ultimo_pagamento", "TEXT DEFAULT ''"],
]) { try { central.exec(`ALTER TABLE empresas ADD COLUMN ${coluna} ${tipo}`); } catch { /* já existe */ } }

const agora = () => new Date().toISOString();
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- código da empresa ----------------
   Seis dígitos, sorteados, sem repetir e sem começar com zero. É o número que
   a empresa digita para entrar — fácil de ditar no telefone. */
export function gerarCodigo() {
  for (let i = 0; i < 200; i++) {
    const codigo = String(crypto.randomInt(100000, 999999));
    const existe = central.prepare("SELECT 1 FROM empresas WHERE codigo = ?").get(codigo);
    if (!existe) return codigo;
  }
  throw new Error("Não consegui gerar um código livre.");
}

/* ---------------- empresas ---------------- */
export const listarEmpresas = () =>
  central.prepare("SELECT * FROM empresas ORDER BY criado_em DESC").all();

export const lerEmpresa = (id) =>
  central.prepare("SELECT * FROM empresas WHERE id = ?").get(id);

export const empresaPorCodigo = (codigo) =>
  central.prepare("SELECT * FROM empresas WHERE codigo = ?").get(String(codigo || "").replace(/\D/g, ""));

export const arquivoDaEmpresa = (empresa) =>
  empresa?.arquivo ? path.join(PASTA_DADOS, empresa.arquivo) : path.join(PASTA_EMPRESAS, empresa.id + ".db");

// pasta das fotos de cada empresa (a Royal continua com a pasta antiga)
export function pastaDeFotos(empresa) {
  if (!empresa) return path.join(PASTA_DADOS, "fotos");
  const p = empresa.arquivo === "royal.db"
    ? path.join(PASTA_DADOS, "fotos")
    : path.join(PASTA_EMPRESAS, empresa.id, "fotos");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

export function criarEmpresa({ nome, responsavel = "", email = "", telefone = "", plano = "teste", arquivo = "" }) {
  nome = String(nome || "").trim();
  if (!nome) throw new Error("Informe o nome da empresa.");
  const e = {
    id: novoId(), codigo: gerarCodigo(), nome, responsavel: String(responsavel || ""),
    email: String(email || "").trim().toLowerCase(), telefone: String(telefone || ""),
    plano, arquivo, ativo: 1, observacao: "", criado_em: agora(),
  };
  central.prepare(`INSERT INTO empresas (id,codigo,nome,responsavel,email,telefone,plano,arquivo,ativo,observacao,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(e.id, e.codigo, e.nome, e.responsavel, e.email, e.telefone, e.plano, e.arquivo, e.ativo, e.observacao, e.criado_em);
  return e;
}

export function atualizarEmpresa(id, { nome, responsavel, email, telefone, plano, ativo, observacao }) {
  const e = lerEmpresa(id);
  if (!e) throw new Error("Empresa não encontrada.");
  central.prepare(`UPDATE empresas SET nome=?, responsavel=?, email=?, telefone=?, plano=?, ativo=?, observacao=? WHERE id=?`)
    .run(nome ?? e.nome, responsavel ?? e.responsavel, email ?? e.email, telefone ?? e.telefone,
         plano ?? e.plano, ativo === undefined ? e.ativo : (ativo ? 1 : 0), observacao ?? e.observacao, id);
  return lerEmpresa(id);
}

export function trocarCodigo(id) {
  const codigo = gerarCodigo();
  central.prepare("UPDATE empresas SET codigo = ? WHERE id = ?").run(codigo, id);
  return lerEmpresa(id);
}

export function apagarEmpresa(id) {
  // a conta sai da lista, mas o banco dela fica no disco — nada é perdido sem aviso
  central.prepare("DELETE FROM empresas WHERE id = ?").run(id);
}

/* ---------------- dono do sistema (você) ---------------- */
function embaralhar(senha, sal) {
  return crypto.scryptSync(String(senha), sal, 64).toString("hex");
}

export function criarHashDono(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  return sal + ":" + embaralhar(senha, sal);
}

export function conferirSenhaDono(senha, guardado) {
  if (!guardado || !guardado.includes(":")) return false;
  const [sal, hash] = guardado.split(":");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(embaralhar(senha, sal), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const contarDonos = () => central.prepare("SELECT COUNT(*) AS t FROM donos").get().t;
export const lerDonoPorEmail = (email) =>
  central.prepare("SELECT * FROM donos WHERE lower(email) = lower(?)").get(String(email || "").trim());

export function criarDono({ nome, email, senha }) {
  email = String(email || "").trim().toLowerCase();
  if (!email.includes("@")) throw new Error("E-mail inválido.");
  if (String(senha || "").length < 6) throw new Error("A senha precisa de pelo menos 6 caracteres.");
  if (lerDonoPorEmail(email)) throw new Error("Já existe uma conta com esse e-mail.");
  const d = { id: novoId(), nome: String(nome || "").trim() || email.split("@")[0], email,
              senha: criarHashDono(senha), criado_em: agora(), ultimo_acesso: "" };
  central.prepare("INSERT INTO donos (id,nome,email,senha,criado_em,ultimo_acesso) VALUES (?,?,?,?,?,?)")
    .run(d.id, d.nome, d.email, d.senha, d.criado_em, d.ultimo_acesso);
  return { ...d, senha: undefined };
}

export function abrirSessaoDono(donoId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + 30 * 864e5).toISOString();
  central.prepare("INSERT INTO sessoes_dono (token, dono_id, criado_em, expira_em) VALUES (?,?,?,?)")
    .run(token, donoId, agora(), expira);
  central.prepare("UPDATE donos SET ultimo_acesso = ? WHERE id = ?").run(agora(), donoId);
  return token;
}

export function donoDaSessao(token) {
  if (!token) return null;
  const s = central.prepare("SELECT * FROM sessoes_dono WHERE token = ?").get(token);
  if (!s || new Date(s.expira_em) < new Date()) return null;
  const d = central.prepare("SELECT id, nome, email FROM donos WHERE id = ?").get(s.dono_id);
  return d || null;
}

export const encerrarSessaoDono = (token) =>
  central.prepare("DELETE FROM sessoes_dono WHERE token = ?").run(token);

/* ==========================================================================
   COBRANÇA

   Cada empresa tem um vencimento. Passou do dia, ela ganha um aviso; passou
   da tolerância, o sistema tranca — continua guardando tudo, mas ninguém
   entra até acertar. O dono registra o pagamento e o vencimento anda um mês.
   ========================================================================== */
const hoje10 = () => new Date().toISOString().slice(0, 10);

export function situacaoDeCobranca(empresa) {
  if (!empresa) return { estado: "sem empresa", bloqueada: false };
  if (!empresa.vencimento) return { estado: "sem cobrança", bloqueada: false, diasParaVencer: null };

  const hoje = new Date(hoje10());
  const vence = new Date(empresa.vencimento);
  const dias = Math.round((vence - hoje) / 864e5);
  const tolerancia = Number(empresa.tolerancia ?? 5);

  if (dias >= 0) return { estado: dias <= 5 ? "vence em breve" : "em dia", bloqueada: false, diasParaVencer: dias };
  const atraso = -dias;
  if (atraso <= tolerancia)
    return { estado: "atrasada", bloqueada: false, diasDeAtraso: atraso, diasParaBloquear: tolerancia - atraso };
  return { estado: "bloqueada", bloqueada: true, diasDeAtraso: atraso };
}

// registra o pagamento e joga o vencimento para o mês seguinte
export function registrarPagamento(id, { meses = 1 } = {}) {
  const e = lerEmpresa(id);
  if (!e) throw new Error("Empresa não encontrada.");
  const base = e.vencimento && new Date(e.vencimento) > new Date(hoje10())
    ? new Date(e.vencimento) : new Date(hoje10());
  base.setMonth(base.getMonth() + Number(meses || 1));
  const novo = base.toISOString().slice(0, 10);
  central.prepare("UPDATE empresas SET vencimento = ?, ultimo_pagamento = ?, ativo = 1 WHERE id = ?")
    .run(novo, hoje10(), id);
  return lerEmpresa(id);
}

export function definirCobranca(id, { valor, vencimento, tolerancia }) {
  const e = lerEmpresa(id);
  if (!e) throw new Error("Empresa não encontrada.");
  central.prepare("UPDATE empresas SET valor = ?, vencimento = ?, tolerancia = ? WHERE id = ?")
    .run(Number(valor ?? e.valor) || 0,
         vencimento === undefined ? e.vencimento : String(vencimento || ""),
         Number(tolerancia ?? e.tolerancia ?? 5), id);
  return lerEmpresa(id);
}
