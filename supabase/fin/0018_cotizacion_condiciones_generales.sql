-- Cotización: «Condiciones generales», un texto libre propio de cada cotización que va en el PDF,
-- en letra chica, arriba de las observaciones y de las condiciones comerciales.
-- Se puede correr más de una vez.

alter table public.fin_cotizaciones add column if not exists condiciones_generales text;

notify pgrst, 'reload schema';
