import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import supabase from '@/lib/supabase/client'

export interface AuthUser {
  id: string
  email: string
  name?: string
  role: 'admin' | 'user'
  sender_name?: string
  sender_email?: string
}

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  signUp: (email: string, password: string, name?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  updateProfile: (data: { sender_name?: string; sender_email?: string }) => Promise<{ error: Error | null }>
  refreshSession: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUser(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadUser = async (session: Session | null) => {
    if (!session) {
      setUser(null)
      setLoading(false)
      return
    }
    const profile = await fetchProfile(session.user.id)
    setUser(buildAuthUser(session, profile))
    setLoading(false)
  }

  const signUp = async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name || email.split('@')[0] } },
    })
    if (error) return { error }
    return { error: null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const updateProfile = async (data: { sender_name?: string; sender_email?: string }) => {
    if (!user) return { error: new Error('Não autenticado') }
    const { error } = await supabase.rpc('update_own_profile', {
      p_sender_name: data.sender_name ?? null,
      p_sender_email: data.sender_email ?? null,
    })
    if (error) return { error }
    setUser({ ...user, ...data })
    return { error: null }
  }

  const refreshSession = async () => {
    const { data } = await supabase.auth.refreshSession()
    await loadUser(data.session)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        signUp,
        signIn,
        signOut,
        updateProfile,
        refreshSession,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('sender_name, sender_email')
    .eq('id', userId)
    .maybeSingle()
  return data
}

function buildAuthUser(
  session: Session,
  profile: { sender_name: string | null; sender_email: string | null } | null,
): AuthUser {
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: (session.user.user_metadata?.name as string | undefined) ?? undefined,
    role: (session.user.app_metadata?.role as 'admin' | 'user') ?? 'user',
    sender_name: profile?.sender_name ?? undefined,
    sender_email: profile?.sender_email ?? undefined,
  }
}

// O shim de sessao paralela no PocketBase (fases 4/5) foi removido: nenhum
// service do frontend usa mais o PocketBase para dados, entao manter a
// sessao dupla so gerava erro 400 ("value must be unique") a cada cadastro
// com e-mail ja existente no PocketBase.
