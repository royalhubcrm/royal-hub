// Busca na Chave7, quando houver acesso autorizado.
//
// A API deles (api.chave7.com.br/graphql) exige uma chave própria no cabeçalho
// x-api-key. Essa chave é da Chave7, não nossa — então ela NÃO vem escrita aqui.
// Peça a eles o acesso para a sua conta e coloque no .env:
//
//   CHAVE7_API_KEY=a-chave-que-eles-te-derem
//
// Sem essa linha, este arquivo fica quieto e o sistema busca só na sua carteira.
// Com ela, a busca passa a olhar os dois lugares e juntar o resultado.

const API = process.env.CHAVE7_API || "https://api.chave7.com.br/graphql";
const CHAVE = process.env.CHAVE7_API_KEY || "";
const CIDADE_PADRAO = process.env.CHAVE7_CIDADE || "Uberlândia";

export const chave7Ligada = () => Boolean(CHAVE);

const CONSULTA = `query GetPropertiesV2($filter: PropertyFilterV2, $orderBy: OrderBy, $take: Float, $isFirstPageSearch: Boolean) {
  propertiesV2(filter: $filter, orderBy: $orderBy, take: $take, isFirstPageSearch: $isFirstPageSearch) {
    page { total }
    results {
      code price neighborhood city coverPhotoUrl
      bedrooms suites garage landArea usefulArea finality
      types { type }
    }
  }
}`;

// os nomes que eles usam para o tipo do imóvel, no nosso vocabulário
const TIPOS = {
  HOUSE: "Casa", CASA: "Casa", SOBRADO: "Sobrado",
  APARTMENT: "Apartamento", APARTAMENTO: "Apartamento", FLAT: "Apartamento",
  LAND: "Lote/Terreno", LOT: "Lote/Terreno", TERRENO: "Lote/Terreno", LOTE: "Lote/Terreno",
  FARM: "Chácara", CHACARA: "Chácara", RANCH: "Chácara",
  COMMERCIAL: "Comercial", SALA: "Sala comercial",
};

const traduzirTipo = (t) => {
  if (!t) return "";
  const chave = String(t).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return TIPOS[chave] || String(t);
};

/**
 * Procura imóveis na Chave7 com os mesmos critérios que a gente usa aqui.
 * Devolve [] em qualquer problema — nunca derruba o atendimento.
 */
export async function buscarNaChave7({ bairro = "", teto = 0, quartos = 0, tipo = "",
                                       cidade = CIDADE_PADRAO, quantas = 6 } = {}) {
  if (!chave7Ligada()) return [];

  const filtro = {
    city: { name: cidade },
    price: { min: 0, max: teto ? Math.round(teto * 1.05) : 17500000 },
    neighborhoods: bairro ? [bairro] : null,
    bedrooms: quartos || null,
    finality: "SALE",
  };

  const corpo = {
    operationName: "GetPropertiesV2",
    variables: { filter: filtro, orderBy: { field: "CREATED_AT", value: "DESC" },
                 take: Math.min(30, quantas * 4), isFirstPageSearch: true },
    query: CONSULTA,
  };

  const desiste = AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": CHAVE, accept: "*/*" },
      body: JSON.stringify(corpo),
      signal: desiste,
    });
    if (!r.ok) {
      console.error("  Chave7: a busca respondeu " + r.status +
        (r.status === 401 ? " — a chave do .env não foi aceita" : ""));
      return [];
    }
    const j = await r.json();
    if (j.errors?.length) { console.error("  Chave7: " + j.errors[0].message); return []; }

    return (j.data?.propertiesV2?.results || [])
      .map((p) => ({
        codigo: String(p.code || ""),
        tipo: traduzirTipo(p.types?.[0]?.type),
        bairro: p.neighborhood || "",
        cidade: p.city || cidade,
        preco: Number(p.price || 0),
        quartos: Number(p.bedrooms || 0),
        suites: Number(p.suites || 0),
        vagas: Number(p.garage || 0),
        area: Number(p.usefulArea || p.landArea || 0),
        foto: p.coverPhotoUrl || "",
        descricao: "",
        origem: "chave7",
      }))
      .filter((m) => m.codigo && (!tipo || m.tipo === tipo))
      .slice(0, quantas);
  } catch (e) {
    console.error("  Chave7: não consegui buscar — " + e.message);
    return [];
  }
}
