-- Inventario: «Bodega MERMA» y categorías siempre en MAYÚSCULA.
--
-- 1. Bodega MERMA. Su ubicación es de un tipo nuevo, «merma», que NO es «interna». Todo el Inventario
--    cuenta solo las ubicaciones internas, así que lo que se mueve a merma sale de todas las métricas
--    (como la ubicación de desecho de Odoo). Solo la ven los administradores de inventario
--    (lib/inventario-merma.ts).
-- 2. Categorías: las que existen pasan a MAYÚSCULA (con respaldo) y un trigger pone en mayúscula toda
--    categoría que se cree o se edite.
--
-- Sin bloques «do $$» (el editor SQL de Supabase los cortaba). Se puede correr más de una vez.

-- ── 1. Bodega MERMA ──────────────────────────────────────────────────────────

alter table public.inv_ubicaciones drop constraint if exists inv_ubicaciones_tipo_check;
alter table public.inv_ubicaciones add constraint inv_ubicaciones_tipo_check
  check (tipo in ('interna', 'proveedor', 'cliente', 'ajuste', 'transito', 'vista', 'merma'));

-- La bodega, de la misma empresa que la principal (AMU).
insert into public.inv_almacenes (nombre, codigo, empresa_id)
select 'Bodega MERMA', 'MER', a.empresa_id
from public.inv_almacenes a
where a.codigo = 'AMU'
  and not exists (select 1 from public.inv_almacenes where codigo = 'MER');

-- Su ubicación (tipo merma: no cuenta como stock).
insert into public.inv_ubicaciones (nombre, codigo, tipo, almacen_id, es_stock_principal, empresa_id)
select 'Bodega MERMA', 'MER-STOCK', 'merma', a.id, false, a.empresa_id
from public.inv_almacenes a
where a.codigo = 'MER'
  and not exists (select 1 from public.inv_ubicaciones where codigo = 'MER-STOCK');

-- Operación para enviar a merma (desde la bodega principal; en la operación se puede elegir otra).
insert into public.inv_tipos_operacion (nombre, codigo, clase, almacen_id, ubicacion_origen_id, ubicacion_destino_id, prefijo)
select 'Enviar a merma', 'MER-ENV', 'interna', m.almacen_id, s.id, m.id, 'MER/ENV'
from public.inv_ubicaciones m, public.inv_ubicaciones s
where m.codigo = 'MER-STOCK' and s.codigo = 'AMU-STOCK'
  and not exists (select 1 from public.inv_tipos_operacion where codigo = 'MER-ENV');

-- Y la de vuelta, por si algo se mandó a merma por error.
insert into public.inv_tipos_operacion (nombre, codigo, clase, almacen_id, ubicacion_origen_id, ubicacion_destino_id, prefijo)
select 'Devolver desde merma', 'MER-DEV', 'interna', m.almacen_id, m.id, s.id, 'MER/DEV'
from public.inv_ubicaciones m, public.inv_ubicaciones s
where m.codigo = 'MER-STOCK' and s.codigo = 'AMU-STOCK'
  and not exists (select 1 from public.inv_tipos_operacion where codigo = 'MER-DEV');

-- ── 2. Categorías en MAYÚSCULA ───────────────────────────────────────────────

-- Respaldo de los nombres tal como estaban (solo la primera vez).
create table if not exists public.inv_categorias_respaldo_mayusculas as
  select id, nombre, now() as respaldado_en from public.inv_categorias;
alter table public.inv_categorias_respaldo_mayusculas enable row level security;

update public.inv_categorias set nombre = upper(nombre) where nombre <> upper(nombre);

create or replace function public.inv_categoria_en_mayuscula() returns trigger language plpgsql
as 'begin new.nombre := upper(btrim(new.nombre)); return new; end';

drop trigger if exists inv_categorias_mayuscula on public.inv_categorias;
create trigger inv_categorias_mayuscula before insert or update of nombre on public.inv_categorias
  for each row execute function public.inv_categoria_en_mayuscula();

-- ── Para deshacer ────────────────────────────────────────────────────────────
-- Categorías (devuelve los nombres de antes y quita el trigger):
--   drop trigger if exists inv_categorias_mayuscula on public.inv_categorias;
--   update public.inv_categorias c set nombre = r.nombre from public.inv_categorias_respaldo_mayusculas r where r.id = c.id;
-- Bodega MERMA (solo si nunca se usó):
--   delete from public.inv_tipos_operacion where codigo in ('MER-ENV', 'MER-DEV');
--   delete from public.inv_ubicaciones where codigo = 'MER-STOCK';
--   delete from public.inv_almacenes where codigo = 'MER';
