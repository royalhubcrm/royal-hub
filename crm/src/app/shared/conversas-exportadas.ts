/**
 * Lê conversas exportadas do WhatsApp (o .zip do "Exportar conversa", ou o .txt de dentro dele)
 * direto no navegador, tira os dados pessoais e monta os trechos que a IA vai ler para
 * aprender o jeito de escrever do corretor. Nada disso sai do computador antes de ser limpo.
 */

export interface Fala { de: 'corretor' | 'cliente'; texto: string }
export interface ConversaLida { arquivo: string; falas: Fala[] }

/** "[7/30/26, 5:55:45 PM] Fulano:" e "30/07/2026 17:55 - Fulano:" */
const LINHA = /^\s*[\[‎]*\s*(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[AaPp]\.?[Mm]\.?)?\s*[\]\-–]\s*([^:]{1,60}?):\s?([\s\S]*)$/;

const SISTEMA = /mensagens e liga(ç|c)(õ|o)es|Voc(ê|e) apagou|apagou esta mensagem|criptografia de ponta a ponta|Mensagem apagada|<M(í|i)dia oculta>|arquivo an(e|ê)xado|imagem ocultada|figurinha omitida|(á|a)udio ocultado|v(í|i)deo omitido|GIF omitido|Miss(e|ê)d voice call|null/i;

/** Tira telefone, e-mail, CPF, link e endereço numerado — o que a IA não precisa ver. */
export function anonimo(t: string): string {
  return t
    .replace(/\b(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, '(telefone)')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '(e-mail)')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '(CPF)')
    .replace(/https?:\/\/\S+|\bwww\.\S+/g, '(link)')
    .trim();
}

/** Um .txt exportado vira a lista de falas, já sem nomes e sem as mensagens do sistema. */
export function lerConversa(arquivo: string, bruto: string): ConversaLida {
  const linhas = bruto.replace(/\r/g, '').split('\n');
  const falas: Fala[] = [];
  const quem = new Map<string, number>();
  const cru: { autor: string; texto: string }[] = [];

  for (const l of linhas) {
    const m = LINHA.exec(l);
    if (m) {
      const autor = m[3].trim();
      const texto = (m[4] ?? '').trim();
      if (!texto || SISTEMA.test(texto)) continue;
      quem.set(autor, (quem.get(autor) ?? 0) + 1);
      cru.push({ autor, texto });
    } else if (cru.length && l.trim() && !SISTEMA.test(l)) {
      cru[cru.length - 1].texto += '\n' + l.trim(); // continuação da mensagem anterior
    }
  }

  // quem mais escreveu numa conversa de atendimento é o corretor
  const autores = [...quem.entries()].sort((a, b) => b[1] - a[1]);
  const corretor = autores[0]?.[0] ?? '';
  for (const c of cru) {
    const texto = anonimo(c.texto);
    if (texto) falas.push({ de: c.autor === corretor ? 'corretor' : 'cliente', texto });
  }
  return { arquivo, falas };
}

// ---------------------------------------------------------------- zip
/** Lê um .zip sem biblioteca nenhuma: só o índice central e o DecompressionStream do navegador. */
export async function lerZip(arquivo: File): Promise<{ nome: string; texto: string }[]> {
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let fim = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('Esse arquivo não parece um .zip do WhatsApp.');

  const quantos = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const saida: { nome: string; texto: string }[] = [];

  for (let n = 0; n < quantos; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const tam = dv.getUint32(p + 20, true);
    const tamNome = dv.getUint16(p + 28, true);
    const tamExtra = dv.getUint16(p + 30, true);
    const tamCom = dv.getUint16(p + 32, true);
    const inicio = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + tamNome));
    p += 46 + tamNome + tamExtra + tamCom;
    if (!/\.(txt|md)$/i.test(nome)) continue;

    // cabeçalho local: o tamanho do nome e do extra podem ser outros
    const nomeLocal = dv.getUint16(inicio + 26, true);
    const extraLocal = dv.getUint16(inicio + 28, true);
    const dados = buf.subarray(inicio + 30 + nomeLocal + extraLocal, inicio + 30 + nomeLocal + extraLocal + tam);
    const cru = metodo === 0 ? dados : new Uint8Array(await new Response(
      new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
    ).arrayBuffer());
    saida.push({ nome, texto: new TextDecoder('utf-8').decode(cru) });
  }
  return saida;
}

/** Aceita .zip, .txt e .md; devolve uma conversa lida por arquivo de texto encontrado. */
export async function lerArquivos(arquivos: File[]): Promise<ConversaLida[]> {
  const lidas: ConversaLida[] = [];
  for (const a of arquivos) {
    if (/\.zip$/i.test(a.name)) {
      for (const t of await lerZip(a)) lidas.push(lerConversa(`${a.name} › ${t.nome}`, t.texto));
    } else {
      lidas.push(lerConversa(a.name, await a.text()));
    }
  }
  return lidas.filter((c) => c.falas.length);
}

export const contarFalas = (lidas: ConversaLida[]) => lidas.reduce((n, c) => n + c.falas.length, 0);

/**
 * Monta o texto que vai para a IA: os pedaços em que o corretor fala, com a pergunta
 * do cliente antes, limitado no tamanho para não estourar o pedido.
 */
export function trechosParaTreino(lidas: ConversaLida[], limite = 22000): string {
  const blocos: string[] = [];
  for (const c of lidas) {
    const linhas: string[] = [];
    for (const f of c.falas) {
      if (f.texto.length > 600) continue;
      linhas.push(`${f.de === 'corretor' ? 'CORRETOR' : 'CLIENTE'}: ${f.texto}`);
    }
    if (linhas.some((l) => l.startsWith('CORRETOR'))) blocos.push(linhas.join('\n'));
  }
  // pega um pedaço de cada conversa, em vez de encher tudo com a primeira
  const porConversa = Math.max(1200, Math.floor(limite / Math.max(1, blocos.length)));
  let texto = blocos.map((b, i) => `--- conversa ${i + 1} ---\n${b.slice(0, porConversa)}`).join('\n\n');
  if (texto.length > limite) texto = texto.slice(0, limite);
  return texto;
}
