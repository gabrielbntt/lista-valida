-- Fase 2: funcoes de suporte (security definer) usadas pelas Edge
-- Functions autenticadas. Todas fazem sua propria checagem de
-- autorizacao internamente, porque as tabelas que escrevem (profiles,
-- email_outbox) nao tem policy de write para o client comum.

-- admin_list_users: profiles nao guarda e-mail (fica em auth.users, que
-- o client nao enxerga). Junta as duas para a tela Users.tsx.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  role text,
  sender_name text,
  sender_email text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email, p.role, p.sender_name, p.sender_email, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;

-- set_user_role: unico caminho de escrita em profiles.role (equivalente a
-- protect_fields.js restaurando o role quando quem edita nao e admin).
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;
  if p_role not in ('user', 'admin') then
    raise exception 'papel invalido';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

-- update_own_profile: auto-edicao de sender_name/sender_email
-- (AccountSettings.tsx). Restrita ao proprio usuario via auth.uid().
create or replace function public.update_own_profile(p_sender_name text, p_sender_email text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  update public.profiles
  set sender_name = p_sender_name, sender_email = p_sender_email
  where id = auth.uid()
  returning * into v_profile;
  return v_profile;
end;
$$;

-- queue_campaign_send: substitui o envio sincrono de send_campaign.js.
-- Seleciona destinatarios (mesmo evento/owner da campanha, respeitando os
-- filtros de rsvp/priority/category), exclui bloqueados e insere em
-- email_outbox + marca a campanha como 'sending' numa unica transacao.
-- O envio de fato acontece depois, no drain do pg_cron (fase 3).
create or replace function public.queue_campaign_send(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.email_campaigns;
  v_queued int;
  v_ignored_blocked int;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campanha nao encontrada';
  end if;
  if v_campaign.owner_id <> auth.uid() and not public.is_admin() then
    raise exception 'acesso negado a esta campanha';
  end if;
  if v_campaign.status = 'sending' then
    raise exception 'campanha ja esta em processo de envio';
  end if;

  with eligible as (
    select
      c.id as contact_id,
      exists (
        select 1 from public.blocked_contacts b
        where b.owner_id = v_campaign.owner_id and lower(b.email) = lower(c.email)
      ) as blocked
    from public.mailing_contacts c
    where c.owner_id = v_campaign.owner_id
      and c.event_id = v_campaign.event_id
      and (coalesce(v_campaign.filter_rsvp, 'todos') = 'todos' or c.rsvp = v_campaign.filter_rsvp)
      and (coalesce(v_campaign.filter_priority, 'todas') = 'todas' or c.priority = v_campaign.filter_priority)
      and (coalesce(v_campaign.filter_category, 'todas') = 'todas' or c.role_category = v_campaign.filter_category)
  ),
  inserted as (
    insert into public.email_outbox (owner_id, campaign_id, contact_id)
    select v_campaign.owner_id, p_campaign_id, contact_id from eligible where not blocked
    returning 1
  )
  select
    (select count(*) from inserted),
    (select count(*) from eligible where blocked)
  into v_queued, v_ignored_blocked;

  if v_queued > 0 then
    update public.email_campaigns set status = 'sending' where id = p_campaign_id;
  end if;

  return jsonb_build_object('queued', v_queued, 'ignored_blocked', v_ignored_blocked);
end;
$$;

-- requeue_campaign_failures: substitui retry_failures.js. Reseta as
-- linhas 'failed' da campanha em email_outbox para 'pending' (o proximo
-- tick do pg_cron reprocessa), excluindo quem foi bloqueado nesse meio
-- tempo (mesma checagem de bloqueio que o hook original fazia no retry).
create or replace function public.requeue_campaign_failures(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_requeued int;
  v_ignored_blocked int;
begin
  select owner_id into v_owner from public.email_campaigns where id = p_campaign_id;
  if v_owner is null then
    raise exception 'campanha nao encontrada';
  end if;
  if v_owner <> auth.uid() and not public.is_admin() then
    raise exception 'acesso negado a esta campanha';
  end if;

  with candidates as (
    select o.id, mc.email
    from public.email_outbox o
    join public.mailing_contacts mc on mc.id = o.contact_id
    where o.campaign_id = p_campaign_id and o.status = 'failed'
  ),
  blocked as (
    select c.id from candidates c
    where exists (
      select 1 from public.blocked_contacts b
      where b.owner_id = v_owner and lower(b.email) = lower(c.email)
    )
  ),
  requeued as (
    update public.email_outbox
    set status = 'pending', attempt_count = 0, next_attempt_at = now(), last_error = null
    where id in (select id from candidates)
      and id not in (select id from blocked)
    returning 1
  )
  select
    (select count(*) from requeued),
    (select count(*) from blocked)
  into v_requeued, v_ignored_blocked;

  if v_requeued > 0 then
    update public.email_campaigns set status = 'sending' where id = p_campaign_id;
  end if;

  return jsonb_build_object('requeued', v_requeued, 'ignored_blocked', v_ignored_blocked);
end;
$$;
