-- Inventario: fotos de los productos.
--
-- Las fotos viven en SharePoint («ARCHIVOS CORE/Inventario/Fotos/<producto>/»); acá se guarda
-- solo la lista de referencias: [{ "ruta": "sp:…", "miniatura": "sp:…", "nombre": "…" }].
-- Los productos que ya existen quedan sin fotos.
--
-- Se puede correr más de una vez.

alter table public.inv_productos
  add column if not exists fotos jsonb not null default '[]'::jsonb;
