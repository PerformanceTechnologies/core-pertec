-- Finanzas · Contactos: clientes y proveedores con los datos que pide el SII para facturar.
--
--   finanzas_contactos          la ficha tributaria de cada empresa o persona (el «Receptor» de
--                               la factura electrónica). Los obligatorios del SII para la factura
--                               afecta (33) y exenta (34) —formato DTE v2.5, feb-2026— son RUT,
--                               razón social, giro, dirección y comuna; el resto es para enviarla
--                               y cobrarla.
--   finanzas_contacto_personas  las personas de cada empresa (el «Atención A:» de la factura).
--
-- Los largos máximos son los del XML del SII, para que lo que se guarda acá entre tal cual en
-- una factura: razón social 100, giro 40, dirección 70, comuna y ciudad 20, contacto 80.
-- El giro admite más largo SOLO porque lo que viene de Odoo a veces lo trae así; el formulario
-- exige 40 y la ficha avisa cuando sobra.
--
-- Se puede correr más de una vez.

create table if not exists public.finanzas_contactos (
  id                   uuid primary key default gen_random_uuid(),
  rut                  text check (rut is null or rut ~ '^[0-9]{7,8}-[0-9K]$'),
  tipo_persona         text not null default 'empresa' check (tipo_persona in ('empresa', 'persona')),
  razon_social         text not null check (length(trim(razon_social)) between 1 and 100),
  giro                 text check (length(giro) <= 200),
  direccion            text check (length(direccion) <= 70),
  comuna               text check (length(comuna) <= 20),
  ciudad               text check (length(ciudad) <= 20),
  pais                 text not null default 'Chile',
  tipo_contribuyente   text not null default 'primera_categoria'
                         check (tipo_contribuyente in ('primera_categoria', 'segunda_categoria', 'consumidor_final', 'extranjero')),
  correo_dte           text check (length(correo_dte) <= 80),
  correo               text check (length(correo) <= 80),
  telefono             text check (length(telefono) <= 40),
  es_cliente           boolean not null default false,
  es_proveedor         boolean not null default false,
  plazo_pago_dias      int check (plazo_pago_dias between 0 and 365),
  notas                text,
  activo               boolean not null default true,
  odoo_id              int unique,
  odoo_ids             int[] not null default '{}',
  creado_por           text,
  actualizado_por      text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
-- El RUT es la llave: dos fichas con el mismo RUT serían dos clientes para el SII que son uno.
create unique index if not exists finanzas_contactos_rut_idx on public.finanzas_contactos (rut) where rut is not null;
create index if not exists finanzas_contactos_razon_idx on public.finanzas_contactos (lower(razon_social));

create table if not exists public.finanzas_contacto_personas (
  id           uuid primary key default gen_random_uuid(),
  contacto_id  uuid not null references public.finanzas_contactos(id) on delete cascade,
  nombre       text not null check (length(trim(nombre)) between 1 and 80),
  cargo        text check (length(cargo) <= 80),
  correo       text check (length(correo) <= 80),
  telefono     text check (length(telefono) <= 40),
  principal    boolean not null default false,
  odoo_id      int unique,
  creado_en    timestamptz not null default now()
);
create index if not exists finanzas_contacto_personas_contacto_idx on public.finanzas_contacto_personas (contacto_id);

-- RLS encendido y sin políticas, como el resto del Core: solo entra el servidor.
alter table public.finanzas_contactos         enable row level security;
alter table public.finanzas_contacto_personas enable row level security;

notify pgrst, 'reload schema';
