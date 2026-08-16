// Fase 3: porta pocketbase/hooks/unsubscribe_get.js. Chamada pela pagina
// /descadastrar/:logId do frontend (fase 5). Publica (--no-verify-jwt).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const logId = new URL(req.url).searchParams.get('log')
  if (!logId) return jsonResponse({ error: 'Link inválido' }, 400)

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: log } = await supabase
    .from('email_logs')
    .select('recipient_email, recipient_name')
    .eq('id', logId)
    .maybeSingle()

  if (!log) return jsonResponse({ error: 'Link de descadastro inválido ou expirado.' }, 404)

  return jsonResponse({ email: log.recipient_email, name: log.recipient_name || '' })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
