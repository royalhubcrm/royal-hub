-- ============================================================================
-- Royal Hub CRM — banco completo (rode UMA vez no SQL Editor do Supabase)
--
-- Tudo fica no schema "crm", separado do "public" que o servidor Node antigo
-- usa. Os dois convivem sem um apagar o outro.
--
-- Depois de rodar:
--   1. Project Settings → Data API → Exposed schemas → adicione "crm".
--   2. Authentication → Sign In / Providers → desligue "Allow new users to sign up"
--      (quem cria contas é o administrador, pela tela Equipe).
--
-- Se você já tinha rodado a primeira versão deste arquivo (só leads e etapas),
-- rode antes:  drop schema crm cascade;
--
-- Como a segurança funciona, em uma frase: cada pessoa tem um perfil ligado a
-- UMA empresa, e toda tabela só mostra as linhas da empresa de quem está logado.
-- Dentro da empresa, corretor vê os leads dele (e os sem dono), gerente vê os
-- da equipe e administrador vê tudo.
-- ============================================================================
begin;

create schema if not exists crm;
grant usage on schema crm to anon, authenticated, service_role;

-- ============================================================================
-- 1. EMPRESAS E PESSOAS
-- ============================================================================
create table crm.empresas (
  id            uuid        primary key default gen_random_uuid(),
  nome          text        not null check (length(btrim(nome)) > 1),
  -- usado nos links públicos: /captar/<slug>
  slug          text        not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  ativa         boolean     not null default true,
  criado_em     timestamptz not null default now()
);

create table crm.equipes (
  id          uuid        primary key default gen_random_uuid(),
  empresa_id  uuid        not null references crm.empresas on delete cascade,
  nome        text        not null check (length(btrim(nome)) > 0),
  gerente_id  uuid,
  criado_em   timestamptz not null default now()
);

-- Um perfil por login do Supabase Auth.
create table crm.perfis (
  id             uuid        primary key references auth.users on delete cascade,
  empresa_id     uuid        not null references crm.empresas on delete cascade,
  nome           text        not null default '',
  email          text        not null default '',
  telefone       text        not null default '',
  papel          text        not null default 'corretor'
                             check (papel in ('admin', 'gerente', 'corretor', 'assistente')),
  equipe_id      uuid        references crm.equipes on delete set null,
  ativo          boolean     not null default true,
  -- dono da plataforma: cria e bloqueia empresas (tela Empresas)
  dono           boolean     not null default false,
  criado_em      timestamptz not null default now(),
  ultimo_acesso  timestamptz
);

alter table crm.equipes
  add constraint equipes_gerente_fk foreign key (gerente_id) references crm.perfis on delete set null;

create index perfis_empresa on crm.perfis (empresa_id);
create index perfis_equipe  on crm.perfis (equipe_id);

-- ---------------------------------------------------------------------------
-- Funções que o RLS usa. "security definer" para lerem crm.perfis sem cair
-- no próprio RLS (senão viraria um laço).
-- ---------------------------------------------------------------------------
create or replace function crm.minha_empresa() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.empresa_id
  from crm.perfis p join crm.empresas e on e.id = p.empresa_id
  where p.id = auth.uid() and p.ativo and e.ativa
$$;

alter table crm.equipes alter column empresa_id set default crm.minha_empresa();

create or replace function crm.meu_papel() returns text
language sql stable security definer set search_path = '' as $$
  select p.papel from crm.perfis p where p.id = auth.uid() and p.ativo
$$;

create or replace function crm.sou_dono() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.dono from crm.perfis p where p.id = auth.uid() and p.ativo), false)
$$;

create or replace function crm.sou(variadic papeis text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(crm.meu_papel() = any (papeis), false)
$$;

-- De quem são os leads que eu enxergo: eu mesmo e, se sou gerente, a minha equipe.
create or replace function crm.pessoas_visiveis() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case
    when crm.meu_papel() = 'gerente' then array(
      select distinct p.id from crm.perfis p
      where p.id = auth.uid()
         or p.equipe_id in (
              select e.id from crm.equipes e where e.gerente_id = auth.uid()
              union
              select eu.equipe_id from crm.perfis eu where eu.id = auth.uid() and eu.equipe_id is not null))
    else array[auth.uid()]
  end
$$;

-- A regra de visibilidade inteira num lugar só.
create or replace function crm.vejo(responsavel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select crm.meu_papel() = 'admin'
      or responsavel is null
      or responsavel = any (crm.pessoas_visiveis())
$$;

-- ---------------------------------------------------------------------------
-- Telefone: guardamos só dígitos, sempre com 55 na frente.
-- A "chave" ignora o nono dígito — o WhatsApp às vezes manda 55 34 9999-0000
-- sem o 9. Sem isso, a mesma pessoa virava dois leads.
-- ---------------------------------------------------------------------------
create or replace function crm.telefone_normal(t text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d = '' then null
    when length(d) in (10, 11) then '55' || d
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

create or replace function crm.telefone_chave(t text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d is null then null
    when d like '55%' and length(d) in (12, 13) then substr(d, 1, 4) || right(d, 8)
    else d
  end
  from (select crm.telefone_normal(t) as d) x
$$;

create or replace function crm.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create or replace function crm.slugificar(t text) returns text
language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(
    lower(translate(coalesce(t, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
    '[^a-z0-9]+', '-', 'g')), 40)
$$;

-- ============================================================================
-- 2. CONFIGURAÇÃO DA EMPRESA (tela Ajustes)
-- ============================================================================
create table crm.config (
  empresa_id      uuid primary key references crm.empresas on delete cascade,
  corretor        text    not null default '',
  creci           text    not null default '',
  whats           text    not null default '',
  endereco        text    not null default '',
  cidade          text    not null default 'Uberlândia',
  -- a assistente virtual do WhatsApp
  assistente      text    not null default 'Camila',
  estilo          text    not null default '',
  fatos           text    not null default
    'Primeiro imóvel tem 50% de desconto na documentação — é o único desconto que existe.' || chr(10) ||
    'Renda informal ou autônomo: consegue sim; o corretor é especialista em formalizar renda (6 meses de extrato ou contracheque).' || chr(10) ||
    'Aprovação de crédito: o corretor resolve; nunca prometa aprovação.' || chr(10) ||
    'Entrada, renda necessária, parcela, prazo e custas: só no atendimento presencial.',
  bot_ligado      boolean not null default false,
  bot_modo        text    not null default 'novos' check (bot_modo in ('anuncio', 'novos', 'todos')),
  bot_hora_inicio time,
  bot_hora_fim    time,
  bot_numeros     text    not null default '',
  -- WhatsApp oficial (Cloud API). O token fica em crm.config_segredos.
  wa_numero_id    text    not null default '',
  wa_verificacao  text    not null default left(replace(gen_random_uuid()::text, '-', ''), 12),
  wa_configurado  boolean not null default false,
  atualizado_em   timestamptz not null default now()
);

-- Ninguém do navegador lê isto; só as Edge Functions (service_role).
create table crm.config_segredos (
  empresa_id    uuid primary key references crm.empresas on delete cascade,
  wa_token      text not null default '',
  -- senha do webhook de leads (Make, Zapier, n8n)
  webhook_token text not null default replace(gen_random_uuid()::text, '-', '')
);

create trigger config_atualizado_em before update on crm.config
  for each row execute function crm.tocar_atualizado_em();

-- toda empresa nova já nasce com a sua configuração
create or replace function crm.empresa_nova() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into crm.config (empresa_id) values (new.id);
  insert into crm.config_segredos (empresa_id) values (new.id);
  return new;
end $$;

create trigger empresas_config after insert on crm.empresas
  for each row execute function crm.empresa_nova();

-- ============================================================================
-- 3. PIPELINE E LEADS
-- ============================================================================
create table crm.etapas_pipeline (
  id            smallint    generated always as identity primary key,
  slug          text        not null unique check (slug ~ '^[a-z0-9_]+$'),
  nome          text        not null,
  ordem         smallint    not null,
  cor           text        not null default '#64748B' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  probabilidade smallint    not null default 0 check (probabilidade between 0 and 100),
  tipo          text        not null default 'aberta' check (tipo in ('aberta', 'ganha', 'perdida')),
  ativa         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  constraint etapas_ordem_unica unique (ordem) deferrable initially deferred
);

insert into crm.etapas_pipeline (slug, nome, ordem, cor, probabilidade, tipo) values
  ('novo',     'Novo',       1, '#64748B',  10, 'aberta'),
  ('contato',  'Em contato', 2, '#3B6EA5',  20, 'aberta'),
  ('visita',   'Visita',     3, '#2F5D8C',  40, 'aberta'),
  ('proposta', 'Proposta',   4, '#1E3A5F',  70, 'aberta'),
  ('fechado',  'Fechado',    5, '#2E7D5B', 100, 'ganha'),
  ('perdido',  'Perdido',    6, '#9B3B3B',   0, 'perdida');

create table crm.leads (
  id              uuid          primary key default gen_random_uuid(),
  empresa_id      uuid          not null default crm.minha_empresa()
                                references crm.empresas on delete cascade,
  nome            text          not null check (length(btrim(nome)) > 0),
  empresa         text,         -- empresa do cliente (quando é PJ)
  email           text          check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone        text          check (telefone is null or telefone ~ '^\d{10,15}$'),
  status          text          not null default 'novo'
                                references crm.etapas_pipeline (slug) on update cascade,
  temperatura     text          not null default 'morno' check (temperatura in ('quente', 'morno', 'frio')),
  valor_estimado  numeric(14,2) not null default 0 check (valor_estimado >= 0),
  origem          text          not null default 'Manual',
  campanha        text          not null default '',
  interesse       text          not null default '',
  obs             text          not null default '',
  -- códigos dos imóveis apresentados
  imoveis         text[]        not null default '{}',
  responsavel_id  uuid          references crm.perfis on delete set null,
  posicao         double precision not null default extract(epoch from now()),
  data_criacao    timestamptz   not null default now(),
  atualizado_em   timestamptz   not null default now()
);

create unique index leads_telefone_unico on crm.leads (empresa_id, crm.telefone_chave(telefone))
  where telefone is not null;
create index leads_kanban      on crm.leads (empresa_id, status, posicao);
create index leads_recentes    on crm.leads (empresa_id, data_criacao desc);
create index leads_responsavel on crm.leads (responsavel_id);

-- Linha do tempo do lead: anotações e o que o sistema registrou sozinho.
create table crm.historico (
  id          bigint      generated always as identity primary key,
  empresa_id  uuid        not null default crm.minha_empresa() references crm.empresas on delete cascade,
  lead_id     uuid        not null references crm.leads on delete cascade,
  texto       text        not null check (length(btrim(texto)) > 0),
  autor_id    uuid        default auth.uid() references crm.perfis on delete set null,
  criado_em   timestamptz not null default now()
);
create index historico_lead on crm.historico (lead_id, criado_em desc);

create or replace function crm.leads_antes() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.telefone := crm.telefone_normal(new.telefone);
  new.email := nullif(btrim(new.email), '');
  new.nome := btrim(new.nome);
  if tg_op = 'UPDATE' then new.atualizado_em := now(); end if;
  return new;
end $$;

create trigger leads_antes before insert or update on crm.leads
  for each row execute function crm.leads_antes();

-- O histórico se escreve sozinho: criação, mudança de etapa e de responsável.
create or replace function crm.leads_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  de_nome text; para_nome text;
begin
  if tg_op = 'INSERT' then
    insert into crm.historico (empresa_id, lead_id, texto)
    values (new.empresa_id, new.id, 'Lead criado (' || coalesce(nullif(new.origem, ''), 'manual') || ')');
    return new;
  end if;

  if new.status is distinct from old.status then
    select nome into de_nome   from crm.etapas_pipeline where slug = old.status;
    select nome into para_nome from crm.etapas_pipeline where slug = new.status;
    insert into crm.historico (empresa_id, lead_id, texto)
    values (new.empresa_id, new.id, 'Etapa: ' || de_nome || ' → ' || para_nome);
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    insert into crm.historico (empresa_id, lead_id, texto)
    values (new.empresa_id, new.id, 'Responsável: ' || coalesce(
      (select nome from crm.perfis where id = new.responsavel_id), 'ninguém'));
    -- a conversa do WhatsApp daquele telefone segue o mesmo dono
    update crm.conversas c set responsavel_id = new.responsavel_id
    where c.empresa_id = new.empresa_id
      and crm.telefone_chave(c.telefone) = crm.telefone_chave(new.telefone)
      and c.responsavel_id is distinct from new.responsavel_id;
  end if;
  return new;
end $$;

-- ============================================================================
-- 4. IMÓVEIS
-- ============================================================================
create table crm.imoveis (
  id            uuid          primary key default gen_random_uuid(),
  empresa_id    uuid          not null default crm.minha_empresa() references crm.empresas on delete cascade,
  codigo        text          not null check (length(btrim(codigo)) > 0),
  tipo          text          not null default 'Casa',
  finalidade    text          not null default 'venda' check (finalidade in ('venda', 'aluguel')),
  status        text          not null default 'disponivel'
                              check (status in ('disponivel', 'reservado', 'vendido', 'inativo')),
  cep           text          not null default '',
  rua           text          not null default '',
  numero        text          not null default '',
  bairro        text          not null default '',
  cidade        text          not null default 'Uberlândia',
  preco         numeric(14,2) not null default 0 check (preco >= 0),
  condominio    numeric(10,2) not null default 0 check (condominio >= 0),
  iptu          numeric(10,2) not null default 0 check (iptu >= 0),
  quartos       smallint      not null default 0 check (quartos >= 0),
  suites        smallint      not null default 0 check (suites >= 0),
  banheiros     smallint      not null default 0 check (banheiros >= 0),
  vagas         smallint      not null default 0 check (vagas >= 0),
  area          numeric(10,2) not null default 0 check (area >= 0),
  descricao     text          not null default '',
  -- endereços das fotos; a primeira é a capa
  fotos         text[]        not null default '{}',
  link          text          not null default '',
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now(),
  unique (empresa_id, codigo)
);
create index imoveis_busca on crm.imoveis (empresa_id, status, bairro, tipo);

create trigger imoveis_atualizado_em before update on crm.imoveis
  for each row execute function crm.tocar_atualizado_em();

-- ============================================================================
-- 5. WHATSAPP, AGENDA E GERÊNCIA
-- ============================================================================
create table crm.conversas (
  id              uuid        primary key default gen_random_uuid(),
  empresa_id      uuid        not null references crm.empresas on delete cascade,
  telefone        text        not null check (telefone ~ '^\d{10,15}$'),
  nome            text        not null default '',
  lead_id         uuid        references crm.leads on delete set null,
  responsavel_id  uuid        references crm.perfis on delete set null,
  bot_ativo       boolean     not null default true,
  -- quando você responde, o bot recua até esta hora
  pausado_ate     timestamptz,
  nao_perturbe    boolean     not null default false,
  ultima          text        not null default '',
  nao_lidas       int         not null default 0,
  retomadas       int         not null default 0,
  ultima_retomada timestamptz,
  atualizado_em   timestamptz not null default now()
);
create unique index conversas_telefone on crm.conversas (empresa_id, crm.telefone_chave(telefone));
create index conversas_recentes on crm.conversas (empresa_id, atualizado_em desc);

create table crm.mensagens (
  id          bigint      generated always as identity primary key,
  empresa_id  uuid        not null references crm.empresas on delete cascade,
  conversa_id uuid        not null references crm.conversas on delete cascade,
  de          text        not null check (de in ('cliente', 'bot', 'voce')),
  texto       text        not null,
  autor_id    uuid        references crm.perfis on delete set null,
  criado_em   timestamptz not null default now()
);
create index mensagens_conversa on crm.mensagens (conversa_id, id);

create table crm.agendamentos (
  id           uuid        primary key default gen_random_uuid(),
  empresa_id   uuid        not null default crm.minha_empresa() references crm.empresas on delete cascade,
  conversa_id  uuid        references crm.conversas on delete set null,
  lead_id      uuid        references crm.leads on delete set null,
  nome         text        not null default '',
  telefone     text        not null default '',
  data         date,
  hora         time,
  local        text        not null default '',
  como         text        not null default '',
  imovel       text        not null default '',
  marcado_por  text        not null default 'assistente',
  status       text        not null default 'marcado'
                           check (status in ('marcado', 'compareceu', 'faltou', 'cancelado')),
  criado_em    timestamptz not null default now()
);
create index agendamentos_data on crm.agendamentos (empresa_id, data, hora);

create table crm.interesses (
  id          bigint      generated always as identity primary key,
  empresa_id  uuid        not null references crm.empresas on delete cascade,
  conversa_id uuid        references crm.conversas on delete cascade,
  lead_id     uuid        references crm.leads on delete cascade,
  codigo      text        not null,
  origem      text        not null default 'conversa',
  criado_em   timestamptz not null default now()
);
create index interesses_empresa on crm.interesses (empresa_id, criado_em desc);

-- Perguntas que a assistente não soube responder e deixou para o corretor.
create table crm.duvidas (
  id          uuid        primary key default gen_random_uuid(),
  empresa_id  uuid        not null references crm.empresas on delete cascade,
  conversa_id uuid        references crm.conversas on delete set null,
  lead_id     uuid        references crm.leads on delete set null,
  nome        text        not null default '',
  pergunta    text        not null,
  resposta    text        not null default '',
  status      text        not null default 'aberta' check (status in ('aberta', 'respondida')),
  criado_em   timestamptz not null default now()
);

-- quem enxerga uma conversa ou um lead (usado pelas tabelas "filhas")
create or replace function crm.vejo_conversa(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select cid is null or exists (
    select 1 from crm.conversas c
    where c.id = cid and c.empresa_id = crm.minha_empresa() and crm.vejo(c.responsavel_id))
$$;

create or replace function crm.vejo_lead(lid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select lid is null or exists (
    select 1 from crm.leads l
    where l.id = lid and l.empresa_id = crm.minha_empresa() and crm.vejo(l.responsavel_id))
$$;

-- a recíproca: mudou o dono da conversa, muda o dono do lead
create or replace function crm.conversas_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.responsavel_id is distinct from old.responsavel_id then
    update crm.leads l set responsavel_id = new.responsavel_id
    where l.empresa_id = new.empresa_id
      and crm.telefone_chave(l.telefone) = crm.telefone_chave(new.telefone)
      and l.responsavel_id is distinct from new.responsavel_id;
  end if;
  return new;
end $$;

create trigger conversas_depois after update on crm.conversas
  for each row execute function crm.conversas_depois();

create trigger leads_depois after insert or update on crm.leads
  for each row execute function crm.leads_depois();

-- ============================================================================
-- 6. SITES DOS CLIENTES
-- ============================================================================
create table crm.sites (
  id            uuid        primary key default gen_random_uuid(),
  empresa_id    uuid        not null default crm.minha_empresa() references crm.empresas on delete cascade,
  slug          text        not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome          text        not null default '',
  titulo        text        not null default '',
  subtitulo     text        not null default '',
  sobre         text        not null default '',
  cor           text        not null default '#1E3A5F' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  fundo         text        not null default 'claro' check (fundo in ('claro', 'escuro')),
  fonte         text        not null default 'moderna' check (fonte in ('moderna', 'classica')),
  whats         text        not null default '',
  email         text        not null default '',
  endereco      text        not null default '',
  creci         text        not null default '',
  -- quais imóveis aparecem: {"tipos":["Casa"],"cidade":"Uberlândia","precoMax":600000}
  filtro        jsonb       not null default '{}',
  dominio       text        not null default '',
  publicado     boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger sites_atualizado_em before update on crm.sites
  for each row execute function crm.tocar_atualizado_em();

-- ============================================================================
-- 7. VIEWS (security_invoker: respeitam o RLS de quem consulta)
-- ============================================================================
create view crm.resumo_pipeline with (security_invoker = true) as
select e.id, e.slug, e.nome, e.ordem, e.cor, e.tipo, e.probabilidade,
       count(l.id)::int                                             as quantidade,
       coalesce(sum(l.valor_estimado), 0)                           as valor_total,
       coalesce(sum(l.valor_estimado * e.probabilidade / 100.0), 0) as valor_ponderado
from crm.etapas_pipeline e
left join crm.leads l on l.status = e.slug
where e.ativa
group by e.id
order by e.ordem;

-- lista de conversas com quem falou por último
create view crm.conversas_lista with (security_invoker = true) as
select c.*,
       (select m.de from crm.mensagens m where m.conversa_id = c.id order by m.id desc limit 1) as ultimo_de,
       r.nome as responsavel_nome
from crm.conversas c
left join crm.perfis r on r.id = c.responsavel_id;

create view crm.interesses_detalhe with (security_invoker = true) as
select i.*, m.tipo, m.bairro, m.preco,
       coalesce(nullif(c.nome, ''), l.nome, c.telefone) as cliente
from crm.interesses i
left join crm.imoveis   m on m.empresa_id = i.empresa_id and m.codigo = i.codigo
left join crm.conversas c on c.id = i.conversa_id
left join crm.leads     l on l.id = i.lead_id;

-- ============================================================================
-- 8. SEGURANÇA (RLS)
-- ============================================================================
alter table crm.empresas        enable row level security;
alter table crm.equipes         enable row level security;
alter table crm.perfis          enable row level security;
alter table crm.config          enable row level security;
alter table crm.config_segredos enable row level security;
alter table crm.etapas_pipeline enable row level security;
alter table crm.leads           enable row level security;
alter table crm.historico       enable row level security;
alter table crm.imoveis         enable row level security;
alter table crm.conversas       enable row level security;
alter table crm.mensagens       enable row level security;
alter table crm.agendamentos    enable row level security;
alter table crm.interesses      enable row level security;
alter table crm.duvidas         enable row level security;
alter table crm.sites           enable row level security;

-- empresas: cada um vê a sua; o dono da plataforma vê e muda todas
create policy empresas_ler on crm.empresas for select to authenticated
  using (id = (select crm.minha_empresa()) or (select crm.sou_dono()));
create policy empresas_editar on crm.empresas for update to authenticated
  using ((select crm.sou_dono()) or (id = (select crm.minha_empresa()) and (select crm.sou('admin'))))
  with check ((select crm.sou_dono()) or (id = (select crm.minha_empresa()) and ativa));

-- pessoas e equipes: todos da empresa se enxergam; só o admin muda
create policy perfis_ler on crm.perfis for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) or id = auth.uid());
create policy perfis_editar on crm.perfis for update to authenticated
  using (empresa_id = (select crm.minha_empresa()) and ((select crm.sou('admin')) or id = auth.uid()))
  with check (empresa_id = (select crm.minha_empresa()));

-- quem não é admin só pode mudar o próprio nome e telefone
create or replace function crm.perfis_protege() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if new.empresa_id is distinct from old.empresa_id or new.dono is distinct from old.dono then
    raise exception 'Não é possível mudar a empresa nem o dono por aqui.';
  end if;
  if not crm.sou('admin') and (new.papel is distinct from old.papel
      or new.equipe_id is distinct from old.equipe_id or new.ativo is distinct from old.ativo
      or new.email is distinct from old.email) then
    raise exception 'Só o administrador muda perfil, equipe e acesso.';
  end if;
  if new.id = auth.uid() and (not new.ativo or new.papel <> old.papel) then
    raise exception 'Você não pode desativar nem rebaixar a sua própria conta.';
  end if;
  return new;
end $$;

create trigger perfis_protege before update on crm.perfis
  for each row execute function crm.perfis_protege();

create policy equipes_ler on crm.equipes for select to authenticated
  using (empresa_id = (select crm.minha_empresa()));
create policy equipes_admin on crm.equipes for all to authenticated
  using (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin')))
  with check (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin')));

create policy config_ler on crm.config for select to authenticated
  using (empresa_id = (select crm.minha_empresa()));
create policy config_admin on crm.config for update to authenticated
  using (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin')))
  with check (empresa_id = (select crm.minha_empresa()));
-- crm.config_segredos: sem política nenhuma = ninguém do navegador lê nem grava.

create policy etapas_ler on crm.etapas_pipeline for select to authenticated using (true);

-- leads: a regra de visibilidade (crm.vejo) vale para ler e mexer
create policy leads_ler on crm.leads for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo(responsavel_id));
create policy leads_criar on crm.leads for insert to authenticated
  with check (empresa_id = (select crm.minha_empresa()));
create policy leads_editar on crm.leads for update to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo(responsavel_id))
  with check (empresa_id = (select crm.minha_empresa()));
create policy leads_apagar on crm.leads for delete to authenticated
  using (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin', 'gerente')));

create policy historico_ler on crm.historico for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo_lead(lead_id));
create policy historico_criar on crm.historico for insert to authenticated
  with check (empresa_id = (select crm.minha_empresa()) and crm.vejo_lead(lead_id) and autor_id = auth.uid());

-- imóveis: todos da empresa veem; assistente não cadastra
create policy imoveis_ler on crm.imoveis for select to authenticated
  using (empresa_id = (select crm.minha_empresa()));
create policy imoveis_mexer on crm.imoveis for all to authenticated
  using (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin', 'gerente', 'corretor')))
  with check (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin', 'gerente', 'corretor')));

-- conversas chegam pelo WhatsApp (Edge Function); no painel só se lê e ajusta
create policy conversas_ler on crm.conversas for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo(responsavel_id));
create policy conversas_editar on crm.conversas for update to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo(responsavel_id))
  with check (empresa_id = (select crm.minha_empresa()));

create policy mensagens_ler on crm.mensagens for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo_conversa(conversa_id));

create policy agendamentos_ler on crm.agendamentos for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo_conversa(conversa_id) and crm.vejo_lead(lead_id));
create policy agendamentos_criar on crm.agendamentos for insert to authenticated
  with check (empresa_id = (select crm.minha_empresa()));
create policy agendamentos_editar on crm.agendamentos for update to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo_conversa(conversa_id) and crm.vejo_lead(lead_id))
  with check (empresa_id = (select crm.minha_empresa()));

create policy interesses_ler on crm.interesses for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo_conversa(conversa_id) and crm.vejo_lead(lead_id));

create policy duvidas_ler on crm.duvidas for select to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo_conversa(conversa_id));
create policy duvidas_responder on crm.duvidas for update to authenticated
  using (empresa_id = (select crm.minha_empresa()) and crm.vejo_conversa(conversa_id))
  with check (empresa_id = (select crm.minha_empresa()));

create policy sites_admin on crm.sites for all to authenticated
  using (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin')))
  with check (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin')));

-- ============================================================================
-- 9. FUNÇÕES QUE O PAINEL CHAMA (RPC)
-- ============================================================================

-- Primeiro acesso: só funciona enquanto não existe empresa nenhuma.
-- Quem entra primeiro vira administrador e dono da plataforma.
create or replace function crm.primeiro_acesso(p_empresa text, p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  nova uuid;
begin
  if auth.uid() is null then raise exception 'Entre com o seu e-mail primeiro.'; end if;
  if exists (select 1 from crm.empresas) then
    raise exception 'O sistema já foi configurado. Peça acesso ao administrador.';
  end if;
  insert into crm.empresas (nome, slug)
  values (btrim(p_empresa), coalesce(nullif(crm.slugificar(p_empresa), ''), 'empresa'))
  returning id into nova;
  insert into crm.perfis (id, empresa_id, nome, email, papel, dono)
  values (auth.uid(), nova, btrim(p_nome), coalesce(auth.jwt() ->> 'email', ''), 'admin', true);
  return nova;
end $$;

-- o painel pergunta: o sistema já tem empresa? (para mostrar ou não o primeiro acesso)
create or replace function crm.sistema_configurado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.empresas)
$$;

create or replace function crm.registrar_acesso() returns void
language sql security definer set search_path = '' as $$
  update crm.perfis set ultimo_acesso = now() where id = auth.uid()
$$;

-- Os números do Dashboard, calculados no banco (respeitando o RLS de quem pede).
create or replace function crm.painel() returns json
language sql stable security invoker set search_path = '' as $$
  with l as (
    select l.*, e.tipo as etapa_tipo
    from crm.leads l join crm.etapas_pipeline e on e.slug = l.status
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select json_build_object(
    'total',      (select count(*) from l),
    'no_mes',     (select count(*) from l, hoje
                   where date_trunc('month', l.data_criacao at time zone 'America/Sao_Paulo') = date_trunc('month', hoje.d)),
    'quentes',    (select count(*) from l where temperatura = 'quente' and etapa_tipo = 'aberta'),
    'abertos',    (select count(*) from l where etapa_tipo = 'aberta'),
    'fechados',   (select count(*) from l where etapa_tipo = 'ganha'),
    'em_aberto',  (select coalesce(sum(valor_estimado), 0) from l where etapa_tipo = 'aberta'),
    'imoveis',    (select count(*) from crm.imoveis where status = 'disponivel'),
    'vgv',        (select coalesce(sum(preco), 0) from crm.imoveis where status = 'disponivel'),
    'agenda_hoje',(select count(*) from crm.agendamentos a, hoje where a.data = hoje.d and a.status = 'marcado'),
    'duvidas',    (select count(*) from crm.duvidas where status = 'aberta'),
    'serie', (
      select json_agg(json_build_object('dia', g.dia, 'n', (
        select count(*) from l where (l.data_criacao at time zone 'America/Sao_Paulo')::date = g.dia)) order by g.dia)
      from hoje, generate_series(0, 13) as n(i), lateral (select hoje.d - 13 + n.i as dia) g),
    'recentes', (
      select coalesce(json_agg(r), '[]') from (
        select id, nome, temperatura, interesse, origem, status, data_criacao
        from l order by data_criacao desc limit 7) r),
    'procurados', (
      select coalesce(json_agg(p), '[]') from (
        select c.codigo, count(*)::int as n, m.tipo, m.bairro
        from (select unnest(imoveis) as codigo from l
              union all select codigo from crm.interesses) c
        left join crm.imoveis m on m.codigo = c.codigo
        group by c.codigo, m.tipo, m.bairro
        order by n desc limit 5) p)
  )
$$;

-- Salva as chaves do WhatsApp oficial. O token vai para a tabela secreta.
create or replace function crm.salvar_whatsapp(p_numero_id text, p_token text, p_verificacao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  emp uuid := crm.minha_empresa();
begin
  if emp is null or not crm.sou('admin') then raise exception 'Só o administrador muda o WhatsApp.'; end if;
  if nullif(btrim(p_token), '') is not null then
    update crm.config_segredos set wa_token = btrim(p_token) where empresa_id = emp;
  end if;
  update crm.config set
    wa_numero_id   = regexp_replace(coalesce(p_numero_id, ''), '\D', '', 'g'),
    wa_verificacao = coalesce(nullif(btrim(p_verificacao), ''), wa_verificacao),
    wa_configurado = regexp_replace(coalesce(p_numero_id, ''), '\D', '', 'g') <> ''
                     and (select s.wa_token <> '' from crm.config_segredos s where s.empresa_id = emp)
  where empresa_id = emp;
end $$;

-- Senha do webhook de leads: o admin vê e pode trocar (a antiga para de valer).
create or replace function crm.token_webhook(p_trocar boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.sou('admin') then raise exception 'Só o administrador vê o token.'; end if;
  if p_trocar then
    update crm.config_segredos set webhook_token = replace(gen_random_uuid()::text, '-', '')
    where empresa_id = crm.minha_empresa();
  end if;
  return (select webhook_token from crm.config_segredos where empresa_id = crm.minha_empresa());
end $$;

-- ============================================================================
-- 10. ENTRADA DE LEADS DE FORA (formulário público, webhook, WhatsApp)
--     Uma função só: se o telefone já existe, não duplica — anota no histórico.
-- ============================================================================
create or replace function crm.entrada_lead(
  p_empresa uuid, p_nome text, p_telefone text, p_email text default '',
  p_interesse text default '', p_campanha text default '', p_origem text default 'Formulário')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  achado uuid;
  tel text := crm.telefone_normal(p_telefone);
  mail text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if nullif(btrim(coalesce(p_nome, '')), '') is null and tel is null then
    raise exception 'Lead sem nome e sem telefone.';
  end if;
  if mail is not null and mail !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then mail := null; end if;

  if tel is not null then
    select id into achado from crm.leads
    where empresa_id = p_empresa and crm.telefone_chave(telefone) = crm.telefone_chave(tel);
  end if;

  if achado is not null then
    update crm.leads set
      interesse = case when interesse = '' then left(coalesce(p_interesse, ''), 500) else interesse end,
      email     = coalesce(email, mail)
    where id = achado;
    insert into crm.historico (empresa_id, lead_id, texto, autor_id)
    values (p_empresa, achado, 'Voltou a entrar em contato (' || p_origem ||
      case when coalesce(p_campanha, '') <> '' then ' — ' || p_campanha else '' end || ')', null);
    return achado;
  end if;

  insert into crm.leads (empresa_id, nome, telefone, email, interesse, campanha, origem)
  values (p_empresa, left(coalesce(nullif(btrim(p_nome), ''), tel), 120), tel, mail,
          left(coalesce(p_interesse, ''), 500), left(coalesce(p_campanha, ''), 120), p_origem)
  returning id into achado;
  return achado;
end $$;

-- ============================================================================
-- 11. PÁGINAS PÚBLICAS (sem login): formulário, imóvel e site
-- ============================================================================
create or replace function crm.empresa_publica(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('nome', e.nome, 'slug', e.slug, 'whats', c.whats, 'corretor', c.corretor)
  from crm.empresas e join crm.config c on c.empresa_id = e.id
  where e.slug = p_slug and e.ativa
$$;

create or replace function crm.captar_lead(
  p_empresa text, p_nome text, p_telefone text, p_email text default '',
  p_interesse text default '', p_campanha text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  emp uuid;
begin
  select id into emp from crm.empresas where slug = p_empresa and ativa;
  if emp is null then raise exception 'Formulário indisponível.'; end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 then raise exception 'Preencha o seu nome.'; end if;
  if length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Confira o WhatsApp com DDD.';
  end if;
  perform crm.entrada_lead(emp, left(p_nome, 120), p_telefone, left(p_email, 160),
                           left(p_interesse, 500), left(p_campanha, 120), 'Formulário');
  return true;
end $$;

create or replace function crm.imovel_publico(p_id uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', m.id, 'codigo', m.codigo, 'tipo', m.tipo, 'finalidade', m.finalidade,
    'bairro', m.bairro, 'cidade', m.cidade, 'preco', m.preco, 'condominio', m.condominio,
    'iptu', m.iptu, 'quartos', m.quartos, 'suites', m.suites, 'banheiros', m.banheiros,
    'vagas', m.vagas, 'area', m.area, 'descricao', m.descricao, 'fotos', m.fotos,
    'empresa', e.nome, 'empresa_slug', e.slug, 'whats', c.whats, 'corretor', c.corretor, 'creci', c.creci)
  from crm.imoveis m
  join crm.empresas e on e.id = m.empresa_id and e.ativa
  join crm.config c on c.empresa_id = m.empresa_id
  where m.id = p_id and m.status = 'disponivel'
$$;

create or replace function crm.site_publico(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'site', to_jsonb(s) - 'empresa_id' - 'filtro',
    'imoveis', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'codigo', m.codigo, 'tipo', m.tipo, 'bairro', m.bairro, 'cidade', m.cidade,
        'preco', m.preco, 'quartos', m.quartos, 'suites', m.suites, 'vagas', m.vagas,
        'area', m.area, 'foto', m.fotos[1], 'finalidade', m.finalidade) order by m.preco)
      from crm.imoveis m
      where m.empresa_id = s.empresa_id and m.status = 'disponivel'
        and (coalesce(jsonb_array_length(s.filtro -> 'tipos'), 0) = 0
             or m.tipo in (select jsonb_array_elements_text(s.filtro -> 'tipos')))
        and (coalesce(s.filtro ->> 'cidade', '') = '' or m.cidade ilike s.filtro ->> 'cidade')
        and (coalesce((s.filtro ->> 'precoMax')::numeric, 0) = 0 or m.preco <= (s.filtro ->> 'precoMax')::numeric)
    ), '[]'))
  from crm.sites s join crm.empresas e on e.id = s.empresa_id and e.ativa
  where s.slug = p_slug and s.publicado
$$;

-- ============================================================================
-- 12. FOTOS (Supabase Storage): bucket público, cada empresa na sua pasta
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('imoveis', 'imoveis', true)
on conflict (id) do nothing;

create policy "fotos: empresa envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'imoveis' and (storage.foldername(name))[1] = crm.minha_empresa()::text);
create policy "fotos: empresa troca" on storage.objects for update to authenticated
  using (bucket_id = 'imoveis' and (storage.foldername(name))[1] = crm.minha_empresa()::text);
create policy "fotos: empresa apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'imoveis' and (storage.foldername(name))[1] = crm.minha_empresa()::text);

-- ============================================================================
-- 13. PERMISSÕES
-- ============================================================================
grant select on all tables in schema crm to authenticated;
grant insert, update, delete on crm.leads, crm.imoveis, crm.equipes, crm.sites to authenticated;
grant insert on crm.historico, crm.agendamentos to authenticated;
grant update on crm.perfis, crm.config, crm.empresas, crm.conversas, crm.agendamentos, crm.duvidas to authenticated;
revoke all on crm.config_segredos from authenticated, anon;
grant all on all tables in schema crm to service_role;
grant usage on all sequences in schema crm to authenticated, service_role;

-- funções: por padrão ninguém de fora chama; liberamos uma a uma
revoke execute on all functions in schema crm from public, anon;
grant execute on all functions in schema crm to authenticated, service_role;
revoke execute on function crm.entrada_lead(uuid, text, text, text, text, text, text) from authenticated;
grant execute on function crm.empresa_publica(text)  to anon;
grant execute on function crm.captar_lead(text, text, text, text, text, text) to anon;
grant execute on function crm.imovel_publico(uuid)   to anon;
grant execute on function crm.site_publico(text)     to anon;
grant execute on function crm.sistema_configurado()  to anon;

-- ============================================================================
-- 14. TEMPO REAL: o painel se atualiza sozinho quando algo muda
-- ============================================================================
alter publication supabase_realtime add table crm.leads, crm.conversas, crm.mensagens;

commit;
