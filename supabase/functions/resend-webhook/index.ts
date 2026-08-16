// Fase 3: porta pocketbase/hooks/resend_webhook.js. O PocketBase nao
// validava a assinatura do webhook - aqui passamos a exigir, corrigindo
// uma lacuna de seguranca que ja existia. Publica (--no-verify-jwt),
// porque quem chama e o Resend, sem JWT do Supabase.
//
// Verificacao Ed25519 sobre o header Resend-Signature, corpo cru. O
// formato exato do header (encoding do secret, se ha prefixo de
// timestamp) pode variar conforme a versao da API do Resend - confira a
// documentacao no momento de configurar o webhook e ajuste
// verifySignature() se necessario.
//
// Diferenca de comportamento em relacao ao hook original: blocked_contacts
// .owner_id e "not null" no schema novo (migration 0001); se nao for
// possivel resolver o owner do e-mail (nenhum log/contato conhecido), o
// bloqueio e pulado em vez de tentar um insert que violaria a constraint.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const signingSecret = Deno.env.get('RESEND_WEBHOOK_SIGNING_SECRET')!

Deno.serve(async (req: Request) => {
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('Resend-Signature')

  if (!(await verifySignature(rawBody, signatureHeader))) {
    return jsonResponse({ error: 'assinatura inválida' }, 401)
  }

  const payload = JSON.parse(rawBody)
  const eventType: string = payload.type || payload.event_type || ''
  const data = payload.data || payload
  const email = (data.email || data.recipient_email || '').toLowerCase()
  if (!email) return jsonResponse({ ok: true })

  const reason = classifyReason(eventType)
  if (!reason) return jsonResponse({ ok: true, skipped: true })

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const blocked = await blockEmail(supabase, email, reason, data)

  return jsonResponse({ ok: true, blocked, email, reason })
})

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false
  try {
    const publicKeyBytes = base64ToBytes(signingSecret)
    const signatureBytes = base64ToBytes(signatureHeader)
    const key = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, signatureBytes, new TextEncoder().encode(rawBody))
  } catch {
    return false
  }
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

function classifyReason(eventType: string): 'Bounce' | 'Reclamação' | null {
  const type = eventType.toLowerCase()
  if (type.includes('bounce')) return 'Bounce'
  if (type.includes('complain') || type.includes('spam')) return 'Reclamação'
  return null
}

async function blockEmail(
  supabase: SupabaseClient,
  email: string,
  reason: 'Bounce' | 'Reclamação',
  data: Record<string, unknown>,
): Promise<boolean> {
  const owner = await resolveOwner(supabase, email)
  if (!owner) return false

  const patch = {
    reason,
    source: 'provedor',
    notes: data.id ? `Resend ID: ${data.id}` : null,
    blocked_at: new Date().toISOString(),
  }

  const existing = await findExisting(supabase, owner, email)
  if (existing) {
    await supabase.from('blocked_contacts').update(patch).eq('id', existing.id)
    return true
  }

  const contact = await findContactForOwner(supabase, owner, email)
  await supabase.from('blocked_contacts').insert({
    ...patch,
    email,
    owner_id: owner,
    contact_id: contact?.id ?? null,
    event_id: contact?.event_id ?? null,
  })
  return true
}

async function resolveOwner(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data: log } = await supabase
    .from('email_logs')
    .select('campaign_id')
    .eq('recipient_email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (log?.campaign_id) {
    const { data: campaign } = await supabase
      .from('email_campaigns')
      .select('owner_id')
      .eq('id', log.campaign_id)
      .maybeSingle()
    if (campaign?.owner_id) return campaign.owner_id
  }

  const { data: contact } = await supabase
    .from('mailing_contacts')
    .select('owner_id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()
  return contact?.owner_id ?? null
}

async function findExisting(supabase: SupabaseClient, owner: string, email: string) {
  const { data } = await supabase
    .from('blocked_contacts')
    .select('id')
    .eq('owner_id', owner)
    .eq('email', email)
    .maybeSingle()
  return data
}

async function findContactForOwner(supabase: SupabaseClient, owner: string, email: string) {
  const { data } = await supabase
    .from('mailing_contacts')
    .select('id, event_id')
    .eq('owner_id', owner)
    .eq('email', email)
    .limit(1)
    .maybeSingle()
  return data
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
