-- Inventario: estado del producto (Operativo / No operativo).
--
-- Si el producto está en condiciones de usarse. Una herramienta en reparación o dañada queda
-- «no operativo» sin dejar de existir ni perder su stock. Los productos que ya existen quedan
-- «operativo». También se carga desde la plantilla de carga masiva (columna «Estado»).
--
-- Se puede correr más de una vez.

alter table public.inv_productos
  add column if not exists estado_operativo text not null default 'operativo';

alter table public.inv_productos drop constraint if exists inv_productos_estado_operativo_check;
alter table public.inv_productos
  add constraint inv_productos_estado_operativo_check check (estado_operativo in ('operativo', 'no_operativo'));

comment on column public.inv_productos.estado_operativo is
  'operativo: en condiciones de usarse. no_operativo: en reparación, dañado o fuera de servicio.';

notify pgrst, 'reload schema';
