# Gestión financiera · Reglas de negocio

Todas en `lib/fin/reglas.ts` (y los asientos en `lib/fin/contabilidad.ts`), puras y probadas con
`npm run probar-fin` contra el Excel «Finanzas PERTEC v2» (hoy = 04-11-2026). Se evalúan **en el
orden escrito**: la primera que se cumple gana.

## 1. Etapa del hito de venta (`etapaHito`, regla G8 del Excel)

1. Sin fecha de aceptación → **Cotización enviada**
2. Con factura:
   - saldo ≤ 0 → **Cobrada**
   - hoy > vencimiento → **Vencida**
   - si no → **Por cobrar**
3. Trabajo terminado:
   - exige EDP y no está aprobado → **Esperando aprobación EDP**
   - sin N° de OC del cliente → **Esperando OC**
   - exige HES y no hay N° → **Esperando HES**
   - si no → **Lista para facturar**
4. Trabajo en curso → **En ejecución**
5. Si no → **Por iniciar**

**Cálculos del hito:**
- Total con IVA = neto × (1 + IVA).
- Condición de pago: la del hito, si no la del perfil del cliente, si no la por omisión.
- Vencimiento = emisión de la factura + condición.
- Saldo = total de la factura − cobros aplicados − notas de crédito.
- Para el flujo:
  - Fecha = fecha estimada de pago, o el vencimiento.
  - Monto: sin factura, el total con IVA; con factura cedida, 0 (entra como excedente de factoring); si no, el saldo.

## 2. Siguiente paso de la compra (`siguientePasoCompra`, regla E8)

1. Anulada → **Anulada**
2. Con fecha de pago real → **Pagada**
3. Factura sin OC → **Factura sin OC: regularizar**
4. Sin aprobación → **Falta aprobación JP o gerente**
5. Sin visado → **Falta visado de Finanzas**
6. Sin OC → **Emitir OC al proveedor**
7. Recepción ≠ sí → **Esperar recepción conforme**
8. Sin factura → **Esperar factura del proveedor**
9. |factura − OC con IVA| > tolerancia → **Revisar diferencia con la OC** (en el borde, igual a la tolerancia, pasa)
10. Sin fecha programada:
    - si la factura venció → **Vencida: programar pago ya**
    - si no → **Programar pago**
11. Si no → **Pago programado**

**Solicitud con formato de OC (`formato_oc = true`).** Las compras nuevas se crean con el formulario de OC (ítems, moneda CLP/UF/USD,
entrega, condiciones) y siguen este recorrido; las anteriores siguen la lista de arriba sin cambios:

1. Anulada → **Anulada** (se conserva el registro; solo el administrador global la reactiva)
2. Pago real → **Pagada**
3. No enviada a aprobación → **Devuelta: corregir y reenviar** (si la devolvieron) o **Borrador: enviar a aprobación**
4. Sin aprobación → **Falta aprobación JP o gerente** (cualquiera de los asignados basta)
5. Sin visado → **Falta visado de Finanzas** (al visar nace el N° de OC correlativo)
6. OC no enviada al proveedor → **Enviar OC al proveedor**
7. El proveedor la rechazó → **OC rechazada por el proveedor**; sin respuesta → **Esperar respuesta del proveedor**
8. El proveedor la aceptó → pasa directo a **Esperar factura del proveedor** (no hay recepción de mercadería aparte)
9. Desde la factura, igual que el flujo anterior.

Devolver (por quien aprueba o visa) la deja de nuevo editable por su autor y le quita la aprobación y el visado; el N° de OC, si ya existía, se conserva.
**Envío al proveedor y avisos (formato OC).**
- Tras visar, quien visa envía la OC por correo desde su Outlook (con el PDF adjunto y un mensaje editable, sin el detalle de los
  productos). Al enviar queda `oc_enviada_en/oc_enviada_a`, el historial y el PDF exacto como respaldo; el paso pasa a **Esperar respuesta del proveedor**.
  «Ya la envié» marca el envío sin mandar correo (por si se envió por otro medio).
- Avisos (campana + correo desde la casilla general de avisos): enviar a aprobación → quienes aprueban; aprobar → quienes visan;
  devolver → solicitante y autor; visar → solicitante y autor. Un paso sin personas asignadas avisa a los administradores del Core.
  Los de «te toca a ti» (aprobar, visar) llegan también a quien hizo la acción si a ella le toca (le queda algo pendiente); los
  informativos (devuelta, visada) nunca. Un aviso que falla no tumba la acción.
- **Recepción** (pestaña de Compras y pagos): lista de las OC enviadas, con filtro Por resolver / Aceptadas / Anuladas / Todas. Se marca
  si el proveedor **aceptó** (pasa a «Esperar factura del proveedor», que se registra desde Facturas recibidas) o **rechazó** (se reenvía
  corregida o se anula). Se puede ver y descargar la OC, ver el resumen y reenviar (el reenvío limpia la respuesta anterior). Anular no borra:
  queda en el registro y solo el administrador global reactiva; el administrador también puede reabrir una respuesta marcada por error
  (mientras no tenga facturas).
- Mi Día muestra «Aprobaciones de compras»: lo que le toca aprobar o visar a la persona y lo suyo que le devolvieron, con el resumen en popup.

`neto_cotizado` sigue siendo el neto **en pesos** (neto × (1 + IVA) = total en pesos al tipo de cambio de la OC); el neto en la moneda de la OC va en `neto_moneda`.

**Comprometido neto:**
- Si hay factura: factura / (1 + IVA).
- Si no, pero está visada: el neto cotizado.
- Si no, 0. Una compra **no visada no entra al flujo**.

**Fecha del flujo:** la fecha programada, si no el vencimiento de la factura, si no visado + plazo de pago a proveedores.

## 3. Estado del factoring (`calcularCesion`)

- **Montos:**
  - Anticipo = nominal × % anticipo.
  - Días de mora = días entre el vencimiento y (el pago real del cliente o hoy).
  - Mora estimada = anticipo × tasa mensual × días / 30.
  - Excedente = nominal − anticipo − (mora cobrada o la estimada).
- **Estado:**
  1. Excedente recibido → **Liquidada**
  2. Cliente pagó y el factor no confirma → **Cliente pagó: confirmar con el factor**
  3. Cliente pagó → **Esperando excedente**
  4. Días de mora > 0 → **En mora: cobrar al cliente**
  5. Si no → **Vigente**

## 4. Estado del movimiento bancario (`calcularMovimiento`)

- Con categoría **y** respaldo:
  - **Conciliado con documento**, si está ligado a un cobro o pago;
  - si no, **Conciliado**.
- Si no → **Por aclarar**. Pasado el plazo para aclarar (parámetro), se marca para **escalar**.
- **Reglas de categorización:**
  - Patrón contenido en la glosa, con monto opcional desde/hasta y cuenta opcional.
  - Se prueban por prioridad, de menor a mayor.
  - Proponen categoría y proyecto, y el usuario las acepta en lote.

## 5. Proyectos (`cifrasProyecto`)

- Vendido = Σ neto de hitos aceptados.
- Facturado = Σ neto de hitos con factura.
- Por facturar = vendido − facturado.
- Por cobrar = Σ saldos.
- Comprometido = Σ comprometido neto de sus compras.
- Disponible = presupuesto de costos − comprometido.
- Margen = vendido − comprometido; margen % = margen / vendido.

## 6. Flujo de caja (`calcularFlujo`)

- Horizonte de N meses (3 por omisión).
- El **mes 1 parte con la caja real de hoy e incluye todo lo atrasado**.
- **Entradas:**
  - Hitos facturados.
  - Hitos por facturar.
  - Excedentes de factoring.
  - Partidas manuales: anticipos de factoring y otros ingresos.
- **Salidas:**
  - Compras visadas o facturadas.
  - Partidas manuales: remuneraciones, impuestos, créditos y leasing.
  - Pago de tarjeta: en el mes 1 es la deuda actual; en los siguientes, la estimación manual.
- Caja final = inicio + entradas − salidas.
- Holgura = caja final − mínimo de caja; si la holgura es negativa → **FALTA CAJA**.
- Fuera del flujo (se muestran aparte):
  - Lo aceptado sin fecha de cobro.
  - Las compras sin visar.

## 7. Dashboard (`calcularDashboard`)

Mismas definiciones del Excel, incluidas dos que no son obvias:

- **Monto por aclarar** es la suma **con signo** (abonos − cargos).
- **Por pagar en 30 días** incluye lo vencido (todo lo que tiene fecha de flujo ≤ hoy + 30).

## 8. Asientos (`generarAsientos`, modo contabilidad integrada)

| Origen | Debe | Haber |
|---|---|---|
| Factura de venta (33/34) | Clientes (total) | Ingresos por servicios, arriendos o venta de productos según el tipo (neto + exento, con proyecto) · IVA débito |
| Nota de crédito de venta (61) | Lo inverso de la factura | |
| Factura de proveedor | Costo directo (o gastos generales si es del proyecto General) · IVA crédito | Proveedores (total) |
| Cobro | Bancos | Clientes |
| Pago | Proveedores | Bancos |
| Factoring con recurso | Bancos (anticipo − costo) · Gasto factoring (costo) | Obligación con factoring (anticipo) |
| Factoring sin recurso | Bancos (anticipo − costo) · Gasto factoring · Excedente por cobrar (nominal − anticipo) | Clientes (nominal) |
| Movimiento conciliado sin documento | Cuenta de su categoría (cargo) o Bancos/Tarjeta (abono) | Bancos/Tarjeta (cargo) o cuenta de su categoría (abono) |

**No generan asiento:**
- Las guías (52).
- Los documentos anulados.
- Los movimientos «Por aclarar».
- Los movimientos sin cuenta contable.

**Cuadre:** todo asiento cuadra o no se emite; un documento descuadrado se avisa en la pantalla de Contabilidad.

**Período cerrado:** no admite asientos nuevos, y reabrirlo pide motivo.
