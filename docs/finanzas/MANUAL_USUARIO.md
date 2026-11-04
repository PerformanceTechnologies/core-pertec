# Gestión financiera · Manual de uso

El módulo está en **Finanzas → Gestión financiera**. Todo lo que ves es de la **empresa activa**
(PERTEC, Zeus Mining o Performance Service): cámbiala con el selector de empresa del Core.

## Antes de partir (una vez por empresa)

1. **Configuración → Parámetros.** Revisa IVA, tolerancia factura vs OC, plazos y el **mínimo de caja**.
2. **Configuración → Cuentas y factores.**
   - Crea las cuentas de banco y la tarjeta con el saldo de hoy (en la tarjeta, la deuda va en negativo).
   - Crea los factores con su % de anticipo y su tasa de mora.
3. **Configuración → Clientes y proveedores.** Para cada cliente, su condición de pago y qué exige para facturar (OC, EDP, HES). Las cotizaciones nuevas lo heredan.
4. **Configuración → Categorías y reglas.** Ajusta las categorías y crea reglas («si la glosa contiene COM MANTENCION → Comisiones bancarias»).

## Rutina diaria (Rutinas → Diario)

Cada tarea muestra cuántas cosas hay pendientes y lleva a la pantalla donde se resuelven.
Márcala al terminar.

1. **Banco:**
   - Tesorería → Banco diario → **Importar cartola** (CSV o Excel del banco; reimportar no duplica).
   - Acepta las **sugerencias** de las reglas en lote.
   - Categoriza el resto y marca el respaldo.
2. **Lo que no reconoces:**
   - Asígnale un responsable y un comentario.
   - Pasado el plazo para aclarar, aparece en **Escalar**.
3. **Facturas recibidas:**
   - Compras → Facturas recibidas: lígalas a su compra.
   - Si llega una **sin OC**, aparece como «Factura sin OC: regularizar» con los días que quedan para reclamarla.
4. **Facturas emitidas:** Ventas → Facturas emitidas; toda factura debe estar ligada a su hito.
5. **Lista para facturar:**
   - Ventas → filtro «Lista para facturar».
   - Marca uno o varios hitos del mismo cliente → **Registrar factura** (folio y fecha del SII).

## Rutina semanal (Rutinas → Semanal)

1. **Cobranza:**
   - Revisa las vencidas y las que vencen en 7 días.
   - Registra la **fecha prometida** de pago en la bitácora del hito; queda como fecha estimada para el flujo.
   - Cobros: Ventas → Cobros, aplicando un pago a una o varias facturas. Los parciales también sirven.
2. **Factoring:** Tesorería → Factoring. Cuando el cliente paga, registra la fecha real y confírmala con el factor; luego anota el excedente recibido.
3. **Compras:**
   - Compras → Por aprobar y Por visar: aprobar y visar son un clic. Al visar se emite el N° de OC.
   - Después: recepción, factura y programar el pago.
4. **Flujo:**
   - Tesorería → Flujo de caja.
   - Toca una cifra para ver de qué se compone.
   - Las filas manuales (remuneraciones, impuestos, créditos, tarjeta) se escriben directo en la celda.
   - Si un mes dice **FALTA CAJA**, revisa qué cobrar antes o qué pago mover.

## Rutina mensual (Rutinas → Mensual)

1. Todo conciliado al último día del mes.
2. Contabilidad:
   - Revisa los libros de compra y venta y el IVA del mes.
   - Si está activa la contabilidad integrada: **Contabilizar mes**.
3. **Cerrar período.** Con el mes cerrado no se pueden registrar ni anular documentos, cobros, pagos ni cesiones con fecha en ese mes. Reabrirlo pide motivo y queda registrado.

## Comercial

- **Pipeline:**
  - Arrastra cada oportunidad entre etapas. Perderla pide el motivo.
  - Las tarjetas con borde ámbar llevan más de 7 días sin actividad.
- **Cotización:**
  - Desde una oportunidad en etapa Cotización, o en «Nueva cotización».
  - Las líneas pueden ser texto libre o productos de Inventario; en arriendo se indican los meses.
  - Cambiar algo después de enviarla se hace con **Nueva versión**.
- **Aceptar una cotización:**
  - Crea el proyecto si no existe, y los hitos: única, en partes o mensual.
  - La oportunidad queda como ganada.

## Resumen (dashboard)

- Muestra caja en bancos, deuda de la tarjeta, por cobrar, vencido, cedido, terminado sin facturar, por pagar y por aclarar.
- **Atención hoy** lista lo urgente.
- También muestra la proyección de caja, el embudo de hitos por etapa, la antigüedad de cuentas por cobrar, los saldos por mandante, la rentabilidad por proyecto y el pipeline.

## Lo que todavía no está

- **Facturación electrónica:** los botones «Emitir factura electrónica» y «Ceder electrónicamente» están deshabilitados. Mientras tanto, emite en el SII y registra el folio aquí.
- **Formatos imprimibles:** el botón «Imprimir» está deshabilitado («Formato en diseño»).
- **Integraciones:** importación del RCV, notificaciones por correo, roles, e integración con Contratos y Rendición de gastos.
