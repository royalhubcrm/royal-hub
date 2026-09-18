// Backup diário.
//
// O Supabase não é backup: ele espelha. Se um erro apagar uma tabela aqui, ela
// some de lá no segundo seguinte. Backup é outra coisa — é uma foto de ontem,
// guardada de lado, que ninguém sobrescreve.
//
// Todo dia o sistema tira uma cópia limpa do banco de cada empresa e do
// cadastro central, guarda em data/backups/AAAA-MM-DD/ e apaga o que passou de
// 30 dias. Restaurar é copiar de volta — e antes disso ele guarda o estado
// atual em "antes-de-restaurar", para o arrependimento também ter volta.
import fs from "node:fs";
import path from "node:path";
import { PASTA_DADOS, listarEmpresas, arquivoDaEmpresa, central } from "./empresas.js";
import { bancoDaEmpresa, fecharBancos } from "./db.js";

export const PASTA_BACKUPS = path.join(PASTA_DADOS, "backups");
const DIAS_GUARDADOS = Number(process.env.BACKUP_DIAS || 30);

const hoje = () => new Date().toISOString().slice(0, 10);
const nomeDoArquivo = (empresa) => (empresa ? empresa.id : "central") + ".db";

/* ---------------- fazer ---------------- */
export function fazerBackup(dia = hoje()) {
  const destino = path.join(PASTA_BACKUPS, dia);
  fs.mkdirSync(destino, { recursive: true });

  const feitos = [];
  // VACUUM INTO tira uma cópia consistente mesmo com o sistema em uso
  const copiar = (banco, arquivo) => {
    const alvo = path.join(destino, arquivo);
    try { fs.rmSync(alvo, { force: true }); } catch { /* não existia */ }
    banco.exec(`VACUUM INTO '${alvo.replace(/'/g, "''")}'`);
    feitos.push({ arquivo, bytes: fs.statSync(alvo).size });
  };

  try { copiar(central, "central.db"); }
  catch (e) { console.error("  Backup: central — " + e.message); }

  for (const empresa of listarEmpresas()) {
    try { copiar(bancoDaEmpresa(empresa), nomeDoArquivo(empresa)); }
    catch (e) { console.error(`  Backup: ${empresa.nome} — ${e.message}`); }
  }

  fs.writeFileSync(path.join(destino, "empresas.json"),
    JSON.stringify(listarEmpresas().map((e) => ({ id: e.id, nome: e.nome, codigo: e.codigo })), null, 2));

  limparAntigos();
  return { dia, arquivos: feitos, total: feitos.reduce((s, f) => s + f.bytes, 0) };
}

function limparAntigos() {
  if (!fs.existsSync(PASTA_BACKUPS)) return;
  const corte = new Date(Date.now() - DIAS_GUARDADOS * 864e5).toISOString().slice(0, 10);
  for (const dia of fs.readdirSync(PASTA_BACKUPS)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    if (dia < corte) { try { fs.rmSync(path.join(PASTA_BACKUPS, dia), { recursive: true, force: true }); } catch { /* segue */ } }
  }
}

/* ---------------- listar ---------------- */
export function listarBackups() {
  if (!fs.existsSync(PASTA_BACKUPS)) return [];
  return fs.readdirSync(PASTA_BACKUPS)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort().reverse()
    .map((dia) => {
      const pasta = path.join(PASTA_BACKUPS, dia);
      const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith(".db"));
      const bytes = arquivos.reduce((s, f) => s + fs.statSync(path.join(pasta, f)).size, 0);
      let empresas = [];
      try { empresas = JSON.parse(fs.readFileSync(path.join(pasta, "empresas.json"), "utf8")); } catch { /* sem índice */ }
      return { dia, bancos: arquivos.length, bytes, empresas };
    });
}

/* ---------------- restaurar ----------------
   `alvo` pode ser o id de uma empresa (restaura só ela) ou "tudo". */
export function restaurar(dia, alvo = "tudo") {
  const pasta = path.join(PASTA_BACKUPS, dia);
  if (!fs.existsSync(pasta)) throw new Error("Não existe backup desse dia.");

  // antes de mexer, guarda como está agora
  const salvaguarda = fazerBackup("antes-de-restaurar-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));

  fecharBancos();
  const restaurados = [];

  const repor = (origem, destino) => {
    if (!fs.existsSync(origem)) return;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origem, destino);
    // o WAL antigo não vale mais para o arquivo novo
    for (const sufixo of ["-wal", "-shm"]) { try { fs.rmSync(destino + sufixo, { force: true }); } catch { /* ok */ } }
    restaurados.push(path.basename(destino));
  };

  if (alvo === "tudo" || alvo === "central")
    repor(path.join(pasta, "central.db"), path.join(PASTA_DADOS, "central.db"));

  for (const empresa of listarEmpresas()) {
    if (alvo !== "tudo" && alvo !== empresa.id) continue;
    repor(path.join(pasta, nomeDoArquivo(empresa)), arquivoDaEmpresa(empresa));
  }

  return { dia, restaurados, salvaguarda: salvaguarda.dia };
}

/* ---------------- rotina diária ---------------- */
let relogio = null;

export function ligarBackupDiario() {
  if (relogio) return;
  if (process.env.BACKUP_DESLIGADO === "1") { console.log("  Backup:      desligado (BACKUP_DESLIGADO=1)"); return; }
  const jaTem = fs.existsSync(path.join(PASTA_BACKUPS, hoje()));
  if (!jaTem) {
    try {
      const r = fazerBackup();
      console.log(`  Backup:      ${r.arquivos.length} banco(s), ${(r.total / 1048576).toFixed(1)} MB — ${r.dia}`);
    } catch (e) { console.error("  Backup: falhou — " + e.message); }
  } else {
    console.log("  Backup:      o de hoje já existe");
  }
  // confere de hora em hora; quando vira o dia, tira a foto nova
  relogio = setInterval(() => {
    if (!fs.existsSync(path.join(PASTA_BACKUPS, hoje()))) {
      try { fazerBackup(); } catch (e) { console.error("  Backup: falhou — " + e.message); }
    }
  }, 3600e3);
  relogio.unref?.();
}
