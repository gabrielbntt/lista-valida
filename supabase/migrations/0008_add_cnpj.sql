-- Fase 5 (reconciliacao): campo cnpj em mailing_contacts, adicionado em
-- paralelo do lado do PocketBase enquanto a migracao Supabase estava em
-- andamento. Incorporado aqui para nao perder a funcionalidade.
alter table public.mailing_contacts add column if not exists cnpj text;
