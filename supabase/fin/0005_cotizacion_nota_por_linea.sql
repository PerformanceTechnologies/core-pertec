-- Cotización: una nota opcional por línea (la descripción larga del producto o servicio).
-- Se puede correr más de una vez.

alter table public.fin_cotizacion_lineas add column if not exists nota text;

notify pgrst, 'reload schema';
