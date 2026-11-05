-- Muro: el chat general de cada empresa (solo texto por ahora).
--
-- Cada mensaje es de una empresa: se ve solo parado en esa empresa (el selector de arriba a la
-- derecha). Las menciones (@persona) van dentro del texto como @{correo} y además en
-- `menciones`, para avisarle a cada una por la campana.
--
-- Se puede correr más de una vez.

create table if not exists public.muro_mensajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  autor_correo text not null,
  autor_nombre text,
  texto text not null check (char_length(texto) between 1 and 4000),
  menciones text[] not null default '{}',
  creado_en timestamptz not null default now(),
  eliminado boolean not null default false
);

create index if not exists muro_mensajes_empresa_fecha on public.muro_mensajes (empresa_id, creado_en desc);

alter table public.muro_mensajes enable row level security;
