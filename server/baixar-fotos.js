// Baixa as fotos dos imóveis para dentro do sistema (public/fotos)
// e remove qualquer link externo. Uso: node server/baixar-fotos.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, agora } from "./db.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "public", "fotos");
fs.mkdirSync(destino, { recursive: true });

const lista = db.prepare("SELECT id, codigo, foto FROM imoveis WHERE foto LIKE 'http%'").all();
console.log(`\n  ${lista.length} foto(s) para baixar\n`);

const up = db.prepare("UPDATE imoveis SET foto = ?, link = '', atualizado_em = ? WHERE id = ?");
let ok = 0, falhou = 0;

for (let i = 0; i < lista.length; i++) {
  const m = lista[i];
  const arq = `${m.codigo}.jpg`;
  const caminho = path.join(destino, arq);
  try {
    if (!fs.existsSync(caminho)) {
      const r = await fetch(m.foto);
      if (!r.ok) throw new Error("HTTP " + r.status);
      fs.writeFileSync(caminho, Buffer.from(await r.arrayBuffer()));
    }
    up.run("/fotos/" + arq, agora(), m.id);
    ok++;
  } catch (e) {
    falhou++;
  }
  if ((i + 1) % 25 === 0 || i === lista.length - 1) {
    process.stdout.write(`\r  ${i + 1}/${lista.length}  salvas: ${ok}  falhas: ${falhou}   `);
  }
}

db.prepare("UPDATE imoveis SET link = '' WHERE link LIKE '%chave7%'").run();
console.log(`\n\n  Pronto. As fotos agora ficam em public/fotos e nada mais aponta para fora.\n`);
