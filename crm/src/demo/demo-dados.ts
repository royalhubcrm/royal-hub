/** Dados de exemplo do modo demonstração (inventados). */
export type Tabelas = Record<
  'empresas' | 'perfis' | 'equipes' | 'config' | 'etapas_pipeline' | 'leads' | 'historico' | 'imoveis'
  | 'conversas' | 'mensagens' | 'agendamentos' | 'interesses' | 'duvidas' | 'sites' | 'testes_assistente',
  any[]
>;

const dias = (n: number, hora = 10) => { const d = new Date(Date.now() - n * 864e5); d.setHours(hora, (n * 17) % 60, 0, 0); return d.toISOString(); };
const dia = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');

/** Foto de mentira: um desenho de casa em SVG, cada um de uma cor. */
function foto(cor: string, tom: string, predio = false) {
  const desenho = predio
    ? `<rect x="250" y="110" width="300" height="360" fill="${tom}"/>${[0, 1, 2, 3, 4].map((l) => [0, 1, 2].map((c) => `<rect x="${280 + c * 90}" y="${140 + l * 64}" width="56" height="38" fill="#E8EEF5" opacity=".85"/>`).join('')).join('')}`
    : `<polygon points="200,260 400,120 600,260" fill="${tom}"/><rect x="240" y="260" width="320" height="210" fill="${tom}" opacity=".9"/><rect x="370" y="360" width="60" height="110" fill="#E8EEF5"/><rect x="280" y="300" width="60" height="44" fill="#E8EEF5"/><rect x="460" y="300" width="60" height="44" fill="#E8EEF5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#F1F5F9"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect y="470" width="800" height="130" fill="#9DB39A"/>${desenho}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function semente(): Tabelas {
  const EMP = '11111111-1111-1111-1111-111111111111';
  const P = { ricardo: 'a0000000-0000-0000-0000-000000000001', carla: 'a0000000-0000-0000-0000-000000000002', gil: 'a0000000-0000-0000-0000-000000000003', bia: 'a0000000-0000-0000-0000-000000000004' };
  const EQ = 'e0000000-0000-0000-0000-000000000001';

  const imoveis = [
    ['8685', 'Casa', 'Jardim Karaíba', 890000, 3, 1, 3, 2, 180, '38411-000', '#8FB3D9', '#2F5D8C', false, 6],
    ['8574', 'Apartamento', 'Santa Mônica', 420000, 2, 1, 2, 1, 72, '38408-100', '#B9C8DC', '#475569', true, 5],
    ['9001', 'Casa', 'Santa Mônica', 480000, 3, 1, 2, 2, 120, '38408-150', '#C8D9C3', '#23704F', false, 5],
    ['9012', 'Apartamento', 'Centro', 310000, 2, 0, 1, 1, 58, '38400-000', '#D9CFC0', '#8A5A00', true, 2],
    ['9020', 'Sobrado', 'Tibery', 650000, 4, 2, 3, 2, 210, '', '#D6C4DA', '#6B3F75', false, 3],
    ['9033', 'Lote/Terreno', 'Granja Marileusa', 290000, 0, 0, 0, 0, 360, '38406-000', '#D8E3C8', '#5C7A2E', false, 1],
    ['9041', 'Apartamento', 'Saraiva', 560000, 3, 1, 2, 2, 96, '38408-300', '#C4D4E8', '#1E3A5F', true, 5],
    ['9055', 'Casa', 'Lídice', 720000, 3, 3, 4, 3, 240, '38400-100', '#E3D2C3', '#9B3B3B', false, 5],
    ['9060', 'Cobertura', 'Tabajaras', 1250000, 4, 3, 5, 3, 280, '38400-200', '#C3CFE3', '#16263D', true, 6],
    ['9072', 'Casa', 'Canaã', 245000, 2, 0, 1, 1, 70, '38401-000', '#E3DCC3', '#8A5A00', false, 2],
  ].map(([codigo, tipo, bairro, preco, quartos, suites, banheiros, vagas, area, cep, cor, tom, predio, nFotos], i) => ({
    id: `b0000000-0000-0000-0000-00000000000${i}`.slice(0, 36), empresa_id: EMP, codigo, tipo, finalidade: 'venda',
    status: i === 3 ? 'reservado' : 'disponivel', cep, rua: i % 2 ? 'Rua das Acácias' : 'Av. Rondon Pacheco', numero: String(100 + i * 37),
    bairro, cidade: 'Uberlândia', preco, condominio: predio ? 450 + i * 40 : 0, iptu: 1200 + i * 150, quartos, suites, banheiros, vagas, area,
    descricao: `${tipo} ${quartos ? `com ${quartos} quartos ` : ''}no ${bairro}, ${area} m². Rua tranquila, perto de comércio e escola. Documentação em dia.`,
    fotos: Array.from({ length: nFotos as number }, () => foto(cor as string, tom as string, predio as boolean)), link: '',
    criado_em: dias(40 - i), atualizado_em: dias(10 - i),
  }));

  const nomes = ['Maria Silva', 'João Souza', 'Ana Paula Rezende', 'Carlos Menezes', 'Fernanda Lima', 'Rafael Costa', 'Juliana Prado',
    'Pedro Henrique', 'Luciana Alves', 'Marcos Vinícius', 'Patrícia Gomes', 'Thiago Borges', 'Camila Duarte', 'Bruno Teixeira',
    'Aline Castro', 'Gustavo Rocha', 'Renata Faria', 'Diego Martins', 'Vanessa Moura', 'Rodrigo Nunes', 'Sofia Andrade',
    'Felipe Ramos', 'Larissa Melo', 'André Pires', 'Beatriz Cunha', 'Leandro Freitas'];
  const interesses = ['Casa 3 quartos na Zona Sul, até 700 mil', 'Apartamento 2 quartos perto do centro', 'Primeiro imóvel, até 250 mil',
    'Lote para construir', 'Cobertura com vista', 'Casa com quintal para cachorro', 'Apartamento para investir', ''];
  const origens = ['Facebook Ads', 'Instagram Ads', 'Formulário', 'WhatsApp', 'Indicação', 'Portal'];
  const etapas = ['novo', 'novo', 'novo', 'contato', 'contato', 'visita', 'proposta', 'fechado', 'perdido', 'contato', 'novo', 'visita'];
  const temps = ['quente', 'morno', 'frio', 'morno', 'quente'];
  const pessoas = [P.carla, P.gil, P.ricardo, null, P.carla, P.bia];
  const leads = nomes.map((nome, i) => ({
    id: `c0000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`, empresa_id: EMP, nome, empresa: i === 6 ? 'Prado Engenharia' : null,
    email: i % 3 ? null : nome.split(' ')[0].toLowerCase() + '@email.com', telefone: `55349${String(91000000 + i * 1379).slice(0, 8)}`,
    status: etapas[i % etapas.length], temperatura: temps[i % temps.length],
    valor_estimado: [0, 420000, 650000, 310000, 890000, 480000, 1250000, 245000][i % 8], origem: origens[i % origens.length],
    campanha: i % 2 ? 'Zona Sul — setembro' : '', interesse: interesses[i % interesses.length], obs: '',
    imoveis: i % 4 === 0 ? ['8685'] : i % 5 === 0 ? ['9001', '8574'] : [], responsavel_id: pessoas[i % pessoas.length],
    posicao: 1000 + i, data_criacao: dias(Math.floor(i * 1.3), 9 + (i % 8)), atualizado_em: dias(Math.floor(i / 2)),
  }));

  const historico = leads.flatMap((l, i) => [
    { id: i * 3 + 1, empresa_id: EMP, lead_id: l.id, texto: `Lead criado (${l.origem})`, autor_id: null, criado_em: l.data_criacao },
    ...(l.status !== 'novo' ? [{ id: i * 3 + 2, empresa_id: EMP, lead_id: l.id, texto: 'Etapa: Novo → Em contato', autor_id: l.responsavel_id, criado_em: l.atualizado_em }] : []),
  ]);

  const conv = (i: number, lead: any, extra: Record<string, unknown> = {}) => ({
    id: `d0000000-0000-0000-0000-00000000000${i}`, empresa_id: EMP, telefone: lead.telefone, nome: lead.nome, lead_id: lead.id,
    responsavel_id: lead.responsavel_id, bot_ativo: true, pausado_ate: null, nao_perturbe: false, ultima: '', nao_lidas: 0,
    retomadas: 0, ultima_retomada: null, atualizado_em: dias(0, 11), ...extra,
  });
  const conversas = [
    conv(1, leads[0], { nao_lidas: 2, atualizado_em: dias(0, 14) }),
    conv(2, leads[1], { atualizado_em: dias(0, 9) }),
    conv(3, leads[3], { pausado_ate: new Date(Date.now() + 3 * 36e5).toISOString(), atualizado_em: dias(0, 8) }),
    conv(4, leads[5], { atualizado_em: dias(3, 16) }),
    conv(5, leads[9], { nao_perturbe: true, atualizado_em: dias(6, 10) }),
  ];
  const falas: [number, string, string][] = [
    [0, 'cliente', 'Oi, vi o anúncio da casa no Karaíba'],
    [0, 'bot', 'Boa tarde! Aqui é a Camila, da Royal Negócios Imobiliários. Que bom que gostou! Você procura em qual região de Uberlândia?'],
    [0, 'cliente', 'Zona Sul, até uns 900 mil'],
    [0, 'bot', 'Ótimo, temos ótimas oportunidades por lá! Separei três que encaixam, dá uma olhada.'],
    [0, 'cliente', 'Gostei da 8685. Dá pra ver amanhã?'],
    [0, 'cliente', 'Umas 18h?'],
    [1, 'cliente', 'Bom dia, ainda tem o apartamento do Santa Mônica?'],
    [1, 'bot', 'Bom dia, João! Tem sim, o 8574: 2 quartos, 72 m², R$ 420 mil. Quer passar aqui no escritório pra ver com calma?'],
    [2, 'cliente', 'Aceita FGTS na entrada?'],
    [2, 'bot', 'Essa eu confirmo com o Ricardo pra não te passar errado, já te aviso.'],
    [2, 'voce', 'Oi Carlos, aceita sim! Te explico direitinho amanhã.'],
    [3, 'cliente', 'Tem casa com 3 quartos no Santa Mônica?'],
    [3, 'bot', 'Tem sim! O 9001: casa com 3 quartos, 120 m², R$ 480 mil. Quer ver?'],
    [3, 'cliente', 'Vou pensar e te falo'],
    [4, 'cliente', 'Não tenho mais interesse, obrigado'],
    [4, 'bot', 'Imagina, tô por aqui se precisar.'],
  ];
  const mensagens = falas.map(([c, de, texto], i) => ({
    id: i + 1, empresa_id: EMP, conversa_id: conversas[c].id, de, texto, autor_id: de === 'voce' ? P.ricardo : null,
    criado_em: new Date(new Date(conversas[c].atualizado_em).getTime() - (falas.length - i) * 6e4).toISOString(),
  }));
  for (const c of conversas) c.ultima = mensagens.filter((m) => m.conversa_id === c.id).at(-1)?.texto ?? '';

  return {
    empresas: [{ id: EMP, nome: 'Royal Negócios Imobiliários', slug: 'royal', ativa: true, criado_em: dias(90) },
      { id: '22222222-2222-2222-2222-222222222222', nome: 'Prime Imóveis', slug: 'prime', ativa: true, criado_em: dias(20) }],
    perfis: [
      { id: P.ricardo, empresa_id: EMP, nome: 'Ricardo Almeida', email: 'ricardo@royal.demo', telefone: '', papel: 'admin', equipe_id: null, ativo: true, dono: true, ultimo_acesso: dias(0) },
      { id: P.carla, empresa_id: EMP, nome: 'Carla Mendes', email: 'carla@royal.demo', telefone: '', papel: 'corretor', equipe_id: EQ, ativo: true, dono: false, ultimo_acesso: dias(1) },
      { id: P.gil, empresa_id: EMP, nome: 'Gilberto Rocha', email: 'gil@royal.demo', telefone: '', papel: 'gerente', equipe_id: EQ, ativo: true, dono: false, ultimo_acesso: dias(2) },
      { id: P.bia, empresa_id: EMP, nome: 'Beatriz Lopes', email: 'bia@royal.demo', telefone: '', papel: 'assistente', equipe_id: null, ativo: true, dono: false, ultimo_acesso: null },
    ],
    equipes: [{ id: EQ, empresa_id: EMP, nome: 'Equipe Zona Sul', gerente_id: P.gil, criado_em: dias(30) }],
    config: [{
      empresa_id: EMP, corretor: 'Ricardo Almeida', creci: '12345-F', whats: '5534999990000', endereco: 'R. José Nonato Ribeiro, 428 — Cazeca, Uberlândia-MG',
      cidade: 'Uberlândia', assistente: 'Camila', estilo: '', bot_ligado: true, bot_modo: 'novos', bot_hora_inicio: null, bot_hora_fim: null, bot_numeros: '',
      fatos: 'Primeiro imóvel tem 50% de desconto na documentação — é o único desconto que existe.\nRenda informal ou autônomo: consegue sim; o corretor é especialista em formalizar renda.\nAprovação de crédito: o corretor resolve; nunca prometa aprovação.\nEntrada, renda necessária, parcela, prazo e custas: só no atendimento presencial.',
      wa_numero_id: '', wa_verificacao: 'royal2026', wa_configurado: true, wa_canal: 'oficial', ponte_visto_em: null, prompt_base: '', ia_provedor: 'auto', ia_modelo: '',
    }],
    etapas_pipeline: [
      ['novo', 'Novo', 1, '#64748B', 10, 'aberta'], ['contato', 'Em contato', 2, '#3B6EA5', 20, 'aberta'], ['visita', 'Visita', 3, '#2F5D8C', 40, 'aberta'],
      ['proposta', 'Proposta', 4, '#1E3A5F', 70, 'aberta'], ['fechado', 'Fechado', 5, '#2E7D5B', 100, 'ganha'], ['perdido', 'Perdido', 6, '#9B3B3B', 0, 'perdida'],
    ].map(([slug, nome, ordem, cor, probabilidade, tipo], i) => ({ id: i + 1, slug, nome, ordem, cor, probabilidade, tipo, ativa: true })),
    leads, historico, imoveis, conversas, mensagens,
    agendamentos: [
      { id: 'f1', empresa_id: EMP, conversa_id: conversas[0].id, lead_id: leads[0].id, nome: 'Maria Silva', telefone: leads[0].telefone, data: dia(1), hora: '18:00:00', local: 'Escritório', como: 'A assistente fechou na conversa (imóvel 8685)', imovel: '8685', marcado_por: 'assistente', status: 'marcado', criado_em: dias(0) },
      { id: 'f2', empresa_id: EMP, conversa_id: null, lead_id: leads[5].id, nome: 'Rafael Costa', telefone: leads[5].telefone, data: dia(2), hora: '10:30:00', local: 'Escritório', como: 'Marcado no painel', imovel: '9001', marcado_por: 'Carla Mendes', status: 'marcado', criado_em: dias(1) },
      { id: 'f3', empresa_id: EMP, conversa_id: conversas[1].id, lead_id: leads[1].id, nome: 'João Souza', telefone: leads[1].telefone, data: dia(0), hora: '17:00:00', local: 'Escritório', como: 'A assistente fechou na conversa (imóvel 8574)', imovel: '8574', marcado_por: 'assistente', status: 'marcado', criado_em: dias(1) },
      { id: 'f4', empresa_id: EMP, conversa_id: null, lead_id: leads[7].id, nome: 'Pedro Henrique', telefone: leads[7].telefone, data: dia(-3), hora: '15:00:00', local: 'Escritório', como: 'Marcado no painel', imovel: '9055', marcado_por: 'Ricardo Almeida', status: 'compareceu', criado_em: dias(5) },
    ],
    interesses: [
      { id: 1, empresa_id: EMP, conversa_id: conversas[0].id, lead_id: leads[0].id, codigo: '8685', origem: 'opcoes', criado_em: dias(0) },
      { id: 2, empresa_id: EMP, conversa_id: conversas[0].id, lead_id: leads[0].id, codigo: '9055', origem: 'opcoes', criado_em: dias(0) },
      { id: 3, empresa_id: EMP, conversa_id: conversas[1].id, lead_id: leads[1].id, codigo: '8574', origem: 'foto', criado_em: dias(1) },
      { id: 4, empresa_id: EMP, conversa_id: conversas[3].id, lead_id: leads[5].id, codigo: '9001', origem: 'opcoes', criado_em: dias(3) },
    ],
    duvidas: [
      { id: 'g1', empresa_id: EMP, conversa_id: conversas[2].id, lead_id: leads[3].id, nome: 'Carlos Menezes', pergunta: 'Cliente quer saber se aceita FGTS na entrada', resposta: '', status: 'aberta', criado_em: dias(0) },
      { id: 'g2', empresa_id: EMP, conversa_id: conversas[0].id, lead_id: leads[0].id, nome: 'Maria Silva', pergunta: 'O condomínio do 8685 aceita pet?', resposta: '', status: 'aberta', criado_em: dias(1) },
    ],
    testes_assistente: [],
    sites: [{
      id: 'h1', empresa_id: EMP, slug: 'royal-zona-sul', nome: 'Royal Zona Sul', titulo: 'Casas na Zona Sul de Uberlândia', subtitulo: 'Atendimento com hora marcada, do primeiro contato à chave.',
      sobre: 'A Royal atende todas as regiões de Uberlândia há mais de 10 anos.', cor: '#1E3A5F', fundo: 'claro', fonte: 'moderna', whats: '5534999990000',
      email: 'contato@royal.demo', endereco: 'R. José Nonato Ribeiro, 428', creci: '12345-F', filtro: { tipos: ['Casa', 'Sobrado'] }, dominio: '', publicado: true,
      criado_em: dias(15), atualizado_em: dias(2),
    }],
  };
}
