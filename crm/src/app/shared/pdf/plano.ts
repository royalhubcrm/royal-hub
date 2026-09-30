// @ts-nocheck — código portado do gerador antigo (o de Python). Roda igual; os tipos ficam soltos de propósito.
// Plano Estratégico Personalizado — o PDF de pós-venda da Royal.
//
// É a versão em JavaScript do gerador que rodava em Python (reportlab) na
// pasta D:\__royal_tools: mesmas seis páginas, mesma identidade — preto,
// dourado #C9A84C, capa escura com faixa lateral, e a logo de verdade.
//
// A diferença é que aqui ele vive dentro do sistema: os dados vêm da tela
// "PDF Personalizado", não de um dicionário no meio do código, e qualquer
// pessoa da equipe gera o documento sem instalar Python nem abrir terminal.
import { Documento, Tela, A4, larguraTexto } from './pdf';

/* ---------------- identidade ---------------- */
const OURO = [0.788, 0.659, 0.298];        // #C9A84C
const PRETO = [0.039, 0.039, 0.039];       // #0A0A0A
const CINZA_ESC = [0.173, 0.173, 0.173];   // #2C2C2C
const CINZA_MED = [0.533, 0.533, 0.533];   // #888888
const CINZA_CLARO = [0.957, 0.957, 0.957]; // #F4F4F4
const BRANCO = [1, 1, 1];

const M = 56;                               // margem (≈ 20 mm)
const LARG = A4.largura - M * 2;

const cortar = (s, tamanho, limite) => {
  s = String(s ?? "");
  while (larguraTexto(s, tamanho) > limite && s.length > 4) s = s.slice(0, -2);
  return s;
};

/* Quebra o texto em linhas que cabem na largura pedida. */
function quebrar(texto, tamanho, limite) {
  const palavras = String(texto ?? "").split(/\s+/).filter(Boolean);
  const linhas = [];
  let linha = "";
  for (const p of palavras) {
    const teste = linha ? linha + " " + p : p;
    if (larguraTexto(teste, tamanho) <= limite) linha = teste;
    else { if (linha) linhas.push(linha); linha = p; }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

function paragrafo(t, x, y, texto, { tamanho = 10, cor = CINZA_ESC, fonte = "F1", limite = LARG, entrelinha = 1.45 } = {}) {
  t.cor(...cor);
  for (const linha of quebrar(texto, tamanho, limite)) {
    t.escrever(x, y, linha, { fonte, tamanho });
    y -= tamanho * entrelinha;
  }
  return y;
}

/* ---------------- o documento ---------------- */
export function planoEstrategico(d, logoBuffer = null, logoEscuraBuffer = null) {
  const doc = new Documento();
  const imagens = [];
  const usar = (buf) => {
    if (!buf) return null;
    const im = doc.imagemJpeg(buf);
    if (!im) return null;
    imagens.push(im);
    return { n: imagens.length - 1, ...im };
  };
  // a mesma marca em dois fundos: a de fundo escuro vai na capa e no fecho,
  // senão ela aparece dentro de um quadrado branco no meio do preto
  const logo = usar(logoBuffer);
  const logoEscura = usar(logoEscuraBuffer || logoBuffer) || logo;
  const usadas = imagens;

  const cliente = String(d.nome || "Cliente").trim();
  const primeiroNome = cliente.split(/\s+/)[0];
  const corretor = d.corretor || "Ricardo";
  const empresa = d.empresa || "Royal Negócios Imobiliários";

  const rodape = (t, titulo) => {
    t.cor(...CINZA_MED);
    t.escrever(M, 34, cortar(`${empresa.toUpperCase()}  ·  ${titulo}`, 7, LARG * 0.6), { tamanho: 7 });
    const dir = cortar(`${cliente}  ·  ${d.empreendimento || ""}`, 7, LARG * 0.38);
    t.escrever(A4.largura - M - larguraTexto(dir, 7), 34, dir, { tamanho: 7 });
    t.corLinha(...OURO);
    t.linha(M, 42, A4.largura - M, 42, 0.4);
  };

  const cabecalhoCapitulo = (t, numero, titulo) => {
    let y = A4.altura - 70;
    t.cor(...OURO);
    t.escrever(M, y, `CAPÍTULO ${String(numero).padStart(2, "0")}`, { fonte: "F2", tamanho: 9, espaco: 1.5 });
    t.cor(...PRETO);
    t.escrever(M, y - 24, cortar(titulo, 18, LARG), { fonte: "F2", tamanho: 18 });
    t.corLinha(...OURO);
    t.linha(M, y - 34, A4.largura - M, y - 34, 1);
    return y - 58;
  };

  /* ═════════ 1. CAPA ═════════ */
  {
    const t = new Tela();
    t.cor(...PRETO).retangulo(0, 0, A4.largura, A4.altura);
    t.cor(...OURO).retangulo(0, 0, 17, A4.altura);            // faixa lateral

    if (logoEscura) {
      const alt = 96, larg = alt * (logoEscura.largura / logoEscura.altura);
      t.imagem(logoEscura.n, M, A4.altura - 150, larg, alt);
    } else {
      t.cor(...OURO).escrever(M, A4.altura - 70, "ROYAL", { fonte: "F2", tamanho: 26, espaco: 4 });
    }

    t.cor(...CINZA_MED).escrever(M, A4.altura - 172, "PÓS-VENDA PREMIUM", { tamanho: 8, espaco: 2 });
    t.corLinha(...OURO).linha(M, A4.altura - 186, A4.largura - M, A4.altura - 186, 0.6);

    t.cor(...BRANCO);
    t.escrever(M, A4.altura * 0.60, "PLANO", { fonte: "F2", tamanho: 30 });
    t.escrever(M, A4.altura * 0.60 - 36, "ESTRATÉGICO", { fonte: "F2", tamanho: 30 });
    t.cor(...OURO).escrever(M, A4.altura * 0.60 - 72, "PERSONALIZADO", { fonte: "F2", tamanho: 30 });

    t.cor(...CINZA_MED);
    t.escrever(M, A4.altura * 0.40, "Sua conquista, seu futuro", { tamanho: 11 });
    t.escrever(M, A4.altura * 0.40 - 16, "Um guia completo — da assinatura às chaves.", { tamanho: 9 });

    t.corLinha(...OURO).linha(M, A4.altura * 0.34, A4.largura - M, A4.altura * 0.34, 0.6);

    t.cor(...CINZA_MED).escrever(M, A4.altura * 0.30, "PREPARADO ESPECIALMENTE PARA", { tamanho: 8, espaco: 1.5 });
    t.cor(...BRANCO).escrever(M, A4.altura * 0.30 - 26, cortar(cliente, 17, LARG), { fonte: "F2", tamanho: 17 });
    t.cor(...OURO).escrever(M, A4.altura * 0.30 - 46,
      cortar([d.empreendimento, d.bloco_unidade].filter(Boolean).join("  ·  "), 10, LARG), { tamanho: 10 });
    t.cor(...CINZA_MED).escrever(M, A4.altura * 0.30 - 64,
      `${(d.cidade || "Uberlândia").toUpperCase()} · ${(d.mes_referencia || "").toUpperCase()}`, { tamanho: 8 });

    doc.pagina(t.toString(), usadas);
  }

  /* ═════════ 2. SEU IMÓVEL EM NÚMEROS ═════════ */
  {
    const t = new Tela();
    let y = cabecalhoCapitulo(t, 1, "Seu imóvel em números");
    y = paragrafo(t, M, y, "Tudo o que está aqui veio do seu contrato, assinado e registrado. Guarde este documento.", { tamanho: 10 });
    y -= 14;

    const campos = [
      ["Empreendimento", d.empreendimento], ["Construtora", d.construtora],
      ["Bloco · unidade", d.bloco_unidade], ["Vaga", d.vaga],
      ["Tipologia", d.tipologia], ["Condomínio", d.condominio],
      ["Prazo de obra", d.prazo_obra], ["Total do condomínio", d.total_cond],
    ].filter(([, v]) => String(v || "").trim());

    const colLarg = (LARG - 14) / 2;
    campos.forEach(([rotulo, valor], i) => {
      const x = i % 2 === 0 ? M : M + colLarg + 14;
      if (i % 2 === 0 && i > 0) y -= 38;
      t.cor(...CINZA_CLARO).cartao(x, y - 30, colLarg, 32, 4);
      t.cor(...CINZA_MED).escrever(x + 9, y - 10, rotulo.toUpperCase(), { tamanho: 7, espaco: 0.8 });
      t.cor(...PRETO).escrever(x + 9, y - 24, cortar(valor, 9.5, colLarg - 18), { fonte: "F2", tamanho: 9.5 });
    });
    y -= 54;

    t.cor(...PRETO).escrever(M, y, "O seu investimento", { fonte: "F2", tamanho: 12 });
    y -= 18;

    const colunas = [LARG * 0.42, LARG * 0.33, LARG * 0.25];
    const linhaTabela = (valores, { cabecalho = false, zebra = false } = {}) => {
      if (cabecalho) t.cor(...PRETO).retangulo(M, y - 16, LARG, 20);
      else if (zebra) t.cor(...CINZA_CLARO).retangulo(M, y - 15, LARG, 19);
      t.cor(...(cabecalho ? BRANCO : PRETO));
      let x = M;
      valores.forEach((v, i) => {
        const ultima = i === valores.length - 1;
        const texto = cortar(v, 9, colunas[i] - 12);
        if (ultima) t.escrever(M + LARG - 8 - larguraTexto(texto, 9), y - 10, texto, { fonte: cabecalho ? "F2" : "F2", tamanho: 9 });
        else t.escrever(x + 8, y - 10, texto, { fonte: cabecalho ? "F2" : "F1", tamanho: 9 });
        x += colunas[i];
      });
      y -= cabecalho ? 22 : 19;
    };

    linhaTabela(["ITEM", "DETALHE", "VALOR"], { cabecalho: true });
    const linhas = [
      ["Sinal", "Pago na assinatura", d.sinal],
      ["Mensais à construtora", d.mensais_qtd, d.mensais_total],
      ["Bônus bom pagador", "Parcelas descontáveis", d.bom_pagador],
      ["Financiamento", "Depois da entrega das chaves", d.financiamento],
    ].filter(([, , v]) => String(v || "").trim());
    linhas.forEach((l, i) => linhaTabela(l, { zebra: i % 2 === 0 }));

    y -= 6;
    t.cor(...OURO).retangulo(M, y - 18, LARG, 24);
    t.cor(...PRETO).escrever(M + 10, y - 11, "VALOR TOTAL DO CONTRATO", { fonte: "F2", tamanho: 10, espaco: 0.5 });
    const total = String(d.valor_total || "");
    t.escrever(M + LARG - 10 - larguraTexto(total, 11), y - 11, total, { fonte: "F2", tamanho: 11 });
    y -= 36;

    if (d.mensais_valor || d.vencimento) {
      t.cor(...CINZA_MED);
      const nota = [d.mensais_valor ? `Parcela mensal: ${d.mensais_valor}` : "",
                    d.vencimento ? `Vencimento: ${d.vencimento}` : ""].filter(Boolean).join("   ·   ");
      t.escrever(M, y, nota, { tamanho: 8.5 });
    }

    rodape(t, "Plano Estratégico Personalizado");
    doc.pagina(t.toString(), usadas);
  }

  /* ═════════ 3. POR QUE A DECISÃO FOI INTELIGENTE ═════════ */
  {
    const t = new Tela();
    let y = cabecalhoCapitulo(t, 2, "Por que sua decisão foi inteligente");

    const razoes = [
      ["01", "Você travou o preço de hoje",
        "Imóvel novo valoriza só por ficar pronto. Você está pagando hoje, em parcelas pequenas, por algo que vale mais quando a chave sai."],
      ["02", "A região está em ascensão",
        "O bairro vem recebendo investimento público e privado. Estar entre os primeiros compradores de um lançamento é estar do lado certo da curva."],
      ["03", "Você tem tempo para se planejar",
        "Tempo para organizar as contas, montar reserva, melhorar o score e simular o financiamento com calma. Esse tempo é um ativo que quase ninguém usa bem."],
      ["04", "Condições de financiamento",
        "Juros menores que o mercado tradicional, FGTS para amortizar e o Fundo Garantidor como proteção a mais no seu contrato."],
      ["05", "Liberdade de escolha na entrega",
        "Morar, alugar por mês, alugar por temporada, alugar por quarto ou vender. Você comprou um leque de possibilidades que se abre na entrega."],
    ];

    for (const [num, titulo, corpo] of razoes) {
      t.cor(...OURO).circulo(M + 10, y - 3, 10);
      t.cor(...PRETO).escrever(M + 10 - larguraTexto(num, 8) / 2, y - 6, num, { fonte: "F2", tamanho: 8 });
      t.cor(...PRETO).escrever(M + 30, y, titulo, { fonte: "F2", tamanho: 11.5 });
      y = paragrafo(t, M + 30, y - 16, corpo, { tamanho: 9.5, limite: LARG - 30 });
      y -= 16;
    }

    rodape(t, "Plano Estratégico Personalizado");
    doc.pagina(t.toString(), usadas);
  }

  /* ═════════ 4. CAMINHOS PARA FAZER RENDER ═════════ */
  {
    const t = new Tela();
    let y = cabecalhoCapitulo(t, 3, "Na entrega: caminhos para fazer render");
    y = paragrafo(t, M, y, "Você não precisa decidir agora. Vale conhecer as opções para chegar preparado na hora da escolha.", { tamanho: 10 });
    y -= 16;

    const caminhos = [
      ["Aluguel tradicional", d.renda_aluguel, "O mais tranquilo. Contrato formal, inquilino fixo, renda previsível todo mês."],
      ["Temporada / Airbnb", d.renda_airbnb, "Dá mais trabalho e rende mais. Precisa de gestão ativa ou de uma plataforma cuidando."],
      ["Aluguel por quarto", d.renda_quartos, "Cada quarto alugado separado. Funciona bem perto de faculdade e de centro médico."],
      ["Venda na entrega", d.lucro_venda, "Vender assim que a chave sai e embolsar a valorização do período de obra."],
    ].filter(([, v]) => String(v || "").trim());

    const colLarg = (LARG - 14) / 2;
    const alt = 104;
    caminhos.forEach(([titulo, valor, desc], i) => {
      const x = i % 2 === 0 ? M : M + colLarg + 14;
      if (i % 2 === 0 && i > 0) y -= alt + 14;
      t.cor(...PRETO).cartao(x, y - alt, colLarg, alt, 6);
      t.cor(...OURO).escrever(x + 12, y - 22, cortar(titulo, 10.5, colLarg - 24), { fonte: "F2", tamanho: 10.5 });
      t.cor(...OURO).escrever(x + 12, y - 44, cortar(valor, 14, colLarg - 24), { fonte: "F2", tamanho: 14 });
      let cy = y - 64;
      t.cor(...CINZA_MED);
      for (const linha of quebrar(desc, 8.5, colLarg - 24).slice(0, 4)) {
        t.escrever(x + 12, cy, linha, { tamanho: 8.5 });
        cy -= 12;
      }
    });
    y -= alt + 24;

    if (d.valor_entrega) {
      t.cor(...CINZA_CLARO).cartao(M, y - 40, LARG, 44, 4);
      t.cor(...CINZA_MED).escrever(M + 12, y - 16, "VALOR PROJETADO NA ENTREGA", { tamanho: 7.5, espaco: 0.8 });
      t.cor(...PRETO).escrever(M + 12, y - 33, String(d.valor_entrega), { fonte: "F2", tamanho: 15 });
      t.cor(...CINZA_MED).escrever(M + 12 + larguraTexto(String(d.valor_entrega), 15) + 14, y - 33,
        "projeção de mercado, não é promessa de rentabilidade", { tamanho: 8 });
    }

    rodape(t, "Plano Estratégico Personalizado");
    doc.pagina(t.toString(), usadas);
  }

  /* ═════════ 5. RESERVA INTELIGENTE ═════════ */
  {
    const t = new Tela();
    let y = cabecalhoCapitulo(t, 4, "Plano da reserva inteligente");
    y = paragrafo(t, M, y, "Uma rotina simples para a parcela nunca apertar — em nenhuma fase da obra.", { tamanho: 10 });
    y -= 14;

    const reserva = d.reserva_mensal || "R$ 400/mês";
    const fases = [
      ["FASE 1 — AGORA, DURANTE A OBRA", d.mensais_valor ? `Parcela atual: ${d.mensais_valor}` : "Enquanto a obra corre",
        `Separe ${reserva} numa conta à parte. Esse dinheiro não é para gastar: é o escudo para quando a parcela subir com o INCC.`],
      ["FASE 2 — QUANDO A PARCELA ALCANÇAR", "Parcela + reserva = tranquilidade",
        "Siga pagando normal. A reserva cobre os meses de ajuste e a sensação no seu bolso não muda."],
      ["FASE 3 — SE PASSAR DO ORÇAMENTO", "A reserva cobre a diferença",
        "Use o que acumulou para cobrir o excedente. Na entrega, a parcela do financiamento costuma vir menor que a da obra."],
      ["FASE 4 — DINHEIRO EXTRA (13º, restituição)", "Amortize escolhendo reduzir prazo",
        "Cada amortização derruba o prazo e economiza juros. Escolha sempre reduzir prazo, não reduzir parcela."],
    ];

    for (const [titulo, sub, corpo] of fases) {
      const alt = 78;
      t.cor(...CINZA_CLARO).cartao(M, y - alt, LARG, alt, 4);
      t.cor(...OURO).retangulo(M, y - alt, 5, alt);
      t.cor(...PRETO).escrever(M + 20, y - 18, titulo, { fonte: "F2", tamanho: 10 });
      t.cor(...OURO).escrever(M + 20, y - 34, sub, { fonte: "F2", tamanho: 9 });
      paragrafo(t, M + 20, y - 50, corpo, { tamanho: 9, limite: LARG - 40 });
      y -= alt + 12;
    }

    rodape(t, "Plano Estratégico Personalizado");
    doc.pagina(t.toString(), usadas);
  }

  /* ═════════ 6. PALAVRA FINAL ═════════ */
  {
    const t = new Tela();
    t.cor(...PRETO).retangulo(0, 0, A4.largura, A4.altura);
    t.cor(...OURO).retangulo(0, 0, 17, A4.altura);

    t.cor(...BRANCO).escrever(M, A4.altura - 100, "Uma palavra final.", { fonte: "F2", tamanho: 20 });

    const msg = d.mensagem_final ||
      `${primeiroNome}, foi uma honra te acompanhar nessa conquista. Esse imóvel não é só quatro paredes: ` +
      `é o começo do seu patrimônio. Cada parcela paga é um tijolo a mais na sua independência. ` +
      `Estou aqui até depois da entrega das chaves — e muito além dela.`;

    let y = A4.altura - 150;
    t.cor(...CINZA_MED);
    for (const linha of quebrar(msg, 11, LARG - 20)) {
      t.escrever(M, y, linha, { tamanho: 11 });
      y -= 20;
    }

    y -= 30;
    t.cor(...OURO).escrever(M, y, corretor, { fonte: "F2", tamanho: 13 });
    t.cor(...CINZA_MED).escrever(M, y - 18, empresa, { tamanho: 9 });
    if (d.creci) t.escrever(M, y - 32, "CRECI " + d.creci, { tamanho: 9 });
    if (d.whatsapp) t.escrever(M, y - 46, "WhatsApp " + d.whatsapp, { tamanho: 9 });
    t.corLinha(...OURO).linha(M, y - 60, M + 150, y - 60, 0.6);

    if (logoEscura) {
      const alt = 60, larg = alt * (logoEscura.largura / logoEscura.altura);
      t.imagem(logoEscura.n, A4.largura - M - larg, 70, larg, alt);
    }

    doc.pagina(t.toString(), usadas);
  }

  return doc.gerar();
}

/* Campos que a tela pede, na ordem em que aparecem.
   Ficam aqui para a tela e o gerador nunca saírem de sincronia. */
export const CAMPOS_PLANO = [
  { grupo: "Identificação", campos: [
    ["nome", "Nome completo do cliente", ""],
    ["empreendimento", "Empreendimento", ""],
    ["construtora", "Construtora", ""],
    ["bloco_unidade", "Bloco e unidade", "ex: Bloco 02 — Unidade 401"],
    ["vaga", "Vaga de garagem", "ex: Vaga 90 (demarcada)"],
    ["tipologia", "Tipologia", "ex: 2 quartos, 1 suíte, varanda"],
    ["condominio", "Condomínio e lazer", "ex: piscina, academia, quadra"],
    ["total_cond", "Total do condomínio", "ex: 240 unidades, 2 torres"],
    ["prazo_obra", "Prazo de entrega", "ex: 36 meses (2029)"],
    ["mes_referencia", "Mês de referência", "ex: Setembro 2026"],
  ] },
  { grupo: "Valores", campos: [
    ["valor_total", "Valor total do contrato", "ex: R$ 295.900,00"],
    ["sinal", "Sinal pago na assinatura", "ex: R$ 3.000,00"],
    ["mensais_qtd", "Quantidade de mensais", "ex: 100 parcelas"],
    ["mensais_valor", "Valor da parcela mensal", "ex: R$ 870,78"],
    ["mensais_total", "Total das mensais", "ex: R$ 87.078,00"],
    ["bom_pagador", "Bônus bom pagador", "ex: R$ 10.000,00"],
    ["financiamento", "Financiamento pós-chaves", "ex: R$ 194.059,92"],
    ["vencimento", "Dia de vencimento", "ex: dia 08 de cada mês"],
    ["reserva_mensal", "Reserva mensal sugerida", "ex: R$ 400/mês"],
  ] },
  { grupo: "Projeções", campos: [
    ["valor_entrega", "Valor projetado na entrega", "ex: R$ 347.000"],
    ["renda_aluguel", "Aluguel tradicional", "ex: R$ 2.150/mês"],
    ["renda_airbnb", "Temporada / Airbnb", "ex: R$ 4.500/mês bruto"],
    ["renda_quartos", "Aluguel por quarto", "ex: R$ 2.400 a R$ 3.000/mês"],
    ["lucro_venda", "Lucro estimado na venda", "ex: R$ 30.000 a R$ 60.000"],
  ] },
  { grupo: "Assinatura", campos: [
    ["corretor", "Corretor", ""],
    ["creci", "CRECI", ""],
    ["whatsapp", "WhatsApp", ""],
    ["mensagem_final", "Mensagem final (em branco usa a padrão)", ""],
  ] },
];
