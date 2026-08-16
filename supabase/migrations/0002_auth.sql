-- Fase 1: perfil automatico no signup + funcao de checagem de papel.
-- is_admin() le a claim injetada pelo custom access token hook
-- (supabase/functions/custom-access-token-hook), nao a tabela profiles -
-- isso evita um select extra em toda policy de RLS.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Espelha pocketbase/hooks/set_owner.js na colecao users: todo signup
-- nasce com role = 'user', nunca confia em valor vindo do cliente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, sender_name, sender_email)
  values (new.id, 'user', new.raw_user_meta_data ->> 'name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
