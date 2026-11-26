-- Plantillas de «Condiciones generales» de las cotizaciones, por empresa: textos que se guardan una vez
-- (arriendo de equipos, servicio en faena, venta…) y se cargan en una cotización con un clic.
--
-- Solo agrega una tabla nueva: no toca datos existentes. Se puede correr más de una vez.

create table if not exists public.fin_plantillas_condiciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nombre text not null,
  texto text not null,
  creado_por text not null,
  creado_en timestamptz not null default now()
);

create index if not exists fin_plantillas_condiciones_empresa on public.fin_plantillas_condiciones (empresa_id, nombre);

-- Solo el servidor (service role) la lee y escribe: sin políticas, nadie más.
alter table public.fin_plantillas_condiciones enable row level security;

comment on table public.fin_plantillas_condiciones is
  'Plantillas de condiciones generales para cotizaciones (por empresa). Ver lib/fin/plantillas-condiciones.ts.';
