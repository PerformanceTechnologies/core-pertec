-- Gestión Financiera: la parte exenta de cotizaciones e hitos.
--
-- Hasta ahora el «neto» de una cotización sumaba líneas afectas y exentas, y los hitos y la factura
-- que nacían de ella le calculaban IVA a todo. Con esta columna la parte exenta viaja aparte.
-- «neto» sigue siendo el total sin IVA (afecto + exento).
--
-- Se puede correr más de una vez.

alter table public.fin_cotizaciones add column if not exists exento numeric(18,0) not null default 0;
alter table public.fin_hitos        add column if not exists exento numeric(18,0) not null default 0;

-- Las cotizaciones ya guardadas: la parte exenta sale de sus líneas.
update public.fin_cotizaciones c
   set exento = coalesce((select sum(l.neto_linea) from public.fin_cotizacion_lineas l where l.cotizacion_id = c.id and l.exento), 0)
 where c.exento = 0;
