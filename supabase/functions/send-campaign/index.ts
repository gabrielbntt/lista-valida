// Fase 2: substitui pocketbase/hooks/send_campaign.js. Nao envia mais
// sincrono — valida a campanha e delega o enfileiramento para
// queue_campaign_send() (RPC security definer que insere em email_outbox
// e marca a campanha como 'sending' numa unica transacao). O envio real
// acontece no drain do pg_cron (fase 3, send-email). Responde em ms.

import { getUser } from '../_shared/auth.ts'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface SendBody {
  id: string
}

type Supabase = Awaited<ReturnType<typeof getUser>>['supabase']

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const { supabase } = await getUser(req)
    const { id } = (await req.json()) as SendBody
    if (!id) return jsonResponse({ error: 'ID da campanha é obrigatório' }, 400)

    const validationError = await validateCampaign(supabase, id)
    if (validationError) return jsonResponse({ error: validationError }, 400)

    const { data, error } = await supabase.rpc('queue_campaign_send', { p_campaign_id: id })
    if (error) return jsonResponse({ error: error.message }, 400)

    return jsonResponse({ status: 'sending', ...data })
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 401)
  }
})

async function validateCampaign(supabase: Supabase, campaignId: string): Promise<string | null> {
  const { data: campaign, error } = await supabase
    .from('email_campaigns')
    .select('status, sender_email')
    .eq('id', campaignId)
    .single()
  if (error || !campaign) return 'Campanha não encontrada'
  if (campaign.status === 'sending') return 'Campanha já está em processo de envio'
  if (!campaign.sender_email) {
    return 'Remetente (sender_email) não configurado na campanha. Edite a campanha e defina um e-mail remetente com domínio verificado no Resend.'
  }
  if (!Deno.env.get('RESEND_API_KEY')) {
    return 'RESEND_API_KEY não configurada. Configure o secret no projeto Supabase (supabase secrets set).'
  }
  return null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
