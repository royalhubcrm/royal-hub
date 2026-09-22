-- ============================================================================
-- OPCIONAL — retomada automática de clientes parados
--
-- Uma vez por hora (em dia útil, das 9h às 19h), a função "whatsapp" procura
-- conversas em que o cliente sumiu há 2 dias e manda UMA mensagem de retomada
-- (no máximo 2 por cliente; quem pediu "não perturbe" nunca recebe).
--
-- Antes de rodar:
--   1. Database → Extensions: ligue "pg_cron" e "pg_net".
--   2. Troque SEU-PROJETO pelo endereço do seu projeto e SEGREDO pelo mesmo
--      valor que você colocou em CRON_SECRET (npx supabase secrets set CRON_SECRET=...).
-- Para desligar depois:  select cron.unschedule('royal-retomadas');
-- ============================================================================
select cron.schedule(
  'royal-retomadas',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU-PROJETO.supabase.co/functions/v1/whatsapp',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', 'SEGREDO'),
    body    := jsonb_build_object('acao', 'retomadas')
  );
  $$
);
