-- Royal Hub CRM — o que a assistente descobre sobre o cliente, em formato de dados
-- (rode depois dos anteriores, no SQL Editor)

-- Campos estruturados que a assistente vai preenchendo na conversa
-- (nome, idade, regiao, teto, quartos, tipo, finalidade, pagamento, prazo, familia, preferencias).
-- Base para relatórios: interesse por região, casa × apartamento, faixa de preço, idade…
alter table crm.leads
  add column if not exists perfil jsonb not null default '{}'::jsonb;

create index if not exists leads_perfil on crm.leads using gin (perfil);
