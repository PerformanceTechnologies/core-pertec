-- Solicitud de compra con formato de Orden de Compra (OC): líneas con detalle, moneda (CLP, UF o USD),
-- entrega, condiciones, quién solicita, y el rastro de aprobación, devolución, envío y respuesta del proveedor.
--
-- Las compras que ya existen NO se tocan: quedan con `formato_oc = false` y siguen el flujo de antes.
-- `neto_cotizado` sigue siendo el neto en PESOS (el flujo de caja, el dashboard y los pagos lo leen);
-- el neto en la moneda de la OC va aparte en `neto_moneda`.
-- Se puede correr más de una vez.

alter table public.fin_compras
  add column if not exists formato_oc            boolean not null default false,
  add column if not exists solicitante_tipo      text check (solicitante_tipo in ('yo', 'usuario', 'otro')),
  add column if not exists solicitante_nombre    text,
  add column if not exists moneda                text not null default 'CLP' check (moneda in ('CLP', 'UF', 'USD')),
  add column if not exists tipo_cambio           numeric(18,4) not null default 1,
  add column if not exists neto_moneda           numeric(18,2),
  add column if not exists atencion              text,
  add column if not exists proveedor_correo      text,
  add column if not exists entrega_lugar         text,
  add column if not exists entrega_plazo         text,
  add column if not exists forma_pago            text,
  add column if not exists observaciones_oc      text,
  add column if not exists condiciones_oc        text,
  -- Aprobación: null = borrador (o devuelta). Al devolver se vuelve a null y queda el motivo.
  add column if not exists enviada_aprobacion_en  timestamptz,
  add column if not exists enviada_aprobacion_por text,
  add column if not exists devuelta_motivo        text,
  add column if not exists devuelta_por           text,
  add column if not exists devuelta_en            timestamptz,
  -- Envío de la OC al proveedor y su respuesta (se usan en las entregas siguientes).
  add column if not exists oc_enviada_a           text,
  add column if not exists oc_enviada_en          timestamptz,
  add column if not exists oc_respuesta           text check (oc_respuesta in ('aceptada', 'rechazada')),
  add column if not exists oc_respuesta_fecha     date,
  add column if not exists oc_respuesta_por       text,
  add column if not exists oc_respuesta_obs       text,
  -- Anular no borra: queda el registro (y un administrador puede reactivarla).
  add column if not exists anulada_por            text,
  add column if not exists anulada_en             timestamptz;

alter table public.fin_compra_lineas
  add column if not exists unidad        text,
  add column if not exists descuento_pct numeric(7,4) not null default 0,
  add column if not exists exento        boolean not null default false,
  add column if not exists nota          text;

-- UF y dólares llevan decimales: el neto de la línea pasa a 2 decimales (en CLP sigue siendo entero).
alter table public.fin_compra_lineas alter column neto_linea type numeric(18,2);

-- Condiciones generales por defecto de las OC de cada empresa (se pueden ajustar en cada OC).
alter table public.empresas add column if not exists condiciones_oc text;

notify pgrst, 'reload schema';
