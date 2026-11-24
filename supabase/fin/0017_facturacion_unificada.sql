-- Facturación electrónica como único lugar de consulta de documentos tributarios (Finanzas › Facturación).
--
--   · fin_documentos.por_conciliar: el documento está pagado/cobrado fuera del Core y aún no se liga a su movimiento
--     del banco. No cuenta como deuda (saldo 0) ni entra a la contabilidad hasta que se concilia a mano en Tesorería,
--     momento en que nace el cobro o pago real ligado al banco y la marca se quita. «Marcar pendiente» la quita sin
--     conciliar (el documento vuelve a deber su total).
--   · Nuevos orígenes: 'historico' (carga inicial desde el archivo, corte 01-01-2026) y 'sii_rcv' (Registro de
--     Compras y Ventas que el Core lee del SII varias veces al día).
--
-- Solo agrega una columna y amplía dos listas de valores permitidos. Se puede correr más de una vez.

alter table public.fin_documentos add column if not exists por_conciliar boolean not null default false;
create index if not exists fin_documentos_por_conciliar_idx on public.fin_documentos (empresa_id, direccion) where por_conciliar;

alter table public.fin_documentos drop constraint if exists fin_documentos_origen_check;
alter table public.fin_documentos add constraint fin_documentos_origen_check
  check (origen in ('manual', 'importado_rcv', 'api_dte', 'historico', 'sii_rcv'));

alter table public.fin_dte_archivo drop constraint if exists fin_dte_archivo_origen_check;
alter table public.fin_dte_archivo add constraint fin_dte_archivo_origen_check
  check (origen in ('historico', 'emision', 'recibido_api', 'manual', 'sii_rcv'));

notify pgrst, 'reload schema';
