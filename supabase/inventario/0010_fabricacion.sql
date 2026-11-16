-- Inventario › Fabricación: productos que fabricamos y su hoja de costos.
--
-- Un «producto fabricado» tiene una receta de costos: una lista de ítems (materiales, mano de obra,
-- maquinaria, servicios externos, otros), cada uno con cantidad, costo unitario y % de merma. La
-- receta rinde cierta cantidad de unidades terminadas (`rendimiento`); sobre el costo directo se
-- aplica un % de gastos indirectos y de ahí sale el costo unitario y el precio sugerido para el
-- margen objetivo. La aritmética vive en lib/fabricacion-modelo.ts (y se prueba con
-- `npm run probar-fabricacion`); la base solo guarda los datos y cuida que no entren valores absurdos.
--
-- Esta primera etapa es COSTEO: no consume ni produce stock. Se puede enlazar un material a un
-- producto del catálogo (`producto_id`) para traer su costo, y el producto terminado a otro del
-- catálogo, para cuando se agregue la orden de producción.
--
-- Como el resto de Inventario, no lleva `empresa_id`. Se puede correr más de una vez.

create table if not exists public.inv_fab_productos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text,
  nombre         text not null,
  descripcion    text,
  unidad_id      uuid references public.inv_unidades (id) on delete set null,
  producto_id    uuid references public.inv_productos (id) on delete set null,
  rendimiento    numeric not null default 1 check (rendimiento > 0),
  indirectos_pct numeric not null default 0 check (indirectos_pct >= 0 and indirectos_pct <= 1000),
  margen_pct     numeric not null default 0 check (margen_pct >= 0 and margen_pct < 100),
  precio_venta   numeric not null default 0 check (precio_venta >= 0),
  estado         text not null default 'borrador' check (estado in ('borrador', 'activo', 'archivado')),
  notas          text,
  creado_por     text,
  archivado_en   timestamptz,
  archivado_por  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- El código identifica la ficha: no se repite (sin distinguir mayúsculas). Vacío no cuenta.
create unique index if not exists inv_fab_productos_codigo_uidx
  on public.inv_fab_productos (lower(codigo)) where codigo is not null;
create index if not exists inv_fab_productos_estado_idx on public.inv_fab_productos (estado);

comment on table public.inv_fab_productos is
  'Productos que fabricamos. Cada uno tiene su receta de costos en inv_fab_items.';
comment on column public.inv_fab_productos.rendimiento is
  'Unidades terminadas que rinde la receta completa. El costo unitario es el costo del lote ÷ rendimiento.';
comment on column public.inv_fab_productos.indirectos_pct is
  'Gastos indirectos (administración, arriendo, energía general…) como % del costo directo.';
comment on column public.inv_fab_productos.margen_pct is
  'Margen objetivo sobre el PRECIO de venta (no recargo sobre el costo): precio = costo ÷ (1 − margen).';

create table if not exists public.inv_fab_items (
  id             uuid primary key default gen_random_uuid(),
  fabricacion_id uuid not null references public.inv_fab_productos (id) on delete cascade,
  grupo          text not null check (grupo in ('material', 'mano_obra', 'maquinaria', 'servicio', 'otro')),
  descripcion    text not null,
  producto_id    uuid references public.inv_productos (id) on delete set null,
  unidad         text not null default 'un',
  cantidad       numeric not null default 0 check (cantidad >= 0),
  costo_unitario numeric not null default 0 check (costo_unitario >= 0),
  merma_pct      numeric not null default 0 check (merma_pct >= 0 and merma_pct <= 100),
  orden          integer not null default 0,
  nota           text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists inv_fab_items_fabricacion_idx on public.inv_fab_items (fabricacion_id, grupo, orden);
create index if not exists inv_fab_items_producto_idx on public.inv_fab_items (producto_id);

comment on table public.inv_fab_items is
  'Ítems de la receta de costos. Subtotal = cantidad × costo_unitario × (1 + merma_pct/100).';

-- Mismo esquema que el resto del módulo: solo el servidor (service role) lee y escribe.
alter table public.inv_fab_productos enable row level security;
alter table public.inv_fab_items enable row level security;

notify pgrst, 'reload schema';
