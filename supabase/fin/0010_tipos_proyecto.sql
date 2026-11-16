-- Proyectos: se pueden crear tipos nuevos además de contrato, spot, arriendo e interno.
-- Se puede correr más de una vez.
alter table public.fin_proyectos drop constraint if exists fin_proyectos_tipo_check;
alter table public.fin_proyectos add constraint fin_proyectos_tipo_check check (tipo ~ '^[a-z0-9_]{1,30}$');
