-- Avisos de vencimiento de arriendos (como las alarmas de Odoo): a las personas elegidas en
-- Configuración › Avisos de arriendo les llega un correo cuando un hito de arriendo está por vencer,
-- vence hoy o ya venció y no se ha facturado. Ver lib/fin/avisos-arriendo.ts.
--
-- Solo agrega dos tablas nuevas: no toca datos existentes. Se puede correr más de una vez.
--
-- Para deshacer (borra solo estas dos tablas, nada más):
--   drop table if exists public.fin_avisos_arriendo_enviados;
--   drop table if exists public.fin_avisos_arriendo;

-- La configuración, una fila por empresa.
create table if not exists public.fin_avisos_arriendo (
  empresa_id      uuid primary key references public.empresas(id),
  activo          boolean not null default true,
  dias_antes      int not null default 3 check (dias_antes between 0 and 60),
  aviso_hoy       boolean not null default true,
  aviso_vencido   boolean not null default true,
  -- usuarios.id de quienes reciben (tienen que ser usuarios activos del Core: el enlace pide sesión).
  destinatarios   uuid[] not null default '{}',
  actualizado_por text,
  actualizado_en  timestamptz not null default now()
);

-- Registro de lo enviado: evita repetir el aviso previo y el de «vence hoy», y duplicar el de «vencido»
-- si el proceso corre más de una vez el mismo día. clave = la fecha de vencimiento (antes / hoy) o el día del envío (vencido).
create table if not exists public.fin_avisos_arriendo_enviados (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  hito_id        uuid not null references public.fin_hitos(id),
  tipo           text not null check (tipo in ('antes', 'hoy', 'vencido')),
  clave          text not null,
  destinatarios  text[] not null default '{}',
  enviado_en     timestamptz not null default now(),
  unique (hito_id, tipo, clave)
);
create index if not exists fin_avisos_arriendo_enviados_empresa on public.fin_avisos_arriendo_enviados (empresa_id, enviado_en desc);

-- Solo el servidor (service role) las lee y escribe: sin políticas, nadie más.
alter table public.fin_avisos_arriendo enable row level security;
alter table public.fin_avisos_arriendo_enviados enable row level security;

comment on table public.fin_avisos_arriendo is 'Configuración de los avisos de vencimiento de arriendos, por empresa. Ver lib/fin/avisos-arriendo.ts.';
comment on table public.fin_avisos_arriendo_enviados is 'Registro de avisos de arriendo enviados (para no repetirlos).';
