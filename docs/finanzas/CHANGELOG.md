# Gestión financiera · Cambios

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
