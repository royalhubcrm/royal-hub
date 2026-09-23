/**
 * MODO DEMONSTRAÇÃO — imita o Supabase dentro do navegador, com dados de exemplo.
 * Só entra no app com "npm run demo" (configuração "demo" do angular.json).
 * Nada daqui vai para a versão de produção, e nada é gravado de verdade:
 * recarregar a página volta tudo ao começo.
 */
import type { ModoDemo } from '../app/core/supabase/demo-tipo';
import { semente, Tabelas } from './demo-dados';

const URL_DEMO = 'https://demo.supabase.co';
const CHAVE_SESSAO = 'sb-demo-auth-token';

const db: Tabelas = semente();
const eu = db.perfis[0];
const usuario = { id: eu.id, email: eu.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const sessao = () => ({
  access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, user: usuario,
});

// primeira visita: já entra logado como o administrador de exemplo
try {
  if (!localStorage.getItem('royal-demo-visto')) {
    localStorage.setItem('royal-demo-visto', '1');
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao()));
  }
} catch { /* navegador sem localStorage: fica na tela de login */ }

// modelos de exemplo para a tela da demonstração
const MODELOS_DEMO = {
  padrao: { groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.6-flash', anthropic: 'claude-sonnet-5' },
  listas: {
    groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
    gemini: ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    anthropic: [] as string[],
  },
};

// texto padrão do prompt, só para a tela da demonstração (o real fica em supabase/functions/_shared/ia.ts)
const PROMPT_DEMO = `[AGORA — data e hora reais do sistema; nunca calcule nem presuma]
Hoje é {{agora}}, em {{cidade}}. Amanhã é {{amanha}}. O cumprimento certo agora é "{{saudacao}}".{{aviso_fim_de_semana}}

Você é a {{assistente}}, assistente do {{corretor}} na {{empresa}} ({{cidade}}), atendendo pelo WhatsApp. Mulher, uns 28 anos, alguns anos de imobiliária — calorosa, espontânea e resolvida; fala no feminino ("obrigada"). Objetivo: quando fizer sentido, levar o cliente a um ATENDIMENTO PRESENCIAL no escritório, com dia e hora — mas quem conduz é ELE. Você não fecha negócio por mensagem: mostra, tira dúvida e aproxima.

═══ REGRA Nº1 — A DÚVIDA DELE VEM PRIMEIRO ═══
- Leia a mensagem inteira (pode vir em várias linhas de uma vez) e responda a intenção mais recente/relevante do bloco TODO — não só o cumprimento.
- Se ele perguntou algo, responda ISSO, direto e curto, ANTES de qualquer pergunta sua. Só depois, se couber, UMA pergunta. Ex — "esse da foto tem quintal?" → responda o que a ficha diz (ou diga que confirma) e só então siga.
- Uma mensagem faz UMA coisa: ou reage, ou responde, ou faz UMA pergunta. Nunca duas perguntas juntas; nunca cumprimento + pergunta + convite no mesmo texto.
- Mensagem vaga ("oi", "?", "vi o anúncio"): não force "entendi" nem ofereça imóvel; pergunte leve o que ele quer ("Me conta, o que você tá procurando?").
- PROIBIDO repetir pergunta que você já fez ou que ele já respondeu. Olhe o histórico antes de perguntar.
- Se ele corrigir um dado, confirme só o item corrigido ("Anotei, até 250 então") e siga de onde parou. Nunca reinicie o atendimento.
- Convite pra atendimento: no máximo 1 vez por vez. "Vou pensar"/"depois" → aceite e pare; não reofereça.
- Se ele já contou tudo de uma vez (região, quartos, valor…), reaja, mostre a opção que encaixa e PARE — sem convite de visita na mesma mensagem; o convite vem depois que ele reagir.

═══ COMO VOCÊ FALA ═══
- REAJA antes de perguntar, só quando houver algo real pra acolher ("Boa, o Santa Mônica é ótimo pra quem trabalha no centro"). Espelhe a energia: se ele é seco, seja curta.
- Como gente: contrações (pra, tá, bora), frases curtas. Nunca repita frase já usada nem comece duas mensagens igual.
- PROIBIDO tom de call center ("Como posso ajudá-lo?", "Estou à disposição", "Prezado").
- Emoji na MINORIA das mensagens, no máximo 1, nunca em duas seguidas.

═══ APRESENTAÇÃO E NOME ═══
Só se apresente na 1ª mensagem (histórico vazio): "{{saudacao}}! Aqui é a {{assistente}}, da {{empresa}}" e pergunte o que ele precisa. Com histórico, continue de onde parou — nunca recomece com "oi, tudo bem" nem repita seu nome. Se o nome dele já apareceu, USE e nunca pergunte de novo. Se perguntarem se é robô: "Sou a assistente virtual da {{empresa}}, mas pode falar comigo normal 😊". Se pedir uma pessoa: "Claro, já passo pro {{corretor}} continuar com você" e pare.

═══ FORMATAÇÃO WHATSAPP ═══
Negrito *texto* (UM asterisco, nunca **). Itálico _texto_. Nunca use #, ---, crase nem marcador de lista ("- ", "• ", "* "). Parágrafo separado por linha em branco = mensagem separada: use só quando os assuntos forem distintos (a maioria é uma mensagem só). Imóvel citado: uma linha começando direto no *negrito* do tipo e bairro, com o código no fim.

═══ A {{EMPRESA}} ═══
Escritório: {{endereco}}. Atendimento presencial só com hora marcada, de segunda a sexta.
Pode afirmar com segurança (e SÓ isto):
{{fatos}}
Entrada, parcela, prazo, renda necessária e custas: nunca por mensagem — "isso o {{corretor}} vê com você no atendimento, com os números na mão".

═══ CARTEIRA — os ÚNICOS imóveis que existem (tempo real) ═══
{{imoveis}}
- NUNCA invente imóvel, bairro, metragem, vaga ou preço. Copie da linha acima e sempre cite o código. No máximo DOIS imóveis por mensagem.
- Preço: só quando perguntarem ou ao apresentar uma opção — valor EXATO da linha, sem arredondar, sem "a partir de".
- A {{empresa}} atende TODAS as regiões de {{cidade}}. Nunca diga que não atende um bairro. Se nada encaixar, diga que vai separar opções com o {{corretor}} e anote a preferência — não invente.

═══ NUNCA INVENTE ═══
Só afirme o que está escrito aqui. Isso vale também para a REGIÃO: escolas, comércio, segurança, trânsito, valorização, vizinhança — você NÃO sabe; nunca elogie nem descreva um bairro além do que está na ficha do imóvel. Pergunta que não está aqui (condomínio de um imóvel, FGTS, permuta, pet, documentação, desconto, "tem escola perto?"…): acolha, diga que confirma com o {{corretor}} e emita (o cliente nunca vê) [DUVIDA]{"pergunta":"<resumo curto>"}. Ex — "aceita permuta?" → "Essa eu confirmo com o {{corretor}} pra não te passar errado, já te aviso." [DUVIDA]{"pergunta":"Aceita permuta no cód. 8685?"}

═══ FOTOS E OPÇÕES ═══
- [ENVIAR_OPCOES]: quando já souber a REGIÃO ou a FAIXA DE PREÇO e for mostrar opções — o sistema manda foto + link de até três imóveis que encaixam. Junto, UMA frase leve ("Separei três que encaixam, dá uma olhada"). Uma vez por conversa, a não ser que ele mude o que procura.
- [ENVIAR_FOTO_IMOVEL_CODIGO] quando ele pedir a foto de UM imóvel (ex.: [ENVIAR_FOTO_IMOVEL_8685]).
- Nunca descreva em palavras que enviou algo ("aqui está a foto"). Se ele disser "não recebi": olhe o histórico — se a sua última mensagem já foi a linha "tipo no bairro — cód. X" do MESMO imóvel, NÃO reenvie; diga "Mandei agora há pouco, dá uma olhadinha aí em cima 😊 Se não aparecer me avisa". Só reenvie se ele insistir.

═══ MEMÓRIA DO CLIENTE (é o que vira relatório — capriche) ═══
Sempre que ele contar algo durável, acrescente no FINAL da resposta, em linha própria, só os campos descobertos:
[PERFIL]{"nome":"<nome>","idade":<número>,"regiao":"<bairro ou região>","tipo":"<Casa|Apartamento|...>","quartos":<número>,"teto":<reais, inteiro>,"finalidade":"<comprar|alugar|investir>","pagamento":"<financiamento|à vista|FGTS...>","prazo":"<quando precisa mudar>","familia":"<com quem vai morar>","preferencias":"<o que ele valoriza>"}
- SÓ o que ELE disse, com as palavras dele. Campo que ele não mencionou NÃO entra (nem vazio, nem chute, nem exemplo). Extraia do que vier naturalmente ("somos eu, minha esposa e as crianças" → familia; "vou financiar" → pagamento; "preciso mudar antes de março" → prazo). NUNCA faça pergunta só pra preencher ficha: no máximo UMA pergunta de qualificação por vez, e só quando fizer sentido na conversa.
- teto em número inteiro em reais (650 mil → 650000); quartos e idade em número; tipo = Casa, Apartamento, Lote/Terreno, Chácara, Sala comercial…; finalidade = comprar | alugar | investir.
- Em preferencias, junte o que já sabia com o novo. Corrigiu um dado → mande o campo corrigido de novo.

═══ CÓDIGOS INTERNOS (o cliente NUNCA vê; o sistema remove antes de enviar; formato exato; nunca dois iguais no mesmo texto) ═══
[ENVIAR_OPCOES] · [ENVIAR_FOTO_IMOVEL_CODIGO] · [DUVIDA]{...} · [PERFIL]{...} · [AGENDAMENTO_CONFIRMADO]{...}

═══ FLUXO (guia, não trilho — só avance quando o cliente puxar; use o histórico pra saber onde parou e nunca repetir o já respondido) ═══
1. Saudação + apresentação (só na 1ª msg). Pergunte aberto o que ele procura e espere.
2. Entender: região OU faixa de preço (uma pergunta, reagindo antes). Quartos e tipo só se ele não disse e fizer diferença.
3. Mostrar: até dois imóveis que batem (linha em negrito com o código) e emita [ENVIAR_OPCOES]. Feche com UMA frase leve — sem convite de visita ainda.
4. Reação: se ele gostou de um, aprofunde nele (responda o que ele perguntar). Se não gostou, pergunte o que mudaria (uma coisa) e ajuste.
5. Atendimento: quando ele demonstrar interesse, convide pra ver com o {{corretor}} no escritório (uma vez). Colete só o que falta, uma coisa por vez: nome (se já sabe, confirme embutido), DIA (nunca presuma "hoje"; só seg a sex — confira em [AGORA]; se "hoje", confira que ainda é horário comercial), HORÁRIO. Proponha horário concreto. Datas em DD/MM.
6. Confirmação (mensagem separada, varie a intro):
*Nome:* [nome]
*Data:* [DD/MM]
*Horário:* [horário]
*Imóvel de interesse:* [tipo no bairro — cód. X]
*Local:* {{endereco}}
Feche pedindo confirmação ("Pode confirmar?", "Ficou certo?").
7. Encerramento — só APÓS ele confirmar, com calor, e SÓ aí acrescente [AGENDAMENTO_CONFIRMADO]{"nome":"...","data":"AAAA-MM-DD","hora":"HH:MM","codigo":"X"} (nunca antes da confirmação, nunca duas vezes, nunca junto de foto).

═══ GERAL ═══
Sempre português, natural, sem pressão. Despedida ou agradecimento ("obrigado", "valeu", 👍): responda curto e caloroso e ENCERRE — nunca reabra o assunto. Fim de semana: diga que o escritório abre na segunda e que o {{corretor}} responde no próximo dia útil; não marque pra hoje.

═══ O JEITO DO {{CORRETOR}} (siga fielmente) ═══
{{estilo}}`;

// ------------------------------------------------------------------ utilidades
const agora = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const resposta = (corpo: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...extra } });
const erro = (status: number, code: string, message: string, details = '') => resposta({ code, message, details, hint: null }, status);
const digitos = (t: unknown) => String(t ?? '').replace(/\D/g, '');
const telNormal = (t: unknown) => { const d = digitos(t); return !d ? null : d.length === 10 || d.length === 11 ? '55' + d : d; };
const telChave = (t: unknown) => { const d = telNormal(t); return !d ? null : d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(0, 4) + d.slice(-8) : d; };
const semAcento = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ------------------------------------------------------------------ "views"
function tabela(nome: string): any[] {
  switch (nome) {
    case 'resumo_pipeline':
      return db.etapas_pipeline.map((e) => {
        const ls = db.leads.filter((l) => l.status === e.slug);
        const total = ls.reduce((t, l) => t + Number(l.valor_estimado), 0);
        return { ...e, quantidade: ls.length, valor_total: total, valor_ponderado: (total * e.probabilidade) / 100 };
      });
    case 'conversas_lista':
      return db.conversas.map((c) => {
        const ultima = db.mensagens.filter((m) => m.conversa_id === c.id).at(-1);
        return { ...c, ultimo_de: ultima?.de ?? null, responsavel_nome: db.perfis.find((p) => p.id === c.responsavel_id)?.nome ?? null };
      });
    case 'interesses_detalhe':
      return db.interesses.map((i) => {
        const m = db.imoveis.find((x) => x.codigo === i.codigo);
        const c = db.conversas.find((x) => x.id === i.conversa_id);
        const l = db.leads.find((x) => x.id === i.lead_id);
        return { ...i, tipo: m?.tipo ?? null, bairro: m?.bairro ?? null, preco: m?.preco ?? null, cliente: c?.nome || l?.nome || c?.telefone || null };
      });
    default:
      return (db as unknown as Record<string, any[]>)[nome] ?? [];
  }
}

// ------------------------------------------------------------------ filtros do PostgREST
function valorLiteral(v: string) { return v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v; }

function condicao(col: string, expr: string): (r: any) => boolean {
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const ponto = expr.indexOf('.');
  const op = expr.slice(0, ponto);
  const bruto = expr.slice(ponto + 1); // o URLSearchParams já decodificou
  const f = (r: any): boolean => {
    const v = r[col];
    switch (op) {
      case 'eq': return String(v) === bruto;
      case 'neq': return v !== null && v !== undefined && String(v) !== bruto;
      case 'is': return valorLiteral(bruto) === null ? v === null || v === undefined : v === valorLiteral(bruto);
      case 'in': return bruto.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v));
      case 'gt': return v !== null && v > (isNaN(+bruto) ? bruto : +bruto);
      case 'gte': return v !== null && v >= (isNaN(+bruto) ? bruto : +bruto);
      case 'lt': return v !== null && v < (isNaN(+bruto) ? bruto : +bruto);
      case 'lte': return v !== null && v <= (isNaN(+bruto) ? bruto : +bruto);
      case 'like': case 'ilike': {
        if (v === null || v === undefined) return false;
        const padrao = op === 'ilike' ? semAcento(bruto) : bruto;
        const re = new RegExp('^' + padrao.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$');
        return re.test(op === 'ilike' ? semAcento(v) : String(v));
      }
      default: return true;
    }
  };
  return neg ? (r) => !f(r) : f;
}

function separarTopo(s: string): string[] {
  const partes: string[] = []; let atual = '', nivel = 0;
  for (const c of s) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) { partes.push(atual); atual = ''; } else atual += c;
  }
  if (atual) partes.push(atual);
  return partes;
}

function filtrar(linhas: any[], params: URLSearchParams): any[] {
  const reservados = new Set(['select', 'order', 'offset', 'limit', 'or', 'on_conflict', 'columns']);
  let r = linhas;
  params.forEach((valor, chave) => {
    if (reservados.has(chave)) return;
    r = r.filter(condicao(chave, valor));
  });
  const ou = params.get('or');
  if (ou) {
    const conds = separarTopo(ou.replace(/^\(|\)$/g, '')).map((p) => {
      const i = p.indexOf('.');
      return condicao(p.slice(0, i), p.slice(i + 1));
    });
    r = r.filter((l) => conds.some((c) => c(l)));
  }
  return r;
}

function ordenar(linhas: any[], ordem: string | null) {
  if (!ordem) return linhas;
  const regras = ordem.split(',').map((o) => { const [col, dir, nulos] = o.split('.'); return { col, desc: dir === 'desc', nulosPrimeiro: nulos === 'nullsfirst' }; });
  return [...linhas].sort((a, b) => {
    for (const { col, desc, nulosPrimeiro } of regras) {
      const va = a[col], vb = b[col];
      if (va === vb) continue;
      if (va === null || va === undefined) return nulosPrimeiro ? -1 : 1;
      if (vb === null || vb === undefined) return nulosPrimeiro ? 1 : -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return desc ? -cmp : cmp;
    }
    return 0;
  });
}

function projetar(linhas: any[], select: string | null) {
  if (select?.includes('empresas(')) {
    return linhas.map((l) => ({ ...l, empresas: db.empresas.find((e) => e.id === l.empresa_id) ?? null }));
  }
  return linhas;
}

// ------------------------------------------------------------------ regras de escrita (os "triggers")
const PADRAO: Record<string, () => Record<string, unknown>> = {
  leads: () => ({ empresa: null, email: null, telefone: null, status: 'novo', temperatura: 'morno', valor_estimado: 0, origem: 'Manual', campanha: '',
    interesse: '', obs: '', imoveis: [], responsavel_id: null, posicao: Date.now() / 1000, data_criacao: agora(), atualizado_em: agora() }),
  imoveis: () => ({ tipo: 'Casa', finalidade: 'venda', status: 'disponivel', cep: '', rua: '', numero: '', bairro: '', cidade: 'Uberlândia', preco: 0,
    condominio: 0, iptu: 0, quartos: 0, suites: 0, banheiros: 0, vagas: 0, area: 0, descricao: '', fotos: [], link: '', criado_em: agora(), atualizado_em: agora() }),
  historico: () => ({ autor_id: eu.id, criado_em: agora() }),
  agendamentos: () => ({ conversa_id: null, lead_id: null, nome: '', telefone: '', data: null, hora: null, local: '', como: '', imovel: '', marcado_por: 'manual', status: 'marcado', criado_em: agora() }),
  equipes: () => ({ gerente_id: null, criado_em: agora() }),
  sites: () => ({ criado_em: agora(), atualizado_em: agora() }),
  testes_assistente: () => ({ autor_id: eu.id, titulo: '', provedor: '', modelo: '', prompt_base: '', falas: [], ficha: {}, nota: null, pros: '', contras: '', melhoria: '', criado_em: agora(), atualizado_em: agora() }),
};

function nomeEtapa(slug: string) { return db.etapas_pipeline.find((e) => e.slug === slug)?.nome ?? slug; }

function historico(leadId: string, texto: string, autor: string | null = eu.id) {
  db.historico.push({ id: db.historico.length + 1, empresa_id: eu.empresa_id, lead_id: leadId, texto, autor_id: autor, criado_em: agora() });
}

function inserir(nome: string, corpo: any): any {
  const lista = (db as unknown as Record<string, any[]>)[nome];
  const linha = { ...(PADRAO[nome]?.() ?? {}), empresa_id: eu.empresa_id, ...corpo };
  if (!('id' in linha)) linha.id = nome === 'historico' ? lista.length + 1 : uuid();
  if (nome === 'leads') {
    linha.telefone = telNormal(linha.telefone);
    if (linha.telefone && db.leads.some((l) => telChave(l.telefone) === telChave(linha.telefone)))
      throw { status: 409, code: '23505', message: 'duplicate key value violates unique constraint "leads_telefone_unico"', details: 'Key (empresa_id, crm.telefone_chave(telefone)) already exists.' };
  }
  if (nome === 'imoveis' && db.imoveis.some((m) => m.codigo === linha.codigo))
    throw { status: 409, code: '23505', message: 'duplicate key value violates unique constraint "imoveis_empresa_id_codigo_key"', details: 'Key (empresa_id, codigo) already exists.' };
  if (nome === 'sites' && db.sites.some((s) => s.slug === linha.slug))
    throw { status: 409, code: '23505', message: 'duplicate key value violates unique constraint "sites_slug_key"', details: '' };
  lista.push(linha);
  if (nome === 'leads') historico(linha.id, `Lead criado (${linha.origem || 'manual'})`);
  return linha;
}

function atualizar(nome: string, linha: any, campos: any) {
  const antes = { ...linha };
  Object.assign(linha, campos);
  if ('atualizado_em' in linha) linha.atualizado_em = agora();
  if (nome === 'leads') {
    if ('telefone' in campos) linha.telefone = telNormal(linha.telefone);
    if (antes.status !== linha.status) historico(linha.id, `Etapa: ${nomeEtapa(antes.status)} → ${nomeEtapa(linha.status)}`);
    if (antes.responsavel_id !== linha.responsavel_id)
      historico(linha.id, 'Responsável: ' + (db.perfis.find((p) => p.id === linha.responsavel_id)?.nome ?? 'ninguém'));
  }
}

// ------------------------------------------------------------------ REST
async function rest(nome: string, metodo: string, url: URL, headers: Headers, corpo: any) {
  const select = url.searchParams.get('select');
  const querObjeto = (headers.get('accept') ?? '').includes('vnd.pgrst.object');
  const prefer = headers.get('prefer') ?? '';
  const devolve = (linhas: any[], status = 200) => {
    if (querObjeto) {
      if (linhas.length !== 1) return erro(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${linhas.length} rows`);
      return resposta(linhas[0], status);
    }
    return resposta(linhas, status);
  };

  try {
    if (metodo === 'GET' || metodo === 'HEAD') {
      const todas = ordenar(filtrar(tabela(nome), url.searchParams), url.searchParams.get('order'));
      const ini = Number(url.searchParams.get('offset') ?? 0);
      const lim = url.searchParams.get('limit');
      const pagina = lim ? todas.slice(ini, ini + Number(lim)) : todas.slice(ini);
      const extra: Record<string, string> = prefer.includes('count=') ? { 'content-range': `${ini}-${ini + pagina.length - 1}/${todas.length}` } : {};
      if (querObjeto) return devolve(projetar(pagina, select));
      return resposta(projetar(pagina, select), 200, extra);
    }
    if (metodo === 'POST') {
      const itens = Array.isArray(corpo) ? corpo : [corpo];
      const conflito = url.searchParams.get('on_conflict');
      const feitos = itens.map((i) => {
        if (conflito && prefer.includes('merge-duplicates')) {
          const cols = conflito.split(',');
          const existente = tabela(nome).find((l) => cols.every((c) => String(l[c]) === String(i[c] ?? (c === 'empresa_id' ? eu.empresa_id : undefined))));
          if (existente) { atualizar(nome, existente, i); return existente; }
        }
        return inserir(nome, i);
      });
      const extra: Record<string, string> = prefer.includes('count=') ? { 'content-range': `*/${feitos.length}` } : {};
      if (!prefer.includes('return=representation')) return resposta(null, 201, extra);
      return querObjeto ? devolve(feitos, 201) : resposta(feitos, 201, extra);
    }
    if (metodo === 'PATCH') {
      const alvo = filtrar(tabela(nome), url.searchParams);
      for (const l of alvo) atualizar(nome, l, corpo);
      if (!prefer.includes('return=representation')) return resposta(null, 204);
      return devolve(alvo);
    }
    if (metodo === 'DELETE') {
      const lista = (db as unknown as Record<string, any[]>)[nome];
      const alvo = new Set(filtrar(lista, url.searchParams));
      (db as unknown as Record<string, any[]>)[nome] = lista.filter((l) => !alvo.has(l));
      if (nome === 'leads') db.historico = db.historico.filter((h) => ![...alvo].some((l) => l.id === h.lead_id));
      return resposta(null, 204);
    }
  } catch (e: any) {
    return erro(e.status ?? 400, e.code ?? 'P0001', e.message ?? String(e), e.details ?? '');
  }
  return erro(405, 'PGRST', 'Método não suportado na demonstração');
}

// ------------------------------------------------------------------ RPC
function rpc(nome: string, a: any) {
  const hoje = new Date().toLocaleDateString('sv-SE');
  switch (nome) {
    case 'sistema_configurado': return resposta(true);
    case 'registrar_acesso': eu.ultimo_acesso = agora(); return resposta(null, 204);
    case 'minha_empresa': return resposta(eu.empresa_id);
    case 'painel': {
      const tipo = (s: string) => db.etapas_pipeline.find((e) => e.slug === s)?.tipo;
      const L = db.leads;
      const mes = hoje.slice(0, 7);
      const disp = db.imoveis.filter((m) => m.status === 'disponivel');
      const serie = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.now() - (13 - i) * 864e5).toLocaleDateString('sv-SE');
        return { dia: d, n: L.filter((l) => new Date(l.data_criacao).toLocaleDateString('sv-SE') === d).length };
      });
      const cont: Record<string, number> = {};
      for (const c of [...L.flatMap((l) => l.imoveis), ...db.interesses.map((i) => i.codigo)]) cont[c] = (cont[c] ?? 0) + 1;
      return resposta({
        total: L.length,
        no_mes: L.filter((l) => new Date(l.data_criacao).toLocaleDateString('sv-SE').slice(0, 7) === mes).length,
        quentes: L.filter((l) => l.temperatura === 'quente' && tipo(l.status) === 'aberta').length,
        abertos: L.filter((l) => tipo(l.status) === 'aberta').length,
        fechados: L.filter((l) => tipo(l.status) === 'ganha').length,
        em_aberto: L.filter((l) => tipo(l.status) === 'aberta').reduce((t, l) => t + Number(l.valor_estimado), 0),
        imoveis: disp.length, vgv: disp.reduce((t, m) => t + Number(m.preco), 0),
        agenda_hoje: db.agendamentos.filter((x) => x.data === hoje && x.status === 'marcado').length,
        duvidas: db.duvidas.filter((d) => d.status === 'aberta').length,
        serie,
        recentes: [...L].sort((a, b) => b.data_criacao.localeCompare(a.data_criacao)).slice(0, 7),
        procurados: Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([codigo, n]) => {
          const m = db.imoveis.find((x) => x.codigo === codigo);
          return { codigo, n, tipo: m?.tipo ?? null, bairro: m?.bairro ?? null };
        }),
      });
    }
    case 'salvar_whatsapp': {
      const c = db.config[0];
      c.wa_numero_id = digitos(a.p_numero_id);
      if (a.p_verificacao) c.wa_verificacao = a.p_verificacao;
      if (a.p_token) c.wa_configurado = !!c.wa_numero_id;
      return resposta(null, 204);
    }
    case 'token_webhook': return resposta(a.p_trocar ? uuid().replace(/-/g, '') : 'demo0token0webhook0royal00000000');
    case 'empresa_publica': {
      const e = db.empresas.find((x) => x.slug === a.p_slug);
      return resposta(e ? { nome: e.nome, slug: e.slug, whats: db.config[0].whats, corretor: db.config[0].corretor } : null);
    }
    case 'captar_lead': {
      const tel = telNormal(a.p_telefone);
      const achado = db.leads.find((l) => telChave(l.telefone) === telChave(tel));
      if (achado) historico(achado.id, 'Voltou a entrar em contato (Formulário)', null);
      else inserir('leads', { nome: a.p_nome, telefone: tel, email: a.p_email || null, interesse: a.p_interesse, campanha: a.p_campanha, origem: 'Formulário' });
      return resposta(true);
    }
    case 'imovel_publico': {
      const m = db.imoveis.find((x) => x.id === a.p_id && x.status === 'disponivel');
      const c = db.config[0];
      return resposta(m ? { ...m, empresa: db.empresas[0].nome, empresa_slug: db.empresas[0].slug, whats: c.whats, corretor: c.corretor, creci: c.creci } : null);
    }
    case 'site_publico': {
      const s = db.sites.find((x) => x.slug === a.p_slug && x.publicado);
      if (!s) return resposta(null);
      const f = s.filtro ?? {};
      const imoveis = db.imoveis.filter((m) => m.status === 'disponivel' && (!f.tipos?.length || f.tipos.includes(m.tipo))
        && (!f.precoMax || m.preco <= f.precoMax)).map((m) => ({ ...m, foto: m.fotos[0] ?? null }));
      return resposta({ site: s, imoveis });
    }
    default: return resposta(null, 204);
  }
}

// ------------------------------------------------------------------ Edge Functions
async function funcao(nome: string, b: any) {
  await new Promise((r) => setTimeout(r, 700)); // parece a IA pensando
  if (nome === 'assistente') {
    if (b.acao === 'provedores') return resposta({ provedores: ['groq', 'gemini'], padrao: MODELOS_DEMO.padrao, listas: MODELOS_DEMO.listas });
    if (b.acao === 'prompt') {
      const cfg = db.config[0];
      const padrao = PROMPT_DEMO;
      const texto = typeof b.texto === 'string' ? b.texto : (cfg.prompt_base || padrao);
      const previa = texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_: string, k: string) => ({
        agora: 'terça-feira, 23/09/2026, 14:05', amanha: 'quarta-feira, 24/09', saudacao: 'Boa tarde', aviso_fim_de_semana: '',
        assistente: cfg.assistente, corretor: cfg.corretor, CORRETOR: String(cfg.corretor).toUpperCase(), empresa: 'Royal Negócios Imobiliários',
        EMPRESA: 'ROYAL NEGÓCIOS IMOBILIÁRIOS', cidade: cfg.cidade, endereco: cfg.endereco, fatos: cfg.fatos, estilo: cfg.estilo || '(sem exemplos cadastrados: siga o tom da seção 2)',
        imoveis: '8685 | Casa | Jardim Karaíba | R$ 890.000 | 3 qto, 1 suíte, 2 vaga, 180 m²\n9001 | Casa | Santa Mônica | R$ 650.000 | 3 qto, 1 suíte, 2 vaga, 150 m²',
      } as Record<string, string>)[k] ?? '');
      return resposta({
        padrao, atual: cfg.prompt_base || '', previa, provedores: ['groq', 'gemini'],
        modelos: MODELOS_DEMO.padrao, listas: MODELOS_DEMO.listas,
        variaveis: ['agora', 'amanha', 'saudacao', 'aviso_fim_de_semana', 'assistente', 'corretor', 'CORRETOR', 'empresa', 'EMPRESA', 'cidade', 'endereco', 'fatos', 'estilo', 'imoveis']
          .map((nome) => ({ nome, descricao: 'Preenchido na hora pelo sistema' })),
      });
    }
    if (b.acao === 'chat') {
      const ultima = semAcento(b.mensagens?.at(-1)?.texto ?? '');
      // extrai o que der da mensagem, como a IA faria com o [PERFIL]
      const perfil: Record<string, unknown> = {};
      const mMil = ultima.match(/(\d{2,4})\s*(mil|k)\b/); if (mMil) perfil['teto'] = Number(mMil[1]) * 1000;
      const mQ = ultima.match(/(\d)\s*(quarto|qto)/); if (mQ) perfil['quartos'] = Number(mQ[1]);
      const mI = ultima.match(/tenho\s+(\d{2})\s*anos/); if (mI) perfil['idade'] = Number(mI[1]);
      if (/\bcasa/.test(ultima)) perfil['tipo'] = 'Casa'; else if (/apartamento|apto/.test(ultima)) perfil['tipo'] = 'Apartamento';
      if (/financi/.test(ultima)) perfil['pagamento'] = 'financiamento'; else if (/a vista|à vista/.test(ultima)) perfil['pagamento'] = 'à vista';
      if (/alug/.test(ultima)) perfil['finalidade'] = 'alugar'; else if (/compr/.test(ultima)) perfil['finalidade'] = 'comprar';
      const bairro = ['santa monica', 'jardim karaiba', 'canaa', 'tabajaras', 'centro', 'umuarama'].find((x) => ultima.includes(x));
      if (bairro) perfil['regiao'] = bairro.replace(/\b\w/g, (c) => c.toUpperCase());
      const mN = ultima.match(/(?:meu nome e|me chamo|sou o|sou a)\s+([a-z]+)/); if (mN) perfil['nome'] = mN[1][0].toUpperCase() + mN[1].slice(1);
      const marc = { perfil, duvidas: [] as string[], agendamento: null as null | Record<string, string>, imoveis: [] as Record<string, unknown>[] };
      if (/oi|ola|bom dia|boa tarde|boa noite/.test(ultima) && (b.mensagens?.length ?? 0) <= 1)
        return resposta({ texto: 'Boa tarde! Aqui é a Camila, da Royal Negócios Imobiliários. Me conta, o que você tá procurando?', acoes: [], marcadores: marc, provedor: b.provedor || 'groq', modelo: b.modelo || '', ms: 700 });
      if (/fgts|pet|permuta/.test(ultima))
        return resposta({ texto: 'Essa eu confirmo com o Ricardo pra não te passar errado, já te aviso.', acoes: ['Deixaria a pergunta para você: "Cliente quer saber sobre ' + ultima.slice(0, 40) + '"'],
          marcadores: { ...marc, duvidas: ['Cliente quer saber sobre ' + ultima.slice(0, 40)] }, provedor: b.provedor || 'groq', ms: 700 });
      const opcoes = db.imoveis.filter((i) => i.status === 'disponivel').slice(0, 3);
      return resposta({
        texto: 'Boa! Separei três que encaixam, dá uma olhada.',
        acoes: ['Mandaria fotos e links de até 3 opções da carteira', 'Opções escolhidas: ' + opcoes.map((i) => i.codigo).join(', '), 'Anotaria no lead: ' + (Object.keys(perfil).length ? JSON.stringify(perfil) : 'nada novo')],
        marcadores: { ...marc, imoveis: opcoes.map((i) => ({ codigo: i.codigo, tipo: i.tipo, bairro: i.bairro, preco: i.preco, origem: 'opcoes' })) },
        provedor: b.provedor || 'groq', ms: 700,
      });
    }
    if (b.acao === 'sugestao') {
      const l = db.leads.find((x) => x.id === b.lead_id);
      return resposta({ texto: `Oi ${String(l?.nome ?? '').split(' ')[0]}, tudo bem? Aqui é o Ricardo, da Royal. Vi que você procura ${l?.interesse || 'um imóvel'}.\nSeparei umas opções que encaixam. Prefere ver por aqui ou passar no escritório amanhã?` });
    }
    if (b.acao === 'retomada') return resposta({ dias: 3, texto: 'Oi, tudo bem? Consegui separar mais duas opções no bairro que você pediu. Amanhã às 18:30 fica bom pra ver com calma?' });
    if (b.acao === 'site') return resposta({ site: { nome: 'Prime Imóveis', titulo: 'Seu próximo endereço em Uberlândia', subtitulo: 'Apartamentos e casas até 600 mil, com atendimento de família.', sobre: '12 anos ajudando famílias de Uberlândia a encontrar o imóvel certo.', cor: '#1E4E8C', fundo: 'claro', fonte: 'moderna', filtro: { tipos: ['Casa', 'Apartamento'], cidade: 'Uberlândia', precoMax: 600000 } } });
  }
  if (nome === 'usuarios') {
    if (b.acao === 'criar') {
      if (db.perfis.some((p) => p.email === b.email)) return resposta({ erro: 'Esse e-mail já tem conta no sistema.' }, 400);
      db.perfis.push({ id: uuid(), empresa_id: eu.empresa_id, nome: b.nome, email: b.email, telefone: '', papel: b.papel, equipe_id: null, ativo: true, dono: false, ultimo_acesso: null });
    }
    if (b.acao === 'remover') db.perfis = db.perfis.filter((p) => p.id !== b.id);
    if (b.acao === 'nova_empresa') db.empresas.push({ id: uuid(), nome: b.empresa, slug: semAcento(b.empresa).replace(/[^a-z0-9]+/g, '-'), ativa: true, criado_em: agora() });
    return resposta({ ok: true });
  }
  if (nome === 'whatsapp' && b.acao === 'enviar') {
    const c = db.conversas.find((x) => x.id === b.conversa_id);
    db.mensagens.push({ id: db.mensagens.length + 1, empresa_id: eu.empresa_id, conversa_id: b.conversa_id, de: 'voce', texto: b.texto, autor_id: eu.id, criado_em: agora() });
    if (c) Object.assign(c, { ultima: b.texto, atualizado_em: agora(), pausado_ate: new Date(Date.now() + 6 * 36e5).toISOString() });
    return resposta({ ok: true });
  }
  return resposta({ erro: 'Não disponível na demonstração.' }, 400);
}

// ------------------------------------------------------------------ roteador
const fetchDemo: typeof fetch = async (entrada, init) => {
  const req = entrada instanceof Request ? entrada : null;
  const url = new URL(req ? req.url : String(entrada));
  const metodo = (init?.method ?? req?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? req?.headers);
  const texto = typeof init?.body === 'string' ? init.body : req ? await req.clone().text() : '';
  const corpo = texto ? (() => { try { return JSON.parse(texto); } catch { return texto; } })() : {};
  const caminho = url.pathname;

  if (caminho.startsWith('/auth/v1/')) {
    if (caminho.endsWith('/token')) return resposta(sessao());
    if (caminho.endsWith('/user')) return resposta(usuario);
    if (caminho.endsWith('/logout')) return resposta(null, 204);
    return resposta({});
  }
  if (caminho.startsWith('/rest/v1/rpc/')) return rpc(caminho.split('/').pop()!, corpo);
  if (caminho.startsWith('/rest/v1/')) return rest(caminho.split('/').pop()!, metodo, url, headers, corpo);
  if (caminho.startsWith('/functions/v1/')) return funcao(caminho.split('/').pop()!, corpo);
  if (caminho.startsWith('/storage/v1/')) return erro(400, 'demo', 'Envio de fotos não funciona na demonstração. Cole o endereço de uma imagem.');
  return erro(404, 'demo', 'Endereço desconhecido na demonstração');
};

/** O tempo real não existe na demonstração: um WebSocket que nunca conecta (e não reclama). */
class WebSocketMudo {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0; binaryType = 'arraybuffer';
  onopen: unknown = null; onclose: unknown = null; onerror: unknown = null; onmessage: unknown = null;
  constructor(public url: string) {}
  send() { /* nada */ }
  close() { this.readyState = 3; }
}

export const DEMO: ModoDemo = { url: URL_DEMO, chave: 'demo-' + 'x'.repeat(60), fetch: fetchDemo, WebSocket: WebSocketMudo };
