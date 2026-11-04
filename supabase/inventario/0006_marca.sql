-- Inventario: marca del producto.
--
-- Texto libre. En el formulario y en la plantilla de carga masiva se muestran las marcas del
-- histórico de compras (Valorización histórica) como referencia del formato, pero se puede
-- escribir una nueva. Los productos que ya existen quedan sin marca.
--
-- Se puede correr más de una vez.

alter table public.inv_productos add column if not exists marca text;

comment on column public.inv_productos.marca is 'Marca del producto (texto libre; el histórico de compras sirve de referencia del formato).';

notify pgrst, 'reload schema';
