-- Fase 5 (reconciliacao): Events.tsx (pagina nova, chegou em paralelo)
-- assina useRealtime('events', ...), mas a migration 0006 nao incluiu
-- essa tabela na publicacao de Realtime.
alter publication supabase_realtime add table public.events;
