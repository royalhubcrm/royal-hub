// Os books dos lançamentos (tabela crm.empreendimentos): o que a assistente sabe
// sobre os prédios que a imobiliária vende, além da carteira de imóveis prontos.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface Empreendimento {
  nome: string; construtora: string; bairro: string; endereco: string; situacao: string;
  tipologias: string; lazer: string; localizacao: string; diferenciais: string; observacoes: string;
}

/** As fichas cadastradas pela empresa (Empreendimentos). Lista curta: vai inteira no prompt. */
export async function empreendimentos(db: SupabaseClient<any, 'crm'>, empresaId: string): Promise<Empreendimento[]> {
  const { data } = await db.from('empreendimentos')
    .select('nome, construtora, bairro, endereco, situacao, tipologias, lazer, localizacao, diferenciais, observacoes')
    .eq('empresa_id', empresaId).order('nome').limit(60);
  return (data ?? []) as Empreendimento[];
}

const linha = (rotulo: string, valor: string) => (String(valor || '').trim() ? `  ${rotulo}: ${String(valor).trim()}\n` : '');

/** Uma ficha por lançamento, do jeito que a IA lê melhor. */
export function fichaEmpreendimento(e: Empreendimento): string {
  return `• ${e.nome}${e.construtora ? ` (${e.construtora})` : ''}\n` +
    linha('Bairro', e.bairro) + linha('Endereço', e.endereco) + linha('Situação', e.situacao) +
    linha('Plantas', e.tipologias) + linha('Lazer', e.lazer) + linha('Em volta', e.localizacao) +
    linha('Diferenciais', e.diferenciais) + linha('Observações', e.observacoes);
}

/**
 * O pedaço do manual que fala dos lançamentos. Vazio quando não há ficha cadastrada,
 * para o prompt continuar exatamente como era.
 */
export function blocoLancamentos(fichas: Empreendimento[], empresa = 'a imobiliária', procura = ''): string {
  if (!fichas.length) return '';
  const alvo = String(procura || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const citados = alvo
    ? fichas.filter((e) => alvo.includes(String(e.nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))
    : [];
  const lista = (citados.length ? citados : fichas).slice(0, 12);
  return `\n\n═══ LANÇAMENTOS QUE A ${empresa.toUpperCase()} VENDE (books das construtoras) ═══\n` +
    lista.map(fichaEmpreendimento).join('\n') +
    `\n- Pode falar destes empreendimentos com segurança — e SÓ do que está escrito aqui.\n` +
    `- Preço, planta específica, andar, unidade disponível, tabela ou condição de pagamento: NUNCA chute. ` +
    `Diga que confirma com o corretor e emita [DUVIDA]{"pergunta":"<resumo curto>"}.\n` +
    `- Lançamento não tem código de imóvel: cite pelo nome, nunca invente código nem use [ENVIAR_FOTO_IMOVEL_...] para ele.`;
}
