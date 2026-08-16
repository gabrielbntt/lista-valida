import supabase from './client'

export async function getCurrentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Não autenticado')
  return userId
}
