import supabase from '@/lib/supabase/client'
import { getCurrentUserId } from '@/lib/supabase/current-user'

export interface EventRecord {
  id: string
  name: string
  event_date?: string
  description?: string
  created: string
  updated: string
}

interface EventRow {
  id: string
  name: string
  event_date: string | null
  description: string | null
  created_at: string
  updated_at: string
}

const SELECT = 'id, name, event_date, description, created_at, updated_at'

function mapRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    name: row.name,
    event_date: row.event_date ?? undefined,
    description: row.description ?? undefined,
    created: row.created_at,
    updated: row.updated_at,
  }
}

export const getEvents = async (): Promise<EventRecord[]> => {
  const { data, error } = await supabase
    .from('events')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow)
}

export const getEvent = async (id: string): Promise<EventRecord> => {
  const { data, error } = await supabase.from('events').select(SELECT).eq('id', id).single()
  if (error) throw error
  return mapRow(data)
}

export const createEvent = async (data: {
  name: string
  event_date?: string
  description?: string
}): Promise<EventRecord> => {
  const owner_id = await getCurrentUserId()
  const { data: row, error } = await supabase
    .from('events')
    .insert({ ...data, owner_id })
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(row)
}

export const updateEvent = async (id: string, data: Partial<EventRecord>): Promise<EventRecord> => {
  const { id: _id, created: _created, updated: _updated, ...patch } = data
  const { data: row, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(row)
}

export const deleteEvent = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
  return true
}
