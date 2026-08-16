import supabase from '@/lib/supabase/client'
import { getCurrentUserId } from '@/lib/supabase/current-user'
import { fetchAllPages } from '@/lib/supabase/fetch-all'

export type RoleCategory =
  | 'C-Level'
  | 'Diretoria'
  | 'Gerência'
  | 'Coordenação'
  | 'Analista'
  | 'Assistente/Auxiliar'
  | 'Estagiário'
  | 'Consultor/Autônomo'
  | 'Outro'

export type RSVPStatus = 'Aguardando' | 'Confirmou' | 'Recusou'
export type ClassificationStatus = 'Pendente' | 'Classificado' | 'Revisado'
export type PriorityLevel = 'Alta' | 'Média' | 'Baixa'

export interface ContactRecord {
  id: string
  event: string
  name: string
  email: string
  phone?: string
  company?: string
  raw_role?: string
  cnpj?: string
  city?: string
  rsvp?: RSVPStatus
  has_degree?: 'Sim' | 'Não'
  classification_status?: ClassificationStatus
  role_category?: RoleCategory
  priority?: PriorityLevel
  interests?: string[]
  demands?: string[]
  profile_summary?: string
  suggested_message?: string
  notes?: string
  last_classified_at?: string
  created: string
  updated: string
  expand?: {
    event?: { name: string }
  }
}

interface ContactRow {
  id: string
  event_id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  raw_role: string | null
  cnpj: string | null
  city: string | null
  rsvp: RSVPStatus | null
  has_degree: 'Sim' | 'Não' | null
  classification_status: ClassificationStatus | null
  role_category: RoleCategory | null
  priority: PriorityLevel | null
  interests: string[] | null
  demands: string[] | null
  profile_summary: string | null
  suggested_message: string | null
  notes: string | null
  last_classified_at: string | null
  created_at: string
  updated_at: string
  event?: { name: string }[] | null
}

const SELECT = `id, event_id, name, email, phone, company, raw_role, cnpj, city, rsvp, has_degree,
  classification_status, role_category, priority, interests, demands, profile_summary,
  suggested_message, notes, last_classified_at, created_at, updated_at`

export function mapRow(row: ContactRow): ContactRecord {
  return {
    id: row.id,
    event: row.event_id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    company: row.company ?? undefined,
    raw_role: row.raw_role ?? undefined,
    cnpj: row.cnpj ?? undefined,
    city: row.city ?? undefined,
    rsvp: row.rsvp ?? undefined,
    has_degree: row.has_degree ?? undefined,
    classification_status: row.classification_status ?? undefined,
    role_category: row.role_category ?? undefined,
    priority: row.priority ?? undefined,
    interests: row.interests ?? undefined,
    demands: row.demands ?? undefined,
    profile_summary: row.profile_summary ?? undefined,
    suggested_message: row.suggested_message ?? undefined,
    notes: row.notes ?? undefined,
    last_classified_at: row.last_classified_at ?? undefined,
    created: row.created_at,
    updated: row.updated_at,
    expand: row.event?.[0] ? { event: row.event[0] } : undefined,
  }
}

export function toPatch(data: Partial<ContactRecord>): Record<string, unknown> {
  const { id: _id, event, created: _created, updated: _updated, expand: _expand, ...rest } = data
  const patch: Record<string, unknown> = { ...rest }
  if (event !== undefined) patch.event_id = event
  return patch
}

// Busca paginada: sem isso o PostgREST devolve so as primeiras 1000 linhas
// e a tela trata como se fosse a base inteira (ver lib/supabase/fetch-all).
export const getContacts = async (
  eventId?: string,
  onProgress?: (carregados: number) => void,
): Promise<ContactRecord[]> => {
  let countQuery = supabase.from('mailing_contacts').select('id', { count: 'exact', head: true })
  if (eventId) countQuery = countQuery.eq('event_id', eventId)
  const { count, error: countError } = await countQuery
  if (countError) throw countError

  const rows = await fetchAllPages<ContactRow>(
    (from, to) => {
      let query = supabase
        .from('mailing_contacts')
        .select(SELECT)
        .order('created_at', { ascending: false })
        // Desempate obrigatorio: a importacao em massa grava milhares de
        // linhas com created_at identico e, sem uma chave unica na
        // ordenacao, a ordem varia entre as consultas - o que faz a
        // paginacao repetir linhas e perder outras.
        .order('id', { ascending: true })
        .range(from, to)
      if (eventId) query = query.eq('event_id', eventId)
      return query
    },
    count ?? 0,
    onProgress,
  )

  return rows.map(mapRow)
}

export const getContact = async (id: string): Promise<ContactRecord> => {
  const { data, error } = await supabase
    .from('mailing_contacts')
    .select(`${SELECT}, event:events(name)`)
    .eq('id', id)
    .single()
  if (error) throw error
  return mapRow(data)
}

export const createContact = async (data: Partial<ContactRecord>): Promise<ContactRecord> => {
  const owner_id = await getCurrentUserId()
  const { data: row, error } = await supabase
    .from('mailing_contacts')
    .insert({ ...toPatch(data), owner_id })
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(row)
}

export const updateContact = async (
  id: string,
  data: Partial<ContactRecord>,
): Promise<ContactRecord> => {
  const { data: row, error } = await supabase
    .from('mailing_contacts')
    .update(toPatch(data))
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(row)
}

export const deleteContact = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('mailing_contacts').delete().eq('id', id)
  if (error) throw error
  return true
}

export const classifyContact = async (id: string): Promise<ContactRecord> => {
  const { data, error } = await supabase.functions.invoke<ContactRow>('classify-contact', {
    body: { id },
  })
  if (error) throw error
  return mapRow(data as ContactRow)
}

export interface ImportResult {
  imported: number
  skipped: number
  blocked: number
  errors: Array<{ row: number; reason: string }>
  imported_ids?: string[]
}

export interface ImportRow {
  name: string
  email: string
  phone?: string
  company?: string
  raw_role?: string
  cnpj?: string
  city?: string
  rsvp?: string
  has_degree?: string
  notes?: string
}

// Planilhas grandes vao em lotes: um unico envio de 19 mil linhas gera um
// corpo de varios MB e faz a Edge Function passar do limite de tempo.
// Cada lote e uma chamada independente e rapida, o que tambem permite
// mostrar progresso real e nao perder o que ja entrou se um lote falhar.
const IMPORT_BATCH_SIZE = 250

export const importContacts = async (
  eventId: string,
  contacts: ImportRow[],
  allowDuplicates: boolean = false,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> => {
  const total = contacts.length
  const acc: ImportResult = { imported: 0, skipped: 0, blocked: 0, errors: [], imported_ids: [] }

  for (let offset = 0; offset < total; offset += IMPORT_BATCH_SIZE) {
    const batch = contacts.slice(offset, offset + IMPORT_BATCH_SIZE)
    const { data, error } = await supabase.functions.invoke<ImportResult>('import-contacts', {
      body: {
        event_id: eventId,
        contacts: batch,
        allow_duplicates: allowDuplicates,
        row_offset: offset,
      },
    })
    if (error) throw error

    const result = data as ImportResult
    acc.imported += result.imported
    acc.skipped += result.skipped
    acc.blocked += result.blocked
    acc.errors.push(...(result.errors ?? []))
    acc.imported_ids!.push(...(result.imported_ids ?? []))

    onProgress?.(Math.min(offset + batch.length, total), total)
  }

  return acc
}

export interface SearchHit {
  id: string
  name: string
  email: string
  company?: string
  raw_role?: string
  role_category?: string
  _distance?: number
}

export const searchContacts = async (
  query: string,
  eventId?: string,
): Promise<{ items: SearchHit[] }> => {
  const { data, error } = await supabase.functions.invoke<{ items: SearchHit[] }>('search-contacts', {
    body: { query, event_id: eventId, k: 25 },
  })
  if (error) throw error
  return data as { items: SearchHit[] }
}
