// Envia e-mail para uma selecao arbitraria de contatos (tela Contatos,
// barra de acoes em lote) usando um modelo escolhido na hora. So
// enfileira e volta em ms, igual send-campaign - delega para
// queue_bulk_send (RPC), que cria uma campanha automatica por baixo pra
// reaproveitar toda a infra de outbox/tracking/relatorio ja existente.

import { getUser } from '../_shared/auth.ts'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface BulkSendBody {
  contact_ids: string[]
  template_id: string
  event_id: string
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const { supabase } = await getUser(req)
    const body = (await req.json()) as BulkSendBody
    const validationError = validateBody(body)
    if (validationError) return jsonResponse({ error: validationError }, 400)
    if (!Deno.env.get('RESEND_API_KEY')) {
      return jsonResponse({ error: 'RESEND_API_KEY não configurada.' }, 400)
    }

    // Mesma validacao de send-campaign: sem remetente, o Resend recusa
    // cada envio e a falha so apareceria depois de 5 tentativas com
    // backoff (ate ~5 min), sem nenhum retorno para quem clicou "Enviar".
    const { data: template } = await supabase
      .from('email_templates')
      .select('sender_email')
      .eq('id', body.template_id)
      .maybeSingle()
    if (!template) return jsonResponse({ error: 'Modelo não encontrado' }, 404)
    if (!template.sender_email) {
      return jsonResponse(
        {
          error:
            'O modelo selecionado não tem remetente (sender_email) configurado. Edite o modelo e defina um e-mail remetente com domínio verificado no Resend.',
        },
        400,
      )
    }

    const { data, error } = await supabase.rpc('queue_bulk_send', {
      p_contact_ids: body.contact_ids,
      p_template_id: body.template_id,
      p_event_id: body.event_id,
    })
    if (error) return jsonResponse({ error: error.message }, 400)

    return jsonResponse({ status: 'sending', ...data })
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 401)
  }
})

function validateBody(body: BulkSendBody): string | null {
  if (!Array.isArray(body.contact_ids) || body.contact_ids.length === 0) {
    return 'Nenhum contato selecionado'
  }
  if (!body.template_id) return 'Modelo é obrigatório'
  if (!body.event_id) return 'Evento é obrigatório'
  return null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
