import { createClient } from 'jsr:@supabase/supabase-js@2'

// Estas functions sao publicadas com --no-verify-jwt de proposito: com a
// verificacao no gateway ligada, o Supabase responde 401 ao preflight
// OPTIONS (que o navegador envia sem Authorization) antes de chamar a
// function, e o navegador bloqueia toda chamada vinda do app por CORS.
// A autenticacao nao fica mais fraca por isso - ela so passa a ser feita
// aqui dentro, por getUser(), que valida o JWT contra o servidor de auth
// e lanca se faltar ou for invalido.
export async function getUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) throw new Error('unauthorized')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('unauthorized')
  return { supabase, user: data.user }
}

// Consulta a fonte canonica do papel: public.profiles, que so e escrita
// por set_user_role() (security definer, exige is_admin).
//
// NAO derive o papel de getUser(): o objeto devolvido vem de
// auth.users.raw_app_meta_data, e o custom-access-token-hook so decora as
// claims do JWT no momento da emissao - nunca grava nessa coluna. Ler
// app_metadata dali retorna undefined mesmo para admins reais.
//
// E NUNCA use user_metadata para autorizacao: aquele campo e gravavel
// pelo proprio usuario via supabase.auth.updateUser(), o que permitiria a
// qualquer conta se autopromover a admin.
type SupabaseClient = Awaited<ReturnType<typeof getUser>>['supabase']

export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'admin'
}

export async function assertOwnerOrAdmin(
  supabase: SupabaseClient,
  user: { id: string },
  ownerId: string,
): Promise<void> {
  if (user.id !== ownerId && !(await isAdmin(supabase, user.id))) {
    throw new Error('forbidden')
  }
}
