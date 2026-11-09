-- Inventario: archivar productos (en vez de eliminarlos).
--
-- Un producto archivado deja de aparecer en el catálogo, en los selectores de las operaciones y
-- ajustes, en la valorización y en el reabastecimiento, y no se puede usar en movimientos nuevos.
-- Pero NO se borra nada: conserva su ficha, sus fotos, su certificado y todo su historial de
-- movimientos, y se puede restaurar desde Inventario › Productos › Archivados.
--
-- «Archivado» es la columna que ya existía: `inv_productos.activo = false`. Todas las consultas del
-- módulo ya filtran por `activo = true`, así que no hay que tocar ninguna. Lo único que faltaba era
-- saber QUIÉN archivó y CUÁNDO, porque archivar es una acción con permiso (solo el administrador del
-- Core o el «Administrador de inventario») y alguien tiene que poder ver quién la hizo.
--
-- El permiso se verifica en el servidor (Server Action); esto es solo el rastro. Los productos que
-- ya estén con activo = false (si los hubiera) quedan archivados sin fecha ni autor.
--
-- Se puede correr más de una vez.

alter table public.inv_productos
  add column if not exists archivado_en  timestamptz,
  add column if not exists archivado_por text;

comment on column public.inv_productos.archivado_en is
  'Cuándo se archivó el producto (activo = false). Vacío si está activo o si se desactivó antes de existir esta columna.';
comment on column public.inv_productos.archivado_por is
  'Correo de quien lo archivó. Vacío si está activo o si se desactivó antes de existir esta columna.';

notify pgrst, 'reload schema';
