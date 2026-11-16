-- Inventario: SKU automático y correlativo (PER-000001, PER-000002…).
--
-- Un solo contador para todo el inventario (no depende de la categoría): el SKU identifica el
-- producto, no lo clasifica. Formato fijo de 6 dígitos para que ordene bien por texto.
--
--  · Si el producto se crea SIN SKU (formulario, importación masiva…), la base le asigna el
--    siguiente número. Lo hace un trigger, así que no hay forma de saltárselo y dos personas
--    creando a la vez nunca reciben el mismo número.
--  · El contador solo sube: un número nunca se reutiliza, aunque el producto se archive.
--  · Un SKU escrito a mano se respeta (sigue siendo único). El SKU de un producto no se puede
--    dejar vacío al editarlo: si lo borras, conserva el que tenía.
--  · Productos que ya existían: los activos sin SKU se numeran de una vez, en orden de creación.
--
-- Se puede correr más de una vez.

-- 1. Contador (una sola fila).
create table if not exists public.inv_sku_secuencia (
  id     smallint primary key default 1 check (id = 1),
  ultimo bigint   not null default 0
);
insert into public.inv_sku_secuencia (id, ultimo) values (1, 0) on conflict (id) do nothing;
alter table public.inv_sku_secuencia enable row level security;
comment on table public.inv_sku_secuencia is 'Último número de SKU automático (PER-xxxxxx) entregado. Solo sube.';

-- 2. Siguiente SKU (atómico: el UPDATE bloquea la fila hasta terminar la transacción).
create or replace function public.inv_siguiente_sku() returns text
language plpgsql as $$
declare v bigint;
begin
  update public.inv_sku_secuencia set ultimo = ultimo + 1 where id = 1 returning ultimo into v;
  return 'PER-' || lpad(v::text, 6, '0');
end $$;

-- 3. Trigger: asigna el SKU si viene vacío; en una edición no deja borrar el que ya tenía.
create or replace function public.inv_productos_sku_auto() returns trigger
language plpgsql as $$
begin
  new.sku := nullif(btrim(coalesce(new.sku, '')), '');
  if new.sku is null then
    if tg_op = 'UPDATE' and old.sku is not null then
      new.sku := old.sku;
    else
      new.sku := public.inv_siguiente_sku();
    end if;
  end if;
  return new;
end $$;

-- 4. Productos existentes. ANTES de crear el trigger, para que el casco de prueba archivado
--    suelte su «EPP-001» sin que se le asigne otro número.
update public.inv_productos set sku = null where sku = 'EPP-001' and activo = false;

-- El contador parte después del mayor PER-nnnnnn que ya exista (0 si no hay ninguno).
update public.inv_sku_secuencia set ultimo = greatest(ultimo, coalesce(
  (select max(substring(sku from '^PER-(\d+)$')::bigint) from public.inv_productos where sku ~ '^PER-\d+$'), 0))
where id = 1;

-- Numera los activos sin SKU, en orden de creación.
do $$
declare r record;
begin
  for r in select id from public.inv_productos
           where activo = true and (sku is null or btrim(sku) = '')
           order by creado_en, id
  loop
    update public.inv_productos set sku = public.inv_siguiente_sku() where id = r.id;
  end loop;
end $$;

drop trigger if exists inv_productos_sku_auto on public.inv_productos;
create trigger inv_productos_sku_auto
  before insert or update on public.inv_productos
  for each row execute function public.inv_productos_sku_auto();

notify pgrst, 'reload schema';
