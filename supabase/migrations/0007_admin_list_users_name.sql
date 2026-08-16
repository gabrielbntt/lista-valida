-- Fase 5: admin_list_users() (migration 0004) nao trazia "name" - a tela
-- de usuarios (Users.tsx) mostra nome com fallback pro e-mail, e sem essa
-- coluna todo mundo aparecia "Sem nome". auth.users.raw_user_meta_data
-- ja guarda o "name" enviado no signUp (use-auth.tsx, fase 4).
--
-- RETURNS TABLE muda de coluna -> precisa dropar antes de recriar
-- (CREATE OR REPLACE FUNCTION nao aceita mudar o formato de retorno).
drop function if exists public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  name text,
  role text,
  sender_name text,
  sender_email text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email, u.raw_user_meta_data ->> 'name' as name, p.role, p.sender_name,
    p.sender_email, p.created_at, p.updated_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;
