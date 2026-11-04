-- Tareas: rango de fechas.
--
-- Hasta ahora una tarea tenía solo fecha límite. Ahora puede tener además una fecha de inicio
-- (opcional): «del 3 al 7 de noviembre». La fecha límite sigue siendo el fin y la que marca si
-- está vencida. Las tareas que ya existen quedan igual (sin inicio).
--
-- Se puede correr más de una vez.

alter table public.crm_tareas add column if not exists fecha_inicio date;

comment on column public.crm_tareas.fecha_inicio is
  'Desde cuándo se trabaja la tarea (opcional). Con fecha_limite forma un rango.';

alter table public.crm_tareas drop constraint if exists crm_tareas_rango_fechas_check;
alter table public.crm_tareas
  add constraint crm_tareas_rango_fechas_check
  check (fecha_inicio is null or fecha_limite is null or fecha_inicio <= fecha_limite);

notify pgrst, 'reload schema';
