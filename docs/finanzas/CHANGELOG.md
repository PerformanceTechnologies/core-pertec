# Gestión financiera · Cambios

## 2026-11-17 · Remuneraciones: desglose por persona y libro en Excel

- **Ver desglose por persona** (`/gestion-financiera/remuneraciones/desglose`): nombre, RUT, cargo y centro de costo de cada persona, y cómo se llega de su sueldo a su líquido (haberes, descuentos, aportes del empleador y costo empresa). Avisa si el libro sigue abierto, si no se pudo leer el nombre de alguien o si los haberes de alguien no cuadran con descuentos + líquido.
- **Libro en Excel** para Contabilidad, con tres hojas: *Libro* (una fila por persona, con totales), *Resumen* (del sueldo al líquido, costo empresa, Previred por institución y control) y *Centralización* (cuenta, glosa, centro de costo, debe y haber). Los montos son números, no texto. Un mes abierto en BUK sale marcado como PROVISORIO.
- Mismo permiso que la pestaña, verificado en la página y en la ruta de descarga; cada vez que se abre el desglose o se baja el Excel queda en la auditoría con quién y cuándo. Los botones no precargan nada: los datos por persona solo se piden al abrirlos.

## 2026-11-17 · Remuneraciones (solo Performance Technologies)

- Pestaña **Remuneraciones** con el libro de BUK por mes: líquido a pagar, Previred (por AFP, salud, cesantía, mutual y caja), impuesto único, costo empresa y detalle por centro de costo. Solo totales por concepto: no se muestran nombres ni RUT de las personas.
- **Estado de pago** de sueldos y de Previred, cruzando BUK con los movimientos del banco de Tesorería: Pagado, Parcial, Por pagar, Pendiente o Sin cartola (cuando el banco cargado no cubre la fecha, no se afirma que falte).
- **Para el flujo de caja**: sugiere lo que sale por remuneraciones en cada mes del flujo (sueldos al pagarse, Previred al vencer; lo ya pagado no se suma) y lo carga en la fila «Remuneraciones» con confirmación y auditoría.
- **Acceso cerrado por defecto**: admin del Core o personas con el nuevo permiso «Ver remuneraciones» (en Permisos de flujos). Se exige en la pestaña, la página y cada acción.
- Requiere la migración `supabase/fin/0011_remuneraciones_permiso.sql` y las variables `BUK_URL` y `BUK_API_TOKEN`.

## 2026-11-04 · Primera entrega

**Base**
- Migración aditiva `supabase/fin/0001_gestion_financiera.sql`:
  - 36 tablas `fin_*` con RLS y la función de correlativos.
  - Bucket privado `finanzas`.
  - Catálogos para PERTEC, Zeus Mining y Performance Service: parámetros, 10 categorías de movimiento, proyecto General y plan de cuentas PyME.
  - La aplicación «Gestión financiera» en el menú de Finanzas.
- Reglas del Excel en `lib/fin/reglas.ts`, probadas contra el Excel con `npm run probar-fin`:
  - Etapas V-001…V-011 y pasos C-001…C-008.
  - Factoring op. 7, banco y flujo de 3 meses (FALTA CAJA en el mes 3).
  - Dashboard y proyectos, más pruebas por rama.
- Motor de asientos y lector de cartolas, con sus pruebas (`probar-fin-contable`).

**Pantallas**
- **Resumen:**
  - KPIs.
  - «Atención hoy».
  - Proyección de caja.
  - Embudo por etapa.
  - Antigüedad de cuentas por cobrar.
  - Mandantes.
  - Rentabilidad por proyecto.
  - Pipeline comercial.
- **Comercial:**
  - Pipeline Kanban de oportunidades: se arrastra entre etapas y marca las que llevan 7 días sin actividad.
  - Cotizador nuevo con líneas de producto de Inventario o texto libre, arriendo por meses y versiones.
  - Al aceptar una cotización se crea el proyecto y los hitos: única, en partes o mensual.
- **Ventas y cobranza:**
  - Hitos con su etapa y edición en línea.
  - Factura desde uno o varios hitos.
  - NC, ND y guías.
  - Cobros parciales aplicados a varias facturas, que pueden venir desde el banco.
  - Ficha del hito con su historial.
- **Compras y pagos:**
  - Solicitud → aprobación → visado (emite la OC) → recepción → factura con cuadre contra la OC y tolerancia → programación → pago.
  - Facturas sin OC.
- **Tesorería:**
  - Banco diario con importación de cartolas, reglas, sugerencias en lote y conciliación con cobros, pagos y traspasos.
  - Factoring.
  - Flujo de caja con detalle por celda y montos manuales en línea.
- **Proyectos:** cifras de vendido, facturado, comprometido, disponible y margen.
- **Contabilidad:**
  - Modo contador externo: libros, IVA y asientos propuestos.
  - Modo integrado: contabilizar el mes.
  - Mayor, balance y estado de resultados.
  - Cierre y reapertura del período.
- **Rutinas** diarias, semanales y mensuales con contadores en vivo.
- **Configuración:** parámetros, cuentas, factores, categorías, reglas y perfil financiero de clientes y proveedores.
- Cartilla del módulo en la portada de Finanzas.

**Pendiente (ver PREGUNTAS_ABIERTAS.md)**
- Facturación electrónica: emitir y ceder.
- Formatos imprimibles.
- Importación del RCV y lector de XML.
- Notificaciones por correo.
- Integraciones con Contratos y Rendición de gastos.
- Roles.
