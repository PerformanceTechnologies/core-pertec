-- Flota: vehículos y maquinaria de PERTEC, al estilo del módulo Fleet de Odoo.
--
--   flo_marcas / flo_modelos   catálogo (fleet.vehicle.model.brand / fleet.vehicle.model)
--   flo_vehiculos              la ficha de cada vehículo (fleet.vehicle), con sus documentos
--                              chilenos: revisión técnica, permiso de circulación y SOAP
--   flo_odometro               lecturas de km u horas (fleet.vehicle.odometer)
--   flo_servicios              mantenciones, reparaciones, combustible… (fleet.vehicle.log.services)
--   flo_contratos              leasing, seguros, arriendos (fleet.vehicle.log.contract)
--   flo_asignaciones           historial de conductores (fleet.vehicle.assignation.log)
--
-- Se puede correr más de una vez.

create table if not exists public.flo_marcas (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now()
);

create table if not exists public.flo_modelos (
  id          uuid primary key default gen_random_uuid(),
  marca_id    uuid not null references public.flo_marcas(id) on delete restrict,
  nombre      text not null check (length(trim(nombre)) > 0),
  categoria   text not null default 'camioneta'
                check (categoria in ('auto', 'camioneta', 'camion', 'furgon', 'maquinaria', 'otro')),
  creado_en   timestamptz not null default now(),
  unique (marca_id, nombre)
);

create table if not exists public.flo_vehiculos (
  id                         uuid primary key default gen_random_uuid(),
  patente                    text not null unique check (length(trim(patente)) > 0),
  modelo_id                  uuid references public.flo_modelos(id) on delete set null,
  anio                       int check (anio between 1950 and 2100),
  color                      text,
  numero_chasis              text,
  numero_motor               text,
  combustible                text not null default 'diesel'
                               check (combustible in ('diesel', 'gasolina', 'electrico', 'hibrido', 'gas', 'otro')),
  unidad_odometro            text not null default 'km' check (unidad_odometro in ('km', 'horas')),
  estado                     text not null default 'disponible'
                               check (estado in ('disponible', 'asignado', 'en_taller', 'fuera_servicio', 'baja')),
  conductor                  text,
  faena                      text,
  propiedad                  text not null default 'propio' check (propiedad in ('propio', 'leasing', 'arrendado')),
  fecha_adquisicion          date,
  valor_compra               numeric(14,0) not null default 0 check (valor_compra >= 0),
  revision_tecnica_vence     date,
  permiso_circulacion_vence  date,
  soap_vence                 date,
  notas                      text,
  activo                     boolean not null default true,
  creado_por                 text,
  creado_en                  timestamptz not null default now(),
  actualizado_en             timestamptz not null default now()
);
create index if not exists flo_vehiculos_estado_idx on public.flo_vehiculos (estado) where activo;

create table if not exists public.flo_odometro (
  id            uuid primary key default gen_random_uuid(),
  vehiculo_id   uuid not null references public.flo_vehiculos(id) on delete cascade,
  fecha         date not null default current_date,
  valor         numeric(12,1) not null check (valor >= 0),
  registrado_por text,
  creado_en     timestamptz not null default now()
);
create index if not exists flo_odometro_vehiculo_idx on public.flo_odometro (vehiculo_id, fecha desc, valor desc);

create table if not exists public.flo_servicios (
  id           uuid primary key default gen_random_uuid(),
  vehiculo_id  uuid not null references public.flo_vehiculos(id) on delete cascade,
  tipo         text not null default 'mantencion'
                 check (tipo in ('mantencion', 'reparacion', 'neumaticos', 'combustible', 'lavado', 'revision', 'otro')),
  estado       text not null default 'hecho' check (estado in ('programado', 'en_curso', 'hecho', 'cancelado')),
  fecha        date not null default current_date,
  descripcion  text,
  proveedor    text,
  costo        numeric(14,0) not null default 0 check (costo >= 0),
  odometro     numeric(12,1) check (odometro >= 0),
  creado_por   text,
  creado_en    timestamptz not null default now()
);
create index if not exists flo_servicios_vehiculo_idx on public.flo_servicios (vehiculo_id, fecha desc);
create index if not exists flo_servicios_fecha_idx on public.flo_servicios (fecha desc);

create table if not exists public.flo_contratos (
  id               uuid primary key default gen_random_uuid(),
  vehiculo_id      uuid not null references public.flo_vehiculos(id) on delete cascade,
  tipo             text not null default 'seguro' check (tipo in ('leasing', 'seguro', 'arriendo', 'gps', 'otro')),
  proveedor        text,
  referencia       text,
  inicio           date not null default current_date,
  fin              date,
  costo_inicial    numeric(14,0) not null default 0 check (costo_inicial >= 0),
  costo_recurrente numeric(14,0) not null default 0 check (costo_recurrente >= 0),
  frecuencia       text not null default 'mensual' check (frecuencia in ('unico', 'mensual', 'anual')),
  cerrado          boolean not null default false,
  notas            text,
  creado_por       text,
  creado_en        timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);
create index if not exists flo_contratos_vehiculo_idx on public.flo_contratos (vehiculo_id);

create table if not exists public.flo_asignaciones (
  id           uuid primary key default gen_random_uuid(),
  vehiculo_id  uuid not null references public.flo_vehiculos(id) on delete cascade,
  conductor    text not null,
  faena        text,
  desde        date not null default current_date,
  hasta        date,
  creado_por   text,
  creado_en    timestamptz not null default now()
);
create index if not exists flo_asignaciones_vehiculo_idx on public.flo_asignaciones (vehiculo_id, desde desc);

-- RLS encendido y sin políticas, como el resto del Core: solo entra el servidor.
alter table public.flo_marcas       enable row level security;
alter table public.flo_modelos      enable row level security;
alter table public.flo_vehiculos    enable row level security;
alter table public.flo_odometro     enable row level security;
alter table public.flo_servicios    enable row level security;
alter table public.flo_contratos    enable row level security;
alter table public.flo_asignaciones enable row level security;

-- Marcas habituales para partir (se pueden agregar más en Configuración).
insert into public.flo_marcas (nombre)
select m from unnest(array['Toyota', 'Mitsubishi', 'Nissan', 'Ford', 'Chevrolet', 'Mercedes-Benz', 'Volvo', 'Hyundai', 'Maxus', 'JAC']) as m
on conflict (nombre) do nothing;

insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Flota', 'flota', '/flota', 'interna', 'truck', 'naranjo',
       'Vehículos, conductores, mantenciones, contratos y costos de la flota.',
       'activa', 45
where not exists (select 1 from public.aplicaciones where slug = 'flota');

notify pgrst, 'reload schema';
