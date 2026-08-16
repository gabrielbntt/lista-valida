-- Fase 1: schema base. Espelha pocketbase/migrations/0001-0009, com os
-- ajustes documentados em docs/migration-supabase.md (secao 1).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles -------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  sender_name text,
  sender_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- events -----------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  event_date date,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_events_owner_created on public.events (owner_id, created_at desc);

create trigger set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- mailing_contacts ---------------------------------------------------------

create table public.mailing_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  company text,
  raw_role text,
  rsvp text check (rsvp in ('Aguardando', 'Confirmou', 'Recusou')),
  has_degree text check (has_degree in ('Sim', 'Não')),
  classification_status text check (
    classification_status in ('Pendente', 'Classificado', 'Revisado')
  ),
  role_category text check (
    role_category in (
      'C-Level', 'Diretoria', 'Gerência', 'Coordenação', 'Analista',
      'Assistente/Auxiliar', 'Estagiário', 'Consultor/Autônomo', 'Outro'
    )
  ),
  priority text check (priority in ('Alta', 'Média', 'Baixa')),
  interests text[] not null default '{}',
  demands text[] not null default '{}',
  profile_summary text,
  suggested_message text,
  notes text,
  last_classified_at timestamptz,
  -- embedding vector(1536), -- fase 2: busca semantica, requer extensao "vector"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_contacts_owner_created on public.mailing_contacts (owner_id, created_at desc);
create index idx_contacts_owner_event on public.mailing_contacts (owner_id, event_id, created_at desc);
create index idx_contacts_email_trgm on public.mailing_contacts using gin (email gin_trgm_ops);
create index idx_contacts_name_trgm on public.mailing_contacts using gin (name gin_trgm_ops);

create trigger set_updated_at
  before update on public.mailing_contacts
  for each row execute function public.set_updated_at();

-- email_templates ----------------------------------------------------------

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text check (
    category in (
      'RSVP', 'Envio de Certificado', 'Convite', 'Pitch',
      'Convite para Comunidade Exclusiva'
    )
  ),
  sender_name text,
  sender_email text,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_templates_owner_created on public.email_templates (owner_id, created_at desc);

create trigger set_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

-- email_campaigns ------------------------------------------------------------

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  template_id uuid references public.email_templates (id) on delete set null,
  name text not null,
  subject text not null,
  body text not null,
  sender_name text,
  sender_email text,
  status text not null default 'draft' check (
    status in ('draft', 'sending', 'sent', 'partially_failed')
  ),
  filter_rsvp text default 'todos',
  filter_priority text default 'todas',
  filter_category text default 'todas',
  total_sent int not null default 0,
  total_failed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_campaigns_owner_created on public.email_campaigns (owner_id, created_at desc);
create index idx_campaigns_owner_event on public.email_campaigns (owner_id, event_id, created_at desc);
create index idx_campaigns_owner_status on public.email_campaigns (owner_id, status, created_at desc);

create trigger set_updated_at
  before update on public.email_campaigns
  for each row execute function public.set_updated_at();

-- email_logs -------------------------------------------------------------

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid references public.email_campaigns (id) on delete set null,
  contact_id uuid references public.mailing_contacts (id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  subject text,
  body text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  click_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_logs_owner_created on public.email_logs (owner_id, created_at desc);
create index idx_logs_owner_campaign on public.email_logs (owner_id, campaign_id, created_at desc);

create trigger set_updated_at
  before update on public.email_logs
  for each row execute function public.set_updated_at();

-- blocked_contacts -----------------------------------------------------------

create table public.blocked_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.mailing_contacts (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  name text,
  email text not null,
  reason text check (reason in ('Reclamação', 'Descadastro', 'Bounce', 'Manual')),
  source text check (source in ('link_descadastro', 'formulario', 'provedor', 'manual')),
  notes text,
  blocked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_blocked_owner_email unique (owner_id, email)
);

create index idx_blocked_owner_created on public.blocked_contacts (owner_id, blocked_at desc);

create trigger set_updated_at
  before update on public.blocked_contacts
  for each row execute function public.set_updated_at();

-- email_outbox (fila de envio assincrono, sem equivalente no PocketBase) ------

create table public.email_outbox (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  contact_id uuid not null references public.mailing_contacts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_outbox_drain on public.email_outbox (status, next_attempt_at);
create index idx_outbox_owner_campaign on public.email_outbox (owner_id, campaign_id);

create trigger set_updated_at
  before update on public.email_outbox
  for each row execute function public.set_updated_at();
