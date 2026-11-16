-- Contactos: «Mandante» y sigla automática (máx. 4 letras, única).
-- mandante_ids: los mandantes (contactos marcados como mandante) con que trabaja este cliente.
-- La sigla de los contactos que ya existen la pone el Core solo, la primera vez que abre la libreta.
-- Se puede correr más de una vez.
alter table public.finanzas_contactos add column if not exists es_mandante boolean not null default false;
alter table public.finanzas_contactos add column if not exists mandante_ids uuid[] not null default '{}';
alter table public.finanzas_contactos add column if not exists sigla text;
alter table public.finanzas_contactos drop constraint if exists finanzas_contactos_sigla_check;
alter table public.finanzas_contactos add constraint finanzas_contactos_sigla_check check (sigla ~ '^[A-Z]{1,4}$');
create unique index if not exists finanzas_contactos_sigla on public.finanzas_contactos (sigla);
