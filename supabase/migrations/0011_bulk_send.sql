-- queue_bulk_send: envio de e-mail para uma selecao arbitraria de
-- contatos (nao filtrada por evento/rsvp/prioridade como
-- queue_campaign_send) usando um modelo escolhido na hora. Cria uma
-- campanha automatica (rastreabilidade/relatorios reaproveitam a mesma
-- infra) e enfileira em email_outbox, igual ao fluxo normal de campanha -
-- o envio de fato acontece no drain do pg_cron (send-email).
create or replace function public.queue_bulk_send(
  p_contact_ids uuid[],
  p_template_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_template public.email_templates;
  v_campaign_id uuid;
  v_queued int;
  v_ignored_blocked int;
begin
  if v_owner is null then
    raise exception 'nao autenticado';
  end if;

  -- Teto no tamanho do lote: email_outbox e drenado por um cron global
  -- (10 por minuto), entao um array gigante de um unico tenant travaria a
  -- fila de todos os outros.
  if coalesce(array_length(p_contact_ids, 1), 0) > 5000 then
    raise exception 'selecao muito grande: maximo de 5000 contatos por envio';
  end if;

  select * into v_template from public.email_templates
  where id = p_template_id and (owner_id = v_owner or public.is_admin());
  if not found then
    raise exception 'modelo nao encontrado';
  end if;

  -- p_event_id vai direto para email_campaigns.event_id: sem esta
  -- checagem, daria para criar uma campanha apontando para o evento de
  -- outro tenant.
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and (e.owner_id = v_owner or public.is_admin())
  ) then
    raise exception 'evento nao encontrado';
  end if;

  insert into public.email_campaigns (
    owner_id, event_id, template_id, name, subject, body,
    sender_name, sender_email, status
  ) values (
    v_owner, p_event_id, p_template_id,
    'Envio manual - ' || v_template.name || ' - ' || to_char(now(), 'DD/MM/YYYY HH24:MI'),
    v_template.subject, v_template.body,
    v_template.sender_name, v_template.sender_email, 'draft'
  )
  returning id into v_campaign_id;

  with eligible as (
    select
      c.id as contact_id,
      exists (
        select 1 from public.blocked_contacts b
        where b.owner_id = v_owner and lower(b.email) = lower(c.email)
      ) as blocked
    from public.mailing_contacts c
    where c.id = any(p_contact_ids)
      and (c.owner_id = v_owner or public.is_admin())
  ),
  inserted as (
    insert into public.email_outbox (owner_id, campaign_id, contact_id)
    select v_owner, v_campaign_id, contact_id from eligible where not blocked
    returning 1
  )
  select
    (select count(*) from inserted),
    (select count(*) from eligible where blocked)
  into v_queued, v_ignored_blocked;

  if v_queued > 0 then
    update public.email_campaigns set status = 'sending' where id = v_campaign_id;
  end if;

  return jsonb_build_object(
    'campaign_id', v_campaign_id,
    'queued', v_queued,
    'ignored_blocked', v_ignored_blocked
  );
end;
$$;
