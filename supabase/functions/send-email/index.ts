// Fase 3: drena email_outbox. Chamada pelo pg_cron a cada minuto (via
// pg_net), nunca pelo frontend - protegida por secret interno, nao por
// JWT. Idempotencia estrutural: o outbox so vira 'sent'/'pending'/'failed'
// com um update condicionado a "where status = 'pending'" (ver
// markSent/markFailedAttempt) - um retry atrasado numa linha ja
// processada nao sobrescreve o resultado.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { renderSubject, renderTextBody, renderTrackedBody, unsubscribeUrl } from './render.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const internalSecret = Deno.env.get('INTERNAL_SECRET')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')!
const siteUrl = (Deno.env.get('SITE_URL') || supabaseUrl).replace(/\/$/, '')
const functionsUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`

// Se TRACKING_BASE_URL estiver definido (ex.: https://listavalida.com.br/r,
// servido pelos rewrites do vercel.json), os links de rastreamento saem no
// mesmo dominio do remetente. Sem ele, cai no dominio do Supabase - que
// funciona igual, so entrega pior.
const trackingBase = Deno.env.get('TRACKING_BASE_URL')?.replace(/\/$/, '')
const tracking = trackingBase
  ? { click: `${trackingBase}/c`, open: `${trackingBase}/o` }
  : { click: `${functionsUrl}/track-click`, open: `${functionsUrl}/track-open` }

const DEFAULT_BATCH_SIZE = 10
const MAX_ATTEMPTS = 5

interface OutboxRow {
  id: number
  owner_id: string
  campaign_id: string
  contact_id: string
  attempt_count: number
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-internal-secret') !== internalSecret) {
    return jsonResponse({ error: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const batchSize = Number(body.batch_size) || DEFAULT_BATCH_SIZE

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const rows = await fetchDueRows(supabase, batchSize)

  const touchedCampaigns = new Set<string>()
  for (const row of rows) {
    await processRow(supabase, row)
    touchedCampaigns.add(row.campaign_id)
  }
  for (const campaignId of touchedCampaigns) {
    await finalizeCampaignIfDone(supabase, campaignId)
  }

  return jsonResponse({ processed: rows.length })
})

async function fetchDueRows(supabase: SupabaseClient, batchSize: number): Promise<OutboxRow[]> {
  const { data } = await supabase
    .from('email_outbox')
    .select('id, owner_id, campaign_id, contact_id, attempt_count')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(batchSize)
  return data ?? []
}

async function processRow(supabase: SupabaseClient, row: OutboxRow) {
  const [{ data: campaign }, { data: contact }] = await Promise.all([
    supabase
      .from('email_campaigns')
      .select('subject, body, sender_name, sender_email')
      .eq('id', row.campaign_id)
      .single(),
    supabase
      .from('mailing_contacts')
      .select('name, email, company, raw_role, suggested_message')
      .eq('id', row.contact_id)
      .single(),
  ])

  if (!campaign || !contact) {
    await markFailedAttempt(supabase, row, 'Campanha ou contato não encontrado')
    return
  }

  const log = await createQueuedLog(supabase, row, campaign, contact)
  if (!log) {
    await markFailedAttempt(supabase, row, 'Falha ao criar registro de log')
    return
  }

  const trackedBody = renderTrackedBody(campaign, contact, log.id, tracking, siteUrl)
  const unsubUrl = unsubscribeUrl(log.id, siteUrl)
  const textBody = renderTextBody(campaign, contact, unsubUrl)
  const fromField = campaign.sender_name ? `${campaign.sender_name} <${campaign.sender_email}>` : campaign.sender_email
  const result = await sendViaResend({
    from: fromField,
    to: contact.email,
    subject: log.subject,
    html: trackedBody,
    text: textBody,
    unsubUrl,
    replyTo: campaign.sender_email,
  })

  if (result.ok) {
    await markSent(supabase, row, log.id, trackedBody)
    return
  }
  await markLogFailed(supabase, log.id, trackedBody, result.error)
  await markFailedAttempt(supabase, row, result.error)
}

interface CampaignRow {
  subject: string
  body: string
  sender_name: string | null
  sender_email: string
}

interface ContactRow {
  name: string
  email: string
  company: string | null
  raw_role: string | null
  suggested_message: string | null
}

async function createQueuedLog(supabase: SupabaseClient, row: OutboxRow, campaign: CampaignRow, contact: ContactRow) {
  const subject = renderSubject(campaign, contact)
  const { data } = await supabase
    .from('email_logs')
    .insert({
      owner_id: row.owner_id,
      campaign_id: row.campaign_id,
      contact_id: row.contact_id,
      recipient_email: contact.email,
      recipient_name: contact.name,
      subject,
      status: 'queued',
    })
    .select('id, subject')
    .single()
  return data
}

interface SendParams {
  from: string
  to: string
  subject: string
  html: string
  text: string
  unsubUrl: string
  replyTo: string
}

async function sendViaResend(p: SendParams): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: p.from,
        to: [p.to],
        subject: p.subject,
        html: p.html,
        // Parte em texto puro: HTML sozinho pesa contra na avaliacao de spam.
        text: p.text,
        reply_to: p.replyTo,
        headers: {
          // Exigido pelo Gmail e pelo Yahoo para remetentes em massa desde
          // 2024. Sem estes dois cabecalhos, a mensagem perde reputacao
          // mesmo com autenticacao de dominio correta.
          'List-Unsubscribe': `<${p.unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })
    if (res.ok) return { ok: true }
    const errBody = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    return { ok: false, error: errBody.message || errBody.error || `Resend API error (HTTP ${res.status})` }
  } catch (error) {
    return { ok: false, error: `Erro de conexão com Resend: ${(error as Error).message}` }
  }
}

async function markSent(supabase: SupabaseClient, row: OutboxRow, logId: string, trackedBody: string) {
  await supabase
    .from('email_logs')
    .update({ status: 'sent', sent_at: new Date().toISOString(), body: trackedBody })
    .eq('id', logId)
  await supabase.from('email_outbox').update({ status: 'sent' }).eq('id', row.id).eq('status', 'pending')
}

async function markLogFailed(supabase: SupabaseClient, logId: string, trackedBody: string, error: string) {
  await supabase
    .from('email_logs')
    .update({ status: 'failed', error_message: error, body: trackedBody })
    .eq('id', logId)
}

async function markFailedAttempt(supabase: SupabaseClient, row: OutboxRow, error: string) {
  const attemptCount = row.attempt_count + 1
  const status = attemptCount >= MAX_ATTEMPTS ? 'failed' : 'pending'
  await supabase
    .from('email_outbox')
    .update({
      status,
      attempt_count: attemptCount,
      next_attempt_at: new Date(Date.now() + attemptCount * 60_000).toISOString(),
      last_error: error,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
}

async function finalizeCampaignIfDone(supabase: SupabaseClient, campaignId: string) {
  const { count: remaining } = await supabase
    .from('email_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
  if (remaining && remaining > 0) return

  const { count: sent } = await supabase
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'sent')
  const { count: failed } = await supabase
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'failed')

  await supabase
    .from('email_campaigns')
    .update({
      status: (failed ?? 0) > 0 ? 'partially_failed' : 'sent',
      total_sent: sent ?? 0,
      total_failed: failed ?? 0,
    })
    .eq('id', campaignId)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
