-- Campo cidade em mailing_contacts, exibido na aba Contatos.
alter table public.mailing_contacts add column if not exists city text;
