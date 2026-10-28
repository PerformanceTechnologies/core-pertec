-- Multiempresa en el Core PERTEC.
--
-- Hasta acá el Core asumía una sola empresa (Performance Technologies) en todas
-- partes. Ahora el grupo son tres —PERTEC, Zeus y Performance Service— y hace
-- falta poder pararse en una y mirar el Core desde ahí, sobre todo para lo que
-- viene después: facturación y contabilidad de las otras dos.
--
-- Esta migración trae SOLO el cimiento: las empresas, el permiso por persona y
-- cuál está activa. NO reparte los datos de los módulos por empresa: hoy todo lo
-- que existe es de PERTEC y se sigue viendo igual. Repartirlos es el paso
-- siguiente, módulo por módulo, y conviene hacerlo con el cimiento ya puesto y
-- probado en vez de todo junto.
--
-- El Core de IH no lleva esto: es de una sola empresa a propósito.

-- -----------------------------------------------------------------------------
-- 1. Las empresas del grupo.
-- -----------------------------------------------------------------------------
create table if not exists public.empresas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text not null unique,
  rut        text,
  color      text not null default 'naranjo',
  logo       text,
  orden      int  not null default 0,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);

comment on table public.empresas is
  'Las empresas del grupo. El selector del menú del Core muestra las que la persona tiene asignadas.';
comment on column public.empresas.slug is
  'Identificador estable para URLs y cookies. El nombre se puede corregir; el slug no se toca.';

-- -----------------------------------------------------------------------------
-- 2. Quién puede pararse en cuál.
-- -----------------------------------------------------------------------------
--  Mismo esquema que usuario_aplicaciones: una fila por par. Sin filas, la
--  persona no ve ninguna empresa más que la de por omisión — NUNCA "todas",
--  porque la tabla vacía es el estado natural de un usuario recién creado y ese
--  no puede ser el que más permisos otorga.
--
--  El admin del core entra a todas, como en el resto del sistema.
create table if not exists public.usuario_empresas (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  creado_en  timestamptz not null default now(),
  primary key (usuario_id, empresa_id)
);

create index if not exists usuario_empresas_empresa_idx on public.usuario_empresas (empresa_id);

-- -----------------------------------------------------------------------------
-- 3. RLS: encendido y sin políticas, como el resto del Core.
-- -----------------------------------------------------------------------------
--  Todo pasa por el servidor con service_role, que se saltea RLS. Encenderlo sin
--  políticas deja las tablas cerradas para la llave pública. Una política acá
--  las abriría.
alter table public.empresas         enable row level security;
alter table public.usuario_empresas enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Las tres empresas.
-- -----------------------------------------------------------------------------
--  PERTEC va primera y con orden 0: es la de por omisión, la que ve quien no
--  tiene ninguna asignada, y la dueña de todo lo que hay cargado hoy.
insert into public.empresas (nombre, slug, color, orden)
select 'Performance Technologies', 'pertec', 'naranjo', 0
where not exists (select 1 from public.empresas where slug = 'pertec');

insert into public.empresas (nombre, slug, color, orden)
select 'Zeus', 'zeus', 'teal', 1
where not exists (select 1 from public.empresas where slug = 'zeus');

insert into public.empresas (nombre, slug, color, orden)
select 'Performance Service', 'performance-service', 'gris', 2
where not exists (select 1 from public.empresas where slug = 'performance-service');

-- -----------------------------------------------------------------------------
-- 5. Los admin del core arrancan con las tres.
-- -----------------------------------------------------------------------------
--  No les hace falta para ENTRAR (el rol admin ya abre todas), pero sí para que
--  la pantalla de Usuarios muestre las casillas marcadas y no parezca que un
--  admin está sin empresas.
insert into public.usuario_empresas (usuario_id, empresa_id)
select u.id, e.id
from public.usuarios u
cross join public.empresas e
where u.rol = 'admin'
on conflict do nothing;
