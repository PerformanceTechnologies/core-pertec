-- Enlaces para que el PROVEEDOR confirme la orden de compra (o pida modificarla) desde el correo, sin cuenta en el
-- Core, como en Odoo. Cada envío de la OC crea un enlace nuevo (y deja sin efecto los anteriores sin responder).
--
-- Del enlace se guarda solo el HASH (sha256) del código: con la base a la vista igual no se puede armar un enlace
-- válido. La respuesta queda aquí (quién respondió, qué y cuándo) y, si confirma, también en fin_compras
-- (oc_respuesta = 'aceptada'), igual que cuando se marca a mano.
--
-- Solo agrega una tabla nueva: no toca datos existentes. Se puede correr más de una vez.

create table if not exists public.fin_oc_enlaces (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  compra_id uuid not null references public.fin_compras(id) on delete cascade,
  token_hash text not null unique,
  -- Quien envió la OC (el negociante): a esa persona le llega el aviso de la respuesta.
  creado_por text not null,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  visto_en timestamptz,
  respondido_en timestamptz,
  respuesta text check (respuesta in ('aceptada', 'modificacion')),
  respuesta_nombre text,
  respuesta_comentario text
);

create index if not exists fin_oc_enlaces_compra on public.fin_oc_enlaces (compra_id, creado_en desc);

-- Solo el servidor (service role) la lee y escribe: sin políticas, nadie más.
alter table public.fin_oc_enlaces enable row level security;

comment on table public.fin_oc_enlaces is
  'Enlaces de confirmación de OC para el proveedor (se guarda el hash del código). Ver lib/fin/oc-enlace.ts.';
