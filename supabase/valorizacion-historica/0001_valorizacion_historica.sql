-- Valorización histórica: el «Registro Maestro de Compras» (materiales, herramientas y EPP sacados
-- de los DTE recibidos del SII), para consultar y valorizar. Solo lectura: los datos entran
-- únicamente subiendo el Excel desde /valorizacion-historica/importar.
--
--   vh_importaciones  cada carga del Excel. Una sola está «activa»; la anterior queda guardada
--                     como «reemplazada» (por si hay que volver atrás) y las más viejas se borran.
--   vh_lineas         hoja «Detalle compras»: una fila por línea de glosa.
--   vh_documentos     hoja «Facturas»: facturas, notas de crédito y de débito.
--   vh_proveedores    hoja «Proveedores».
--   vh_categorias     hoja «Categorías»: la clasificación y su criterio.
--   La hoja «Control y observaciones» va como jsonb en vh_importaciones.control.
--
-- Se puede correr más de una vez.

create table if not exists public.vh_importaciones (
  id           uuid primary key default gen_random_uuid(),
  archivo      text not null,
  estado       text not null default 'cargando' check (estado in ('cargando', 'activa', 'reemplazada', 'fallida')),
  desde        date,
  hasta        date,
  lineas       int not null default 0,
  documentos   int not null default 0,
  proveedores  int not null default 0,
  monto_total  numeric(16, 2) not null default 0,
  control      jsonb not null default '{}'::jsonb,
  creado_por   text,
  creado_en    timestamptz not null default now()
);
create unique index if not exists vh_importaciones_una_activa on public.vh_importaciones ((true)) where estado = 'activa';

create table if not exists public.vh_lineas (
  importacion_id           uuid not null references public.vh_importaciones(id) on delete cascade,
  n                        int not null,
  fecha                    date not null,
  tipo_documento           text not null,
  folio                    bigint not null,
  rut                      text not null,
  proveedor                text not null,
  codigo_proveedor         text,
  glosa                    text not null,
  producto                 text,
  marca                    text,
  modelo                   text,
  talla                    text,
  categoria                text not null,
  subcategoria             text not null,
  tipo_item                text not null,
  cantidad                 numeric(14, 4),
  unidad                   text,
  precio_unitario          numeric(16, 4),
  descuento_linea          numeric(8, 6),
  valor_linea              numeric(16, 2) not null default 0,
  factor_descuento_global  numeric(10, 8) not null default 1,
  valor_ajustado           numeric(16, 2) not null default 0,
  costo_unitario           numeric(18, 6),
  estado_cuadratura        text not null default '',
  revisar                  boolean not null default false,
  pdf                      text,
  referencias              text,
  clave                    text not null,
  primary key (importacion_id, n)
);
create index if not exists vh_lineas_clave_idx on public.vh_lineas (importacion_id, clave);
create index if not exists vh_lineas_rut_idx on public.vh_lineas (importacion_id, rut);

create table if not exists public.vh_documentos (
  importacion_id     uuid not null references public.vh_importaciones(id) on delete cascade,
  n                  int not null,
  fecha              date not null,
  tipo               text not null,
  folio              bigint not null,
  rut                text not null,
  proveedor          text not null,
  direccion          text,
  comuna             text,
  contacto_pertec    text,
  monto_neto         numeric(16, 2) not null default 0,
  monto_exento       numeric(16, 2) not null default 0,
  iva                numeric(16, 2) not null default 0,
  impuesto_adicional numeric(16, 2) not null default 0,
  total              numeric(16, 2) not null default 0,
  estado_cuadratura  text not null default '',
  referencias        text,
  pdf                text,
  primary key (importacion_id, n)
);

create table if not exists public.vh_proveedores (
  importacion_id      uuid not null references public.vh_importaciones(id) on delete cascade,
  rut                 text not null,
  razon_social        text not null,
  giro                text,
  direccion           text,
  comuna              text,
  email               text,
  contacto_pertec     text,
  categoria_principal text,
  primary key (importacion_id, rut)
);

create table if not exists public.vh_categorias (
  importacion_id  uuid not null references public.vh_importaciones(id) on delete cascade,
  orden           int not null,
  categoria       text not null,
  subcategoria    text not null,
  tipo_item       text not null default '',
  criterio        text,
  primary key (importacion_id, orden)
);

-- Como el resto del Core: se lee y escribe solo desde el servidor (service role).
alter table public.vh_importaciones enable row level security;
alter table public.vh_lineas        enable row level security;
alter table public.vh_documentos    enable row level security;
alter table public.vh_proveedores   enable row level security;
alter table public.vh_categorias    enable row level security;

-- Deja activa una carga ya completa, en una sola transacción: quien está mirando pasa de los datos
-- viejos a los nuevos sin ver nunca el registro vacío. Guarda la carga anterior y borra las demás.
create or replace function public.vh_activar_importacion(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vh_importaciones where id = p_id and estado = 'cargando') then
    raise exception 'La carga % no existe o ya no está en curso', p_id;
  end if;
  update vh_importaciones set estado = 'reemplazada' where estado = 'activa';
  update vh_importaciones set estado = 'activa' where id = p_id;
  delete from vh_importaciones
   where id <> p_id
     and id is distinct from (select id from vh_importaciones where estado = 'reemplazada' order by creado_en desc limit 1);
end $$;
revoke all on function public.vh_activar_importacion(uuid) from public, anon, authenticated;

-- La aplicación, para poder darla por usuario desde Administración.
insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Valorización histórica', 'valorizacion-historica', '/valorizacion-historica', 'interna', 'chart-bar', 'naranjo',
       'Compras históricas de materiales, herramientas y EPP: buscador, costos, proveedores y valorización.',
       'activa', 46
where not exists (select 1 from public.aplicaciones where slug = 'valorizacion-historica');

notify pgrst, 'reload schema';
