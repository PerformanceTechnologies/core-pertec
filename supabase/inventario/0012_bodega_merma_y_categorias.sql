-- Inventario: «Bodega MERMA» y categorías siempre en MAYÚSCULA.
--
-- 1. Bodega MERMA. Su ubicación es de un tipo nuevo, «merma», que NO es «interna». Todo el Inventario
--    (stock a mano, disponible, valorización, tablero, reabastecimiento, la tabla de productos) cuenta
--    solo las ubicaciones internas, así que lo que se mueve a merma sale de todas las métricas. Es lo
--    mismo que hace Odoo con su ubicación de desecho. Lo que hay en merma se calcula con los movimientos
--    hechos hacia y desde ella, y se puede devolver un producto a una bodega con una operación desde merma.
--    La bodega, su ubicación y su operación solo las ven los administradores de inventario (eso lo hace
--    el código: lib/inventario-merma.ts).
--
-- 2. Categorías: las que ya existen pasan a MAYÚSCULA (con respaldo de los nombres antes del cambio),
--    y un trigger pone en mayúscula toda categoría que se cree o se edite, venga de donde venga.
--
-- Se puede correr más de una vez.

-- ── 1. Bodega MERMA ───────────────────────────────────────────────────────────────────────────

-- El tipo «merma» se suma a los que ya existían (solo amplía la lista; ninguna fila cambia).
alter table public.inv_ubicaciones drop constraint if exists inv_ubicaciones_tipo_check;
alter table public.inv_ubicaciones add constraint inv_ubicaciones_tipo_check
  check (tipo in ('interna', 'proveedor', 'cliente', 'ajuste', 'transito', 'vista', 'merma'));

do $$
declare
  v_empresa uuid;
  v_almacen uuid;
  v_merma   uuid;
  v_stock   uuid;
begin
  -- De la misma empresa que la bodega principal (Amunátegui).
  select empresa_id into v_empresa from public.inv_almacenes where codigo = 'AMU';

  select id into v_almacen from public.inv_almacenes where codigo = 'MER';
  if v_almacen is null then
    insert into public.inv_almacenes (nombre, codigo, empresa_id)
      values ('Bodega MERMA', 'MER', coalesce(v_empresa, (select empresa_id from public.inv_almacenes order by creado_en limit 1)))
      returning id into v_almacen;
  end if;

  select id into v_merma from public.inv_ubicaciones where codigo = 'MER-STOCK';
  if v_merma is null then
    insert into public.inv_ubicaciones (nombre, codigo, tipo, almacen_id, es_stock_principal, empresa_id)
      select 'Bodega MERMA', 'MER-STOCK', 'merma', v_almacen, false, a.empresa_id from public.inv_almacenes a where a.id = v_almacen
      returning id into v_merma;
  end if;

  -- La operación para mandar a merma: desde la bodega principal (en la operación se puede elegir otra).
  select id into v_stock from public.inv_ubicaciones where codigo = 'AMU-STOCK';
  if v_stock is null then
    select id into v_stock from public.inv_ubicaciones where tipo = 'interna' and es_stock_principal order by creado_en limit 1;
  end if;
  if v_stock is not null and not exists (select 1 from public.inv_tipos_operacion where codigo = 'MER-ENV') then
    insert into public.inv_tipos_operacion (nombre, codigo, clase, almacen_id, ubicacion_origen_id, ubicacion_destino_id, prefijo)
      values ('Enviar a merma', 'MER-ENV', 'interna', v_almacen, v_stock, v_merma, 'MER/ENV');
  end if;
  -- Y la de vuelta, por si algo se mandó a merma por error.
  if v_stock is not null and not exists (select 1 from public.inv_tipos_operacion where codigo = 'MER-DEV') then
    insert into public.inv_tipos_operacion (nombre, codigo, clase, almacen_id, ubicacion_origen_id, ubicacion_destino_id, prefijo)
      values ('Devolver desde merma', 'MER-DEV', 'interna', v_almacen, v_merma, v_stock, 'MER/DEV');
  end if;
end $$;

-- ── 2. Categorías en MAYÚSCULA ───────────────────────────────────────────────────────────────

-- Respaldo de los nombres tal como estaban (solo la primera vez).
create table if not exists public.inv_categorias_respaldo_mayusculas as
  select id, nombre, now() as respaldado_en from public.inv_categorias;
alter table public.inv_categorias_respaldo_mayusculas enable row level security;

update public.inv_categorias set nombre = upper(nombre) where nombre <> upper(nombre);

create or replace function public.inv_categoria_en_mayuscula() returns trigger language plpgsql as $$
begin
  new.nombre := upper(btrim(new.nombre));
  return new;
end $$;

drop trigger if exists inv_categorias_mayuscula on public.inv_categorias;
create trigger inv_categorias_mayuscula before insert or update of nombre on public.inv_categorias
  for each row execute function public.inv_categoria_en_mayuscula();

-- ── Para deshacer ────────────────────────────────────────────────────────────────────────────
-- Categorías (devuelve los nombres de antes y quita el trigger):
--   drop trigger if exists inv_categorias_mayuscula on public.inv_categorias;
--   update public.inv_categorias c set nombre = r.nombre from public.inv_categorias_respaldo_mayusculas r where r.id = c.id;
-- Bodega MERMA (solo si nunca se usó: si ya tiene operaciones, primero devuelve lo que haya en merma):
--   delete from public.inv_tipos_operacion where codigo in ('MER-ENV', 'MER-DEV');
--   delete from public.inv_ubicaciones where codigo = 'MER-STOCK';
--   delete from public.inv_almacenes where codigo = 'MER';
