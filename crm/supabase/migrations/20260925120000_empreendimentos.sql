-- Empreendimentos (os books das construtoras) no Royal CRM.
-- Roda uma vez no SQL Editor. Segue o mesmo padrão das outras tabelas:
-- tudo preso à empresa de quem está logado, RLS ligada, admin escreve.
begin;

create table if not exists crm.empreendimentos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default crm.minha_empresa() references crm.empresas on delete cascade,
  nome          text not null,
  construtora   text not null default '',
  bairro        text not null default '',
  endereco      text not null default '',
  situacao      text not null default '',
  tipologias    text not null default '',
  lazer         text not null default '',
  localizacao   text not null default '',
  diferenciais  text not null default '',
  observacoes   text not null default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

create index if not exists empreendimentos_empresa on crm.empreendimentos (empresa_id, nome);

alter table crm.empreendimentos enable row level security;

drop policy if exists empreendimentos_ler on crm.empreendimentos;
create policy empreendimentos_ler on crm.empreendimentos for select to authenticated
  using (empresa_id = (select crm.minha_empresa()));

drop policy if exists empreendimentos_admin on crm.empreendimentos;
create policy empreendimentos_admin on crm.empreendimentos for all to authenticated
  using (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin','gerente')))
  with check (empresa_id = (select crm.minha_empresa()) and (select crm.sou('admin','gerente')));

grant select, insert, update, delete on crm.empreendimentos to authenticated;

commit;
