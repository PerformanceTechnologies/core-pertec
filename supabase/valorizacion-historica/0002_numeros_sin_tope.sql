-- Valorización histórica: los números sin tope de dígitos.
--
-- El Excel trae datos que no siempre son lo que dice su columna (una línea con «% Desc. línea»
-- = 413,6, que es un monto y no un porcentaje). Con numeric(8,6) la carga completa se caía con
-- «numeric field overflow». El registro es solo para consultar: se guarda lo que diga el Excel.
-- Se puede correr más de una vez.

alter table public.vh_lineas
  alter column cantidad                type numeric,
  alter column precio_unitario         type numeric,
  alter column descuento_linea         type numeric,
  alter column valor_linea             type numeric,
  alter column factor_descuento_global type numeric,
  alter column valor_ajustado          type numeric,
  alter column costo_unitario          type numeric;

alter table public.vh_documentos
  alter column monto_neto         type numeric,
  alter column monto_exento       type numeric,
  alter column iva                type numeric,
  alter column impuesto_adicional type numeric,
  alter column total              type numeric;

alter table public.vh_importaciones
  alter column monto_total type numeric;

notify pgrst, 'reload schema';
