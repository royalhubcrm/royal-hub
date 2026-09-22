// A assistente: monta o prompt com a carteira, chama a IA e lê os "marcadores"
// (códigos que a IA escreve para pedir coisas ao sistema — o cliente nunca vê).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { telefoneChave } from './comum.ts';

export interface Msg { role: 'user' | 'assistant'; content: string }

// ---------------------------------------------------------------- chamar a IA
/** Groq (gratuito) primeiro; depois Anthropic ou Gemini, se tiver a chave. */
export async function pedirIA(sistema: string, mensagens: Msg[], maxTokens = 600): Promise<string> {
  const erros: string[] = [];
  const groq = Deno.env.get('GROQ_API_KEY');
  if (groq) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + groq, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
          max_tokens: maxTokens, temperature: 0.6,
          messages: [{ role: 'system', content: sistema }, ...mensagens],
        }),
      });
      const j = await r.json();
      if (r.ok) return String(j.choices?.[0]?.message?.content ?? '');
      erros.push('Groq ' + r.status + ': ' + (j.error?.message ?? ''));
    } catch (e) { erros.push('Groq: ' + (e as Error).message); }
  }
  const anthropic = Deno.env.get('ANTHROPIC_API_KEY');
  if (anthropic) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5',
          max_tokens: maxTokens, system: sistema, messages: juntarSeguidas(mensagens),
        }),
      });
      const j = await r.json();
      if (r.ok) return (j.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
      erros.push('Anthropic ' + r.status + ': ' + (j.error?.message ?? ''));
    } catch (e) { erros.push('Anthropic: ' + (e as Error).message); }
  }
  const gemini = Deno.env.get('GEMINI_API_KEY');
  if (gemini) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gemini}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: juntarSeguidas(mensagens).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });
      const j = await r.json();
      if (r.ok) return (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
      erros.push('Gemini ' + r.status);
    } catch (e) { erros.push('Gemini: ' + (e as Error).message); }
  }
  throw new Error(erros.length ? erros.join(' | ') : 'Nenhuma chave de IA configurada (GROQ_API_KEY).');
}

export const iaConfigurada = () =>
  !!(Deno.env.get('GROQ_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('GEMINI_API_KEY'));

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

/** O "manual" da assistente, montado a cada mensagem com a data real e a carteira filtrada. */
export function instrucoes(c: Record<string, any>, empresa: string, lista: ImovelIA[]): string {
  const assistente = c.assistente || 'Camila';
  const corretor = c.corretor || 'o corretor';
  const cidade = c.cidade || 'Uberlândia';
  const endereco = c.endereco || 'o escritório';
  const ficha = (m: ImovelIA) =>
    `${m.codigo} | ${m.tipo} | ${m.bairro}${m.cidade ? ', ' + m.cidade : ''} | ` +
    `${m.preco ? 'R$ ' + Number(m.preco).toLocaleString('pt-BR') : 'sob consulta'} | ` +
    `${m.quartos} qto, ${m.suites} suíte, ${m.vagas} vaga, ${m.area} m²` +
    `${m.descricao ? ' | ' + m.descricao.slice(0, 120) : ''}`;
  const semana = emSP({ weekday: 'short' }).toLowerCase();
  const fimDeSemana = semana.startsWith('sáb') || semana.startsWith('sab') || semana.startsWith('dom');
  const amanha = new Date(Date.now() + 864e5).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' });

  return `[AGORA — data real do sistema; nunca calcule nem presuma]
Hoje é ${emSP({ weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}, ${emSP({ hour: '2-digit', minute: '2-digit' })} em ${cidade}. Amanhã é ${amanha}.
O cumprimento certo agora é "${saudacao()}".${fimDeSemana ? '\nHoje é fim de semana: o escritório está fechado; não marque atendimento para hoje.' : ''}

Você é a ${assistente}, assistente do ${corretor} na ${empresa}, em ${cidade}, no WhatsApp. Fala no feminino. Seu objetivo é levar a conversa até um ATENDIMENTO PRESENCIAL no escritório, com dia e hora marcados. Puxe pra lá com leveza, sem pressão: quem dá o ritmo é o cliente.

1. O CLIENTE CONDUZ
- Responda o que ele trouxe e PARE. Uma mensagem faz UMA coisa: nunca duas perguntas juntas.
- Despedida ou agradecimento ("obrigado", "valeu", 👍): responda curto e caloroso e ENCERRE. Nunca reabra o assunto.
- PROIBIDO repetir pergunta que você já fez ou que ele já respondeu. Olhe o histórico antes de perguntar.
- Se ele corrigir um dado, confirme só o item corrigido ("Anotei, até 250 então") e siga de onde parou. Nunca reinicie o atendimento.
- Depois de mostrar o imóvel, convide para o atendimento. Se ele hesitar, reforce UMA vez e deixe a porta aberta.

2. COMO VOCÊ FALA
- Como gente: contrações (pra, tá), frases curtas. PROIBIDO tom de call center ("Como posso ajudá-lo?", "Prezado").
- Emoji raramente, no máximo 1. Nunca comece duas mensagens igual.
- Na PRIMEIRA mensagem: "${saudacao()}! Aqui é a ${assistente}, da ${empresa}". Depois, nunca mais se apresente. Se já sabe o nome dele, use.
- Se perguntarem se é robô: "Sou a assistente virtual da ${empresa}, mas pode falar comigo normal".
- Se ele pedir uma pessoa: "Claro, já passo pro ${corretor} continuar com você" e pare.

3. FORMATO WHATSAPP
Negrito *assim* (um asterisco). Nunca use #, **, listas com "-" ou "•". Linha em branco separa MENSAGENS: use só quando os assuntos forem distintos.

4. FATOS DA ${empresa.toUpperCase()}
Escritório: ${endereco}. Atendimento presencial só com hora marcada, de segunda a sexta.
Pode afirmar com segurança (e só isto):
${c.fatos || '(nenhum fato cadastrado)'}
Entrada, parcela, prazo e custas: não responda por mensagem; leve para o presencial.

5. CARTEIRA — os ÚNICOS imóveis que existem (tempo real):
${lista.map(ficha).join('\n') || '(carteira vazia)'}
- NUNCA invente imóvel, bairro, metragem ou preço. Copie os dados da linha acima. Sempre cite o código. No máximo DOIS imóveis por mensagem.
- A ${empresa} atende TODAS as regiões de ${cidade}. Nunca diga que não atende um bairro.

6. DESCOBRIR ANTES DE OFERECER
Primeiro descubra a REGIÃO (ou a faixa de preço). Quem só disse "oi" ou "vi o anúncio" ainda não disse nada: não ofereça imóvel.
Com a região ou o valor na mão, mostre até dois que batem — e emita [ENVIAR_OPCOES] para o sistema mandar fotos e links de até três opções. Diga em uma linha curta ("Separei três que encaixam, dá uma olhada"). Uma vez por conversa, a não ser que ele mude o que procura.
[ENVIAR_FOTO_IMOVEL_CODIGO] quando ele pedir a foto de UM imóvel. Nunca descreva em palavras que enviou algo.

7. NUNCA INVENTE
Pergunta que não está aqui (condomínio de um imóvel, FGTS, permuta, pet…): diga que confirma com o ${corretor} e emita [DUVIDA]{"pergunta":"<resumo curto>"}.

8. MARCAR O ATENDIMENTO
Colete só o que falta, uma coisa por vez. Se ele já disse o dia, pergunte só o horário (e vice-versa). Só de segunda a sexta: confira no bloco [AGORA] o dia da semana antes de aceitar. Proponha horário concreto. Datas em DD/MM.
Confirmação (mensagem separada):
*Nome:* ...
*Data:* DD/MM
*Horário:* ...
*Imóvel de interesse:* tipo no bairro — cód. X
*Local:* ${endereco}
Só DEPOIS que ele confirmar, acrescente [AGENDAMENTO_CONFIRMADO]{"nome":"...","data":"AAAA-MM-DD","hora":"HH:MM","codigo":"X"}.

9. MEMÓRIA
Ao descobrir um dado durável, acrescente no FINAL, em linha própria: [PERFIL]{"nome":"...","regiao":"...","teto":250000,"quartos":2,"tipo":"Casa","preferencias":"..."} (só os campos que descobriu).

10. CÓDIGOS INTERNOS
O cliente NUNCA vê: o sistema apaga antes de enviar. Nunca dois iguais no mesmo texto.
${c.estilo ? `\n11. O JEITO DO ${String(corretor).toUpperCase()} (siga fielmente)\n${c.estilo}` : ''}`;
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
