// Fase 3: porta pocketbase/hooks/track_click.js. Publica (--no-verify-jwt).
// O id do email_logs vem via query string (?log=), nao via path param -
// mais robusto entre versoes do Edge Runtime do que depender de
// segmentos de path apos o nome da function.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const fallbackUrl = Deno.env.get('SITE_URL') || '/'

Deno.serve(async (req: Request) => {
  const params = new URL(req.url).searchParams
  const logId = params.get('log')
  const targetUrl = safeRedirectTarget(params.get('url'))

  if (logId) {
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    await registerClick(supabase, logId)
  }

  return new Response(null, { status: 302, headers: { Location: targetUrl } })
})

// O destino vem da query string, entao redirecionar sem validar tornaria
// esta function um open redirect: *.supabase.co costuma estar em
// allowlist de gateway de e-mail, e o link passaria por filtros que
// bloqueariam o dominio de phishing final. Aceita apenas http(s) - o que
// barra javascript:, data: e afins.
function safeRedirectTarget(raw: string | null): string {
  if (!raw) return fallbackUrl
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallbackUrl
    return url.toString()
  } catch {
    return fallbackUrl
  }
}

async function registerClick(supabase: SupabaseClient, logId: string) {
  const { data: log } = await supabase
    .from('email_logs')
    .select('clicked_at, click_count')
    .eq('id', logId)
    .maybeSingle()
  if (!log) return

  await supabase
    .from('email_logs')
    .update({
      clicked_at: log.clicked_at ?? new Date().toISOString(),
      click_count: (log.click_count ?? 0) + 1,
    })
    .eq('id', logId)
}
