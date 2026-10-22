-- Buzón de notificaciones del core (campana en el menú).
--
-- Un único lugar donde caen los avisos de todos los módulos para que no se escapen. Cada
-- notificación pertenece a un módulo (su slug de aplicación) o es global (modulo null): la ve quien
-- tenga acceso a ese módulo, y el admin siempre. El estado "leída" es por persona, en otra tabla.

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  modulo text,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  enlace text,
  severidad text not null default 'info',
  clave text unique,
  creado_en timestamptz not null default now()
);

create index if not exists notificaciones_modulo_fecha
  on public.notificaciones (modulo, creado_en desc);

create table if not exists public.notificaciones_vistas (
  notificacion_id uuid not null references public.notificaciones(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  vista_en timestamptz not null default now(),
  primary key (notificacion_id, usuario_id)
);

alter table public.notificaciones enable row level security;
alter table public.notificaciones_vistas enable row level security;
