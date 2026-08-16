import supabase from '@/lib/supabase/client'
import { getCurrentUserId } from '@/lib/supabase/current-user'

export type TemplateCategory =
  | 'RSVP'
  | 'Envio de Certificado'
  | 'Convite'
  | 'Pitch'
  | 'Convite para Comunidade Exclusiva'

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'RSVP',
  'Envio de Certificado',
  'Convite',
  'Pitch',
  'Convite para Comunidade Exclusiva',
]

export interface TemplateRecord {
  id: string
  name: string
  category: TemplateCategory
  sender_name?: string
  sender_email?: string
  subject: string
  body_template: string
  created: string
  updated: string
}

export interface TemplateInput {
  name: string
  category: TemplateCategory
  sender_name?: string
  sender_email?: string
  subject: string
  body_template: string
}

interface TemplateRow {
  id: string
  name: string
  category: TemplateCategory
  sender_name: string | null
  sender_email: string | null
  subject: string
  body: string
  created_at: string
  updated_at: string
}

const SELECT = 'id, name, category, sender_name, sender_email, subject, body, created_at, updated_at'

function mapRow(row: TemplateRow): TemplateRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sender_name: row.sender_name ?? undefined,
    sender_email: row.sender_email ?? undefined,
    subject: row.subject,
    body_template: row.body,
    created: row.created_at,
    updated: row.updated_at,
  }
}

function toPatch(data: Partial<TemplateInput>): Record<string, unknown> {
  const { body_template, ...rest } = data
  const patch: Record<string, unknown> = { ...rest }
  if (body_template !== undefined) patch.body = body_template
  return patch
}

export const getTemplates = async (): Promise<TemplateRecord[]> => {
  const { data, error } = await supabase
    .from('email_templates')
    .select(SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow)
}

export const getTemplate = async (id: string): Promise<TemplateRecord> => {
  const { data, error } = await supabase.from('email_templates').select(SELECT).eq('id', id).single()
  if (error) throw error
  return mapRow(data)
}

export const createTemplate = async (data: TemplateInput): Promise<TemplateRecord> => {
  const owner_id = await getCurrentUserId()
  const { data: row, error } = await supabase
    .from('email_templates')
    .insert({ ...toPatch(data), owner_id })
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(row)
}

export const updateTemplate = async (
  id: string,
  data: Partial<TemplateInput>,
): Promise<TemplateRecord> => {
  const { data: row, error } = await supabase
    .from('email_templates')
    .update(toPatch(data))
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return mapRow(row)
}

export const deleteTemplate = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('email_templates').delete().eq('id', id)
  if (error) throw error
  return true
}
