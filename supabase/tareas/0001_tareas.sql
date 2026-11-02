-- Tareas: un tablero simple estilo Trello dentro de CRM.
--
-- Tres columnas fijas (Por hacer, En curso, Hecho) y tarjetas que se arrastran
-- entre ellas. Una sola tabla: si más adelante hacen falta varios tableros,
-- etiquetas o comentarios, se agregan en una migración nueva.
--
-- Se puede correr más de una vez.

create table if not exists public.crm_tareas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (length(trim(titulo)) > 0),
  descripcion  text,
  estado       text not null default 'por_hacer'
                 check (estado in ('por_hacer', 'en_curso', 'hecho')),
  prioridad    text not null default 'media'
                 check (prioridad in ('baja', 'media', 'alta')),
  responsable  text,
  fecha_limite date,
  orden        double precision not null default 0,
  creado_por   text,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists crm_tareas_estado_orden_idx on public.crm_tareas (estado, orden);

comment on table public.crm_tareas is 'Tarjetas del tablero de Tareas (CRM). orden ordena dentro de cada columna.';

-- RLS encendido y sin políticas, como el resto del Core: solo entra el servidor.
alter table public.crm_tareas enable row level security;

insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Tareas', 'tareas', '/tareas', 'interna', 'clipboard-list', 'naranjo',
       'Tablero de tareas del equipo: por hacer, en curso y hecho.',
       'activa', 25
where not exists (select 1 from public.aplicaciones where slug = 'tareas');
