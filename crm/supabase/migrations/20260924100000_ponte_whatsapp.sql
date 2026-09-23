-- WhatsApp por QR code (ponte): a empresa escolhe o canal, o painel/retomadas
-- enfileiram o que a ponte deve entregar, e a ponte avisa quando passou por aqui.
alter table crm.config
  add column if not exists wa_canal text not null default 'oficial' check (wa_canal in ('oficial', 'ponte')),
  add column if not exists ponte_visto_em timestamptz;

create table if not exists crm.fila_whatsapp (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null references crm.empresas(id) on delete cascade,
  conversa_id uuid references crm.conversas(id) on delete cascade,
  telefone    text not null,
  tipo        text not null default 'texto' check (tipo in ('texto', 'imagem')),
  texto       text not null default '',
  link        text,
  criado_em   timestamptz not null default now(),
  enviado_em  timestamptz
);
create index if not exists fila_whatsapp_pendente on crm.fila_whatsapp (empresa_id, id) where enviado_em is null;

-- sem política nenhuma: só o servidor (service_role) lê e grava
alter table crm.fila_whatsapp enable row level security;
