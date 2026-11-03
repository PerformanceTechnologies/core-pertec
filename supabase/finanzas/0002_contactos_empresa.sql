-- Contactos: una persona puede ser contacto de una empresa (p. ej. el jefe de compras de un cliente).
--
-- Se guarda en la ficha de la persona: empresa_id apunta a la ficha de la empresa. Si la empresa
-- se borra, la persona queda suelta (no se borra con ella).
--
-- Se puede correr más de una vez.

alter table public.finanzas_contactos
  add column if not exists empresa_id uuid references public.finanzas_contactos(id) on delete set null;

create index if not exists finanzas_contactos_empresa_idx on public.finanzas_contactos (empresa_id) where empresa_id is not null;

notify pgrst, 'reload schema';
