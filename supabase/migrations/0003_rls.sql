-- Fase 1: RLS. Ver docs/migration-supabase.md secao 8 para os dois pontos
-- onde o desenho abaixo se afasta do texto literal do briefing (with check
-- do update, e imutabilidade de owner_id via trigger em vez de RLS pura).

create or replace function public.protect_owner_id()
returns trigger
language plpgsql
as $$
begin
  new.owner_id = old.owner_id;
  return new;
end;
$$;

-- profiles ---------------------------------------------------------------
-- Sem policy de insert/update/delete: todo write passa por
-- handle_new_user() (trigger) ou por funcoes security definer futuras
-- (set_user_role, update_own_profile - fase 6).

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- Tabelas owner-scoped: events, mailing_contacts, email_templates,
-- email_campaigns, blocked_contacts. Mesmo padrao de 4 policies + trigger
-- de imutabilidade de owner_id nas 5.

alter table public.events enable row level security;

create policy events_select on public.events
  for select using (auth.uid() = owner_id or public.is_admin());
create policy events_insert on public.events
  for insert with check (auth.uid() = owner_id);
create policy events_update on public.events
  for update
  using (auth.uid() = owner_id or public.is_admin())
  with check (auth.uid() = owner_id or public.is_admin());
create policy events_delete on public.events
  for delete using (auth.uid() = owner_id or public.is_admin());

create trigger protect_owner_id
  before update on public.events
  for each row execute function public.protect_owner_id();

alter table public.mailing_contacts enable row level security;

create policy mailing_contacts_select on public.mailing_contacts
  for select using (auth.uid() = owner_id or public.is_admin());
create policy mailing_contacts_insert on public.mailing_contacts
  for insert with check (auth.uid() = owner_id);
create policy mailing_contacts_update on public.mailing_contacts
  for update
  using (auth.uid() = owner_id or public.is_admin())
  with check (auth.uid() = owner_id or public.is_admin());
create policy mailing_contacts_delete on public.mailing_contacts
  for delete using (auth.uid() = owner_id or public.is_admin());

create trigger protect_owner_id
  before update on public.mailing_contacts
  for each row execute function public.protect_owner_id();

alter table public.email_templates enable row level security;

create policy email_templates_select on public.email_templates
  for select using (auth.uid() = owner_id or public.is_admin());
create policy email_templates_insert on public.email_templates
  for insert with check (auth.uid() = owner_id);
create policy email_templates_update on public.email_templates
  for update
  using (auth.uid() = owner_id or public.is_admin())
  with check (auth.uid() = owner_id or public.is_admin());
create policy email_templates_delete on public.email_templates
  for delete using (auth.uid() = owner_id or public.is_admin());

create trigger protect_owner_id
  before update on public.email_templates
  for each row execute function public.protect_owner_id();

alter table public.email_campaigns enable row level security;

create policy email_campaigns_select on public.email_campaigns
  for select using (auth.uid() = owner_id or public.is_admin());
create policy email_campaigns_insert on public.email_campaigns
  for insert with check (auth.uid() = owner_id);
create policy email_campaigns_update on public.email_campaigns
  for update
  using (auth.uid() = owner_id or public.is_admin())
  with check (auth.uid() = owner_id or public.is_admin());
create policy email_campaigns_delete on public.email_campaigns
  for delete using (auth.uid() = owner_id or public.is_admin());

create trigger protect_owner_id
  before update on public.email_campaigns
  for each row execute function public.protect_owner_id();

alter table public.blocked_contacts enable row level security;

create policy blocked_contacts_select on public.blocked_contacts
  for select using (auth.uid() = owner_id or public.is_admin());
create policy blocked_contacts_insert on public.blocked_contacts
  for insert with check (auth.uid() = owner_id);
create policy blocked_contacts_update on public.blocked_contacts
  for update
  using (auth.uid() = owner_id or public.is_admin())
  with check (auth.uid() = owner_id or public.is_admin());
create policy blocked_contacts_delete on public.blocked_contacts
  for delete using (auth.uid() = owner_id or public.is_admin());

create trigger protect_owner_id
  before update on public.blocked_contacts
  for each row execute function public.protect_owner_id();

-- email_logs: somente leitura para o client. Escrita so via service_role
-- nas Edge Functions (send-campaign, send-email, track-click, track-open,
-- unsubscribe-confirm), que ignora RLS por padrao.

alter table public.email_logs enable row level security;

create policy email_logs_select on public.email_logs
  for select using (auth.uid() = owner_id or public.is_admin());

-- email_outbox: sem nenhuma policy - fila 100% interna, so service_role
-- acessa (bypassa RLS). RLS habilitada aqui so garante que nenhum acesso
-- futuro do client passe por acidente.

alter table public.email_outbox enable row level security;
