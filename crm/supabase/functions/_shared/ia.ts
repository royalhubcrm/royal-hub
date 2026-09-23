// A assistente: monta o prompt com a carteira, chama a IA e lê os "marcadores"
// (códigos que a IA escreve para pedir coisas ao sistema — o cliente nunca vê).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { telefoneChave } from './comum.ts';

export interface Msg { role: 'user' | 'assistant'; content: string }

// ---------------------------------------------------------------- chamar a IA
export type Provedor = 'groq' | 'anthropic' | 'gemini';
export const PROVEDORES: Provedor[] = ['groq', 'anthropic', 'gemini'];
const NOME: Record<Provedor, string> = { groq: 'Groq', anthropic: 'Claude', gemini: 'Gemini' };
const CHAVE: Record<Provedor, string> = { groq: 'GROQ_API_KEY', anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };
const VAR_MODELO: Record<Provedor, string> = { groq: 'GROQ_MODEL', anthropic: 'ANTHROPIC_MODEL', gemini: 'GEMINI_MODEL' };
const MODELO_PADRAO: Record<Provedor, string> = { groq: 'openai/gpt-oss-120b', anthropic: 'claude-sonnet-5', gemini: 'gemini-3.6-flash' };

export interface OpcoesIA {
  /** Provedor preferido (vem da tela Conversas → Assistente). */
  provedor?: Provedor;
  /** Modelo do provedor preferido; vazio = padrão. */
  modelo?: string;
  /** true = só esse provedor, sem cair para os outros (o simulador usa para comparar). */
  estrito?: boolean;
}

/** Os provedores com chave configurada, na ordem padrão. */
export const provedoresDisponiveis = (): Provedor[] => PROVEDORES.filter((p) => !!Deno.env.get(CHAVE[p]));
export const modeloDe = (p: Provedor, escolhido?: string) => escolhido || Deno.env.get(VAR_MODELO[p]) || MODELO_PADRAO[p];

/** O que a config da empresa pede (ia_provedor/ia_modelo) no formato das opções. */
export function preferenciaIA(c: Record<string, any>): OpcoesIA {
  const p = c?.ia_provedor;
  return PROVEDORES.includes(p) ? { provedor: p, modelo: String(c.ia_modelo || '') || undefined } : {};
}

export async function pedirIA(sistema: string, mensagens: Msg[], maxTokens = 600, o: OpcoesIA = {}): Promise<string> {
  return (await pedirIADetalhado(sistema, mensagens, maxTokens, o)).texto;
}

/**
 * Tenta o provedor preferido e, se ele falhar, os outros que tiverem chave
 * (ordem padrão: Groq, gratuito → Claude → Gemini). Diz quem respondeu.
 */
export async function pedirIADetalhado(sistema: string, mensagens: Msg[], maxTokens = 600, o: OpcoesIA = {}): Promise<{ texto: string; provedor: Provedor; modelo: string }> {
  const ordem: Provedor[] = o.provedor ? (o.estrito ? [o.provedor] : [o.provedor, ...PROVEDORES.filter((p) => p !== o.provedor)]) : PROVEDORES;
  const erros: string[] = [];
  for (const p of ordem) {
    const chave = Deno.env.get(CHAVE[p]);
    if (!chave) { if (o.provedor === p) erros.push(`${NOME[p]}: falta a chave ${CHAVE[p]}.`); continue; }
    const modelo = modeloDe(p, o.provedor === p ? o.modelo : undefined);
    try {
      const texto = await CHAMAR[p](chave, modelo, sistema, mensagens, maxTokens);
      if (texto.trim()) return { texto, provedor: p, modelo };
      erros.push(`${NOME[p]} (${modelo}): resposta vazia`);
    } catch (e) { erros.push(`${NOME[p]} (${modelo}): ${(e as Error).message}`); }
  }
  throw new Error(erros.length ? erros.join(' | ') : 'Nenhuma chave de IA configurada (GROQ_API_KEY ou GEMINI_API_KEY).');
}

type Chamada = (chave: string, modelo: string, sistema: string, mensagens: Msg[], maxTokens: number) => Promise<string>;

const CHAMAR: Record<Provedor, Chamada> = {
  async groq(chave, modelo, sistema, mensagens, maxTokens) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelo, max_tokens: maxTokens, temperature: 0.6,
        // modelos que "pensam" (gpt-oss, qwen) gastariam os tokens todos raciocinando
        ...(/gpt-oss|qwen|deepseek/.test(modelo) ? { reasoning_effort: 'low' } : {}),
        messages: [{ role: 'system', content: sistema }, ...mensagens],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(r.status + ' ' + (j.error?.message ?? ''));
    return String(j.choices?.[0]?.message?.content ?? '');
  },
  async anthropic(chave, modelo, sistema, mensagens, maxTokens) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system: sistema, messages: juntarSeguidas(mensagens) }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(r.status + ' ' + (j.error?.message ?? ''));
    return (j.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
  },
  async gemini(chave, modelo, sistema, mensagens, maxTokens) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: juntarSeguidas(mensagens).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        // o Gemini 2.5+ "pensa" antes de responder; sem desligar, o pensamento come o maxOutputTokens
        generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(r.status + ' ' + (j.error?.message ?? ''));
    const texto = (j.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('');
    if (!texto) throw new Error('resposta vazia (' + (j.candidates?.[0]?.finishReason ?? j.promptFeedback?.blockReason ?? '?') + ')');
    return texto;
  },
};

export const iaConfigurada = () => provedoresDisponiveis().length > 0;

/** Anthropic e Gemini exigem papéis alternados: junta mensagens seguidas do mesmo lado. */
function juntarSeguidas(msgs: Msg[]): Msg[] {
  const saida: Msg[] = [];
  for (const m of msgs) {
    const ult = saida.at(-1);
    if (ult && ult.role === m.role) ult.content += '\n' + m.content;
    else saida.push({ ...m });
  }
  if (saida[0]?.role === 'assistant') saida.unshift({ role: 'user', content: '(início da conversa)' });
  return saida;
}

// ---------------------------------------------------------------- carteira
export interface ImovelIA {
  id: string; codigo: string; tipo: string; bairro: string; cidade: string; preco: number;
  quartos: number; suites: number; vagas: number; area: number; descricao: string; fotos: string[];
}

const semAcento = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Só os imóveis que têm a ver com o que o cliente falou (mandar a carteira inteira é caro e confunde). */
export function imoveisQueServem(todos: ImovelIA[], procura: string, quantos = 12): ImovelIA[] {
  if (!todos.length) return [];
  const texto = semAcento(procura);
  if (!texto) return todos.slice(0, quantos);

  const codigos = new Set(todos.map((m) => semAcento(m.codigo)).filter((c) => new RegExp(`\\b${c}\\b`).test(texto)));
  const citados = todos.filter((m) => codigos.has(semAcento(m.codigo)));

  let teto = 0;
  const mMil = texto.match(/(\d{2,4})\s*(mil|k)\b/);
  const mReal = texto.match(/r?\$?\s*([\d.]{6,})/);
  if (mMil) teto = Number(mMil[1]) * 1000;
  else if (mReal) teto = Number(mReal[1].replace(/\./g, ''));
  const mQ = texto.match(/(\d)\s*(quarto|qto|dorm)/);
  const quartos = mQ ? Number(mQ[1]) : 0;
  const tipo = /\bcasa/.test(texto) ? 'casa' : /apartamento|apto|\bap\b/.test(texto) ? 'apartamento'
    : /lote|terreno/.test(texto) ? 'terreno' : /chacara/.test(texto) ? 'chacara' : '';
  const bairros = [...new Set(todos.map((m) => m.bairro).filter(Boolean))].filter((b) => texto.includes(semAcento(b)));

  const combina = (m: ImovelIA) =>
    (!teto || (m.preco && m.preco <= teto * 1.1)) &&
    (!quartos || (m.quartos || 0) >= quartos) &&
    (!tipo || semAcento(m.tipo).includes(tipo)) &&
    (!bairros.length || bairros.includes(m.bairro));

  const achados = todos.filter((m) => combina(m) && !codigos.has(semAcento(m.codigo)));
  const escolhidos = [...citados, ...achados];
  return (escolhidos.length ? escolhidos : todos).slice(0, quantos);
}

export async function carteira(db: SupabaseClient<any, 'crm'>, empresaId: string): Promise<ImovelIA[]> {
  const { data } = await db.from('imoveis')
    .select('id, codigo, tipo, bairro, cidade, preco, quartos, suites, vagas, area, descricao, fotos')
    .eq('empresa_id', empresaId).eq('status', 'disponivel').order('atualizado_em', { ascending: false }).limit(1500);
  return (data ?? []) as ImovelIA[];
}

// ---------------------------------------------------------------- prompt
const emSP = (o: Intl.DateTimeFormatOptions) => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', ...o });

function saudacao() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/** As variáveis que o texto do prompt aceita (a tela lista estas para o administrador). */
export const VARIAVEIS_PROMPT = [
  { nome: 'agora', descricao: 'Data e hora reais em São Paulo, com o dia da semana' },
  { nome: 'amanha', descricao: 'A data de amanhã por extenso' },
  { nome: 'saudacao', descricao: '"Bom dia", "Boa tarde" ou "Boa noite", conforme a hora' },
  { nome: 'aviso_fim_de_semana', descricao: 'Aviso de escritório fechado (só aparece sábado e domingo)' },
  { nome: 'assistente', descricao: 'Nome da assistente (Ajustes → Assistente)' },
  { nome: 'corretor', descricao: 'Corretor responsável (Ajustes → Imobiliária)' },
  { nome: 'CORRETOR', descricao: 'O mesmo, em maiúsculas' },
  { nome: 'empresa', descricao: 'Nome da imobiliária' },
  { nome: 'EMPRESA', descricao: 'O mesmo, em maiúsculas' },
  { nome: 'cidade', descricao: 'Cidade padrão' },
  { nome: 'endereco', descricao: 'Endereço do escritório' },
  { nome: 'fatos', descricao: 'O campo "O que ela pode afirmar com segurança"' },
  { nome: 'estilo', descricao: 'O campo "Como ela deve falar"' },
  { nome: 'imoveis', descricao: 'A carteira filtrada para o que o cliente pediu (uma linha por imóvel)' },
];

/** O texto padrão. A empresa pode trocar em Conversas → Assistente; vazio lá = este. */
export const PROMPT_PADRAO = `[AGORA — data e hora reais do sistema; nunca calcule nem presuma]
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
Só afirme o que está escrito aqui. Pergunta que não está aqui (condomínio de um imóvel, FGTS, permuta, pet, documentação, desconto…): acolha, diga que confirma com o {{corretor}} e emita (o cliente nunca vê) [DUVIDA]{"pergunta":"<resumo curto>"}. Ex — "aceita permuta?" → "Essa eu confirmo com o {{corretor}} pra não te passar errado, já te aviso." [DUVIDA]{"pergunta":"Aceita permuta no cód. 8685?"}

═══ FOTOS E OPÇÕES ═══
- [ENVIAR_OPCOES]: quando já souber a REGIÃO ou a FAIXA DE PREÇO e for mostrar opções — o sistema manda foto + link de até três imóveis que encaixam. Junto, UMA frase leve ("Separei três que encaixam, dá uma olhada"). Uma vez por conversa, a não ser que ele mude o que procura.
- [ENVIAR_FOTO_IMOVEL_CODIGO] quando ele pedir a foto de UM imóvel (ex.: [ENVIAR_FOTO_IMOVEL_8685]).
- Nunca descreva em palavras que enviou algo ("aqui está a foto"). Se ele disser "não recebi": olhe o histórico — se a sua última mensagem já foi a linha "tipo no bairro — cód. X" do MESMO imóvel, NÃO reenvie; diga "Mandei agora há pouco, dá uma olhadinha aí em cima 😊 Se não aparecer me avisa". Só reenvie se ele insistir.

═══ MEMÓRIA DO CLIENTE ═══
Ao descobrir um dado durável (nome, região, teto, quartos, tipo, preferência), acrescente no FINAL da resposta, em linha própria: [PERFIL]{"nome":"...","regiao":"...","teto":250000,"quartos":2,"tipo":"Casa","preferencias":"..."} — só os campos descobertos; em preferencias, junte o que já sabia com o novo.

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

/** Troca {{variavel}} pelo valor; variável desconhecida vira vazio. */
export function renderizarPrompt(modelo: string, vars: Record<string, string>): string {
  return modelo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? vars[k.toLowerCase()] ?? '');
}

/** O "manual" da assistente, montado a cada mensagem com a data real e a carteira filtrada. */
export function instrucoes(c: Record<string, any>, empresa: string, lista: ImovelIA[]): string {
  const corretor = c.corretor || 'o corretor';
  const cidade = c.cidade || 'Uberlândia';
  const ficha = (m: ImovelIA) =>
    `${m.codigo} | ${m.tipo} | ${m.bairro}${m.cidade ? ', ' + m.cidade : ''} | ` +
    `${m.preco ? 'R$ ' + Number(m.preco).toLocaleString('pt-BR') : 'sob consulta'} | ` +
    `${m.quartos} qto, ${m.suites} suíte, ${m.vagas} vaga, ${m.area} m²` +
    `${m.descricao ? ' | ' + m.descricao.slice(0, 120) : ''}`;
  const semana = emSP({ weekday: 'short' }).toLowerCase();
  const fimDeSemana = semana.startsWith('sáb') || semana.startsWith('sab') || semana.startsWith('dom');

  const vars: Record<string, string> = {
    agora: `${emSP({ weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}, ${emSP({ hour: '2-digit', minute: '2-digit' })}`,
    amanha: new Date(Date.now() + 864e5).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' }),
    saudacao: saudacao(),
    aviso_fim_de_semana: fimDeSemana ? '\nHoje é fim de semana: o escritório está fechado; não marque atendimento para hoje.' : '',
    assistente: c.assistente || 'Camila',
    corretor, CORRETOR: String(corretor).toUpperCase(),
    empresa, EMPRESA: empresa.toUpperCase(),
    cidade,
    endereco: c.endereco || 'o escritório',
    fatos: c.fatos || '(nenhum fato cadastrado)',
    estilo: c.estilo || '(sem exemplos cadastrados: siga o tom da seção 2)',
    imoveis: lista.map(ficha).join('\n') || '(carteira vazia)',
  };
  const modelo = String(c.prompt_base || '').trim() || PROMPT_PADRAO;
  return renderizarPrompt(modelo, vars);
}

// ---------------------------------------------------------------- marcadores
export interface Marcadores {
  texto: string;
  fotos: string[];
  opcoes: boolean;
  agendamento: { nome?: string; data?: string; hora?: string; codigo?: string } | null;
  perfis: Record<string, unknown>[];
  duvidas: { pergunta?: string }[];
}

export function lerMarcadores(bruto: string): Marcadores {
  let texto = String(bruto ?? '');
  const fotos: string[] = [];
  const perfis: Record<string, unknown>[] = [];
  const duvidas: { pergunta?: string }[] = [];
  let agendamento: Marcadores['agendamento'] = null;
  let opcoes = false;

  texto = texto.replace(/\[ENVIAR_FOTO_IMOVEL[_\s-]*([\w-]{2,12})\]/gi, (_, cod) => { if (!fotos.includes(cod)) fotos.push(cod); return ''; });
  texto = texto.replace(/\[ENVIAR_(OPCOES|PDF)\](\s*\{[\s\S]*?\})?/gi, () => { opcoes = true; return ''; });

  const comJson = (nome: string, aoAchar: (o: any) => void) => {
    texto = texto.replace(new RegExp('\\[' + nome + '\\]\\s*(\\{[\\s\\S]*?\\})', 'gi'), (_, j) => {
      try { aoAchar(JSON.parse(j)); } catch { /* json torto: ignora */ }
      return '';
    });
    texto = texto.replace(new RegExp('\\[' + nome + '\\]', 'gi'), '');
  };
  comJson('AGENDAMENTO_CONFIRMADO', (o) => { agendamento = o; });
  comJson('PERFIL', (o) => perfis.push(o));
  comJson('DUVIDA(?:_[A-Z]+)?', (o) => duvidas.push(o));

  texto = texto.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  return { texto, fotos, opcoes, agendamento, perfis, duvidas };
}

/** Descreve em português o que a assistente pediu (usado no simulador, que não grava nada). */
export function descreverMarcadores(m: Marcadores): string[] {
  const a: string[] = [];
  if (m.opcoes) a.push('Mandaria fotos e links de até 3 opções da carteira');
  for (const f of m.fotos) a.push(`Mandaria a foto do imóvel ${f}`);
  if (m.agendamento) a.push(`Marcaria visita: ${m.agendamento.data ?? '?'} ${m.agendamento.hora ?? ''} (${m.agendamento.nome ?? 'cliente'})`);
  for (const d of m.duvidas) a.push(`Deixaria a pergunta para você: "${d.pergunta ?? ''}"`);
  for (const p of m.perfis) a.push('Anotaria no lead: ' + resumoPerfil(p));
  return a;
}

export function resumoPerfil(p: Record<string, any>): string {
  const partes: string[] = [];
  if (p.regiao) partes.push('região: ' + p.regiao);
  if (p.teto) partes.push('até R$ ' + Number(p.teto).toLocaleString('pt-BR'));
  if (p.quartos) partes.push(p.quartos + ' quartos');
  if (p.tipo) partes.push(p.tipo);
  if (p.aprovacao) partes.push('aprovação: ' + p.aprovacao);
  if (p.preferencias) partes.push(p.preferencias);
  return partes.join(' · ');
}

/** Grava no banco o que a assistente pediu (conversa de verdade do WhatsApp). */
export async function aplicarMarcadores(
  db: SupabaseClient<any, 'crm'>, m: Marcadores,
  ctx: { empresaId: string; conversaId: string; leadId: string | null; nome: string; telefone: string; endereco: string },
) {
  const { empresaId, conversaId, leadId } = ctx;

  for (const p of m.perfis) {
    if (!leadId) continue;
    const resumo = resumoPerfil(p);
    const campos: Record<string, unknown> = {};
    if (p.nome) campos.nome = String(p.nome).slice(0, 120);
    if (resumo) campos.interesse = resumo.slice(0, 500);
    if (Object.keys(campos).length) await db.from('leads').update(campos).eq('id', leadId);
    if (resumo) await db.from('historico').insert({ empresa_id: empresaId, lead_id: leadId, texto: 'A assistente anotou: ' + resumo, autor_id: null });
  }

  const a = m.agendamento;
  if (a?.data) {
    const { data: igual } = await db.from('agendamentos').select('id')
      .eq('conversa_id', conversaId).eq('data', a.data).neq('status', 'cancelado').limit(1);
    if (!igual?.length) {
      await db.from('agendamentos').insert({
        empresa_id: empresaId, conversa_id: conversaId, lead_id: leadId,
        nome: a.nome || ctx.nome, telefone: ctx.telefone, data: a.data, hora: a.hora || null,
        local: ctx.endereco, imovel: a.codigo ?? '', marcado_por: 'assistente',
        como: 'A assistente fechou na conversa' + (a.codigo ? ` (imóvel ${a.codigo})` : ''),
      });
      if (leadId) {
        await db.from('leads').update({ status: 'visita' }).eq('id', leadId).in('status', ['novo', 'contato']);
        await db.from('historico').insert({ empresa_id: empresaId, lead_id: leadId, texto: `Visita marcada pela assistente: ${a.data} ${a.hora ?? ''}`, autor_id: null });
      }
      if (a.codigo) await db.from('interesses').insert({ empresa_id: empresaId, conversa_id: conversaId, lead_id: leadId, codigo: String(a.codigo), origem: 'agendamento' });
    }
  }

  for (const d of m.duvidas)
    if (d.pergunta) await db.from('duvidas').insert({ empresa_id: empresaId, conversa_id: conversaId, lead_id: leadId, nome: ctx.nome, pergunta: String(d.pergunta).slice(0, 500) });

  for (const cod of m.fotos)
    await db.from('interesses').insert({ empresa_id: empresaId, conversa_id: conversaId, lead_id: leadId, codigo: cod, origem: 'foto' });
}

/** Acha o lead daquele telefone (mesma chave do banco). */
export async function leadDoTelefone(db: SupabaseClient<any, 'crm'>, empresaId: string, telefone: string) {
  const chave = telefoneChave(telefone);
  const { data } = await db.from('leads').select('id, nome, telefone').eq('empresa_id', empresaId)
    .like('telefone', '%' + telefone.slice(-8)).limit(5);
  return (data ?? []).find((l: { telefone: string }) => telefoneChave(l.telefone) === chave) ?? null;
}
