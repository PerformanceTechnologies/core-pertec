-- Cotización de arriendo: cobro por mes (como hasta ahora) o por día.
-- La cantidad de periodos de cada línea sigue en fin_cotizacion_lineas.meses (meses o días, según esta columna).
-- Se puede correr más de una vez.

alter table public.fin_cotizaciones add column if not exists arriendo_unidad text not null default 'mes'
  check (arriendo_unidad in ('mes', 'dia'));

notify pgrst, 'reload schema';
