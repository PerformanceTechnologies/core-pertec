-- Muro: roles por empresa, para decidir quién puede borrar mensajes.
--
--   moderador   → borra cualquier mensaje del muro de esa empresa.
--   miembro     → borra solo sus propios mensajes (es lo que tiene quien no aparece en la tabla).
--   sin_borrar  → no puede borrar nada, ni lo suyo.
--
-- Los administradores del Core siempre pueden borrar todo y son quienes asignan los roles.
-- Se puede correr más de una vez.

create table if not exists public.muro_roles (
  empresa_id uuid not null,
  correo text not null,
  rol text not null check (rol in ('moderador', 'miembro', 'sin_borrar')),
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, correo)
);

alter table public.muro_roles enable row level security;
