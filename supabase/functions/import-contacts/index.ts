// Fase 2: porta pocketbase/hooks/import_contacts.js. Mesma logica de
// deduplicacao (por e-mail dentro do lote e contra contatos existentes do
// mesmo evento), mas grava via supabase-js — RLS garante owner_id =
// auth.uid() (with check da policy de insert).
//
// Fase 5 (reconciliacao): cnpj/notes e a contagem de "blocked" foram
// adicionados em paralelo do lado do PocketBase enquanto a migracao
// estava em andamento - incorporados aqui. "blocked" e distinto de
// "skipped": skipped e duplicata, blocked e e-mail que ja esta em
// blocked_contacts (nao faz sentido reimportar quem ja optou por sair).

import { getUser } from '../_shared/auth.ts'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface ImportRow {
  name?: string
  email?: string
  phone?: string
  company?: string
  raw_role?: string
  cnpj?: string
  city?: string
  rsvp?: string
  has_degree?: string
  notes?: string
}

interface ImportBody {
  event_id: string
  contacts: ImportRow[]
  allow_duplicates?: boolean
  // Planilhas grandes sao enviadas em lotes pelo frontend; o offset faz o
  // numero da linha no relatorio de erro corresponder a planilha original.
  row_offset?: number
}

type Supabase = Awaited<ReturnType<typeof getUser>>['supabase']

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const { supabase, user } = await getUser(req)
    const body = (await req.json()) as ImportBody
    const validationError = validateBody(body)
    if (validationError) return jsonResponse({ error: validationError }, 400)

    // A policy de insert so valida owner_id = auth.uid(), nao a posse do
    // evento - sem esta checagem daria para importar contatos apontando
    // para o evento de outro tenant.
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', body.event_id)
      .maybeSingle()
    if (!event) return jsonResponse({ error: 'Evento não encontrado' }, 404)

    const result = await importAll(supabase, user.id, body)
    return jsonResponse(result)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 401)
  }
})

// Trabalha em conjuntos, nao contato a contato. A versao anterior fazia 3
// idas ao banco por contato (existe? bloqueado? insere), o que media
// ~447ms/contato - uma planilha de 19 mil linhas levaria ~2h20 e estourava
// o limite de tempo da function por volta do contato 300. Aqui sao poucas
// consultas por lote, independente do tamanho.
const LOOKUP_CHUNK = 100 // limite conservador para nao estourar o tamanho da URL do .in()
const INSERT_CHUNK = 500

async function importAll(supabase: Supabase, ownerId: string, body: ImportBody) {
  const errors: Array<{ row: number; reason: string }> = []
  const rowOffset = body.row_offset ?? 0

  // 1. Normaliza e valida, guardando o indice original para o relatorio.
  const candidates: Array<{ row: ReturnType<typeof normalizeRow>; index: number }> = []
  body.contacts.forEach((raw, i) => {
    const row = normalizeRow(raw)
    const rowError = validateRow(row)
    if (rowError) errors.push({ row: rowOffset + i + 1, reason: rowError })
    else candidates.push({ row, index: i })
  })

  // 2. Duplicata dentro do proprio lote.
  const seen = new Set<string>()
  const deduped: typeof candidates = []
  let skipped = 0
  for (const item of candidates) {
    if (!body.allow_duplicates && seen.has(item.row.email)) {
      skipped++
      continue
    }
    seen.add(item.row.email)
    deduped.push(item)
  }

  const emails = deduped.map((i) => i.row.email)

  // 3. Duas buscas em conjunto no lugar de 2 por contato.
  const existing = body.allow_duplicates
    ? new Set<string>()
    : await fetchEmailSet(supabase, 'mailing_contacts', 'event_id', body.event_id, emails)
  const blockedSet = await fetchEmailSet(supabase, 'blocked_contacts', 'owner_id', ownerId, emails)

  const toInsert: Array<Record<string, unknown>> = []
  let blocked = 0
  for (const item of deduped) {
    if (existing.has(item.row.email)) {
      skipped++
      continue
    }
    if (blockedSet.has(item.row.email)) {
      blocked++
      continue
    }
    toInsert.push(buildInsertRow(ownerId, body.event_id, item.row))
  }

  // 4. Insercao em lotes.
  const imported: string[] = []
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK)
    const { data, error } = await supabase.from('mailing_contacts').insert(chunk).select('id')
    if (error) {
      errors.push({ row: rowOffset + i + 1, reason: error.message })
      continue
    }
    for (const r of data ?? []) imported.push(r.id)
  }

  return { imported: imported.length, skipped, blocked, errors, imported_ids: imported }
}

// Busca em conjunto quais e-mails da lista ja existem na tabela, em
// pedacos para nao montar uma URL grande demais no filtro .in().
async function fetchEmailSet(
  supabase: Supabase,
  table: string,
  scopeColumn: string,
  scopeValue: string,
  emails: string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < emails.length; i += LOOKUP_CHUNK) {
    const chunk = emails.slice(i, i + LOOKUP_CHUNK)
    const { data } = await supabase
      .from(table)
      .select('email')
      .eq(scopeColumn, scopeValue)
      .in('email', chunk)
    for (const r of data ?? []) found.add(String(r.email).toLowerCase())
  }
  return found
}

function buildInsertRow(
  ownerId: string,
  eventId: string,
  row: ReturnType<typeof normalizeRow>,
): Record<string, unknown> {
  return {
    owner_id: ownerId,
    event_id: eventId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    raw_role: row.raw_role,
    cnpj: row.cnpj || null,
    city: row.city || null,
    notes: row.notes || null,
    rsvp: row.rsvp,
    has_degree: row.has_degree || null,
    classification_status: 'Pendente',
    priority: 'Média',
  }
}

function validateBody(body: ImportBody): string | null {
  if (!body?.event_id) return 'ID do evento é obrigatório'
  if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
    return 'Nenhum contato enviado para importação'
  }
  return null
}

function normalizeRow(row: ImportRow) {
  const rsvpInput = (row.rsvp || '').trim().toLowerCase()
  const rsvp = rsvpInput.includes('confirm')
    ? 'Confirmou'
    : rsvpInput.includes('recus')
      ? 'Recusou'
      : 'Aguardando'

  const degreeInput = (row.has_degree || '').trim().toLowerCase()
  const hasDegree = degreeInput.startsWith('s') ? 'Sim' : degreeInput.startsWith('n') ? 'Não' : ''

  return {
    name: (row.name || '').trim(),
    email: (row.email || '').trim().toLowerCase(),
    phone: (row.phone || '').trim(),
    company: (row.company || '').trim(),
    raw_role: (row.raw_role || '').trim(),
    cnpj: (row.cnpj || '').trim(),
    city: (row.city || '').trim(),
    notes: (row.notes || '').trim(),
    rsvp,
    has_degree: hasDegree,
  }
}

function validateRow(row: ReturnType<typeof normalizeRow>): string | null {
  if (!row.name) return 'Nome do participante ausente'
  if (!row.email || !row.email.includes('@')) return 'Endereço de e-mail inválido ou ausente'
  return null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
