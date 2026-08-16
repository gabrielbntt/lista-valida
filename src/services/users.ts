import supabase from '@/lib/supabase/client'

export interface UserRecord {
  id: string
  name?: string
  email: string
  role: 'admin' | 'user'
  sender_name?: string
  sender_email?: string
  created: string
  updated: string
}

interface AdminListUserRow {
  id: string
  email: string
  name: string | null
  role: 'admin' | 'user'
  sender_name: string | null
  sender_email: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: AdminListUserRow): UserRecord {
  return {
    id: row.id,
    name: row.name ?? undefined,
    email: row.email,
    role: row.role,
    sender_name: row.sender_name ?? undefined,
    sender_email: row.sender_email ?? undefined,
    created: row.created_at,
    updated: row.updated_at,
  }
}

export const getUsers = async (): Promise<UserRecord[]> => {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw error
  return ((data ?? []) as AdminListUserRow[]).map(mapRow)
}

export const createUser = async (data: {
  name: string
  email: string
  password: string
  role: 'admin' | 'user'
}): Promise<{ id: string; email: string }> => {
  const { data: result, error } = await supabase.functions.invoke<{ id: string; email: string }>(
    'create-user',
    { body: data },
  )
  if (error) throw error
  return result as { id: string; email: string }
}

export const updateUserRole = async (id: string, role: 'admin' | 'user'): Promise<void> => {
  const { error } = await supabase.rpc('set_user_role', { p_user_id: id, p_role: role })
  if (error) throw error
}
