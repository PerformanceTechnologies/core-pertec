-- Tareas: varios responsables por tarea y quién la asignó.
--
-- responsables reemplaza a la columna responsable (uno solo): lo que ya estaba
-- asignado se copia a la lista. La columna vieja queda sin uso; se puede borrar
-- más adelante cuando no quede código que la lea.
--
-- Se puede correr más de una vez.

alter table public.crm_tareas add column if not exists responsables text[] not null default '{}';
alter table public.crm_tareas add column if not exists asignado_por text;

update public.crm_tareas
  set responsables = array[responsable]
  where responsable is not null and responsable <> '' and responsables = '{}';

create index if not exists crm_tareas_responsables_idx on public.crm_tareas using gin (responsables);

comment on column public.crm_tareas.responsables is 'Correos de los usuarios del Core a cargo de la tarea.';
comment on column public.crm_tareas.asignado_por is 'Correo de quien asignó la tarea.';
