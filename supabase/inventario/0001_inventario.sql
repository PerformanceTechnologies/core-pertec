-- =============================================================================
--  Core Pertec — Módulo Inventario
-- =============================================================================
--
--  Réplica del corazón del Inventario de Odoo: stock de DOBLE ENTRADA.
--
--  La idea central —y lo que hace que todo lo demás caiga por su peso— es que el
--  stock NUNCA se edita a mano. Cada cambio de existencias es una TRANSFERENCIA
--  de una ubicación a otra. Para que eso baste, hay ubicaciones "virtuales":
--
--    · Proveedores  → de acá "sale" la mercadería que recibimos (una recepción
--                     mueve de Proveedores a la bodega).
--    · Clientes     → acá "entra" lo que despachamos (una entrega mueve de la
--                     bodega a Clientes).
--    · Ajustes      → contraparte de un conteo físico (si sobran 3, entran desde
--                     Ajustes; si faltan 2, salen hacia Ajustes).
--    · Tránsito     → mercadería en viaje entre bodegas.
--
--  Así recepción, entrega, traslado interno y ajuste son EL MISMO mecanismo: un
--  movimiento entre dos ubicaciones. La "cantidad a mano" de un producto en una
--  ubicación (el quant) es la suma de los movimientos validados que entran menos
--  los que salen. Se materializa en inv_quants y se actualiza al validar.
--
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Unidades de medida
-- -----------------------------------------------------------------------------
create table if not exists public.inv_unidades (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  abreviacion text not null,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

comment on table public.inv_unidades is 'Unidades de medida de los productos (unidad, caja, kilo, litro…).';

-- -----------------------------------------------------------------------------
-- 2. Categorías de producto
-- -----------------------------------------------------------------------------
create table if not exists public.inv_categorias (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  creado_en timestamptz not null default now()
);

comment on table public.inv_categorias is 'Agrupación de productos para filtrar y reportar.';

-- -----------------------------------------------------------------------------
-- 3. Productos
-- -----------------------------------------------------------------------------
--  tipo:
--    almacenable → se controla stock (el único que genera quants).
--    consumible  → se mueve pero no se controla su cantidad a mano.
--    servicio    → no es físico (no se inventaría).
--  seguimiento:
--    ninguno / lote (varias unidades por lote) / serie (una unidad por número).
create table if not exists public.inv_productos (
  id             uuid primary key default gen_random_uuid(),
  sku            text unique,
  nombre         text not null,
  descripcion    text,
  categoria_id   uuid references public.inv_categorias (id) on delete set null,
  unidad_id      uuid references public.inv_unidades (id) on delete restrict,
  tipo           text not null default 'almacenable'
                   check (tipo in ('almacenable', 'consumible', 'servicio')),
  seguimiento    text not null default 'ninguno'
                   check (seguimiento in ('ninguno', 'lote', 'serie')),
  costo          numeric not null default 0 check (costo >= 0),
  precio         numeric not null default 0 check (precio >= 0),
  activo         boolean not null default true,
  datos          jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists inv_productos_categoria_idx on public.inv_productos (categoria_id);
create index if not exists inv_productos_activo_idx on public.inv_productos (activo);
comment on table public.inv_productos is 'Catálogo de productos. Solo los almacenables controlan stock.';

-- -----------------------------------------------------------------------------
-- 4. Almacenes
-- -----------------------------------------------------------------------------
create table if not exists public.inv_almacenes (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  codigo    text not null unique,
  creado_en timestamptz not null default now()
);

comment on table public.inv_almacenes is 'Bodegas físicas. Cada una agrupa ubicaciones internas y tipos de operación.';

-- -----------------------------------------------------------------------------
-- 5. Ubicaciones (reales y virtuales)
-- -----------------------------------------------------------------------------
--  tipo:
--    interna   → dentro de una bodega nuestra (cuenta como stock propio).
--    proveedor → virtual: origen de las recepciones.
--    cliente   → virtual: destino de las entregas.
--    ajuste    → virtual: contraparte de los ajustes de inventario.
--    transito  → virtual: mercadería en viaje entre bodegas.
--    vista     → solo agrupa en el árbol, no guarda stock.
create table if not exists public.inv_ubicaciones (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  codigo             text,
  tipo               text not null default 'interna'
                       check (tipo in ('interna', 'proveedor', 'cliente', 'ajuste', 'transito', 'vista')),
  padre_id           uuid references public.inv_ubicaciones (id) on delete set null,
  almacen_id         uuid references public.inv_almacenes (id) on delete set null,
  es_stock_principal boolean not null default false,
  activo             boolean not null default true,
  creado_en          timestamptz not null default now()
);

create index if not exists inv_ubicaciones_tipo_idx on public.inv_ubicaciones (tipo);
create index if not exists inv_ubicaciones_almacen_idx on public.inv_ubicaciones (almacen_id);
comment on table public.inv_ubicaciones is
  'Ubicaciones. Las virtuales (proveedor/cliente/ajuste/transito) hacen que todo movimiento sea una transferencia de doble entrada.';

-- -----------------------------------------------------------------------------
-- 6. Tipos de operación (los "picking types" de Odoo)
-- -----------------------------------------------------------------------------
--  Plantillas de transferencia: definen la clase y las ubicaciones por defecto,
--  y numeran los documentos (prefijo + correlativo): REC00001, ENT00001…
create table if not exists public.inv_tipos_operacion (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  codigo               text not null unique,
  clase                text not null
                         check (clase in ('recepcion', 'entrega', 'interna', 'ajuste')),
  almacen_id           uuid references public.inv_almacenes (id) on delete cascade,
  ubicacion_origen_id  uuid references public.inv_ubicaciones (id) on delete set null,
  ubicacion_destino_id uuid references public.inv_ubicaciones (id) on delete set null,
  prefijo              text not null default 'TR',
  correlativo          integer not null default 0,
  activo               boolean not null default true,
  creado_en            timestamptz not null default now()
);

comment on table public.inv_tipos_operacion is 'Plantillas de transferencia por bodega: recepción, entrega, interna, ajuste.';

-- -----------------------------------------------------------------------------
-- 7. Lotes y números de serie
-- -----------------------------------------------------------------------------
--  Un lote agrupa unidades de un producto; una serie es un lote de una sola
--  unidad. Mismo objeto para los dos, como en Odoo (stock.lot).
create table if not exists public.inv_lotes (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references public.inv_productos (id) on delete cascade,
  nombre            text not null,
  fecha_vencimiento date,
  creado_en         timestamptz not null default now(),
  constraint inv_lotes_unicidad unique (producto_id, nombre)
);

create index if not exists inv_lotes_producto_idx on public.inv_lotes (producto_id);
create index if not exists inv_lotes_vencimiento_idx on public.inv_lotes (fecha_vencimiento);
comment on table public.inv_lotes is 'Lotes y números de serie de un producto, con fecha de vencimiento opcional.';

-- -----------------------------------------------------------------------------
-- 8. Transferencias (los "pickings" de Odoo)
-- -----------------------------------------------------------------------------
--  estado:
--    borrador  → se está armando, sin reservar ni mover stock.
--    listo     → confirmada y stock reservado en el origen.
--    hecho     → validada: el stock ya se movió (quants actualizados).
--    cancelado → anulada.
create table if not exists public.inv_transferencias (
  id                   uuid primary key default gen_random_uuid(),
  referencia           text not null unique,
  tipo_operacion_id    uuid references public.inv_tipos_operacion (id) on delete set null,
  clase                text not null
                         check (clase in ('recepcion', 'entrega', 'interna', 'ajuste')),
  ubicacion_origen_id  uuid not null references public.inv_ubicaciones (id) on delete restrict,
  ubicacion_destino_id uuid not null references public.inv_ubicaciones (id) on delete restrict,
  estado               text not null default 'borrador'
                         check (estado in ('borrador', 'listo', 'hecho', 'cancelado')),
  contraparte          text,
  nota                 text,
  fecha_programada     date,
  fecha_validacion     timestamptz,
  creado_por           text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

create index if not exists inv_transferencias_estado_idx on public.inv_transferencias (estado);
create index if not exists inv_transferencias_clase_idx on public.inv_transferencias (clase);
create index if not exists inv_transferencias_fecha_idx on public.inv_transferencias (creado_en desc);
comment on table public.inv_transferencias is 'Documento que mueve stock entre dos ubicaciones. Agrupa movimientos.';

-- -----------------------------------------------------------------------------
-- 9. Movimientos (los "stock moves" de Odoo, con la línea colapsada)
-- -----------------------------------------------------------------------------
--  Cada movimiento es una línea de una transferencia: un producto (y su lote),
--  una cantidad planeada y la cantidad realmente hecha al validar.
create table if not exists public.inv_movimientos (
  id                   uuid primary key default gen_random_uuid(),
  transferencia_id     uuid not null references public.inv_transferencias (id) on delete cascade,
  producto_id          uuid not null references public.inv_productos (id) on delete restrict,
  unidad_id            uuid references public.inv_unidades (id) on delete set null,
  lote_id              uuid references public.inv_lotes (id) on delete set null,
  ubicacion_origen_id  uuid not null references public.inv_ubicaciones (id) on delete restrict,
  ubicacion_destino_id uuid not null references public.inv_ubicaciones (id) on delete restrict,
  cantidad             numeric not null check (cantidad > 0),
  cantidad_hecha       numeric,
  costo_unitario       numeric,
  estado               text not null default 'borrador'
                         check (estado in ('borrador', 'hecho', 'cancelado')),
  creado_en            timestamptz not null default now()
);

create index if not exists inv_movimientos_transferencia_idx on public.inv_movimientos (transferencia_id);
create index if not exists inv_movimientos_producto_idx on public.inv_movimientos (producto_id);
create index if not exists inv_movimientos_estado_idx on public.inv_movimientos (estado);
comment on table public.inv_movimientos is 'Línea de una transferencia: producto, lote y cantidad que se mueve.';

-- -----------------------------------------------------------------------------
-- 10. Quants: cantidad a mano por producto / ubicación / lote
-- -----------------------------------------------------------------------------
--  La foto del stock. Se mantiene al validar transferencias. "reservado" es lo
--  comprometido por transferencias en estado "listo" que aún no se validan;
--  disponible = cantidad - reservado.
create table if not exists public.inv_quants (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references public.inv_productos (id) on delete cascade,
  ubicacion_id   uuid not null references public.inv_ubicaciones (id) on delete cascade,
  lote_id        uuid references public.inv_lotes (id) on delete cascade,
  cantidad       numeric not null default 0,
  reservado      numeric not null default 0,
  actualizado_en timestamptz not null default now()
);

-- Unicidad por (producto, ubicación, lote) tratando NULL como un lote más.
create unique index if not exists inv_quants_unicidad
  on public.inv_quants (producto_id, ubicacion_id, coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists inv_quants_ubicacion_idx on public.inv_quants (ubicacion_id);
comment on table public.inv_quants is 'Cantidad a mano por producto, ubicación y lote. Se actualiza al validar transferencias.';

-- -----------------------------------------------------------------------------
-- 11. Reglas de reabastecimiento (mín/máx por producto y ubicación)
-- -----------------------------------------------------------------------------
create table if not exists public.inv_reglas_reabastecimiento (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.inv_productos (id) on delete cascade,
  ubicacion_id uuid not null references public.inv_ubicaciones (id) on delete cascade,
  minimo       numeric not null default 0 check (minimo >= 0),
  maximo       numeric not null default 0 check (maximo >= 0),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  constraint inv_reglas_unicidad unique (producto_id, ubicacion_id)
);

comment on table public.inv_reglas_reabastecimiento is
  'Mín/máx por producto y ubicación: cuando el disponible cae bajo el mínimo, se sugiere reponer hasta el máximo.';

-- -----------------------------------------------------------------------------
-- 12. RLS: igual que el resto del core, solo el service role entra.
-- -----------------------------------------------------------------------------
alter table public.inv_unidades                enable row level security;
alter table public.inv_categorias              enable row level security;
alter table public.inv_productos               enable row level security;
alter table public.inv_almacenes               enable row level security;
alter table public.inv_ubicaciones             enable row level security;
alter table public.inv_tipos_operacion         enable row level security;
alter table public.inv_lotes                   enable row level security;
alter table public.inv_transferencias          enable row level security;
alter table public.inv_movimientos             enable row level security;
alter table public.inv_quants                  enable row level security;
alter table public.inv_reglas_reabastecimiento enable row level security;

-- -----------------------------------------------------------------------------
-- 13. Datos iniciales: unidades, una bodega y sus ubicaciones y operaciones.
-- -----------------------------------------------------------------------------
insert into public.inv_unidades (nombre, abreviacion) values
  ('Unidad', 'UN'),
  ('Caja', 'CJ'),
  ('Kilogramo', 'KG'),
  ('Litro', 'LT'),
  ('Par', 'PAR'),
  ('Metro', 'MT')
on conflict do nothing;

do $$
declare
  v_almacen   uuid;
  v_stock     uuid;
  v_prov      uuid;
  v_cli       uuid;
  v_ajuste    uuid;
  v_transito  uuid;
begin
  -- Bodega principal (solo si no hay ninguna todavía).
  if not exists (select 1 from public.inv_almacenes) then
    insert into public.inv_almacenes (nombre, codigo) values ('Bodega Central', 'BC')
    returning id into v_almacen;

    insert into public.inv_ubicaciones (nombre, codigo, tipo, almacen_id, es_stock_principal)
      values ('Bodega Central / Stock', 'BC-STOCK', 'interna', v_almacen, true)
      returning id into v_stock;

    insert into public.inv_ubicaciones (nombre, codigo, tipo) values ('Proveedores', 'VIRT-PROV', 'proveedor') returning id into v_prov;
    insert into public.inv_ubicaciones (nombre, codigo, tipo) values ('Clientes', 'VIRT-CLI', 'cliente') returning id into v_cli;
    insert into public.inv_ubicaciones (nombre, codigo, tipo) values ('Ajustes de inventario', 'VIRT-AJU', 'ajuste') returning id into v_ajuste;
    insert into public.inv_ubicaciones (nombre, codigo, tipo) values ('Tránsito', 'VIRT-TRA', 'transito') returning id into v_transito;

    insert into public.inv_tipos_operacion (nombre, codigo, clase, almacen_id, ubicacion_origen_id, ubicacion_destino_id, prefijo) values
      ('Recepciones',            'BC-REC', 'recepcion', v_almacen, v_prov,  v_stock,  'REC'),
      ('Entregas',               'BC-ENT', 'entrega',   v_almacen, v_stock, v_cli,    'ENT'),
      ('Transferencias internas','BC-INT', 'interna',   v_almacen, v_stock, v_stock,  'INT'),
      ('Ajustes de inventario',  'BC-AJU', 'ajuste',    v_almacen, v_stock, v_ajuste, 'AJU');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 14. La app en el menú del core.
-- -----------------------------------------------------------------------------
insert into public.aplicaciones (nombre, slug, url, tipo, icono, color, descripcion, estado, orden)
select 'Inventario', 'inventario', '/inventario', 'interna', 'package', 'teal',
       'Control de stock de doble entrada: productos, bodegas, recepciones, entregas y ajustes.',
       'activa', 60
where not exists (select 1 from public.aplicaciones where slug = 'inventario');

-- -----------------------------------------------------------------------------
-- 15. El motor de stock: funciones atómicas que mueven los quants.
-- -----------------------------------------------------------------------------
--  Van en la base (y no en el servidor Node) para que cada validación sea UNA
--  transacción: o se mueve todo el stock de la transferencia, o no se mueve nada.

-- Aplica un delta a la cantidad a mano (y opcionalmente a lo reservado) de un
-- quant, creándolo si no existía.
create or replace function public.inv_mover_quant(
  p_producto uuid, p_ubicacion uuid, p_lote uuid, p_delta numeric, p_delta_reservado numeric default 0
) returns void language plpgsql as $$
begin
  insert into public.inv_quants (producto_id, ubicacion_id, lote_id, cantidad, reservado, actualizado_en)
  values (p_producto, p_ubicacion, p_lote, p_delta, p_delta_reservado, now())
  on conflict (producto_id, ubicacion_id, coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set cantidad       = public.inv_quants.cantidad + p_delta,
                reservado      = public.inv_quants.reservado + p_delta_reservado,
                actualizado_en = now();
end $$;

-- Confirma una transferencia en borrador: reserva el stock en el origen interno.
create or replace function public.inv_reservar_transferencia(p_id uuid) returns void language plpgsql as $$
declare m record;
begin
  update public.inv_transferencias set estado = 'listo', actualizado_en = now()
    where id = p_id and estado = 'borrador';
  if not found then raise exception 'La transferencia no está en borrador'; end if;

  for m in
    select mv.*, uo.tipo as origen_tipo
    from public.inv_movimientos mv
    join public.inv_ubicaciones uo on uo.id = mv.ubicacion_origen_id
    where mv.transferencia_id = p_id and mv.estado = 'borrador'
  loop
    if m.origen_tipo = 'interna' then
      perform public.inv_mover_quant(m.producto_id, m.ubicacion_origen_id, m.lote_id, 0, m.cantidad);
    end if;
  end loop;
end $$;

-- Valida una transferencia: mueve el stock de verdad (origen -, destino +),
-- libera la reserva si venía de "listo", y la deja "hecha". Atómico.
create or replace function public.inv_validar_transferencia(p_id uuid) returns void language plpgsql as $$
declare m record; v_estado text; v_costo numeric;
begin
  select estado into v_estado from public.inv_transferencias where id = p_id for update;
  if v_estado is null then raise exception 'La transferencia no existe'; end if;
  if v_estado = 'hecho' then raise exception 'La transferencia ya está validada'; end if;
  if v_estado = 'cancelado' then raise exception 'La transferencia está cancelada'; end if;

  if not exists (select 1 from public.inv_movimientos where transferencia_id = p_id and estado = 'borrador') then
    raise exception 'La transferencia no tiene líneas que mover';
  end if;

  for m in
    select mv.*, uo.tipo as origen_tipo, ud.tipo as destino_tipo, pr.costo as prod_costo
    from public.inv_movimientos mv
    join public.inv_ubicaciones uo on uo.id = mv.ubicacion_origen_id
    join public.inv_ubicaciones ud on ud.id = mv.ubicacion_destino_id
    join public.inv_productos   pr on pr.id = mv.producto_id
    where mv.transferencia_id = p_id and mv.estado = 'borrador'
  loop
    v_costo := coalesce(m.costo_unitario, m.prod_costo, 0);
    if m.origen_tipo = 'interna' then
      perform public.inv_mover_quant(
        m.producto_id, m.ubicacion_origen_id, m.lote_id, -m.cantidad,
        case when v_estado = 'listo' then -m.cantidad else 0 end);
    end if;
    if m.destino_tipo = 'interna' then
      perform public.inv_mover_quant(m.producto_id, m.ubicacion_destino_id, m.lote_id, m.cantidad, 0);
    end if;
    update public.inv_movimientos
      set estado = 'hecho', cantidad_hecha = m.cantidad, costo_unitario = v_costo
      where id = m.id;
  end loop;

  update public.inv_transferencias
    set estado = 'hecho', fecha_validacion = now(), actualizado_en = now()
    where id = p_id;
end $$;

-- Cancela una transferencia no validada, liberando lo que hubiera reservado.
create or replace function public.inv_cancelar_transferencia(p_id uuid) returns void language plpgsql as $$
declare m record; v_estado text;
begin
  select estado into v_estado from public.inv_transferencias where id = p_id for update;
  if v_estado is null then raise exception 'La transferencia no existe'; end if;
  if v_estado = 'hecho' then raise exception 'No se puede cancelar una transferencia ya validada'; end if;

  if v_estado = 'listo' then
    for m in
      select mv.*, uo.tipo as origen_tipo
      from public.inv_movimientos mv
      join public.inv_ubicaciones uo on uo.id = mv.ubicacion_origen_id
      where mv.transferencia_id = p_id and mv.estado = 'borrador'
    loop
      if m.origen_tipo = 'interna' then
        perform public.inv_mover_quant(m.producto_id, m.ubicacion_origen_id, m.lote_id, 0, -m.cantidad);
      end if;
    end loop;
  end if;

  update public.inv_movimientos set estado = 'cancelado'
    where transferencia_id = p_id and estado = 'borrador';
  update public.inv_transferencias set estado = 'cancelado', actualizado_en = now()
    where id = p_id;
end $$;
