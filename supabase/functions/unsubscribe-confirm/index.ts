// Fase 3: porta pocketbase/hooks/unsubscribe_confirm.js. Publica
// (--no-verify-jwt). Diferenca de comportamento em relacao ao hook
// original: blocked_contacts.owner_id e "not null" no schema novo
// (migration 0001), entao se nao for possivel resolver o owner do log
// (contato e campanha ja removidos), o bloqueio e pulado em vez de
// tentar um insert que violaria a constraint.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ConfirmBody {
  reason?: string
}

interface LogRow {
  recipient_email: string
  recipient_name: string | null
  contact_id: string | null
  campaign_id: string | null
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const logId = new URL(req.url).searchParams.get('log')
  if (!logId) return jsonResponse({ error: 'Link inválido' }, 400)

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: log } = await supabase
    .from('email_logs')
    .select('recipient_email, recipient_name, contact_id, campaign_id')
    .eq('id', logId)
    .maybeSingle()
  if (!log?.recipient_email) {
    return jsonResponse({ error: 'Link de descadastro inválido ou expirado.' }, 404)
  }

  const body = (await req.json().catch(() => ({}))) as ConfirmBody
  const owner = await resolveOwner(supabase, log)
  if (owner) await blockContact(supabase, owner, log, body.reason)

  return jsonResponse({ success: true })
})

async function resolveOwner(supabase: SupabaseClient, log: LogRow): Promise<string | null> {
  if (log.contact_id) {
    const { data } = await supabase
      .from('mailing_contacts')
      .select('owner_id')
      .eq('id', log.contact_id)
      .maybeSingle()
    if (data?.owner_id) return data.owner_id
  }
  if (log.campaign_id) {
    const { data } = await supabase
      .from('email_campaigns')
      .select('owner_id')
      .eq('id', log.campaign_id)
      .maybeSingle()
    if (data?.owner_id) return data.owner_id
  }
  return null
}

async function blockContact(supabase: SupabaseClient, owner: string, log: LogRow, reasonNote?: string) {
  const { data: existing } = await supabase
    .from('blocked_contacts')
    .select('id')
    .eq('owner_id', owner)
    .eq('email', log.recipient_email)
    .maybeSingle()

  const patch = {
    reason: 'Descadastro',
    source: 'link_descadastro',
    notes: reasonNote ?? null,
    blocked_at: new Date().toISOString(),
  }

  if (existing) {
    await supabase.from('blocked_contacts').update(patch).eq('id', existing.id)
    return
  }

  const eventId = await resolveEventId(supabase, log.contact_id)
  await supabase.from('blocked_contacts').insert({
    ...patch,
    email: log.recipient_email,
    name: log.recipient_name,
    owner_id: owner,
    contact_id: log.contact_id,
    event_id: eventId,
  })
}

async function resolveEventId(supabase: SupabaseClient, contactId: string | null) {
  if (!contactId) return null
  const { data } = await supabase.from('mailing_contacts').select('event_id').eq('id', contactId).maybeSingle()
  return data?.event_id ?? null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
