-- Cotización: descuento general e «incluir datos de pago en el PDF».
--
--   · descuento_general_tipo / _valor: un descuento sobre todo el documento, en % o en monto fijo. Se suma al
--     descuento por línea que ya existía. descuento_general guarda el monto resultante (en pesos).
--   · incluir_datos_pago: si el PDF lleva los datos bancarios de la empresa. Apagado por omisión.
--
-- Se puede correr más de una vez.

alter table public.fin_cotizaciones add column if not exists descuento_general_tipo  text
  check (descuento_general_tipo is null or descuento_general_tipo in ('pct', 'monto'));
alter table public.fin_cotizaciones add column if not exists descuento_general_valor numeric(18,4) not null default 0;
alter table public.fin_cotizaciones add column if not exists descuento_general       numeric(18,0) not null default 0;
alter table public.fin_cotizaciones add column if not exists incluir_datos_pago      boolean not null default false;

notify pgrst, 'reload schema';
