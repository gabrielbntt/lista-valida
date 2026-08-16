import supabase from '@/lib/supabase/client'
import { getCurrentUserId } from '@/lib/supabase/current-user'

export type BlockReason = 'Reclamação' | 'Descadastro' | 'Bounce' | 'Manual'
export type BlockSource = 'link_descadastro' | 'formulario' | 'provedor' | 'manual'

export interface BlockedContactRecord {
  id: string
  contact?: string
  event?: string
  name?: string
  email: string
  reason: BlockReason
  source: BlockSource
  notes?: string
  blocked_at?: string
  created: string
  updated: string
  expand?: { event?: { name: string } }
}

interface BlockedContactRow {
  id: string
  contact_id: string | null
  event_id: string | null
  name: string | null
  email: string
  reason: BlockReason
  source: BlockSource
  notes: string | null
  blocked_at: string | null
  created_at: string
  updated_at: string
  event: { name: string }[] | null
}

const SELECT =
  'id, contact_id, event_id, name, email, reason, source, notes, blocked_at, created_at, updated_at, event:events(name)'

function mapRow(row: BlockedContactRow): BlockedContactRecord {
  return {
    id: row.id,
    contact: row.contact_id ?? undefined,
    event: row.event_id ?? undefined,
    name: row.name ?? undefined,
    email: row.email,
    reason: row.reason,
    source: row.source,
    notes: row.notes ?? undefined,
    blocked_at: row.blocked_at ?? undefined,
    created: row.created_at,
    updated: row.updated_at,
    expand: row.event?.[0] ? { event: row.event[0] } : undefined,
  }
}

export const getBlockedContacts = async (): Promise<BlockedContactRecord[]> => {
  const { data, error } = await supabase
    .from('blocked_contacts')
    .select(SELECT)
    .order('blocked_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow)
}

export const createBlockedContact = async (data: {
  name?: string
  email: string
  event?: string
  notes?: string
}): Promise<BlockedContactRecord> => {
  const owner_id = await getCurrentUserId()
  const { data: row, error } = await supabase
    .from('blocked_contacts')
    .insert({
      owner_id,
      name: data.name,
      email: data.email,
      event_id: data.event,
      notes: data.notes,
      reason: 'Manual',
      source: 'manual',
      blocked_at: new Date().toISOString(),
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(row)
}

export const deleteBlockedContact = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('blocked_contacts').delete().eq('id', id)
  if (error) throw error
  return true
}
