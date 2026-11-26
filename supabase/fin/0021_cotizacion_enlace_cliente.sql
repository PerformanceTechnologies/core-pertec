-- Enlaces para que el CLIENTE acepte la cotización (o pida modificarla) desde el correo, sin cuenta en el Core, como
-- en Odoo. Igual que fin_oc_enlaces (0019): cada envío crea un enlace nuevo y deja sin efecto los anteriores sin
-- responder; se guarda solo el HASH del código.
--
-- Si acepta, la cotización se acepta completa (lib/fin/cotizacion-aceptar.ts: proyecto si hace falta e hitos en una
-- sola parte), como con el botón «Aceptar y generar hitos» del Core.
--
-- Solo agrega una tabla nueva: no toca datos existentes. Se puede correr más de una vez.

create table if not exists public.fin_cotizacion_enlaces (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cotizacion_id uuid not null references public.fin_cotizaciones(id) on delete cascade,
  token_hash text not null unique,
  -- Quien envió la cotización (el negociante): a esa persona le llega el aviso de la respuesta.
  creado_por text not null,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  visto_en timestamptz,
  respondido_en timestamptz,
  respuesta text check (respuesta in ('aceptada', 'modificacion')),
  respuesta_nombre text,
  respuesta_comentario text,
  -- El N° de orden de compra que el cliente escribió al aceptar (si lo dio).
  respuesta_oc text
);

create index if not exists fin_cotizacion_enlaces_cotizacion on public.fin_cotizacion_enlaces (cotizacion_id, creado_en desc);

-- Solo el servidor (service role) la lee y escribe: sin políticas, nadie más.
alter table public.fin_cotizacion_enlaces enable row level security;

comment on table public.fin_cotizacion_enlaces is
  'Enlaces de aceptación de cotizaciones para el cliente (se guarda el hash del código). Ver lib/fin/cotizacion-enlace.ts.';
