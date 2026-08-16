import { useEffect, useRef } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import supabase from '@/lib/supabase/client'

/**
 * Hook for real-time subscriptions to a Supabase table (postgres_changes).
 * ALWAYS use this hook instead of subscribing inline. Cada chamada abre
 * seu proprio canal (nome unico), entao varios componentes podem assinar
 * a mesma tabela sem conflito. RLS ja escopa quais linhas cada canal
 * entrega - sem filtro adicional aqui, mesmo padrao do hook anterior
 * (PocketBase SSE) que so disparava um refetch completo, nunca usava o
 * payload do evento.
 */
export function useRealtime<TRow extends Record<string, unknown> = Record<string, unknown>>(
  tableName: string,
  callback: (payload: RealtimePostgresChangesPayload<TRow>) => void,
  enabled: boolean = true,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`${tableName}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload: RealtimePostgresChangesPayload<TRow>) => callbackRef.current(payload),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tableName, enabled])
}

export default useRealtime
