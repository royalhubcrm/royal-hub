// Testes automáticos.
//
// Rodam em segundos e provam o que não pode quebrar nunca:
//   · a empresa A não enxerga NADA da empresa B;
//   · o gerente vê a equipe dele e só ela;
//   · código errado não entra;
//   · mensalidade vencida tranca, pagamento destranca;
//   · o bot não despeja imóvel na primeira mensagem nem repete pergunta;
//   · o backup faz a foto e a restauração devolve o que foi apagado.
//
// Nada disso toca no seu banco: o servidor sobe numa pasta temporária
// (ROYAL_DATA) que é apagada no fim.
//
// Como rodar:  npm test
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "royal-teste-"));
const PORTA = 3000 + Math.floor(Math.random() * 1500);
const BASE = "http://127.0.0.1:" + PORTA;

let passou = 0, falhou = 0;
const nomes = [];

function ok(condicao, titulo, detalhe = "") {
  if (condicao) { passou++; console.log("  \u001b[32m✓\u001b[0m " + titulo); }
  else { falhou++; nomes.push(titulo); console.log("  \u001b[31m✗\u001b[0m " + titulo + (detalhe ? "\n      " + detalhe : "")); }
}
const igual = (a, b, titulo) => ok(a === b, titulo, `esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

/* ---------------- conversa com o servidor ---------------- */
function criarSessao() {
  let cookies = {};
  return {
    get cookie() { return Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; "); },
    async pedir(rota, opcoes = {}) {
      const r = await fetch(BASE + rota, {
        ...opcoes,
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          ...(this.cookie ? { cookie: this.cookie } : {}),
          ...(opcoes.headers || {}),
        },
        body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : opcoes.body,
      });
      for (const c of r.headers.getSetCookie?.() || []) {
        const [par] = c.split(";");
        const i = par.indexOf("=");
        const nome = par.slice(0, i).trim(), valor = par.slice(i + 1);
        if (valor) cookies[nome] = valor; else delete cookies[nome];
      }
      const texto = await r.text();
      let corpo = null;
      try { corpo = JSON.parse(texto); } catch { corpo = texto; }
      return { status: r.status, corpo };
    },
  };
}

/* ---------------- subir e derrubar o servidor ---------------- */
let servidor;
function subir() {
  return new Promise((aceita, recusa) => {
    servidor = spawn(process.execPath, [path.join(raiz, "server", "index.js")], {
      cwd: raiz,
      env: {
        ...process.env,
        ROYAL_DATA: PASTA, PORT: String(PORTA),
        BACKUP_DESLIGADO: "1", NODE_ENV: "teste",
        // sem chaves: o bot responde pelo modo local, que é o que queremos medir
        ANTHROPIC_API_KEY: "", GROQ_API_KEY: "", GEMINI_API_KEY: "",
        SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "", CHAVE7_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "";
    const prazo = setTimeout(() => recusa(new Error("O servidor não subiu em 25s:\n" + saida)), 25000);
    servidor.stdout.on("data", (d) => {
      saida += d;
      if (saida.includes("ROYAL HUB rodando")) { clearTimeout(prazo); setTimeout(aceita, 250); }
    });
    servidor.stderr.on("data", (d) => { saida += d; });
    servidor.on("exit", (c) => { clearTimeout(prazo); recusa(new Error("O servidor morreu (código " + c + "):\n" + saida)); });
  });
}

function derrubar() {
  return new Promise((aceita) => {
    if (!servidor || servidor.exitCode !== null) return aceita();
    servidor.removeAllListeners("exit");
    servidor.on("exit", aceita);
    servidor.kill("SIGKILL");
    setTimeout(aceita, 3000);
  });
}

/* ==================== os testes ==================== */
const ontem = (dias) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);

async function testar() {
  const dono = criarSessao();

  /* ---- o dono e duas empresas ---- */
  let r = await dono.pedir("/api/dono/primeiro-acesso", { method: "POST", corpo: { nome: "Dono", email: "dono@teste.com", senha: "senha123" } });
  ok(r.status === 200, "o primeiro dono se cadastra", JSON.stringify(r.corpo));

  const nova = async (nome) => (await dono.pedir("/api/dono/empresas", { method: "POST", corpo: { nome } })).corpo;
  const alfa = await nova("Imobiliária Alfa");
  const beta = await nova("Imobiliária Beta");
  ok(/^\d{6}$/.test(alfa.codigo), "o código da empresa é sorteado com 6 dígitos");
  ok(alfa.codigo !== beta.codigo, "duas empresas nunca recebem o mesmo código");

  /* ---- primeiro administrador de cada uma ---- */
  const A = criarSessao(), B = criarSessao();
  r = await A.pedir("/api/auth/primeiro-acesso", { method: "POST", corpo: { codigo: alfa.codigo, nome: "Ana", email: "ana@alfa.com", senha: "senha123" } });
  ok(r.status === 200, "o primeiro acesso cria o administrador da empresa", JSON.stringify(r.corpo));
  await B.pedir("/api/auth/primeiro-acesso", { method: "POST", corpo: { codigo: beta.codigo, nome: "Bruno", email: "bruno@beta.com", senha: "senha123" } });

  r = await A.pedir("/api/auth/primeiro-acesso", { method: "POST", corpo: { codigo: alfa.codigo, nome: "Outro", email: "outro@alfa.com", senha: "senha123" } });
  igual(r.status, 400, "o primeiro acesso não funciona duas vezes na mesma empresa");

  /* ---- entrar ---- */
  const semCodigo = criarSessao();
  r = await semCodigo.pedir("/api/auth/entrar", { method: "POST", corpo: { codigo: "000000", email: "ana@alfa.com", senha: "senha123" } });
  igual(r.status, 401, "código de empresa que não existe não entra");

  r = await semCodigo.pedir("/api/auth/entrar", { method: "POST", corpo: { codigo: beta.codigo, email: "ana@alfa.com", senha: "senha123" } });
  igual(r.status, 401, "a conta da Alfa não entra com o código da Beta");

  r = await semCodigo.pedir("/api/auth/entrar", { method: "POST", corpo: { codigo: alfa.codigo, email: "ana@alfa.com", senha: "errada" } });
  igual(r.status, 401, "senha errada não entra");

  r = await criarSessao().pedir("/api/leads");
  igual(r.status, 401, "sem login, a API não responde nada");

  /* ---- uma empresa não enxerga a outra ---- */
  await A.pedir("/api/imoveis", { method: "POST", corpo: { codigo: "ALFA1", tipo: "Casa", bairro: "Segismundo Pereira", preco: 450000, quartos: 3 } });
  await B.pedir("/api/imoveis", { method: "POST", corpo: { codigo: "BETA1", tipo: "Apartamento", bairro: "Santa Mônica", preco: 320000, quartos: 2 } });
  await A.pedir("/api/leads", { method: "POST", corpo: { nome: "Cliente da Alfa", telefone: "34999990001" } });
  await B.pedir("/api/leads", { method: "POST", corpo: { nome: "Cliente da Beta", telefone: "34999990002" } });

  const imoveisA = (await A.pedir("/api/imoveis")).corpo;
  const imoveisB = (await B.pedir("/api/imoveis")).corpo;
  const lista = (x) => (Array.isArray(x) ? x : x?.imoveis || []);
  ok(lista(imoveisA).some((m) => m.codigo === "ALFA1") && !lista(imoveisA).some((m) => m.codigo === "BETA1"),
     "a Alfa vê o imóvel dela e NÃO vê o da Beta");
  ok(lista(imoveisB).some((m) => m.codigo === "BETA1") && !lista(imoveisB).some((m) => m.codigo === "ALFA1"),
     "a Beta vê o imóvel dela e NÃO vê o da Alfa");

  const leadsA = (await A.pedir("/api/leads")).corpo;
  ok(leadsA.some((l) => l.nome === "Cliente da Alfa") && !leadsA.some((l) => l.nome === "Cliente da Beta"),
     "os leads de uma empresa não aparecem na outra");

  /* ---- equipes: o gerente vê só a equipe dele ---- */
  const cria = async (dados) => (await A.pedir("/api/usuarios", { method: "POST", corpo: dados })).corpo;
  const gerente1 = await cria({ nome: "Gerente Um", email: "g1@alfa.com", senha: "senha123", papel: "gerente" });
  const gerente2 = await cria({ nome: "Gerente Dois", email: "g2@alfa.com", senha: "senha123", papel: "gerente" });
  const corretor1 = await cria({ nome: "Corretor Um", email: "c1@alfa.com", senha: "senha123", papel: "corretor" });
  const corretor2 = await cria({ nome: "Corretor Dois", email: "c2@alfa.com", senha: "senha123", papel: "corretor" });

  const equipe1 = (await A.pedir("/api/equipes", { method: "POST", corpo: { nome: "Equipe Um", gerente_id: gerente1.id } })).corpo;
  const equipe2 = (await A.pedir("/api/equipes", { method: "POST", corpo: { nome: "Equipe Dois", gerente_id: gerente2.id } })).corpo;
  await A.pedir("/api/equipes/membro", { method: "POST", corpo: { usuarioId: corretor1.id, equipeId: equipe1.id } });
  await A.pedir("/api/equipes/membro", { method: "POST", corpo: { usuarioId: corretor2.id, equipeId: equipe2.id } });

  const leadUm = (await A.pedir("/api/leads", { method: "POST", corpo: { nome: "Lead da Equipe Um", telefone: "34988880001" } })).corpo;
  const leadDois = (await A.pedir("/api/leads", { method: "POST", corpo: { nome: "Lead da Equipe Dois", telefone: "34988880002" } })).corpo;
  await A.pedir("/api/leads/" + leadUm.id + "/responsavel", { method: "POST", corpo: { usuarioId: corretor1.id } });
  await A.pedir("/api/leads/" + leadDois.id + "/responsavel", { method: "POST", corpo: { usuarioId: corretor2.id } });

  const G1 = criarSessao();
  r = await G1.pedir("/api/auth/entrar", { method: "POST", corpo: { codigo: alfa.codigo, email: "g1@alfa.com", senha: "senha123" } });
  ok(r.status === 200, "o gerente entra com o mesmo código da empresa");
  igual(r.corpo?.usuario?.papel, "gerente", "o sistema reconhece sozinho que a pessoa é gerente");

  const leadsG1 = (await G1.pedir("/api/leads")).corpo;
  ok(leadsG1.some((l) => l.nome === "Lead da Equipe Um"), "o gerente vê os leads da equipe dele");
  ok(!leadsG1.some((l) => l.nome === "Lead da Equipe Dois"), "o gerente NÃO vê os leads da outra equipe");

  r = await G1.pedir("/api/usuarios", { method: "POST", corpo: { nome: "Intruso", email: "x@alfa.com", senha: "senha123", papel: "admin" } });
  igual(r.status, 403, "o gerente não cria usuário — isso é do administrador");

  const C1 = criarSessao();
  await C1.pedir("/api/auth/entrar", { method: "POST", corpo: { codigo: alfa.codigo, email: "c1@alfa.com", senha: "senha123" } });
  const leadsC1 = (await C1.pedir("/api/leads")).corpo;
  ok(leadsC1.every((l) => l.nome !== "Lead da Equipe Dois"), "o corretor vê só o que é dele");

  /* ---- cobrança: vencida tranca, pagamento destranca ---- */
  await dono.pedir("/api/dono/empresas/" + beta.id + "/cobranca", { method: "PUT", corpo: { valor: 19900, vencimento: ontem(30), tolerancia: 5 } });
  r = await B.pedir("/api/leads");
  igual(r.status, 402, "mensalidade vencida além da tolerância tranca o acesso");

  await dono.pedir("/api/dono/empresas/" + beta.id + "/pagamento", { method: "POST", corpo: { meses: 1 } });
  r = await B.pedir("/api/leads");
  igual(r.status, 200, "o pagamento destranca na hora");

  r = await A.pedir("/api/leads");
  igual(r.status, 200, "o bloqueio de uma empresa não respinga na outra");

  await dono.pedir("/api/dono/empresas/" + beta.id, { method: "PUT", corpo: { ativo: false } });
  r = await B.pedir("/api/leads");
  igual(r.status, 403, "empresa desativada não entra");
  await dono.pedir("/api/dono/empresas/" + beta.id, { method: "PUT", corpo: { ativo: true } });

  /* ---- o bot ---- */
  const falar = async (mensagens) => (await A.pedir("/api/chat", { method: "POST", corpo: { mensagens, jid: "5534999999999@s.whatsapp.net", nome: "Teste" } })).corpo;

  const primeira = await falar([{ papel: "cliente", texto: "quero comprar uma casa" }]);
  const texto1 = String(primeira?.texto || primeira?.resposta || "");
  ok(texto1.length > 0, "o bot responde a primeira mensagem", JSON.stringify(primeira).slice(0, 200));
  ok(!/ALFA1|R\$\s?\d/.test(texto1), "o bot NÃO despeja imóvel e preço na primeira mensagem", texto1);
  ok(!/localhost|http/i.test(texto1), "o bot não manda link na primeira mensagem", texto1);
  ok(/\?/.test(texto1), "o bot pergunta algo antes de oferecer", texto1);

  const segunda = await falar([
    { papel: "cliente", texto: "quero comprar uma casa" },
    { papel: "bot", texto: texto1 },
    { papel: "cliente", texto: "pode ser no Segismundo Pereira" },
  ]);
  const texto2 = String(segunda?.texto || segunda?.resposta || "");
  const perguntaRegiao = (t) => /regi[ãa]o|bairro|onde/i.test(t) && /\?/.test(t);
  ok(!(perguntaRegiao(texto1) && perguntaRegiao(texto2)), "o bot não repete a pergunta da região", texto1 + " || " + texto2);

  const terceira = await falar([
    { papel: "cliente", texto: "vocês atendem o bairro Tibery?" },
  ]);
  const texto3 = String(terceira?.texto || terceira?.resposta || "");
  ok(!/n[ãa]o (trabalhamos|atendemos|temos)/i.test(texto3), "o bot nunca diz que a Royal não atende uma região", texto3);

  /* ---- backup e restauração ---- */
  r = await dono.pedir("/api/dono/backups/agora", { method: "POST" });
  ok(r.status === 200 && r.corpo?.arquivos?.length >= 3, "o backup copia o cadastro central e o banco de cada empresa", JSON.stringify(r.corpo).slice(0, 200));
  const dia = r.corpo.dia;

  r = await dono.pedir("/api/dono/backups");
  ok(Array.isArray(r.corpo) && r.corpo.some((b) => b.dia === dia), "o backup de hoje aparece na lista");

  // apaga um imóvel e volta no tempo
  const alvo = lista((await A.pedir("/api/imoveis")).corpo).find((m) => m.codigo === "ALFA1");
  await A.pedir("/api/imoveis/" + alvo.id, { method: "DELETE" });
  ok(!lista((await A.pedir("/api/imoveis")).corpo).some((m) => m.codigo === "ALFA1"), "o imóvel foi mesmo apagado");

  r = await dono.pedir("/api/dono/backups/" + dia + "/restaurar", { method: "POST", corpo: { alvo: "tudo" } });
  ok(r.status === 200, "a restauração responde sem erro", JSON.stringify(r.corpo).slice(0, 200));
  ok(fs.existsSync(path.join(PASTA, "backups", dia)), "o backup do dia continua guardado depois de restaurar");
  ok(fs.readdirSync(path.join(PASTA, "backups")).some((d) => d.startsWith("antes-de-restaurar")),
     "antes de restaurar, o sistema guarda como estava");

  // o servidor precisa reabrir os arquivos: sobe de novo e confere
  await derrubar();
  await subir();
  const A2 = criarSessao();
  await A2.pedir("/api/auth/entrar", { method: "POST", corpo: { codigo: alfa.codigo, email: "ana@alfa.com", senha: "senha123" } });
  ok(lista((await A2.pedir("/api/imoveis")).corpo).some((m) => m.codigo === "ALFA1"),
     "depois de restaurar, o imóvel apagado está de volta");
}

/* ==================== rodar ==================== */
console.log("\n  Testes do Royal Hub");
console.log("  pasta de teste: " + PASTA + "\n");

let erro = null;
try {
  await subir();
  await testar();
} catch (e) {
  erro = e;
  console.error("\n  \u001b[31mParou no meio:\u001b[0m " + e.message);
} finally {
  await derrubar();
  try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* segue */ }
}

console.log(`\n  ${passou} passaram, ${falhou} falharam`);
if (falhou) console.log("  Falharam:\n" + nomes.map((n) => "    · " + n).join("\n"));
console.log("");
process.exit(falhou || erro ? 1 : 0);
