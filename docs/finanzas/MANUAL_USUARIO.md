# Gestión financiera · Manual de uso

El módulo está en **Finanzas → Gestión financiera**. Todo lo que ves es de la **empresa activa**
(PERTEC, Zeus Mining o Performance Service): cámbiala con el selector de empresa del Core.

## Antes de partir (una vez por empresa)

1. **Configuración → Parámetros.** Revisa IVA, tolerancia factura vs OC, plazos y el **mínimo de caja**.
2. **Configuración → Cuentas y factores.**
   - Crea las cuentas de banco y la tarjeta con el saldo de hoy (en la tarjeta, la deuda va en negativo).
   - Crea los factores con su % de anticipo y su tasa de mora.
3. **Configuración → Clientes y proveedores.** Para cada cliente, su condición de pago y qué exige para facturar (OC, EDP, HES). Las cotizaciones nuevas lo heredan.
4. **Configuración → Categorías y reglas.** Ahí está la lista maestra de Finanzas (ver «Clasificar gastos e ingresos» más abajo). Crea las reglas que clasifican solas («si la glosa contiene COM MANTENCION → Costos Financieros › Comisiones Bancarias»).
5. **Permisos de flujos.** Asigna «Concilia el banco» a quien clasifica el banco y «Mantiene las categorías» a la jefatura de Finanzas.

## Rutina diaria (Rutinas → Diario)

Cada tarea muestra cuántas cosas hay pendientes y lleva a la pantalla donde se resuelven.
Márcala al terminar.

1. **Banco:**
   - Tesorería → Banco diario → **Importar cartola** (CSV o Excel del banco; reimportar no duplica).
   - Acepta las **sugerencias** en lote (vienen de una regla o de un movimiento anterior igual). Corrige solo lo que veas raro.
   - Lo que sea un pago a proveedor o un cobro a cliente: **lígalo** al pago o al cobro. La clasificación llega sola desde la compra o el hito.
   - Lo demás: elige **categoría y subcategoría** (hay un buscador), el proyecto si lo pide, y marca el respaldo. Si se va a repetir, **Regla por texto** o **Regla por RUT**.
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

## Clasificar gastos e ingresos (lista maestra de Finanzas)

Todo movimiento del banco se clasifica con la lista de Finanzas, en dos niveles: **Categoría → Subcategoría**. Son 15 categorías (8 de gasto, 9 de ingreso; Financiamiento y Traspasos Internos están en ambos lados) y 75 subcategorías. Los textos son los mismos del Excel de Finanzas.

- **Gasto:** Personal y Dotación, Backoffice y Admin, Operaciones y Proyectos (pide proyecto), Impuestos y Cotizaciones, Costos Financieros, Inversión. Cada una tiene sus subcategorías y hay que elegir una.
- **Ingreso:** Servicios, Proyecto Spot, Arriendos, Ventas, Otros Ingresos, Intereses Ganados, Devolución Impuestos. No llevan subcategoría.
- **Ni ingreso ni gasto:** Financiamiento (factoring, créditos, préstamos de relacionadas, aportes o retiros de socios) y Traspasos Internos (pago de la tarjeta, divisas, traspasos entre cuentas propias). Mueven caja, pero **no suman** en ingresos ni gastos: así el pago de la tarjeta no se cuenta dos veces (su detalle ya está clasificado aparte).
- **Sin clasificar = pendiente.** Queda en «Por aclarar» hasta que alguien lo revise.

**Se clasifica una vez, donde nace.** Quien pide una compra elige el **tipo de gasto** en la solicitud. Cuando el pago de esa factura se liga al cargo del banco, el movimiento **hereda** la subcategoría y el proyecto; nadie la vuelve a elegir. Igual con los cobros: el ingreso sale del hito facturado (servicio, arriendo o venta; Proyecto Spot si el proyecto es spot). Un traspaso entre cuentas queda como Traspasos Internos › Traspaso entre Cuentas.

**Lo automático, en orden** (lo primero que calza gana, y el movimiento muestra de dónde salió):
1. Heredado del pago o cobro conciliado.
2. Regla por RUT de la contraparte.
3. Regla por texto de la glosa (Uber, Copec, Previred, TGR…).
4. Igual a un movimiento anterior ya clasificado (misma glosa sin números ni fechas). Solo se sugiere.
5. Mismo RUT que un movimiento anterior. Solo se sugiere.

6. **La IA** (Claude): para lo que nada de lo anterior reconoce, sugiere categoría y subcategoría con su seguridad (%) y el porqué. Aparece como «IA: … · 92 %».

Las reglas (2 y 3) se aplican solas cada mañana al llegar el banco; lo aprendido (4 y 5) y lo de la IA (6) aparece como sugerencia y se acepta con un clic. Si corriges una sugerencia de la IA, aprende de tu corrección.

**La IA, paso a paso:**
- Cada mañana revisa los movimientos nuevos sin clasificar (no las nóminas: su glosa no dice si son sueldos o proveedores). Si no quieres esperar, en el Banco diario está **«Sugerir con IA»**.
- Usa como ejemplos lo que Finanzas ya clasificó: mientras más se clasifica, mejor sugiere.
- En Configuración → Categorías y reglas se ve **cuánto acierta** (aceptadas contra corregidas) y las **reglas propuestas**: lo que ya se clasificó igual 3 o más veces, para convertirlo en regla con un clic.
- **Que se aplique sola** está apagado. Actívalo ahí mismo cuando el acierto lleve varias semanas sobre el umbral (por omisión, 95 %). Aun así, lo que pide proyecto nunca se aplica solo.
- Se envía a Claude solo la fecha, la glosa, el monto y el RUT de la contraparte; nada de saldos ni datos de personas.

**Ver el mes por categoría:** Tesorería → **Por categoría**. Ingresos y gastos del mes, aparte Financiamiento y Traspasos, y lo que falta clasificar. Cada categoría se abre para ver sus subcategorías.

**Cambiar la lista:** Configuración → Categorías y reglas. Solo quien tiene el permiso «Mantiene las categorías» puede agregar o desactivar categorías, subcategorías y reglas (si nadie lo tiene asignado, cualquiera con Finanzas). Nunca se borran: se desactivan, para no perder lo ya clasificado.

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

1. Todo conciliado al último día del mes: **cero pendientes** en «Por aclarar» y en Tesorería → Por categoría.
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
- **Lista maestra en CRM:** el cotizador sigue con sus tipos de costo; conectarlo a la lista de Finanzas (cotizado contra real por proyecto) es la siguiente etapa.
- **Rendir gastos:** cada boleta ya tiene su «Tipo de gasto (Finanzas)», y lo rendido suma en Tesorería › Por categoría. Quien revisa un informe no puede cambiar el tipo de gasto: si está mal, observa la boleta y quien rinde lo corrige.
