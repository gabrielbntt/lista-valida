// Fase 2: substitui pocketbase/hooks/retry_failures.js. So reenfileira
// (requeue_campaign_failures) — o reenvio de fato acontece no proximo
// tick do pg_cron (fase 3), nao mais sincrono. Existe como Edge Function
// dedicada (em vez de update direto do client) para manter email_outbox
// 100% fechado ao client, como decidido na Fase 1 (RLS sem policy nessa
// tabela).

import { getUser } from '../_shared/auth.ts'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface RetryBody {
  id: string
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const { supabase } = await getUser(req)
    const { id } = (await req.json()) as RetryBody
    if (!id) return jsonResponse({ error: 'ID da campanha é obrigatório' }, 400)

    const { data, error } = await supabase.rpc('requeue_campaign_failures', { p_campaign_id: id })
    if (error) return jsonResponse({ error: error.message }, 400)

    return jsonResponse({ status: 'sending', ...data })
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 401)
  }
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
