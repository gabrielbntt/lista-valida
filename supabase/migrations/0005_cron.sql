-- Fase 3: drain automatico da fila de envio (email_outbox).
--
-- Agenda a Edge Function send-email para rodar a cada minuto. Ela pega os
-- pendentes da fila e envia via Resend.
--
-- ANTES DE RODAR:
--   1. Escolha um valor aleatorio qualquer para o segredo interno (ele so
--      serve para impedir que terceiros disparem o envio - nao e nenhuma
--      chave existente do Supabase nem do Resend).
--   2. Cadastre esse valor em Edge Functions -> Secrets, com o nome
--      INTERNAL_SECRET, e faca o redeploy da function send-email.
--   3. Troque COLOQUE_O_SEGREDO_AQUI abaixo pelo mesmo valor.
--
-- O segredo fica gravado em cron.job.command, tabela legivel apenas por
-- superusuario - por isso nao usamos o Vault aqui: ele adicionava um
-- segundo lugar para o valor divergir, que era a causa mais comum de a
-- fila ficar parada com 401.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove um agendamento anterior, se existir, para poder rodar de novo
-- sem erro de nome duplicado.
select cron.unschedule('outbox-drain')
where exists (select 1 from cron.job where jobname = 'outbox-drain');

select cron.schedule(
  'outbox-drain',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://bqjzyebbhboocytigacx.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'COLOQUE_O_SEGREDO_AQUI'
    ),
    body := jsonb_build_object('batch_size', 10)
  );
  $$
);

-- Conferencia: lista o agendamento criado.
select jobid, jobname, schedule, active from cron.job where jobname = 'outbox-drain';
