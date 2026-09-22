/**
 * Leitura do que a pessoa cola de uma planilha (Excel, Google Sheets) ou de um
 * CSV. Tudo roda no navegador: nada é enviado antes de a pessoa conferir.
 */
import { ImovelEditavel, imovelVazio } from '../../core/models/imovel.model';
import { LeadEditavel, Temperatura } from '../../core/models/lead.model';
import { telefoneChave } from './telefone';

export const semAcento = (t: unknown) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Planilha colada vem separada por TAB; CSV por ; ou , (respeitando aspas). */
export function separarLinha(linha: string): string[] {
  if (linha.includes('\t')) return linha.split('\t');
  if (linha.includes(';')) return linha.split(';');
  const partes: string[] = [];
  let atual = '', aspas = false;
  for (const c of linha) {
    if (c === '"') aspas = !aspas;
    else if (c === ',' && !aspas) { partes.push(atual); atual = ''; }
    else atual += c;
  }
  partes.push(atual);
  return partes;
}

const ETAPAS: Record<string, string> = {
  'novo': 'novo', 'em contato': 'contato', 'contato': 'contato', 'visita': 'visita',
  'proposta': 'proposta', 'fechado': 'fechado', 'ganho': 'fechado', 'perdido': 'perdido',
};

export interface LeituraLeads {
  leads: LeadEditavel[];
  ignorados: number;          // linhas sem nome e sem telefone
  repetidosNaPlanilha: number;
}

export function lerLeadsDaPlanilha(texto: string): LeituraLeads {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { leads: [], ignorados: 0, repetidosNaPlanilha: 0 };

  // descobre as colunas pelo cabeçalho
  const cab = separarLinha(linhas[0]).map(semAcento);
  const acha = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c.includes(n)));
  const col = {
    nome: acha('nome', 'cliente', 'contato'),
    telefone: acha('telefone', 'whats', 'celular', 'fone', 'tel'),
    email: acha('email', 'e-mail'),
    interesse: acha('interesse', 'imovel', 'procura', 'busca', 'observ', 'obs'),
    origem: acha('origem', 'fonte', 'canal'),
    campanha: acha('campanha', 'anuncio'),
    temperatura: acha('temperatura', 'classific'),
    etapa: acha('estagio', 'etapa', 'funil', 'status'),
  };
  const temCabecalho = col.nome >= 0 || col.telefone >= 0;
  const corpo = temCabecalho ? linhas.slice(1) : linhas;

  const vistos = new Set<string>();
  let ignorados = 0, repetidosNaPlanilha = 0;
  const leads: LeadEditavel[] = [];

  for (const l of corpo) {
    const p = separarLinha(l).map((x) => x.replace(/^"|"$/g, '').trim());
    let nome = '', telefone = '', email = '', interesse = '', origem = '', campanha = '', temp = '', etapa = '';
    if (temCabecalho) {
      const v = (i: number) => (i >= 0 ? p[i] ?? '' : '');
      nome = v(col.nome); telefone = v(col.telefone); email = v(col.email); interesse = v(col.interesse);
      origem = v(col.origem); campanha = v(col.campanha); temp = v(col.temperatura); etapa = v(col.etapa);
    } else {
      // sem cabeçalho: o que tem muitos dígitos é telefone, o que tem @ é e-mail
      telefone = p.find((x) => (x.match(/\d/g) ?? []).length >= 8) ?? '';
      email = p.find((x) => x.includes('@')) ?? '';
      nome = p.find((x) => x && x !== telefone && x !== email) ?? '';
      interesse = p.filter((x) => x && x !== nome && x !== telefone && x !== email).join(' ');
    }
    if (!nome && !telefone) { ignorados++; continue; }
    const chave = telefoneChave(telefone) ?? 'nome:' + semAcento(nome);
    if (vistos.has(chave)) { repetidosNaPlanilha++; continue; }
    vistos.add(chave);

    const t = semAcento(temp);
    leads.push({
      nome: nome || telefone,
      telefone: telefone || null,
      email: email.includes('@') ? email : null,
      interesse,
      origem: origem || 'Planilha',
      campanha,
      temperatura: (['quente', 'morno', 'frio'].includes(t) ? t : 'morno') as Temperatura,
      status: ETAPAS[semAcento(etapa)] ?? 'novo',
    });
  }
  return { leads, ignorados, repetidosNaPlanilha };
}

const numero = (v: unknown) => Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;

/**
 * Imóveis colados: JSON (lista de objetos) ou uma linha por imóvel no formato
 *   código; tipo; bairro; preço; quartos; suítes; vagas; área
 */
export function lerImoveisColados(texto: string, cidade: string): ImovelEditavel[] {
  const t = texto.trim();
  if (!t) return [];
  let brutos: Record<string, unknown>[];
  try {
    const j = JSON.parse(t);
    brutos = Array.isArray(j) ? j : [j];
  } catch {
    brutos = t.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
      const p = separarLinha(l).map((s) => s.trim());
      return { codigo: p[0], tipo: p[1], bairro: p[2], preco: p[3], quartos: p[4], suites: p[5], vagas: p[6], area: p[7] };
    });
  }
  return brutos
    .map((o) => ({
      ...imovelVazio(cidade),
      codigo: String(o['codigo'] ?? o['código'] ?? '').trim(),
      tipo: String(o['tipo'] ?? 'Casa').trim() || 'Casa',
      bairro: String(o['bairro'] ?? '').trim(),
      cidade: String(o['cidade'] ?? cidade).trim() || cidade,
      preco: numero(o['preco'] ?? o['preço']),
      quartos: Math.trunc(numero(o['quartos'])),
      suites: Math.trunc(numero(o['suites'] ?? o['suítes'])),
      vagas: Math.trunc(numero(o['vagas'])),
      area: numero(o['area'] ?? o['área']),
      descricao: String(o['descricao'] ?? o['descrição'] ?? ''),
      fotos: o['foto'] ? [String(o['foto'])] : Array.isArray(o['fotos']) ? (o['fotos'] as string[]) : [],
    }))
    .filter((m) => m.codigo);
}
