-- Tareas: notas con archivos y visibilidad.
--
-- 1. visible_general: con true (lo de siempre) la ve todo el que tiene la app;
--    con false, solo sus responsables y quien la asignó. Solo ellos pueden
--    cambiarla. La regla la aplica el servidor (lib/tareas-modelo.ts).
-- 2. crm_tareas_notas: comentarios de texto con archivos adjuntos. Los archivos
--    van al bucket PRIVADO "tareas" y se bajan con un enlace firmado de un
--    minuto, después de revisar que quien pide pueda ver la tarea.
-- 3. El historial anota también las notas.
--
-- Se puede correr más de una vez.

alter table public.crm_tareas add column if not exists visible_general boolean not null default true;

comment on column public.crm_tareas.visible_general is
  'true: la ve todo el que tiene la app. false: solo responsables y quien la asignó.';

create table if not exists public.crm_tareas_notas (
  id        uuid primary key default gen_random_uuid(),
  tarea_id  uuid not null references public.crm_tareas (id) on delete cascade,
  texto     text,
  -- [{ "nombre": "cotizacion.pdf", "ruta": "<tarea>/<uuid>.pdf", "tipo": "application/pdf", "tamano": 12345 }]
  archivos  jsonb not null default '[]'::jsonb,
  correo    text not null,
  nombre    text,
  creado_en timestamptz not null default now()
);

create index if not exists crm_tareas_notas_tarea_idx on public.crm_tareas_notas (tarea_id, creado_en desc);

comment on table public.crm_tareas_notas is 'Notas de una tarea: texto y archivos (bucket privado "tareas").';

alter table public.crm_tareas_notas enable row level security;

alter table public.crm_tareas_historial drop constraint if exists crm_tareas_historial_accion_check;
alter table public.crm_tareas_historial
  add constraint crm_tareas_historial_accion_check check (accion in ('creada', 'editada', 'estado', 'nota'));

-- El bucket privado de los adjuntos (sin políticas: solo entra el servidor).
insert into storage.buckets (id, name, public, file_size_limit)
values ('tareas', 'tareas', false, 4194304)
on conflict (id) do nothing;
