-- Registro de uso del buscador con IA, para un límite real (compartido entre servidores).
--
-- El buscador no tenía límite: cada consulta es una llamada paga a la IA. Con una fila por consulta
-- el tope se cuenta contra la base y vale para todas las instancias.

create table if not exists public.consulta_ia_usos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  creado_en timestamptz not null default now()
);

create index if not exists consulta_ia_usos_persona_fecha
  on public.consulta_ia_usos (usuario_id, creado_en desc);

alter table public.consulta_ia_usos enable row level security;
