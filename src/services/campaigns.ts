import supabase from '@/lib/supabase/client'
import { getCurrentUserId } from '@/lib/supabase/current-user'
import { fetchAllPages } from '@/lib/supabase/fetch-all'

export type CampaignStatus = 'rascunho' | 'enviando' | 'enviado' | 'parcialmente_falhou'

type DbCampaignStatus = 'draft' | 'sending' | 'sent' | 'partially_failed'

export const STATUS_DB_TO_PT: Record<DbCampaignStatus, CampaignStatus> = {
  draft: 'rascunho',
  sending: 'enviando',
  sent: 'enviado',
  partially_failed: 'parcialmente_falhou',
}
export const STATUS_PT_TO_DB: Record<CampaignStatus, DbCampaignStatus> = {
  rascunho: 'draft',
  enviando: 'sending',
  enviado: 'sent',
  parcialmente_falhou: 'partially_failed',
}

export interface CampaignRecord {
  id: string
  name: string
  event: string
  subject: string
  body_template: string
  sender_name?: string
  sender_email?: string
  status?: CampaignStatus
  filter_rsvp?: string
  filter_priority?: string
  filter_category?: string
  total_sent?: number
  total_failed?: number
  created: string
  updated: string
  expand?: { event?: { name: string } }
}

// 'enviando' aqui e um estado novo (fila assincrona, fase 3) sem
// equivalente no PocketBase - antes o log so existia ja com resultado
// final. Ver src/pages/CampaignDetail.tsx para o badge correspondente.
export interface EmailLogRecord {
  id: string
  campaign: string
  contact?: string
  recipient_email: string
  recipient_name?: string
  subject?: string
  body?: string
  status: 'enviando' | 'enviado' | 'falhou'
  error_message?: string
  sent_at?: string
  opened_at?: string
  clicked_at?: string
  click_count?: number
  created: string
  updated: string
}

interface CampaignRow {
  id: string
  name: string
  event_id: string
  subject: string
  body: string
  sender_name: string | null
  sender_email: string | null
  status: DbCampaignStatus
  filter_rsvp: string | null
  filter_priority: string | null
  filter_category: string | null
  total_sent: number
  total_failed: number
  created_at: string
  updated_at: string
  event?: { name: string }[] | null
}

interface EmailLogRow {
  id: string
  campaign_id: string
  contact_id: string | null
  recipient_email: string
  recipient_name: string | null
  subject: string | null
  body: string | null
  status: 'queued' | 'sent' | 'failed'
  error_message: string | null
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  click_count: number
  created_at: string
  updated_at: string
}

const CAMPAIGN_SELECT = `id, name, event_id, subject, body, sender_name, sender_email, status,
  filter_rsvp, filter_priority, filter_category, total_sent, total_failed, created_at, updated_at`

export const LOG_STATUS_DB_TO_PT: Record<EmailLogRow['status'], EmailLogRecord['status']> = {
  queued: 'enviando',
  sent: 'enviado',
  failed: 'falhou',
}

export function mapCampaign(row: CampaignRow): CampaignRecord {
  return {
    id: row.id,
    name: row.name,
    event: row.event_id,
    subject: row.subject,
    body_template: row.body,
    sender_name: row.sender_name ?? undefined,
    sender_email: row.sender_email ?? undefined,
    status: STATUS_DB_TO_PT[row.status],
    filter_rsvp: row.filter_rsvp ?? undefined,
    filter_priority: row.filter_priority ?? undefined,
    filter_category: row.filter_category ?? undefined,
    total_sent: row.total_sent,
    total_failed: row.total_failed,
    created: row.created_at,
    updated: row.updated_at,
    expand: row.event?.[0] ? { event: row.event[0] } : undefined,
  }
}

export function mapLog(row: EmailLogRow): EmailLogRecord {
  return {
    id: row.id,
    campaign: row.campaign_id,
    contact: row.contact_id ?? undefined,
    recipient_email: row.recipient_email,
    recipient_name: row.recipient_name ?? undefined,
    subject: row.subject ?? undefined,
    body: row.body ?? undefined,
    status: LOG_STATUS_DB_TO_PT[row.status],
    error_message: row.error_message ?? undefined,
    sent_at: row.sent_at ?? undefined,
    opened_at: row.opened_at ?? undefined,
    clicked_at: row.clicked_at ?? undefined,
    click_count: row.click_count,
    created: row.created_at,
    updated: row.updated_at,
  }
}

export function toPatch(data: Partial<CampaignRecord>): Record<string, unknown> {
  const { id: _id, event, body_template, status, created: _created, updated: _updated, expand: _expand, ...rest } =
    data
  const patch: Record<string, unknown> = { ...rest }
  if (event !== undefined) patch.event_id = event
  if (body_template !== undefined) patch.body = body_template
  if (status !== undefined) patch.status = STATUS_PT_TO_DB[status]
  return patch
}

export const getCampaigns = async (eventId?: string): Promise<CampaignRecord[]> => {
  let query = supabase
    .from('email_campaigns')
    .select(`${CAMPAIGN_SELECT}, event:events(name)`)
    .order('created_at', { ascending: false })
  if (eventId) query = query.eq('event_id', eventId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapCampaign)
}

export const getReportCampaigns = async (
  eventId?: string,
  status?: string,
): Promise<CampaignRecord[]> => {
  let query = supabase
    .from('email_campaigns')
    .select(`${CAMPAIGN_SELECT}, event:events(name)`)
    .order('created_at', { ascending: false })
  if (eventId) query = query.eq('event_id', eventId)
  if (status) query = query.eq('status', STATUS_PT_TO_DB[status as CampaignStatus])
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapCampaign)
}

export const getCampaign = async (id: string): Promise<CampaignRecord> => {
  const { data, error } = await supabase
    .from('email_campaigns')
    .select(`${CAMPAIGN_SELECT}, event:events(name)`)
    .eq('id', id)
    .single()
  if (error) throw error
  return mapCampaign(data)
}

export const createCampaign = async (data: Partial<CampaignRecord>): Promise<CampaignRecord> => {
  const owner_id = await getCurrentUserId()
  const { data: row, error } = await supabase
    .from('email_campaigns')
    .insert({ ...toPatch(data), owner_id })
    .select(CAMPAIGN_SELECT)
    .single()
  if (error) throw error
  return mapCampaign(row)
}

export const updateCampaign = async (
  id: string,
  data: Partial<CampaignRecord>,
): Promise<CampaignRecord> => {
  const { data: row, error } = await supabase
    .from('email_campaigns')
    .update(toPatch(data))
    .eq('id', id)
    .select(CAMPAIGN_SELECT)
    .single()
  if (error) throw error
  return mapCampaign(row)
}

export const deleteCampaign = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('email_campaigns').delete().eq('id', id)
  if (error) throw error
  return true
}

// Assincrono desde a fase 3: so enfileira e volta em ms. sent/failed nao
// sao mais conhecidos na hora - acompanhe via campaign.status/total_sent/
// total_failed (Realtime) e a lista de logs, nao pelo retorno desta chamada.
export interface QueueResult {
  status: 'sending'
  queued: number
  ignored_blocked?: number
}

export interface RequeueResult {
  status: 'sending'
  requeued: number
  ignored_blocked?: number
}

export const sendCampaign = async (id: string): Promise<QueueResult> => {
  const { data, error } = await supabase.functions.invoke<QueueResult>('send-campaign', {
    body: { id },
  })
  if (error) throw error
  return data as QueueResult
}

export const retryCampaignFailures = async (id: string): Promise<RequeueResult> => {
  const { data, error } = await supabase.functions.invoke<RequeueResult>('retry-campaign-failures', {
    body: { id },
  })
  if (error) throw error
  return data as RequeueResult
}

// Envio pontual para uma selecao arbitraria de contatos (tela Contatos,
// nao filtrada por campanha) usando um modelo escolhido na hora. Cria
// uma campanha automatica por baixo (rastreabilidade/relatorio) - ver
// queue_bulk_send (migration 0011).
export interface BulkSendResult {
  status: 'sending'
  campaign_id: string
  queued: number
  ignored_blocked?: number
}

export const sendBulkEmail = async (
  contactIds: string[],
  templateId: string,
  eventId: string,
): Promise<BulkSendResult> => {
  const { data, error } = await supabase.functions.invoke<BulkSendResult>('send-bulk-email', {
    body: { contact_ids: contactIds, template_id: templateId, event_id: eventId },
  })
  if (error) throw error
  return data as BulkSendResult
}

// Paginado: uma campanha para 19 mil contatos gera 19 mil logs, e sem isso
// o relatorio de entregas mostraria metricas calculadas sobre apenas 1000.
export const getCampaignLogs = async (campaignId: string): Promise<EmailLogRecord[]> => {
  const { count, error: countError } = await supabase
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
  if (countError) throw countError

  const rows = await fetchAllPages<EmailLogRow>(
    (from, to) =>
      supabase
        .from('email_logs')
        .select(
          'id, campaign_id, contact_id, recipient_email, recipient_name, subject, body, status, error_message, sent_at, opened_at, clicked_at, click_count, created_at, updated_at',
        )
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        // Desempate unico: sem ele a paginacao repete e perde linhas quando
        // varios logs compartilham o mesmo created_at (envio em lote).
        .order('id', { ascending: true })
        .range(from, to),
    count ?? 0,
  )
  return rows.map(mapLog)
}
