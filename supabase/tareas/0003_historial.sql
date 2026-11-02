-- Tareas: historial de cada tarjeta.
--
-- Una fila por cosa que pasó: se creó, se editó (con qué cambió) o cambió de
-- columna. Se borra junto con la tarea.
--
-- Se puede correr más de una vez.

create table if not exists public.crm_tareas_historial (
  id        uuid primary key default gen_random_uuid(),
  tarea_id  uuid not null references public.crm_tareas (id) on delete cascade,
  accion    text not null check (accion in ('creada', 'editada', 'estado')),
  detalle   text,
  correo    text,
  nombre    text,
  creado_en timestamptz not null default now()
);

create index if not exists crm_tareas_historial_tarea_idx on public.crm_tareas_historial (tarea_id, creado_en desc);

comment on table public.crm_tareas_historial is 'Qué pasó con cada tarea, quién y cuándo.';

alter table public.crm_tareas_historial enable row level security;
