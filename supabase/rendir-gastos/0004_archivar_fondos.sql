-- =============================================================================
--  Rendir Gastos — archivar fondos (en vez de borrarlos).
--
--  Un fondo archivado NO se borra: conserva su libro, sus informes y su auditoría, solo deja de verse en
--  las listas y de contar en los pendientes. Se puede desarchivar. Solo agrega dos columnas opcionales.
--
--  Se puede correr más de una vez.
-- =============================================================================

alter table public.rg_fondos
  add column if not exists archivado_en  timestamptz,
  add column if not exists archivado_por text;

create index if not exists rg_fondos_archivados on public.rg_fondos (empresa_id) where archivado_en is not null;

notify pgrst, 'reload schema';
