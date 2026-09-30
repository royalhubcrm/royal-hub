// @ts-nocheck — código portado do gerador antigo (o de Python). Roda igual; os tipos ficam soltos de propósito.
// Gerador de PDF caseiro, sem nenhuma biblioteca — a mesma engine do gerador em Python,
// agora rodando no próprio navegador (por isso bytes em Uint8Array no lugar do Buffer do Node).

/** Texto -> bytes latin1 (um caractere = um byte; o que passa de 255 vira "?"). */
function bytesDe(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c < 256 ? c : 63; }
  return b;
}

/** Bytes latin1 -> texto. */
function textoDe(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Cola vários pedaços de bytes num só. */
function juntar(partes: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of partes) n += p.length;
  const fora = new Uint8Array(n);
  let i = 0;
  for (const p of partes) { fora.set(p, i); i += p.length; }
  return fora;
}

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];

export const A4 = { largura: 595.28, altura: 841.89 };

/* ---------- utilidades ---------- */
// Alguns sinais que a gente usa (travessão, aspas curvas, reticências) não
// existem no latin1 e sumiriam do papel. Aqui eles viram o código do WinAnsi,
// que é o que a fonte do PDF entende.
const WINANSI = { "\u2014": "\u0097", "\u2013": "\u0096", "\u2018": "\u0091", "\u2019": "\u0092",
  "\u201c": "\u0093", "\u201d": "\u0094", "\u2022": "\u0095", "\u2026": "\u0085", "\u20ac": "\u0080" };

const texto1252 = (s) =>
  bytesDe(String(s ?? "")
    .replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g, (c) => WINANSI[c])
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"));

// largura aproximada de um texto, para centralizar e cortar
export const larguraTexto = (s, tamanho) => String(s || "").length * tamanho * 0.5;

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
      return { altura: u16(buf, i + 5), largura: u16(buf, i + 7),
               canais: buf[i + 9] };
    }
    i += 2 + u16(buf, i + 2);
  }
  return null;
}

/* ---------- montagem do arquivo ---------- */
export class Documento {
  constructor() {
    this.objetos = [];          // cada item: os bytes do objeto
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
    const cabecalho = bytesDe(
      `<< /Type /XObject /Subtype /Image /Width ${m.largura} /Height ${m.altura} ` +
      `/ColorSpace ${cor} /BitsPerComponent 8 /Filter /DCTDecode /Length ${buf.length} >>\nstream\n`,
      );
    const id = this.novo(juntar([cabecalho, buf, bytesDe("\nendstream")]));
    return { id, largura: m.largura, altura: m.altura };
  }

  pagina(conteudo, imagens) {
    const fluxo = bytesDe(conteudo);
    const idFluxo = this.novo(juntar([
      bytesDe(`<< /Length ${fluxo.length} >>\nstream\n`),
      fluxo, bytesDe("\nendstream")]));
    this.paginas.push({ idFluxo, imagens });
  }

  gerar() {
    const idHelv = this.novo(bytesDe("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
    const idHelvB = this.novo(bytesDe("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
    const idTimesB = this.novo(bytesDe("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>"));

    const idPaginas = this.objetos.length + this.paginas.length + 1;
    const idsPagina = [];
    for (const p of this.paginas) {
      const xobj = p.imagens.length
        ? "/XObject << " + p.imagens.map((im, n) => `/Im${n} ${im.id} 0 R`).join(" ") + " >> "
        : "";
      idsPagina.push(this.novo(bytesDe(
        `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] ` +
        `/Resources << /Font << /F1 ${idHelv} 0 R /F2 ${idHelvB} 0 R /F3 ${idTimesB} 0 R >> ${xobj}>> ` +
        `/Contents ${p.idFluxo} 0 R >>`)));
    }

    const idArvore = this.novo(bytesDe(
      `<< /Type /Pages /Kids [${idsPagina.map((i) => i + " 0 R").join(" ")}] /Count ${idsPagina.length} >>`));
    const idCatalogo = this.novo(bytesDe(`<< /Type /Catalog /Pages ${idArvore} 0 R >>`));

    const partes = [bytesDe("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
    let posicao = partes[0].length;
    const enderecos = [];
    this.objetos.forEach((corpo, n) => {
      enderecos.push(posicao);
      const b = juntar([bytesDe(`${n + 1} 0 obj\n`), corpo, bytesDe("\nendobj\n")]);
      partes.push(b);
      posicao += b.length;
    });

    let xref = `xref\n0 ${this.objetos.length + 1}\n0000000000 65535 f \n`;
    for (const e of enderecos) xref += String(e).padStart(10, "0") + " 00000 n \n";
    xref += `trailer\n<< /Size ${this.objetos.length + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${posicao}\n%%EOF\n`;
    partes.push(bytesDe(xref));
    return juntar(partes);
  }
}

/* ---------- desenho ---------- */
export class Tela {
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
    const t = textoDe(texto1252(txt));
    this.ops.push(`BT /${fonte} ${tamanho} Tf ${espaco ? espaco + " Tc " : ""}${x} ${y} Td (${t}) Tj ET`);
    if (espaco) this.ops.push("BT 0 Tc ET");
    return this;
  }
  centralizar(y, txt, opcoes = {}) {
    const larg = larguraTexto(txt, opcoes.tamanho || 11) + (opcoes.espaco || 0) * String(txt).length;
    return this.escrever((A4.largura - larg) / 2, y, txt, opcoes);
  }
  imagem(n, x, y, l, a) { this.ops.push(`q ${l} 0 0 ${a} ${x} ${y} cm /Im${n} Do Q`); return this; }
  // círculo desenhado com quatro curvas — o PDF não tem círculo pronto
  circulo(cx, cy, r) {
    const k = r * 0.5523;
    this.ops.push(
      `${cx - r} ${cy} m ` +
      `${cx - r} ${cy + k} ${cx - k} ${cy + r} ${cx} ${cy + r} c ` +
      `${cx + k} ${cy + r} ${cx + r} ${cy + k} ${cx + r} ${cy} c ` +
      `${cx + r} ${cy - k} ${cx + k} ${cy - r} ${cx} ${cy - r} c ` +
      `${cx - k} ${cy - r} ${cx - r} ${cy - k} ${cx - r} ${cy} c f`);
    return this;
  }
  // retângulo de cantos arredondados, para os cartões
  cartao(x, y, l, a, r = 6) {
    const k = r * 0.5523;
    this.ops.push(
      `${x + r} ${y} m ${x + l - r} ${y} l ` +
      `${x + l - r + k} ${y} ${x + l} ${y + r - k} ${x + l} ${y + r} c ` +
      `${x + l} ${y + a - r} l ` +
      `${x + l} ${y + a - r + k} ${x + l - r + k} ${y + a} ${x + l - r} ${y + a} c ` +
      `${x + r} ${y + a} l ` +
      `${x + r - k} ${y + a} ${x} ${y + a - r + k} ${x} ${y + a - r} c ` +
      `${x} ${y + r} l ` +
      `${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} c f`);
    return this;
  }
  toString() { return this.ops.join("\n"); }
}
