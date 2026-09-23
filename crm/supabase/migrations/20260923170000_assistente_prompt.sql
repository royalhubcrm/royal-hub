-- Royal Hub CRM — prompt e modelo da assistente editáveis pela tela
-- (rode depois do 20260922120000_crm_inicial.sql, também no SQL Editor)

alter table crm.config
  -- texto do "manual" da assistente; vazio = usa o padrão do sistema
  add column if not exists prompt_base text not null default '',
  -- quem responde primeiro: auto (Groq → Claude → Gemini), ou um deles
  add column if not exists ia_provedor text not null default 'auto'
    check (ia_provedor in ('auto', 'groq', 'gemini', 'anthropic')),
  -- nome do modelo do provedor escolhido; vazio = padrão do sistema
  add column if not exists ia_modelo text not null default '';
