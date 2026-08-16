// Custom Access Token Hook: injeta profiles.role em claims.app_metadata.role
// no momento em que o JWT nasce, para is_admin() (migrations/0002_auth.sql)
// nao depender de um select extra em toda policy de RLS.
//
// Configuracao manual obrigatoria no dashboard: Authentication > Hooks >
// Custom Access Token Hook > selecionar esta function. O dashboard mostra o
// segredo exato a usar para verificar a assinatura da chamada (formato pode
// variar por versao do Supabase - conferir a doc no momento da configuracao
// em vez de confiar cegamente no header abaixo).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const hookSecret = Deno.env.get('AUTH_HOOK_SECRET')!

Deno.serve(async (req: Request) => {
  const authorization = req.headers.get('Authorization')
  if (authorization !== `Bearer ${hookSecret}`) {
    return jsonResponse({ error: { http_code: 401, message: 'nao autorizado' } }, 401)
  }

  const payload = await req.json()
  const userId = payload.user_id as string
  const claims = payload.claims as Record<string, unknown>

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    return jsonResponse({ error: { http_code: 500, message: 'perfil nao encontrado' } }, 500)
  }

  const appMetadata = (claims.app_metadata as Record<string, unknown>) ?? {}
  claims.app_metadata = { ...appMetadata, role: profile.role }

  return jsonResponse({ claims })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
