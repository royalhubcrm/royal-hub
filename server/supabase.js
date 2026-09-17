// Ponte com o Supabase — o banco de verdade mora lá; o SQLite daqui é só a cópia rápida.
//
// Como funciona, em uma frase: ao ligar, o sistema baixa tudo da nuvem; a cada
// alteração, sobe o que mudou. Assim o PC e o endereço fixo trabalham sobre a
// mesma base, e reiniciar o servidor não apaga mais nada.
//
// No .env (e no painel do Render):
//   SUPABASE_URL=https://xxxxxxxx.supabase.co
//   SUPABASE_SERVICE_KEY=a chave secreta (service_role) do projeto
//
// A chave secreta fica só no servidor. As tabelas estão com RLS ligado e sem
// política nenhuma: quem tiver a chave pública não lê nem escreve nada.

const ENDERECO = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SEGREDO = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";

export const nuvemLigada = () => Boolean(ENDERECO && SEGREDO);

// tabelas pequenas: sobem inteiras (e o que sumiu aqui some lá)
const INTEIRAS = ["config", "usuarios", "sessoes", "imoveis", "leads", "sites", "agendamentos", "wa_conversas", "duvidas"];
// tabelas que só crescem: sobem as linhas novas
const CRESCENTES = ["historico", "conversas", "interesses", "wa_mensagens"];
const TABELAS = [...INTEIRAS, ...CRESCENTES];

const CHAVE_DE = { config: "chave", wa_conversas: "jid", sessoes: "token" };
const chaveDe = (t) => CHAVE_DE[t] || "id";

const LOTE = 500;
const ESPERA = 2500;               // junta as alterações antes de subir

let banco = null;                  // o SQLite local
const sujas = new Set();
const ultimoId = {};               // até onde já subiu, nas tabelas que crescem
let relogio = null;
let avisouErro = false;

/* ------------------------- conversa com a API ------------------------- */
async function rest(caminho, opcoes = {}) {
  const r = await fetch(ENDERECO + "/rest/v1/" + caminho, {
    ...opcoes,
    headers: {
      apikey: SEGREDO,
      authorization: "Bearer " + SEGREDO,
      "content-type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!r.ok) throw new Error("Supabase " + r.status + " em " + caminho + ": " + (await r.text()).slice(0, 200));
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

const baixar = (tabela) => rest(tabela + "?select=*");

const subir = (tabela, linhas) =>
  rest(tabela, {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(linhas),
  });

async function subirEmLotes(tabela, linhas) {
  for (let i = 0; i < linhas.length; i += LOTE) await subir(tabela, linhas.slice(i, i + LOTE));
}

/* ------------------------- SQLite local ------------------------- */
const lerLocal = (tabela) => banco.prepare("SELECT * FROM " + tabela).all();

function gravarLocal(tabela, linhas) {
  banco.exec("DELETE FROM " + tabela);
  if (!linhas.length) return;
  const colunas = Object.keys(linhas[0]);
  const stmt = banco.prepare(
    `INSERT OR REPLACE INTO ${tabela} (${colunas.join(",")}) VALUES (${colunas.map(() => "?").join(",")})`
  );
  for (const l of linhas) stmt.run(...colunas.map((c) => (l[c] === null || l[c] === undefined ? null : l[c])));

  // as tabelas de id automático precisam continuar de onde a nuvem parou,
  // senão o próximo registro nasceria com um número já usado
  if (CRESCENTES.includes(tabela)) {
    try {
      const maior = banco.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM ${tabela}`).get().m;
      banco.prepare("INSERT INTO sqlite_sequence (name, seq) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = ?)")
        .run(tabela, maior, tabela);
      banco.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = ? AND seq < ?").run(maior, tabela, maior);
    } catch { /* tabela sem id automático */ }
  }
}

const maiorId = (tabela) =>
  Number(banco.prepare("SELECT COALESCE(MAX(id),0) AS m FROM " + tabela).get()?.m || 0);

/* ------------------------- primeira carga ------------------------- */
// Regra: se a nuvem tem dado, ela manda. Se a nuvem está vazia e aqui tem
// dado, é a primeira vez — então o que está aqui sobe para lá.
export async function sincronizarNoInicio(bancoLocal) {
  banco = bancoLocal;
  if (!nuvemLigada()) {
    console.log("  Supabase:    desligado (sem SUPABASE_URL / SUPABASE_SERVICE_KEY) — usando só o banco local");
    return false;
  }
  try {
    let baixadas = 0, enviadas = 0;
    for (const t of TABELAS) {
      const daNuvem = await baixar(t);
      if (daNuvem.length) {
        gravarLocal(t, daNuvem);
        baixadas += daNuvem.length;
      } else {
        const daqui = lerLocal(t);
        if (daqui.length) { await subirEmLotes(t, daqui); enviadas += daqui.length; }
      }
      if (CRESCENTES.includes(t)) ultimoId[t] = maiorId(t);
    }
    console.log(`  Supabase:    ligado — ${baixadas} linhas baixadas, ${enviadas} enviadas`);
    return true;
  } catch (e) {
    console.error("  Supabase:    não consegui sincronizar — " + e.message);
    console.error("               o sistema continua funcionando com o banco local.");
    return false;
  }
}

/* ------------------------- subir o que mudou ------------------------- */
export function marcarMudanca(tabela) {
  if (!nuvemLigada() || !banco || !TABELAS.includes(tabela)) return;
  sujas.add(tabela);
  if (relogio) return;
  relogio = setTimeout(() => { relogio = null; empurrar().catch(() => {}); }, ESPERA);
}

async function empurrarTabela(tabela) {
  if (CRESCENTES.includes(tabela)) {
    const desde = ultimoId[tabela] ?? 0;
    const novas = banco.prepare(`SELECT * FROM ${tabela} WHERE id > ?`).all(desde);
    if (!novas.length) return;
    await subirEmLotes(tabela, novas);
    ultimoId[tabela] = Math.max(desde, ...novas.map((l) => Number(l.id) || 0));
    return;
  }

  const pk = chaveDe(tabela);
  const daqui = lerLocal(tabela);
  if (daqui.length) await subirEmLotes(tabela, daqui);

  // o que foi apagado aqui precisa sumir de lá também
  const naNuvem = await rest(`${tabela}?select=${pk}`);
  const aqui = new Set(daqui.map((l) => String(l[pk])));
  const sobrando = naNuvem.map((l) => String(l[pk])).filter((v) => !aqui.has(v));
  for (let i = 0; i < sobrando.length; i += 100) {
    const lista = sobrando.slice(i, i + 100).map((v) => '"' + v.replace(/"/g, '\\"') + '"').join(",");
    await rest(`${tabela}?${pk}=in.(${lista})`, { method: "DELETE", headers: { prefer: "return=minimal" } });
  }
}

export async function empurrar() {
  if (!nuvemLigada() || !banco || !sujas.size) return;
  const lista = [...sujas];
  sujas.clear();
  for (const t of lista) {
    try {
      await empurrarTabela(t);
      avisouErro = false;
    } catch (e) {
      sujas.add(t);                                   // tenta de novo na próxima
      if (!avisouErro) { console.error("  Supabase: falhou ao subir " + t + " — " + e.message); avisouErro = true; }
    }
  }
  if (sujas.size && !relogio) relogio = setTimeout(() => { relogio = null; empurrar().catch(() => {}); }, 15000);
}

// antes de desligar, tenta subir o que ficou pendente
export async function despedir() {
  if (relogio) { clearTimeout(relogio); relogio = null; }
  await empurrar().catch(() => {});
}

/* ------------------------- fotos na nuvem ------------------------- */
// As fotos dos imóveis ficam em arquivo dentro do projeto. Isso não sobrevive
// a um reinício no Render nem é visto pelo outro computador. Então subimos
// cada foto para o Storage do Supabase e trocamos o caminho pelo endereço público.
const BALDE = "imoveis";

const tipoDoArquivo = (nome) =>
  /\.png$/i.test(nome) ? "image/png" : /\.webp$/i.test(nome) ? "image/webp" : "image/jpeg";

async function subirFoto(nomeArquivo, conteudo) {
  const r = await fetch(`${ENDERECO}/storage/v1/object/${BALDE}/${nomeArquivo}`, {
    method: "POST",
    headers: {
      apikey: SEGREDO,
      authorization: "Bearer " + SEGREDO,
      "content-type": tipoDoArquivo(nomeArquivo),
      "x-upsert": "true",
    },
    body: conteudo,
  });
  if (!r.ok) throw new Error("Storage " + r.status + ": " + (await r.text()).slice(0, 160));
  return `${ENDERECO}/storage/v1/object/public/${BALDE}/${nomeArquivo}`;
}

// Sobe as fotos que ainda estão em arquivo local e atualiza o imóvel.
// `pastas` são os lugares onde procurar o arquivo; `fs` e `path` vêm de fora
// para este arquivo não precisar conhecer a estrutura do projeto.
export async function subirFotosLocais(bancoLocal, fs, path, pastas, aoAndar = null) {
  banco = banco || bancoLocal;
  if (!nuvemLigada()) return { subidas: 0, faltando: 0 };

  const lista = banco.prepare("SELECT id, codigo, foto FROM imoveis WHERE foto LIKE '/fotos/%'").all();
  if (!lista.length) return { subidas: 0, faltando: 0 };

  const atualizar = bancoLocal.prepare("UPDATE imoveis SET foto = ?, atualizado_em = ? WHERE id = ?");
  let subidas = 0, faltando = 0;

  for (const m of lista) {
    const arquivo = m.foto.replace("/fotos/", "");
    const caminho = pastas.map((p) => path.join(p, arquivo)).find((c) => fs.existsSync(c));
    if (!caminho) { faltando++; continue; }
    try {
      const url = await subirFoto(arquivo, fs.readFileSync(caminho));
      atualizar.run(url, new Date().toISOString(), m.id);
      subidas++;
      if (aoAndar && subidas % 50 === 0) aoAndar(subidas, lista.length);
    } catch (e) {
      faltando++;
      if (faltando === 1) console.error("  Supabase: foto " + arquivo + " não subiu — " + e.message);
    }
  }
  if (subidas) { sujas.add("imoveis"); await empurrar(); }
  return { subidas, faltando };
}
