-- Solicitudes de cotización: pedirle a un contacto (normalmente un proveedor) que cotice algo.
-- Pueden nacer de un lead que «necesita compra»; la compra que se arme después queda enlazada al lead.
-- Se puede correr más de una vez.

create table if not exists public.fin_solicitudes_cotizacion (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  codigo          text not null,
  contacto_id     uuid references public.finanzas_contactos(id),
  oportunidad_id  uuid references public.fin_oportunidades(id) on delete set null,
  correo          text not null,
  asunto          text not null,
  mensaje         text not null,
  items           jsonb not null default '[]'::jsonb,
  responder_antes date,
  estado          text not null default 'enviada' check (estado in ('enviada', 'recibida', 'cerrada')),
  compra_id       uuid references public.fin_compras(id) on delete set null,
  creado_por      text,
  creado_en       timestamptz not null default now()
);
create index if not exists fin_solicitudes_cotizacion_empresa on public.fin_solicitudes_cotizacion (empresa_id, creado_en desc);
create index if not exists fin_solicitudes_cotizacion_oportunidad on public.fin_solicitudes_cotizacion (oportunidad_id);
alter table public.fin_solicitudes_cotizacion enable row level security;

alter table public.fin_oportunidades add column if not exists necesita_compra boolean not null default false;
alter table public.fin_compras add column if not exists oportunidad_id uuid references public.fin_oportunidades(id) on delete set null;
create index if not exists fin_compras_oportunidad on public.fin_compras (oportunidad_id);
