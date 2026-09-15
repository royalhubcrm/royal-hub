// Importa imóveis de um arquivo JSON para o banco.
// Uso:  node server/importar.js                (procura na pasta Downloads)
//       node server/importar.js caminho.json   (arquivo específico)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { db, agora } from "./db.js";

function maisRecenteEmDownloads() {
  const dir = path.join(os.homedir(), "Downloads");
  if (!fs.existsSync(dir)) return null;
  const achados = fs.readdirSync(dir)
    .filter((f) => /^imoveis-chave7.*\.json$/i.test(f))
    .map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return achados.length ? achados[0].f : null;
}

const alvo = process.argv[2] || maisRecenteEmDownloads();

if (!alvo || !fs.existsSync(alvo)) {
  console.error("Nenhum arquivo imoveis-chave7*.json encontrado na pasta Downloads.");
  process.exit(1);
}

const bruto = JSON.parse(fs.readFileSync(alvo, "utf8"));
const itens = Array.isArray(bruto) ? bruto : bruto.itens || [];
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;

const stmt = db.prepare(`INSERT INTO imoveis
  (id,codigo,tipo,bairro,cidade,preco,quartos,suites,vagas,area,foto,link,descricao,status,atualizado_em)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    tipo=excluded.tipo, bairro=excluded.bairro, cidade=excluded.cidade, preco=excluded.preco,
    quartos=excluded.quartos, suites=excluded.suites, vagas=excluded.vagas, area=excluded.area,
    foto=excluded.foto, link=excluded.link, atualizado_em=excluded.atualizado_em`);

let n = 0;
for (const o of itens) {
  const codigo = String(o.codigo || o.cod || o.id || "").trim();
  if (!codigo) continue;
  stmt.run(
    codigo, codigo, String(o.tipo || ""), String(o.bairro || ""), String(o.cidade || "Uberlândia"),
    num(o.preco), num(o.quartos), num(o.suites), num(o.vagas), num(o.area),
    String(o.foto || ""), String(o.link || "https://www.chave7.com.br/buscar-imoveis?code=" + codigo),
    String(o.descricao || ""), "Disponível", agora()
  );
  n++;
}

const total = db.prepare("SELECT COUNT(*) AS t FROM imoveis").get().t;
console.log(`\n  ${n} imóvel(is) importado(s) de ${path.basename(alvo)}`);
console.log(`  Carteira agora: ${total} imóveis\n`);
