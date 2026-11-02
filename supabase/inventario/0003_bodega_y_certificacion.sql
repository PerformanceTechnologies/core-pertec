-- Inventario: bodega del producto, certificación y vencimiento.
--
-- 1. ubicacion_id: la bodega (ubicación interna) donde vive el producto por omisión.
-- 2. requiere_certificacion: si está activo, el producto debe tener su certificado
--    (documento en el bucket PRIVADO "inventario") con fecha de vencimiento. Si falta
--    el documento, la lista de productos lo marca.
-- 3. fecha_vencimiento: vencimiento del producto en sí (opcional), aparte del del
--    certificado.
--
-- Se puede correr más de una vez.

alter table public.inv_productos
  add column if not exists ubicacion_id uuid references public.inv_ubicaciones (id) on delete set null,
  add column if not exists requiere_certificacion boolean not null default false,
  add column if not exists certificado_ruta text,
  add column if not exists certificado_nombre text,
  add column if not exists certificado_vence date,
  add column if not exists fecha_vencimiento date;

comment on column public.inv_productos.ubicacion_id is 'Bodega (ubicación interna) del producto por omisión.';
comment on column public.inv_productos.requiere_certificacion is 'Si exige certificado vigente (documento y fecha de vencimiento).';
comment on column public.inv_productos.certificado_ruta is 'Ruta del certificado en el bucket privado "inventario".';
comment on column public.inv_productos.fecha_vencimiento is 'Vencimiento del producto (opcional), distinto del del certificado.';

insert into storage.buckets (id, name, public, file_size_limit)
values ('inventario', 'inventario', false, 4194304)
on conflict (id) do nothing;
