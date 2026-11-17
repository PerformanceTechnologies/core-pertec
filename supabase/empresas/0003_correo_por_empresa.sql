-- Correo por empresa: los correos de Zeus salen desde la cuenta de Zeus de cada persona.
--
-- Hasta acá todo correo a clientes y proveedores (cotizaciones, OC, solicitudes de
-- cotización, ofertas) salía desde la cuenta de Microsoft con la que la persona entra
-- al Core, o sea desde @pertec.cl, aunque estuviera parada en Zeus.
--
-- Con esto, una empresa marcada con `correo_propio` exige que cada persona conecte UNA
-- vez su cuenta de esa empresa (un inicio de sesión de Microsoft que pide SOLO permiso
-- para enviar). Desde ahí, parado en esa empresa, el Core envía con esa cuenta.
--
-- Se puede correr más de una vez.

-- -----------------------------------------------------------------------------
-- 1. Qué empresas envían desde su propio correo.
-- -----------------------------------------------------------------------------
alter table public.empresas add column if not exists correo_propio boolean not null default false;
-- Opcional: si se llena (p. ej. 'zeusmining.cl'), solo se aceptan cuentas de ese dominio.
alter table public.empresas add column if not exists correo_dominio text;

comment on column public.empresas.correo_propio is
  'true = los correos a clientes y proveedores salen desde la cuenta de esta empresa que cada persona conecta (no desde su cuenta de PERTEC).';
comment on column public.empresas.correo_dominio is
  'Dominio que debe tener la cuenta conectada (sin @). Vacío = se acepta cualquiera que no sea la del Core.';

update public.empresas set correo_propio = true where slug = 'zeus';

-- -----------------------------------------------------------------------------
-- 2. La cuenta conectada de cada persona en cada empresa.
-- -----------------------------------------------------------------------------
--  El refresh token va cifrado con la misma llave que graph_credenciales
--  (TOKEN_CIFRADO_KEY) y solo sirve para Mail.Send: con él no se puede leer el buzón.
create table if not exists public.correo_empresa_conexiones (
  usuario_id            uuid not null references public.usuarios(id) on delete cascade,
  empresa_id            uuid not null references public.empresas(id) on delete cascade,
  cuenta                text not null,
  nombre                text,
  tenant_id             text,
  refresh_token_cifrado text not null,
  error                 text,
  conectado_en          timestamptz not null default now(),
  usado_en              timestamptz,
  actualizado_en        timestamptz not null default now(),
  primary key (usuario_id, empresa_id)
);

comment on table public.correo_empresa_conexiones is
  'Cuenta de correo de otra empresa del grupo que cada persona conectó para enviar (solo Mail.Send).';

-- RLS encendido y sin políticas, como el resto del Core: solo el servidor (service_role) llega.
alter table public.correo_empresa_conexiones enable row level security;
