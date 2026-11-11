-- Los roles internos de cada aplicación (usuario_aplicaciones.rol_extra) que ofrece la pantalla
-- de Usuarios: usuario, admin, visualizador (Proyectos, Cotizador) y especial (Contratos).
-- La regla anterior no admitía todos y al guardar daba:
--   «violates check constraint usuario_aplicaciones_rol_extra_check».
-- Se puede correr más de una vez.
alter table public.usuario_aplicaciones drop constraint if exists usuario_aplicaciones_rol_extra_check;
alter table public.usuario_aplicaciones
  add constraint usuario_aplicaciones_rol_extra_check
  check (rol_extra is null or rol_extra in ('usuario', 'admin', 'visualizador', 'especial'));
notify pgrst, 'reload schema';
