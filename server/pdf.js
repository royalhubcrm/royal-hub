// Gerador de PDF caseiro — sem nenhuma biblioteca, sem npm install.
// Faz o que a gente precisa: texto, linhas, retângulos e fotos JPEG.
//
// É pouco código porque o PDF é um formato simples quando você usa só as
// fontes que todo leitor já tem (Helvetica e Times) e imagens JPEG, que
// entram no arquivo do jeito que estão.

const A4 = { largura: 595.28, altura: 841.89 };

/* ---------- utilidades ---------- */
const texto1252 = (s) =>
  Buffer.from(String(s ?? "")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"), "latin1");

// largura aproximada de um texto, para centralizar e cortar
const larguraTexto = (s, tamanho) => String(s || "").length * tamanho * 0.5;

function cortar(s, tamanho, limite) {
  s = String(s || "");
  while (larguraTexto(s, tamanho) > limite && s.length > 3) s = s.slice(0, -2);
  return s;
}

// lê largura e altura de um JPEG direto dos marcadores do arquivo
function medirJpeg(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marcador = buf[i + 1];
    if (marcador >= 0xc0 && marcador <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7),
               canais: buf[i + 9] };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/* ---------- montagem do arquivo ---------- */
class Documento {
  constructor() {
    this.objetos = [];          // cada item: Buffer com o corpo do objeto
    this.paginas = [];
  }

  novo(corpo) {
    this.objetos.push(corpo);
    return this.objetos.length;  // número do objeto (1-based)
  }

  imagemJpeg(buf) {
    const m = medirJpeg(buf);
    if (!m) return null;
    const cor = m.canais === 1 ? "/DeviceGray" : "/DeviceRGB";
    const cabecalho = Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width ${m.largura} /Height ${m.altura} ` +
      `/ColorSpace ${cor} /BitsPerComponent 8 /Filter /DCTDecode /Length ${buf.length} >>\nstream\n`,
      "latin1");
    const id = this.novo(Buffer.concat([cabecalho, buf, Buffer.from("\nendstream", "latin1")]));
    return { id, largura: m.largura, altura: m.altura };
  }

  pagina(conteudo, imagens) {
    const fluxo = Buffer.from(conteudo, "latin1");
    const idFluxo = this.novo(Buffer.concat([
      Buffer.from(`<< /Length ${fluxo.length} >>\nstream\n`, "latin1"),
      fluxo, Buffer.from("\nendstream", "latin1")]));
    this.paginas.push({ idFluxo, imagens });
  }

  gerar() {
    const idHelv = this.novo(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "latin1"));
    const idHelvB = this.novo(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", "latin1"));
    const idTimesB = this.novo(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>", "latin1"));

    const idPaginas = this.objetos.length + this.paginas.length + 1;
    const idsPagina = [];
    for (const p of this.paginas) {
      const xobj = p.imagens.length
        ? "/XObject << " + p.imagens.map((im, n) => `/Im${n} ${im.id} 0 R`).join(" ") + " >> "
        : "";
      idsPagina.push(this.novo(Buffer.from(
        `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] ` +
        `/Resources << /Font << /F1 ${idHelv} 0 R /F2 ${idHelvB} 0 R /F3 ${idTimesB} 0 R >> ${xobj}>> ` +
        `/Contents ${p.idFluxo} 0 R >>`, "latin1")));
    }

    const idArvore = this.novo(Buffer.from(
      `<< /Type /Pages /Kids [${idsPagina.map((i) => i + " 0 R").join(" ")}] /Count ${idsPagina.length} >>`, "latin1"));
    const idCatalogo = this.novo(Buffer.from(`<< /Type /Catalog /Pages ${idArvore} 0 R >>`, "latin1"));

    const partes = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let posicao = partes[0].length;
    const enderecos = [];
    this.objetos.forEach((corpo, n) => {
      enderecos.push(posicao);
      const b = Buffer.concat([Buffer.from(`${n + 1} 0 obj\n`, "latin1"), corpo, Buffer.from("\nendobj\n", "latin1")]);
      partes.push(b);
      posicao += b.length;
    });

    let xref = `xref\n0 ${this.objetos.length + 1}\n0000000000 65535 f \n`;
    for (const e of enderecos) xref += String(e).padStart(10, "0") + " 00000 n \n";
    xref += `trailer\n<< /Size ${this.objetos.length + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${posicao}\n%%EOF\n`;
    partes.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(partes);
  }
}

/* ---------- desenho ---------- */
class Tela {
  constructor() { this.ops = []; }
  cor(r, g, b) { this.ops.push(`${r} ${g} ${b} rg`); return this; }
  corLinha(r, g, b) { this.ops.push(`${r} ${g} ${b} RG`); return this; }
  retangulo(x, y, l, a, preencher = true) {
    this.ops.push(`${x} ${y} ${l} ${a} re ${preencher ? "f" : "S"}`); return this;
  }
  linha(x1, y1, x2, y2, espessura = 1) {
    this.ops.push(`${espessura} w ${x1} ${y1} m ${x2} ${y2} l S`); return this;
  }
  escrever(x, y, txt, { fonte = "F1", tamanho = 11, espaco = 0 } = {}) {
    const t = texto1252(txt).toString("latin1");
    this.ops.push(`BT /${fonte} ${tamanho} Tf ${espaco ? espaco + " Tc " : ""}${x} ${y} Td (${t}) Tj ET`);
    if (espaco) this.ops.push("BT 0 Tc ET");
    return this;
  }
  centralizar(y, txt, opcoes = {}) {
    const larg = larguraTexto(txt, opcoes.tamanho || 11) + (opcoes.espaco || 0) * String(txt).length;
    return this.escrever((A4.largura - larg) / 2, y, txt, opcoes);
  }
  imagem(n, x, y, l, a) { this.ops.push(`q ${l} 0 0 ${a} ${x} ${y} cm /Im${n} Do Q`); return this; }
  toString() { return this.ops.join("\n"); }
}

/* ==========================================================================
   A folha de imóveis da Royal: capa curta + até 3 opções, uma por bloco.
   `imoveis` = [{ codigo, tipo, bairro, cidade, preco, quartos, suites, vagas,
                  area, descricao, fotoBuffer }]
   ========================================================================== */
export function folhaDeImoveis({ imoveis, empresa, corretor, creci, whats, endereco,
                                 cliente = "", logoBuffer = null }) {
  const doc = new Documento();
  const OURO = [0.788, 0.635, 0.153];       // #C9A227
  const ESCURO = [0.047, 0.043, 0.035];
  const CINZA = [0.45, 0.44, 0.42];

  const imagens = [];
  const usar = (buf) => {
    if (!buf) return null;
    const im = doc.imagemJpeg(buf);
    if (!im) return null;
    imagens.push(im);
    return { n: imagens.length - 1, ...im };
  };

  const logo = usar(logoBuffer);
  const fotos = imoveis.map((m) => usar(m.fotoBuffer));

  const t = new Tela();
  const M = 46;                              // margem
  const L = A4.largura - M * 2;

  // ---- cabeçalho ----
  t.cor(...ESCURO).retangulo(0, A4.altura - 108, A4.largura, 108);
  if (logo) {
    const alt = 46, larg = Math.min(190, logo.largura * (alt / logo.altura));
    t.imagem(logo.n, M, A4.altura - 80, larg, alt);
  } else {
    t.cor(...OURO).escrever(M, A4.altura - 62, "ROYAL", { fonte: "F3", tamanho: 26, espaco: 6 });
    t.cor(1, 1, 1).escrever(M + 2, A4.altura - 80, String(empresa || "").toUpperCase(), { fonte: "F1", tamanho: 7, espaco: 2 });
  }
  t.cor(1, 1, 1).escrever(M, A4.altura - 98, cliente ? `Seleção para ${cliente}` : "Seleção de imóveis", { fonte: "F1", tamanho: 9 });
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  t.escrever(A4.largura - M - 60, A4.altura - 98, hoje, { fonte: "F1", tamanho: 9 });
  t.corLinha(...OURO).linha(0, A4.altura - 108, A4.largura, A4.altura - 108, 2);

  // ---- blocos dos imóveis ----
  const ALTURA_BLOCO = 176;
  let y = A4.altura - 108 - 26;

  imoveis.forEach((m, i) => {
    const topo = y;
    const base = topo - ALTURA_BLOCO;

    // moldura leve
    t.corLinha(0.88, 0.87, 0.85).retangulo(M, base, L, ALTURA_BLOCO, false);

    // foto à esquerda
    const foto = fotos[i];
    const lFoto = 200, aFoto = ALTURA_BLOCO - 24;
    if (foto) {
      const escala = Math.max(lFoto / foto.largura, aFoto / foto.altura);
      const fl = foto.largura * escala, fa = foto.altura * escala;
      t.ops.push(`q ${M + 12} ${base + 12} ${lFoto} ${aFoto} re W n`);
      t.imagem(foto.n, M + 12 - (fl - lFoto) / 2, base + 12 - (fa - aFoto) / 2, fl, fa);
      t.ops.push("Q");
    } else {
      t.cor(0.93, 0.92, 0.9).retangulo(M + 12, base + 12, lFoto, aFoto);
      t.cor(...CINZA).escrever(M + 12 + 58, base + 12 + aFoto / 2, "sem foto", { tamanho: 9 });
    }

    // textos à direita
    const x = M + 12 + lFoto + 20;
    const larguraTxt = L - (x - M) - 16;
    let ty = topo - 30;

    t.cor(...OURO).escrever(x, ty, `CÓD. ${m.codigo}`, { fonte: "F2", tamanho: 8, espaco: 1.5 });
    ty -= 22;
    t.cor(...ESCURO).escrever(x, ty, cortar(`${m.tipo || "Imóvel"} no ${m.bairro || ""}`, 15, larguraTxt), { fonte: "F2", tamanho: 15 });
    ty -= 15;
    t.cor(...CINZA).escrever(x, ty, m.cidade || "Uberlândia", { tamanho: 9 });
    ty -= 26;

    const preco = m.preco
      ? Number(m.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
      : "Sob consulta";
    t.cor(...ESCURO).escrever(x, ty, preco, { fonte: "F2", tamanho: 17 });
    ty -= 24;

    const dados = [
      m.quartos ? `${m.quartos} quarto${m.quartos > 1 ? "s" : ""}` : "",
      m.suites ? `${m.suites} suíte${m.suites > 1 ? "s" : ""}` : "",
      m.vagas ? `${m.vagas} vaga${m.vagas > 1 ? "s" : ""}` : "",
      m.area ? `${m.area} m²` : "",
    ].filter(Boolean).join("   ·   ");
    t.cor(...CINZA).escrever(x, ty, cortar(dados, 10, larguraTxt), { tamanho: 10 });

    if (m.descricao) {
      ty -= 18;
      t.escrever(x, ty, cortar(m.descricao, 9, larguraTxt), { tamanho: 9 });
    }

    y = base - 16;
  });

  // ---- rodapé ----
  const rodape = 64;
  t.corLinha(...OURO).linha(M, rodape + 34, A4.largura - M, rodape + 34, 1);
  t.cor(...ESCURO).escrever(M, rodape + 18, `${corretor || ""}${creci ? " — CRECI " + creci : ""}`, { fonte: "F2", tamanho: 10 });
  t.cor(...CINZA).escrever(M, rodape + 5, [whats, endereco].filter(Boolean).join("  ·  "), { tamanho: 8 });
  t.escrever(M, rodape - 10, "Valores e disponibilidade sujeitos a confirmação.", { tamanho: 7 });

  doc.pagina(t.toString(), imagens);
  return doc.gerar();
}
