-- Fase 5: habilita Supabase Realtime (postgres_changes) nas tabelas que o
-- frontend assina via useRealtime (equivalente ao SSE '*' por colecao do
-- PocketBase). RLS ja escopa quais linhas cada assinante recebe.
alter publication supabase_realtime add table public.mailing_contacts;
alter publication supabase_realtime add table public.email_campaigns;
alter publication supabase_realtime add table public.email_logs;
alter publication supabase_realtime add table public.email_templates;
alter publication supabase_realtime add table public.blocked_contacts;
alter publication supabase_realtime add table public.profiles;
