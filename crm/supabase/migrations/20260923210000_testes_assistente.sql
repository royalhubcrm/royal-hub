-- Royal Hub CRM — diálogos de teste da assistente salvos com anotações
-- (rode depois dos anteriores, no SQL Editor)

create table crm.testes_assistente (
  id           uuid        primary key default gen_random_uuid(),
  empresa_id   uuid        not null default crm.minha_empresa() references crm.empresas on delete cascade,
  autor_id     uuid        references crm.perfis on delete set null default auth.uid(),
  titulo       text        not null default '',
  provedor     text        not null default '',   -- quem respondeu (groq/gemini/...) ou vazio = automático
  modelo       text        not null default '',
  -- o prompt em vigor na hora do teste (vazio = padrão do sistema), para saber o que estava valendo
  prompt_base  text        not null default '',
  falas        jsonb       not null default '[]'::jsonb,   -- [{papel, texto, provedor, ms, acoes}]
  ficha        jsonb       not null default '{}'::jsonb,   -- {perfil, imoveis, duvidas, agendamento}
  nota         smallint    check (nota between 1 and 5),
  pros         text        not null default '',
  contras      text        not null default '',
  melhoria     text        not null default '',   -- o que mudar no prompt
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index testes_assistente_empresa on crm.testes_assistente (empresa_id, criado_em desc);

create trigger testes_assistente_atualizado_em before update on crm.testes_assistente
  for each row execute function crm.tocar_atualizado_em();

alter table crm.testes_assistente enable row level security;
-- quem está na empresa lê e grava; só admin/gerente ou o próprio autor apaga
create policy testes_ler on crm.testes_assistente for select to authenticated
  using (empresa_id = (select crm.minha_empresa()));
create policy testes_gravar on crm.testes_assistente for insert to authenticated
  with check (empresa_id = (select crm.minha_empresa()));
create policy testes_editar on crm.testes_assistente for update to authenticated
  using (empresa_id = (select crm.minha_empresa()))
  with check (empresa_id = (select crm.minha_empresa()));
create policy testes_apagar on crm.testes_assistente for delete to authenticated
  using (empresa_id = (select crm.minha_empresa()) and (autor_id = auth.uid() or (select crm.sou('admin', 'gerente'))));

grant select, insert, update, delete on crm.testes_assistente to authenticated;
grant all on crm.testes_assistente to service_role;
