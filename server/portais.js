// Feed XML para os portais (ZAP, Viva Real, OLX — todos do Grupo OLX usam o
// mesmo formato, o VRSync).
//
// O portal não recebe imóvel: ele BUSCA. A gente publica um endereço fixo, tipo
//   https://seusistema.com/feed/203566/zap.xml
// e cadastra esse endereço no painel do portal. De hora em hora eles leem o
// arquivo e atualizam tudo: imóvel novo aparece, imóvel vendido some, preço
// muda sozinho. Você mexe só no seu sistema.
//
// Formato conferido na documentação do Grupo OLX:
// https://developers.grupozap.com/feeds/vrsync/

/* ---------- o que os portais exigem de cada anúncio ---------- */
export const EXIGENCIAS = {
  fotos: 5,           // mínimo de imagens por anúncio
  descricao: 50,      // mínimo de caracteres na descrição
  tituloMin: 10,
  tituloMax: 100,
};

// nosso tipo -> o nome que o portal entende
const TIPOS = {
  "Casa": "Residential / Home",
  "Sobrado": "Residential / Sobrado",
  "Apartamento": "Residential / Apartment",
  "Duplex": "Residential / Apartment",
  "Studio": "Residential / Studio",
  "Kitnet": "Residential / Kitnet",
  "Flat": "Residential / Flat",
  "Cobertura": "Residential / Penthouse",
  "Jardim": "Residential / Home",
  "Lote/Terreno": "Residential / Land Lot",
  "Chácara": "Residential / Farm Ranch",
  "Sítio": "Residential / Farm Ranch",
  "Fazenda": "Residential / Agricultural",
  "Ponto comercial": "Commercial / Business",
  "Sala comercial": "Commercial / Office",
  "Galpão": "Commercial / Industrial",
};

export const tipoDoPortal = (tipo) => TIPOS[tipo] || "Residential / Home";

const escapar = (t) => String(t ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const cdata = (t) => "<![CDATA[" + String(t ?? "").replace(/\]\]>/g, "]]&gt;") + "]]>";

/* ---------- fotos e descrição ---------- */
export function fotosDoImovel(m, base = "") {
  let lista = [];
  try { lista = JSON.parse(m.fotos || "[]"); } catch { lista = []; }
  if (m.foto && !lista.includes(m.foto)) lista = [m.foto, ...lista];
  return lista
    .filter(Boolean)
    .map((f) => (/^https?:/i.test(f) ? f : base.replace(/\/+$/, "") + f));
}

// Descrição montada só com o que existe na ficha — nada inventado.
export function descricaoDoImovel(m) {
  if (m.descricao && m.descricao.trim().length >= EXIGENCIAS.descricao) return m.descricao.trim();

  const partes = [`${m.tipo || "Imóvel"} à venda no bairro ${m.bairro || ""}, em ${m.cidade || "Uberlândia"}.`];
  const itens = [];
  if (m.quartos) itens.push(`${m.quartos} quarto${m.quartos > 1 ? "s" : ""}`);
  if (m.suites) itens.push(`${m.suites} suíte${m.suites > 1 ? "s" : ""}`);
  if (m.banheiros) itens.push(`${m.banheiros} banheiro${m.banheiros > 1 ? "s" : ""}`);
  if (m.vagas) itens.push(`${m.vagas} vaga${m.vagas > 1 ? "s" : ""} de garagem`);
  if (m.area) itens.push(`${m.area} m² de área`);
  if (itens.length) partes.push("O imóvel tem " + itens.join(", ") + ".");
  if (m.descricao) partes.push(m.descricao.trim());
  partes.push(`Código do imóvel: ${m.codigo}. Agende sua visita e fale com nosso corretor.`);
  return partes.join(" ");
}

export function tituloDoImovel(m) {
  let t = `${m.tipo || "Imóvel"} ${m.quartos ? "com " + m.quartos + " quarto" + (m.quartos > 1 ? "s" : "") + " " : ""}`
    + `no ${m.bairro || m.cidade || ""}`;
  t = t.replace(/\s+/g, " ").trim();
  if (t.length < EXIGENCIAS.tituloMin) t = `${t} — ${m.cidade || "Uberlândia"}`;
  return t.slice(0, EXIGENCIAS.tituloMax);
}

/* ---------- o que ainda falta em cada anúncio ---------- */
export function faltaParaOPortal(m, base = "") {
  const falta = [];
  const fotos = fotosDoImovel(m, base);
  if (fotos.length < EXIGENCIAS.fotos) falta.push(`${EXIGENCIAS.fotos - fotos.length} foto(s)`);
  if (!m.cep) falta.push("CEP");
  if (!m.preco) falta.push("preço");
  if (!m.bairro) falta.push("bairro");
  if (!m.area && !/Land Lot/.test(tipoDoPortal(m.tipo))) falta.push("área");
  return falta;
}

export const prontoParaOPortal = (m, base = "") => faltaParaOPortal(m, base).length === 0;

/* ---------- o arquivo XML ---------- */
export function feedVRSync({ imoveis, empresa, config, base, contato }) {
  const agora = new Date().toISOString().slice(0, 19);
  const publicados = imoveis.filter((m) => prontoParaOPortal(m, base));

  const anuncios = publicados.map((m) => {
    const fotos = fotosDoImovel(m, base);
    const aluguel = m.finalidade === "aluguel";
    const transacao = aluguel ? "For Rent" : "For Sale";
    const preco = aluguel
      ? `<RentalPrice currency="BRL" period="Monthly">${m.preco}</RentalPrice>`
      : `<ListPrice currency="BRL">${m.preco}</ListPrice>`;

    return `    <Listing>
      <ListingID>${escapar(m.codigo)}</ListingID>
      <Title>${escapar(tituloDoImovel(m))}</Title>
      <TransactionType>${transacao}</TransactionType>
      <DetailViewUrl>${escapar(base + "/imovel/" + m.codigo)}</DetailViewUrl>
      <Media>
${fotos.slice(0, 20).map((f, i) =>
  `        <Item medium="image"${i === 0 ? ' primary="true"' : ""} caption="${escapar(tituloDoImovel(m))}">${escapar(f)}</Item>`).join("\n")}
      </Media>
      <Details>
        <PropertyType>${tipoDoPortal(m.tipo)}</PropertyType>
        <Description>${cdata(descricaoDoImovel(m))}</Description>
        ${preco}
        ${m.condominio ? `<PropertyAdministrationFee currency="BRL">${m.condominio}</PropertyAdministrationFee>` : ""}
        ${m.iptu ? `<Iptu currency="BRL" period="Yearly">${m.iptu}</Iptu>` : ""}
        <LivingArea unit="square metres">${m.area || 0}</LivingArea>
        <Bedrooms>${m.quartos || 0}</Bedrooms>
        <Bathrooms>${m.banheiros || m.suites || 1}</Bathrooms>
        <Suites>${m.suites || 0}</Suites>
        <Garage>${m.vagas || 0}</Garage>
      </Details>
      <Location displayAddress="Neighborhood">
        <Country abbreviation="BR">Brasil</Country>
        <State abbreviation="MG">Minas Gerais</State>
        <City>${escapar(m.cidade || "Uberlândia")}</City>
        <Neighborhood>${escapar(m.bairro)}</Neighborhood>
        ${m.rua ? `<Address>${escapar(m.rua)}</Address>` : ""}
        ${m.numero ? `<StreetNumber>${escapar(m.numero)}</StreetNumber>` : ""}
        <PostalCode>${escapar(m.cep)}</PostalCode>
      </Location>
      <ContactInfo>
        <Name>${escapar(contato.nome)}</Name>
        <Email>${escapar(contato.email)}</Email>
        ${contato.telefone ? `<Telephone>${escapar(contato.telefone)}</Telephone>` : ""}
        ${contato.creci ? `<Creci>${escapar(contato.creci)}</Creci>` : ""}
      </ContactInfo>
    </Listing>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">
  <Header>
    <Provider>${escapar(empresa?.nome || config.empresa || "Royal Hub")}</Provider>
    <Email>${escapar(contato.email)}</Email>
    <ContactName>${escapar(contato.nome)}</ContactName>
    <PublishDate>${agora}</PublishDate>
    ${contato.telefone ? `<Telephone>${escapar(contato.telefone)}</Telephone>` : ""}
  </Header>
  <Listings>
${anuncios}
  </Listings>
</ListingDataFeed>
`;
  return { xml, publicados: publicados.length, total: imoveis.length };
}
