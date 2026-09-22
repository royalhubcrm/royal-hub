// Feed XML para ZAP, Viva Real e OLX (padrão VRSync do Grupo OLX).
//   GET .../functions/v1/feed-portais?empresa=<slug>
// O portal lê este endereço de hora em hora: imóvel novo aparece, vendido some.
import { admin, configDa, empresaPorSlug, responder } from '../_shared/comum.ts';

const EXIGE = { fotos: 5, tituloMin: 10, tituloMax: 100, descricao: 50 };

const TIPOS: Record<string, string> = {
  'Casa': 'Residential / Home', 'Sobrado': 'Residential / Sobrado', 'Apartamento': 'Residential / Apartment',
  'Duplex': 'Residential / Apartment', 'Studio': 'Residential / Studio', 'Kitnet': 'Residential / Kitnet',
  'Flat': 'Residential / Flat', 'Cobertura': 'Residential / Penthouse', 'Lote/Terreno': 'Residential / Land Lot',
  'Chácara': 'Residential / Farm Ranch', 'Sítio': 'Residential / Farm Ranch', 'Fazenda': 'Residential / Agricultural',
  'Ponto comercial': 'Commercial / Business', 'Sala comercial': 'Commercial / Office', 'Galpão': 'Commercial / Industrial',
};
const tipoPortal = (t: string) => TIPOS[t] ?? 'Residential / Home';
const x = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const cdata = (t: unknown) => '<![CDATA[' + String(t ?? '').replace(/\]\]>/g, ']]&gt;') + ']]>';
const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`;

function titulo(m: any) {
  let t = `${m.tipo} ${m.quartos ? 'com ' + plural(m.quartos, 'quarto') + ' ' : ''}no ${m.bairro || m.cidade}`.replace(/\s+/g, ' ').trim();
  if (t.length < EXIGE.tituloMin) t += ` — ${m.cidade}`;
  return t.slice(0, EXIGE.tituloMax);
}

/** Descrição curta é completada só com o que existe na ficha — nada inventado. */
function descricao(m: any) {
  if ((m.descricao ?? '').trim().length >= EXIGE.descricao) return m.descricao.trim();
  const itens = [m.quartos && plural(m.quartos, 'quarto'), m.suites && plural(m.suites, 'suíte'),
    m.banheiros && plural(m.banheiros, 'banheiro'), m.vagas && plural(m.vagas, 'vaga') + ' de garagem', m.area && `${m.area} m² de área`].filter(Boolean);
  return [`${m.tipo} ${m.finalidade === 'aluguel' ? 'para alugar' : 'à venda'} no bairro ${m.bairro}, em ${m.cidade}.`,
    itens.length ? 'O imóvel tem ' + itens.join(', ') + '.' : '', (m.descricao ?? '').trim(),
    `Código do imóvel: ${m.codigo}. Agende sua visita.`].filter(Boolean).join(' ');
}

const pronto = (m: any) => m.fotos.length >= EXIGE.fotos && /^\d{8}$/.test(m.cep ?? '') && m.preco > 0 && m.bairro &&
  (m.area > 0 || /Land Lot/.test(tipoPortal(m.tipo)));

Deno.serve(responder(async (req) => {
  const url = new URL(req.url);
  const db = admin();
  const empresa = await empresaPorSlug(db, url.searchParams.get('empresa'));
  if (!empresa) return new Response('Empresa não encontrada', { status: 404 });

  const cfg = await configDa(db, empresa.id);
  const { data: dono } = await db.from('perfis').select('email').eq('empresa_id', empresa.id).eq('papel', 'admin').limit(1).maybeSingle();
  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
  const { data } = await db.from('imoveis').select('*').eq('empresa_id', empresa.id).eq('status', 'disponivel').limit(5000);
  const publicados = (data ?? []).filter(pronto);
  const contato = { nome: cfg.corretor || empresa.nome, email: dono?.email ?? '', telefone: cfg.whats ?? '', creci: cfg.creci ?? '' };

  const anuncios = publicados.map((m: any) => {
    const aluguel = m.finalidade === 'aluguel';
    return `    <Listing>
      <ListingID>${x(m.codigo)}</ListingID>
      <Title>${x(titulo(m))}</Title>
      <TransactionType>${aluguel ? 'For Rent' : 'For Sale'}</TransactionType>
      ${site ? `<DetailViewUrl>${x(site + '/imovel/' + m.id)}</DetailViewUrl>` : ''}
      <Media>
${m.fotos.slice(0, 20).map((f: string, i: number) => `        <Item medium="image"${i === 0 ? ' primary="true"' : ''} caption="${x(titulo(m))}">${x(f)}</Item>`).join('\n')}
      </Media>
      <Details>
        <PropertyType>${tipoPortal(m.tipo)}</PropertyType>
        <Description>${cdata(descricao(m))}</Description>
        ${aluguel ? `<RentalPrice currency="BRL" period="Monthly">${Math.round(m.preco)}</RentalPrice>` : `<ListPrice currency="BRL">${Math.round(m.preco)}</ListPrice>`}
        ${m.condominio ? `<PropertyAdministrationFee currency="BRL">${Math.round(m.condominio)}</PropertyAdministrationFee>` : ''}
        ${m.iptu ? `<Iptu currency="BRL" period="Yearly">${Math.round(m.iptu)}</Iptu>` : ''}
        <LivingArea unit="square metres">${Math.round(m.area || 0)}</LivingArea>
        <Bedrooms>${m.quartos || 0}</Bedrooms>
        <Bathrooms>${m.banheiros || m.suites || 1}</Bathrooms>
        <Suites>${m.suites || 0}</Suites>
        <Garage>${m.vagas || 0}</Garage>
      </Details>
      <Location displayAddress="Neighborhood">
        <Country abbreviation="BR">Brasil</Country>
        <State abbreviation="MG">Minas Gerais</State>
        <City>${x(m.cidade)}</City>
        <Neighborhood>${x(m.bairro)}</Neighborhood>
        ${m.rua ? `<Address>${x(m.rua)}</Address>` : ''}
        ${m.numero ? `<StreetNumber>${x(m.numero)}</StreetNumber>` : ''}
        <PostalCode>${x(m.cep)}</PostalCode>
      </Location>
      <ContactInfo>
        <Name>${x(contato.nome)}</Name>
        <Email>${x(contato.email)}</Email>
        ${contato.telefone ? `<Telephone>${x(contato.telefone)}</Telephone>` : ''}
      </ContactInfo>
    </Listing>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">
  <Header>
    <Provider>${x(empresa.nome)}</Provider>
    <Email>${x(contato.email)}</Email>
    <ContactName>${x(contato.nome)}</ContactName>
    <PublishDate>${new Date().toISOString().slice(0, 19)}</PublishDate>
    ${contato.telefone ? `<Telephone>${x(contato.telefone)}</Telephone>` : ''}
  </Header>
  <Listings>
${anuncios}
  </Listings>
</ListingDataFeed>
`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}));
