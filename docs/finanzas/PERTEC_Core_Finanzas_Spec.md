# Core PERTEC · Especificación Módulos Finanzas, CRM, Ventas, Compras, Tesorería y Contabilidad

> **Documento para Claude Code.** Implementar dentro del repositorio existente de `core.pertec.cl`.
> Versión 1.0 · 04-11-2026 · Autor funcional: Hugo (TI PERTEC)
> Fuente funcional: `Finanzas_PERTEC_v2_Punto_de_partida.xlsx` (analizado íntegramente en la sección 2).

---

## 0. Cómo usar este documento (leer primero, Claude Code)

1. **No empieces a escribir código hasta completar la Fase 0 (Descubrimiento)** de la sección 13. Este documento describe *qué* construir y *cómo debe comportarse*; el *cómo técnico exacto* (framework, ORM, componentes, carpetas) lo debes adaptar a lo que **ya existe** en el Core.
2. Supuestos de infraestructura conocidos: webapp desplegada en **Vercel**, base de datos y respaldos en **Supabase (PostgreSQL)**, infraestructura compartida con Innovation Health. Verifica framework (probablemente Next.js + TypeScript), librería UI, ORM/cliente de BD, auth y estructura de módulos antes de decidir nada.
3. Reglas inviolables (detalle en sección 1.3):
   - **No modificar, migrar, borrar ni “limpiar” datos** de módulos existentes (Rendición de gastos, Contactos, Inventario ni otros).
   - **Migraciones solo aditivas.** Nada de `DROP`, `ALTER ... DROP COLUMN`, `UPDATE` masivos ni `TRUNCATE` sobre tablas existentes.
   - **Los módulos nuevos parten vacíos en producción.** Datos de ejemplo solo en entorno local/preview mediante un seed separado y explícito.
   - **Separación total por empresa** (PERTEC, Innovation Health, Zeus Mining). Única excepción: **Inventario** (catálogo y stock compartidos).
   - **Reutilizar el sistema de diseño existente** (tokens, colores, tipografía, componentes, layout, navegación). Cero estilos ad-hoc.
4. Cuando algo de este documento choque con una convención real del repo, **gana la convención del repo**, y lo dejas anotado en `docs/finanzas/DECISIONES.md`.
5. Ante una duda funcional no resuelta aquí, implementa la opción más simple que respete el flujo del Excel y regístrala en `docs/finanzas/PREGUNTAS_ABIERTAS.md`. No bloquees el avance.

---

## 1. Visión y alcance

### 1.1 Objetivo

Llevar al Core PERTEC, de forma nativa, toda la operación financiera que hoy vive en el Excel “Finanzas PERTEC v2”: desde la oportunidad comercial y la cotización hasta el cobro, desde la solicitud de compra hasta el pago, con conciliación bancaria diaria, factoring, flujo de caja a 3 meses, contabilidad y un **dashboard de finanzas de nivel gerencial**.

El principio del Excel se mantiene: **cada entidad es una tabla propia y las “hojas” son vistas**. Nadie vuelve a escribir un dato que ya existe en otro lado (HEREDA), lo calculable se calcula (CALCULA), y lo que hoy se digita (MANUAL/AUTO) mañana llegará solo sin cambiar el diseño.

### 1.2 Módulos a construir

| # | Módulo (menú) | Reemplaza hoja(s) del Excel | Prioridad |
|---|---|---|---|
| M0 | **Configuración financiera** (por empresa) | Listas y reglas | P0 |
| M1 | **Proyectos / Contratos** | Proyectos | P0 |
| M2 | **CRM Comercial** (pipeline de oportunidades) | Flujo (inicio), Ventas y CxC cols H–I | P0 |
| M3 | **Ventas y Cobranza** (cotización → hitos → factura → cobro) | Ventas y CxC | P0 |
| M4 | **Compras y Pagos** (solicitud → OC → recepción → factura → pago) | Compras y CxP | P0 |
| M5 | **Tesorería / Banco diario** (cartolas, tarjeta, conciliación) | Banco diario | P0 |
| M6 | **Factoring** | Factoring | P1 |
| M7 | **Flujo de caja** (proyección 3 meses) | Flujo de caja | P0 |
| M8 | **Dashboard Finanzas** (home del módulo Finanzas) | Dashboard | P0 |
| M9 | **Rutinas y cierre** | Rutinas | P1 |
| M10 | **Contabilidad** (plan de cuentas, asientos, libros, cierre) | (nuevo; Léeme/Rutinas mencionan paquete contador) | P1 |
| M11 | **Documentos tributarios** (carga manual hoy, DTE/SII mañana) | Cols AUTO de factura/guía | P0 manual · P2 API |

> Compras y Ventas deben ser **lo más simples de usar del sistema**: pocos campos visibles, defaults inteligentes, acciones de un clic para avanzar de etapa.

### 1.3 Restricciones y principios no negociables

1. **Multiempresa estricta.** Toda tabla nueva lleva `empresa_id NOT NULL`. RLS en Supabase garantiza que un usuario solo ve/escribe empresas a las que pertenece. La UI siempre opera sobre la **empresa activa** (selector global). Ningún reporte suma empresas salvo una vista “Consolidado” explícita y solo para rol Gerencia (P2).
2. **Inventario compartido.** Productos, bodegas y stock del módulo Inventario existente son comunes a las tres empresas. Los documentos financieros que referencian productos guardan `empresa_id` propio; el producto es global.
3. **Datos existentes intocables.** Las integraciones con Contactos, Inventario y Rendición de gastos se hacen por **referencia (FK o tabla puente nueva)** y **lectura**; cualquier escritura hacia módulos existentes (p. ej., entrada de stock al recepcionar una OC) va detrás de un **flag por empresa desactivado por defecto**.
4. **Auditoría total:** “todo cambio guarda quién, cuándo y por qué” (Léeme). Tabla de auditoría genérica + motivo obligatorio en anulaciones, reaperturas y cambios de montos.
5. **Nada dudoso se contabiliza sin revisión.** Movimientos bancarios “Por aclarar” no generan asiento.
6. **Nunca se guardan claves del banco.** Las cartolas se importan por archivo; integraciones futuras solo vía API oficial con tokens en secretos del servidor.
7. **Escalable:** reglas (etapas, siguiente paso, categorización, asientos) como **funciones/configuración**, no lógica dispersa en componentes.
8. **Sin formatos imprimibles ahora.** Cotización, OC, guía y factura no requieren PDF/plantilla en esta etapa. Dejar el punto de extensión (`documento.plantilla_id`, acción “Imprimir” deshabilitada con tooltip “Formato en diseño”).
9. **Facturación electrónica SII: no ahora.** Carga manual de facturas (formulario + adjunto PDF/XML). Arquitectura preparada para conectar un proveedor DTE (p. ej. SimpleFactura) o el SII sin rediseñar (sección 9).

### 1.4 Fuera de alcance (esta entrega)

- Formatos de impresión / PDF de documentos.
- Emisión DTE, acuse/reclamo automático en SII, cesión electrónica (AEC) automática.
- Remuneraciones (siguen en BUK; solo se registran como egreso proyectado/real).
- Conexión automática con bancos o portales de factoring.
- Consolidación contable entre empresas.

---

## 2. Análisis funcional del Excel “Finanzas PERTEC v2”

### 2.1 Estructura general

| Hoja | Rol | Lo que el sistema debe heredar |
|---|---|---|
| Léeme | Convenciones | Clasificación de cada campo: **AUTO** (llegará sola: banco, SII, factor; hoy se digita o importa en el mismo campo), **HEREDA** (se copia de otra entidad, no se reescribe), **CALCULA** (fórmula), **MANUAL** (persona; en ámbar). “Las hojas son vistas; cada entidad es una tabla”. |
| Cambios v2 | Decisiones de diseño | Presupuesto opcional (spot), sin semáforo por fila (la caja se mira en el flujo consolidado), visado = Finanzas dice “hay plata”, nóminas no son hoja (se cruzan en banco), etapas simplificadas a “Etapa actual” y “Siguiente paso”. |
| Flujo | Proceso cotización → cobro | Dos caminos: **con OC del cliente** y **sin OC** (la OC llega después y es requisito para facturar). EDP y HES opcionales según cliente. Arriendos: un hito por mes; la guía va en el primer mes. Mapa de módulos: Proyectos y OC → Cobrar → Pagar → Caja y cierre → Panel; Maestros alimentan todo. |
| Dashboard | Panel gerencia | KPIs de caja, CxC, CxP, factoring, proyección 3 meses, ventas por etapa, saldos por mandante. |
| Proyectos | Vista por mandante/proyecto | Vendido, facturado, por facturar, por cobrar, compras comprometidas, presupuesto opcional, disponible, margen. |
| Ventas y CxC | Una fila por **cosa facturable** (EDP, hito, mes de arriendo, spot) | Entidad central: **Hito facturable**. 32 columnas en 6 bloques. |
| Factoring | Una fila por factura cedida | Operación de factoring con N facturas; control de pago del cliente para no pagar mora indebida. |
| Compras y CxP | Una fila por compra | Solicitud → aprobación → visado → OC → recepción → factura → pago. |
| Banco diario | Movimientos bancos + tarjeta | Saldos por cuenta, categorización, respaldo, a quién preguntar, días sin aclarar, escalamiento. |
| Flujo de caja | Proyección mensual 3 meses | Caja inicio + cobros − pagos = caja final vs mínimo → holgura → alerta. |
| Rutinas | Tareas diaria/semanal/mensual | Checklist operativo con contadores en vivo. |
| Listas y reglas | Parámetros, listas, reglas | Configuración por empresa. |

### 2.2 Parámetros (nombres definidos del Excel → configuración por empresa)

| Nombre Excel | Valor ejemplo | Campo sistema `fin_parametros` | Uso |
|---|---|---|---|
| `Hoy` | 04-11-2026 | — (fecha del servidor, zona `America/Santiago`) | Vencimientos, días de mora, alertas |
| `IVA` | 0,19 | `tasa_iva` | Totales con IVA |
| `TolOC` | $1.000 | `tolerancia_factura_oc` | Diferencia factura vs OC que no detiene el pago |
| `PlazoProv` | 30 días | `plazo_pago_proveedor_dias` | Estimar pago de OC visada sin factura |
| `PlazoAclarar` | 3 días | `plazo_aclarar_movimiento_dias` | Escalamiento de movimientos bancarios |
| `MinCaja` | $20.000.000 | `minimo_caja` | **Política** (no saldo): colchón que gerencia no quiere romper |
| `TasaMora` | 1,2 % mensual | `tasa_mora_factoring_default` | Estimar mora de factoring (cada contrato puede tener la suya) |

Agregar (no están en Excel pero el flujo los necesita): `plazo_tarjeta_respaldo_horas` (48, política sugerida en Rutinas), `plazo_reclamo_factura_dias` (8, Ley 19.983 — validar con contador), `horizonte_flujo_meses` (3), `moneda` (CLP).

### 2.3 Listas (→ catálogos/enums)

- **Tipo de venta:** Servicio, Arriendo, Venta.
- **Tipo de proyecto:** Contrato, Spot, Arriendo, Interno. Spot se nombra «Spot - nombre».
- **Trabajo / entrega:** Pendiente, En curso, Terminado.
- **Sí/No** (requiere EDP, requiere HES, respaldo).
- **Recepción conforme:** Sí, Parcial, No.
- **Cuentas:** Banco Chile CC, Itaú CC, Tarjeta de crédito (tipos: Banco / Tarjeta). → tabla por empresa.
- **Factores:** Itaú Factoring, Banchile Factoring. → tabla por empresa.
- **Recurso:** Con recurso / Sin recurso.
- **Categorías de movimiento bancario:** Cobro cliente, Pago proveedor, Remuneraciones, Impuestos, Factoring, Gasto tarjeta, Comisión banco, Traspaso entre cuentas, Crédito o leasing, Otro. → tabla configurable por empresa, con mapeo a cuenta contable.
- **Mandantes/clientes:** nombre, condición de pago (días), RUT y contacto de cobranza → **NO es tabla nueva**: se usa el módulo **Contactos** existente + extensión financiera por empresa (sección 4.2).

### 2.4 Regla «Etapa actual» (hitos de venta) — orden de evaluación exacto

Fórmula original (G8) traducida. Se evalúa en este orden; la primera que se cumple manda:

```
si no hay fecha de aceptación                         → "Cotización enviada"
si hay factura:
    si saldo <= 0                                     → "Cobrada"
    si hoy > vencimiento                              → "Vencida"
    si no                                             → "Por cobrar"
si trabajo = "Terminado":
    si requiere EDP y no hay fecha aprobación EDP     → "Esperando aprobación EDP"
    si no hay N° OC cliente                           → "Esperando OC"
    si requiere HES y no hay N° HES                   → "Esperando HES"
    si no                                             → "Lista para facturar"
si trabajo = "En curso"                               → "En ejecución"
si no (Pendiente o vacío)                             → "Por iniciar"
```

| Etapa | Acción sugerida (se muestra en UI) |
|---|---|
| Cotización enviada | Seguimiento comercial |
| Por iniciar | Coordinar ejecución |
| En ejecución | Preparar EDP o respaldos |
| Esperando aprobación EDP | Perseguir aprobación del EDP |
| Esperando OC | Pedir OC al cliente |
| Esperando HES | Pedir HES al cliente |
| Lista para facturar | **Emitir factura hoy** |
| Por cobrar | Confirmar fecha de pago |
| Vencida | Gestionar cobranza |
| Cobrada | — |

### 2.5 Regla «Siguiente paso» (compras) — orden exacto

```
tiene fecha de pago real                                   → "Pagada"
tiene factura y no tiene OC                                → "Factura sin OC: regularizar"
no tiene aprobación (JP o gerente)                         → "Falta aprobación JP o gerente"
no tiene visado de Finanzas                                → "Falta visado de Finanzas"
no tiene N° OC                                             → "Emitir OC al proveedor"
recepción ≠ "Sí"                                           → "Esperar recepción conforme"
no tiene factura                                           → "Esperar factura del proveedor"
|total factura − neto OC × (1+IVA)| > tolerancia           → "Revisar diferencia con la OC"
sin fecha programada y hoy > vencimiento                   → "Vencida: programar pago ya"
sin fecha programada                                       → "Programar pago"
con fecha programada                                       → "Pago programado"
```

> Nota: el Excel compara en **valor absoluto** (`ABS(diferencia) > TolOC`), por lo que también detecta facturas menores a la OC (típico en recepciones parciales). Mantener ese comportamiento.

### 2.6 Regla «Estado» factoring

```
excedente recibido (fecha)                          → "Liquidada"
cliente pagó y factor no ha confirmado              → "Cliente pagó: confirmar con el factor"
cliente pagó (y factor confirmó)                    → "Esperando excedente"
días de mora > 0                                    → "En mora: cobrar al cliente"
si no                                               → "Vigente"
```

Cálculos: `anticipo = nominal × %anticipo` · `neto_recibido = anticipo − costo_factor` (debe calzar con el abono bancario) · `dias_mora = max(0, (pago_real ?? hoy) − vencimiento)` · `mora_estimada = anticipo × tasa × días / 30` · `excedente = nominal − anticipo − (mora_cobrada ?? mora_estimada)` · fecha de flujo del excedente = pago real ?? fecha estimada ?? vencimiento.

### 2.7 Regla estado de movimiento bancario

```
estado  = "Conciliado" si tiene categoría Y respaldo = Sí; si no "Por aclarar"
dias    = hoy − fecha (solo si Por aclarar)
alerta  = "Escalar" si Por aclarar y dias > plazo_aclarar
```
En el sistema se agrega un tercer estado **“Conciliado con documento”** cuando el movimiento quedó ligado a cobro/pago/factura/operación (match), que es el que habilita el asiento contable automático.

### 2.8 Cálculos de Ventas y CxC

- `monto_con_iva = round(neto × (1 + IVA))`
- `condicion_pago` hereda del cliente (default 30).
- `vence = fecha_emision + condicion_pago`.
- `cedida_factoring` = existe en una operación de factoring.
- `saldo = total_factura − Σ pagos aplicados` (solo facturado).
- `dias_vencida = hoy − vence` (solo etapa Vencida).
- **Para flujo:** `fecha_flujo = fecha_estimada_pago ?? vence` (solo aceptadas) · `monto_flujo`: por facturar → total con IVA; facturada no cedida → saldo; cedida → 0 (entra por Factoring) · `tipo_flujo`: “Por facturar” | “Facturada”.

### 2.9 Cálculos de Compras y CxP

- `diferencia_vs_oc = total_factura − round(neto_cotizado × (1+IVA))`.
- `comprometido_neto` = factura/(1+IVA) si hay factura; neto cotizado si está visada; 0 si no.
- `fecha_flujo` (si no está pagada) = fecha programada ?? vencimiento ?? visado + plazo_proveedor.
- `monto_flujo` (si no está pagada) = total factura ?? neto×(1+IVA) si visada ?? 0.
- **Las solicitudes no visadas NO entran al flujo** (se muestran como informativo).

### 2.10 Cálculos de Proyectos

`vendido` = Σ neto hitos con cotización aceptada · `facturado` = Σ neto hitos con factura · `por_facturar` = vendido − facturado · `por_cobrar` = Σ saldos · `compras_comprometidas` = Σ comprometido_neto de compras del proyecto · `presupuesto_disponible` = presupuesto − comprometido (o “Sin presupuesto”) · `margen` = vendido − comprometido · `margen_%` = margen / vendido. *(Margen “sin mano de obra propia aún”: dejar campo `costo_mano_obra` preparado, null.)*

### 2.11 Flujo de caja (3 meses)

| Línea | Origen | Regla |
|---|---|---|
| Caja al inicio | CALCULA | Mes 1: Σ saldos de cuentas tipo Banco. Mes n: caja final mes n−1 |
| + Cobros facturas emitidas no cedidas | CALCULA | Σ monto_flujo tipo “Facturada” con fecha_flujo en el mes (**Mes 1 incluye atrasado**) |
| + Cobros por facturar con fecha estimada | CALCULA | ídem tipo “Por facturar” |
| + Excedentes de factoring | CALCULA | Σ excedentes por fecha flujo |
| + Anticipos de factoring planificados | MANUAL | Partida planificada |
| + Otros ingresos | MANUAL | Partida planificada |
| − Pagos a proveedores | CALCULA | Σ monto_flujo compras por fecha_flujo (Mes 1 incluye atrasado) |
| − Remuneraciones | MANUAL | Monto mensual fijo (futuro: integración BUK) |
| − Impuestos (IVA, PPM, retenciones) | MANUAL→CALCULA | Estimación F29; P1: calcular desde IVA DF − IVA CF del mes anterior |
| − Créditos, leasing | MANUAL | Cuotas fijas (plantilla recurrente) |
| − Pago tarjeta | CALCULA/MANUAL | Mes 1: deuda actual tarjeta; meses 2–3 estimación manual |
| Caja final | CALCULA | inicio + entradas − salidas |
| Mínimo de caja | HEREDA | parámetro |
| Holgura | CALCULA | final − mínimo |
| Alerta | CALCULA | “FALTA CAJA” si holgura < 0 |
| Informativo: por facturar sin fecha | CALCULA | No incluido; botón “Asignar fecha” |
| Informativo: compras sin visar | CALCULA | No incluido |

### 2.12 Rutinas (se convierten en checklist con contadores vivos)

| Frecuencia | Tarea | Contador que el sistema muestra |
|---|---|---|
| Diario | Cargar movimientos de ayer (bancos y tarjeta), categorizar y ligar | Movimientos importados hoy / por categorizar |
| Diario | Asignar responsable a lo no reconocido | Movimientos sin “a quién preguntar”; N° a escalar |
| Diario | Revisar facturas recibidas ayer: ligar a OC o reclamar dentro de plazo | Facturas sin OC; días restantes para reclamo |
| Diario | Revisar facturas emitidas: ligadas a su hito | Facturas emitidas sin hito |
| Diario | Ver “Lista para facturar” y emitir | N° y monto listos para facturar |
| Semanal | Cobranza: vencidas y por vencer, registrar fecha prometida | Vencidas, por vencer 7 días, sin fecha estimada |
| Semanal | Factoring: confirmar con factores qué clientes pagaron | “Cliente pagó: confirmar con el factor” |
| Semanal | Visar compras y programar pagos según flujo | Compras esperando visado; holgura del mes |
| Semanal | Revisar flujo 3 meses y holgura | Meses con FALTA CAJA |
| Mensual | Cierre: todo conciliado al último día | Movimientos “Por aclarar” del mes |
| Mensual | Cuadrar emitidas/recibidas con RCV del SII | Diferencias RCV vs sistema |
| Mensual | Cuadrar saldo cedido con informe de cada factor | Exposición por factor |
| Mensual | Paquete al contador (libros, facturas, cartolas, nóminas, rendiciones, tarjeta) | Botón “Generar paquete” (ZIP) |

### 2.13 Hallazgos y mejoras incorporadas respecto del Excel

1. El Excel modela **una factura = un hito**. El sistema permite **1 factura ↔ N hitos** (tabla puente) y **pagos parciales** (aplicaciones de pago), conservando la vista “una fila por hito”.
2. Falta **Nota de Crédito/Débito**: se agregan (afectan saldo de factura y diferencia vs OC en compras).
3. Falta **cotización estructurada** (solo N° y monto): se agrega Cotización con líneas (opcionalmente productos de Inventario) que al aceptarse **genera los hitos** (incluye generador de meses de arriendo).
4. Compras sin **recepción ligada a inventario**: se agrega recepción con líneas (parcial/total) y, si el flag está activo, movimiento de stock.
5. Tarjeta de crédito y **Rendición de gastos** existente: un gasto de tarjeta puede conciliarse contra una rendición/gasto existente (link de solo lectura) en vez de pedir respaldo duplicado.
6. Se agrega **contabilidad de partida doble** derivada de los documentos, desactivable (modo “Contador externo”).
7. Se reemplaza el semáforo por **holgura mensual** visible al visar una compra (mini-widget en el formulario de visado).

---

## 3. Benchmark: qué tomamos de otros sistemas (y qué no)

| Sistema | Idea adoptada | Adaptación PERTEC | Lo que NO copiamos |
|---|---|---|---|
| **Odoo** (Ventas, Compras, Contabilidad) | Documentos encadenados (cotización → orden → entrega → factura); *smart buttons* con contadores en la cabecera de cada documento; **3‑way match** OC/recepción/factura antes de pagar; chatter (historial + comentarios) en cada registro; asientos generados desde documentos; diarios por banco. | Cadena propia: Oportunidad → Cotización → **Hitos facturables** (EDP/HES/OC cliente) → Factura → Cobro. Match OC/recepción/factura con tolerancia configurable. | Configuración contable exhaustiva, multi‑moneda, decenas de estados, módulos que no usamos. |
| **monday.com CRM** | Pipeline **Kanban** por etapas con drag & drop, montos por columna, vistas tabla/kanban intercambiables, automatizaciones simples (“cuando pasa X, avisa a Y”). | Kanban de oportunidades y **Kanban de hitos por “Etapa actual”** (cobranza visual). Recordatorios por vencimiento. | Tableros genéricos sin modelo de datos; todo aquí es tipado. |
| **ERPs chilenos (Defontana, Nubox, Bsale)** | Integración SII: RCV, acuse/reclamo en 8 días, libros de compra/venta, F29, cesión AEC; plan de cuentas chileno. | Importación de RCV (CSV) para cuadrar; alerta de plazo de reclamo; plan de cuentas plantilla Chile; preparación para DTE vía proveedor. | Emisión DTE propia en esta fase. |
| **Xero / QuickBooks** | **Conciliación bancaria con reglas** (“cuando la glosa contiene X → categoría Y”), sugerencias de match por monto/fecha/RUT. | Reglas guardadas por empresa; sugerencias automáticas; confirmación humana. | Feeds bancarios directos. |
| **Excel v2 (propio)** | Etapa actual / Siguiente paso calculados; una fila por hito; flujo a 3 meses; rutinas. | Es la fuente de verdad funcional. | — |

---

## 4. Arquitectura técnica

### 4.1 Principios

- **Domain modules**: cada módulo en su carpeta, siguiendo la estructura actual del Core. Sugerencia si no hay convención: `src/modules/finanzas/{config,proyectos,crm,ventas,compras,tesoreria,factoring,flujo,contabilidad,documentos,dashboard,rutinas}/` con `components/`, `server/` (acciones/queries), `schemas/` (zod), `types.ts`.
- **Lógica de negocio en el servidor y en la BD**: reglas de estado como **funciones SQL** (`fin_fn_etapa_hito`, `fin_fn_siguiente_paso_compra`, …) expuestas en **vistas** (`fin_v_hitos`, `fin_v_compras`, …). La UI nunca recalcula reglas; solo lee vistas y llama acciones.
- **Agregados del dashboard** vía funciones RPC (`fin_rpc_dashboard(empresa_id, fecha)`) o vistas materializadas refrescadas por trigger/cron si el volumen lo amerita.
- **Validación** compartida cliente/servidor con zod (o lo que use el repo).
- **Montos en CLP como `numeric(18,0)`**; porcentajes `numeric(7,4)`; fechas `date`; timestamps `timestamptz`. Redondeo comercial a peso.
- **Numeración correlativa por empresa y tipo** (`fin_secuencias`) con bloqueo transaccional: `COT-000123`, `NV-…`, `SC-…`, `OC-…`, `REC-…`, `PAG-…`, `COB-…`, `FAC-OP-…`, `AS-…`.
- **Event log de dominio** (`fin_eventos`): cada transición relevante (cotización aceptada, hito terminado, factura registrada, compra visada, pago registrado…) inserta un evento. Sirve para auditoría, notificaciones, asientos automáticos y futuras integraciones (DTE, webhooks).
- **Feature flags por empresa** (`fin_parametros.flags jsonb`): `contabilidad_activa`, `integracion_inventario_activa`, `integracion_rendiciones_activa`, `dte_proveedor` (null).

### 4.2 Nomenclatura de BD

- Si el Core ya usa **schemas** de Postgres por módulo → crear schema `finanzas` (y exponerlo en Supabase API si se usa PostgREST).
- Si no → tablas en el schema actual con prefijo **`fin_`**. (Recomendado por menor fricción.)
- Todas las tablas: `id uuid pk default gen_random_uuid()`, `empresa_id uuid not null` (FK a la tabla de empresas existente; si no existe, crear `fin_empresas` **solo como catálogo** y registrar decisión), `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (soft delete; nunca borrado físico de documentos), `version int` (bloqueo optimista).
- Índices: `(empresa_id, <fecha|estado>)` en todas las tablas transaccionales.

### 4.3 Multiempresa y seguridad (RLS)

```sql
-- Patrón de política para TODA tabla fin_* (adaptar a la tabla de membresía real del Core)
alter table fin_x enable row level security;
create policy fin_x_tenant on fin_x
  using (empresa_id in (select empresa_id from <membresias_usuario> where user_id = auth.uid()))
  with check (empresa_id in (select empresa_id from <membresias_usuario> where user_id = auth.uid()));
```
- La empresa activa se toma del contexto de sesión del Core (selector existente). Si no existe selector global, crearlo en el layout con el patrón visual del Core.
- Tests obligatorios: un usuario de PERTEC no puede leer ni escribir registros de Zeus Mining ni de Innovation Health (sección 14).
- Inventario: las tablas existentes **no se tocan**; solo se referencian `producto_id`/`bodega_id`.

### 4.4 Roles y permisos (matriz base, configurable)

| Acción | Comercial | Jefe de Proyecto | Gerente | Finanzas | Contador (lectura) | Admin |
|---|---|---|---|---|---|---|
| Oportunidades / cotizaciones | CRUD | Ver | CRUD | Ver | — | CRUD |
| Aceptar cotización / crear hitos | ✔ | — | ✔ | ✔ | — | ✔ |
| Actualizar trabajo, EDP, HES, OC cliente | — | ✔ | ✔ | ✔ | — | ✔ |
| Registrar factura de venta / cobro | — | — | ✔ | ✔ | Ver | ✔ |
| Crear solicitud de compra | ✔ | ✔ | ✔ | ✔ | — | ✔ |
| **Aprobar** compra (técnico) | — | ✔ (sus proyectos, hasta monto límite) | ✔ | — | — | ✔ |
| **Visar** compra (financiero) | — | — | ✔ | ✔ | — | ✔ |
| Emitir OC / recepcionar | — | ✔ recepción | ✔ | ✔ | — | ✔ |
| Programar y registrar pagos | — | — | ✔ | ✔ | — | ✔ |
| Banco diario / conciliación | — | responder consultas | ✔ | ✔ | Ver | ✔ |
| Factoring | — | — | ✔ | ✔ | Ver | ✔ |
| Contabilidad (asientos, cierre) | — | — | Ver | ✔ | Ver/Export | ✔ |
| Configuración financiera | — | — | ✔ | ✔ | — | ✔ |
| Dashboard Finanzas | — | Ver (sus proyectos) | ✔ | ✔ | ✔ | ✔ |

Montos límite de aprobación por rol: `fin_reglas_aprobacion (empresa_id, rol, monto_max)`. **Quién aprueba cada paso está “por definir”** en el Excel: dejar la tabla configurable y una regla por defecto (JP ≤ $X, sobre eso Gerente).

---

## 5. Modelo de datos

> Notación: `→` FK. Campos marcados *(AUTO)* se digitan/importan hoy y se automatizarán sin cambiar el modelo (`origen` registra cómo llegó: `manual | importado | api`).

### 5.1 Configuración (M0)

**fin_parametros** (1 fila por empresa): `tasa_iva`, `tolerancia_factura_oc`, `plazo_pago_proveedor_dias`, `plazo_aclarar_movimiento_dias`, `minimo_caja`, `tasa_mora_factoring_default`, `plazo_tarjeta_respaldo_horas`, `plazo_reclamo_factura_dias`, `horizonte_flujo_meses`, `flags jsonb`.

**fin_cuentas_financieras**: `nombre`, `tipo` (banco|tarjeta|caja), `banco`, `numero_enmascarado` (solo últimos 4), `moneda`, `cuenta_contable_id →fin_cuentas_contables`, `saldo_inicial`, `fecha_saldo_inicial`, `activa`.

**fin_saldos_cuenta** *(AUTO)*: `cuenta_id`, `fecha`, `saldo_banco`, `origen`. (Saldo según banco; el saldo calculado sale de movimientos.)

**fin_factores**: `nombre`, `contacto_id →contactos` (opcional), `tasa_mora_mensual`, `pct_anticipo_default`, `recurso_default` (con|sin), `cuenta_contable_obligacion_id`.

**fin_categorias_movimiento**: `nombre`, `sentido` (ingreso|egreso|ambos), `requiere_proyecto` (true para Gasto tarjeta), `cuenta_contable_id`, `orden`, `activa`. Seed por empresa con las 10 del Excel (este seed de **catálogos** sí se crea en producción, vacío de transacciones).

**fin_reglas_categorizacion**: `cuenta_id?`, `patron_glosa` (ILIKE/regex), `monto_min?`, `monto_max?`, `categoria_id`, `proyecto_id?`, `contacto_id?`, `prioridad`, `activa`, `veces_aplicada`. (“Regla guardada: se asigna sola el próximo mes”.)

**fin_condiciones_pago**: `nombre`, `dias`. 

**fin_secuencias**: `empresa_id`, `tipo_doc`, `prefijo`, `siguiente`, `relleno`.

**fin_reglas_aprobacion**: `tipo` (compra), `rol`, `monto_max`, `requiere_visado` (bool).

### 5.2 Extensión de Contactos (sin tocar la tabla existente)

**fin_contactos_empresa** (perfil financiero por empresa de un contacto existente): `contacto_id →contactos`, `empresa_id`, `es_cliente`, `es_proveedor`, `condicion_pago_venta_dias` (default 30), `condicion_pago_compra_dias`, `contacto_cobranza_nombre/email/telefono`, `requiere_oc_default`, `requiere_edp_default`, `requiere_hes_default`, `portal_proveedores_url`, `exige_referencia_documento` (texto, p. ej. “DEM” para clientes que exigen referencia en la factura), `cuenta_contable_cxc_id?`, `cuenta_contable_cxp_id?`, `notas`. Unique `(empresa_id, contacto_id)`.
> El RUT y razón social viven en Contactos. Si Contactos no tiene RUT validado, agregar validación de dígito verificador **en la UI del módulo nuevo** al crear el perfil; no corregir datos existentes.

### 5.3 Proyectos (M1)

**fin_proyectos**: `codigo` (correlativo), `nombre` (único por empresa y mandante; spot = “Spot - nombre”), `mandante_id →contactos`, `tipo` (contrato|spot|arriendo|interno), `descripcion`, `jefe_proyecto_id →usuarios`, `fecha_inicio`, `fecha_termino`, `presupuesto_costos` (nullable = sin presupuesto), `costo_mano_obra` (nullable, futuro), `estado` (activo|cerrado), `centro_costo_contable?`.
Proyecto especial por empresa: **“General”** (mandante “Interno”) para gastos generales.

**fin_v_proyectos** (vista): todos los calculados de 2.10.

### 5.4 CRM (M2)

**fin_oportunidades**: `codigo`, `nombre`, `cliente_id →contactos`, `contacto_persona?`, `proyecto_id?` (si es ampliación), `tipo` (servicio|arriendo|venta), `etapa` (ver 6.1), `monto_estimado`, `probabilidad` (derivada de etapa, editable), `fecha_cierre_estimada`, `responsable_id`, `origen` (licitación, recurrente, referido, web, otro), `motivo_perdida?`, `descripcion`.

**fin_actividades** (polimórfica, sirve a todo el módulo): `entidad_tipo`, `entidad_id`, `tipo` (llamada|reunión|correo|nota|tarea), `fecha`, `vencimiento?`, `responsable_id`, `resultado`, `hecha`. (Es el “Gestión de cobranza / comentario” del Excel y el seguimiento comercial.)

### 5.5 Ventas (M3)

**fin_cotizaciones**: `numero`, `oportunidad_id?`, `cliente_id`, `proyecto_id?` (se crea/elige al aceptar), `fecha`, `validez_dias`, `tipo` (servicio|arriendo|venta), `condicion_pago_dias` (hereda cliente), `requiere_oc`, `requiere_edp`, `requiere_hes` (heredan defaults del cliente), `estado` (borrador|enviada|aceptada|rechazada|vencida|anulada), `fecha_envio`, `fecha_aceptacion` (= “Cotización aceptada (fecha)”), `evidencia_aceptacion` (adjunto: correo/firma), `neto`, `iva`, `total` (calculados), `version` (revisiones: V1, V2…), `cotizacion_padre_id?`, `plantilla_id` (null, futuro).

**fin_cotizacion_lineas**: `cotizacion_id`, `producto_id? →inventario` (opcional), `descripcion`, `cantidad`, `unidad`, `precio_unitario`, `descuento_pct`, `neto_linea`, `exento` (bool), `periodo_meses?` (arriendo).

**fin_hitos** — **entidad central (= fila de “Ventas y CxC”)**:
| Campo | Excel | Origen |
|---|---|---|
| `codigo` (V-001…) | ID | CALCULA |
| `cliente_id` | Mandante | HEREDA cotización |
| `proyecto_id` | Proyecto | HEREDA |
| `descripcion` | Descripción | MANUAL (default: cotización) |
| `tipo` | Tipo | HEREDA |
| `periodo` (texto) + `periodo_desde/hasta` | Hito/período | MANUAL / generador |
| `cotizacion_id` | N° cotización | HEREDA |
| `neto` | Monto neto | HEREDA (editable en EDP con motivo) |
| `oc_cliente_numero`, `oc_cliente_fecha`, `oc_cliente_adjunto` | N° OC cliente | MANUAL |
| `estado_trabajo` (pendiente|en_curso|terminado) | Trabajo/entrega | MANUAL |
| `guia_despacho_id? →fin_documentos_tributarios` | Guía | AUTO |
| `requiere_edp`, `edp_fecha_aprobacion`, `edp_adjunto` | EDP | MANUAL |
| `requiere_hes`, `hes_numero`, `hes_adjunto` | HES | MANUAL |
| `fecha_estimada_pago` | Fecha estimada | MANUAL (promesa cliente) |
| `orden` | — | — |
Vista **fin_v_hitos**: añade `total_con_iva`, `etapa_actual`, `accion_sugerida`, `factura_numero`, `fecha_emision`, `vence`, `cedida_factoring`, `fecha_pago_real`, `monto_pagado`, `saldo`, `dias_vencida`, `fecha_flujo`, `monto_flujo`, `tipo_flujo`.

**Generador de hitos al aceptar cotización:**
- Servicio/Venta: 1 hito “Única” por defecto, o N hitos (“Hito 1..N”, % o montos) o EDP mensuales (“EDP oct”, “EDP nov”… entre fechas).
- Arriendo: un hito por mes del período (“Arriendo oct”, “Arriendo nov”…); la guía de despacho se asocia al primer mes.
- Siempre editable después (agregar hito, dividir hito, anular hito con motivo).

**fin_documentos_tributarios** (ventas y compras; M11): `direccion` (emitido|recibido), `tipo_dte` (33 factura afecta, 34 exenta, 52 guía despacho, 56 nota débito, 61 nota crédito, 46 factura compra, 39/41 boleta, 110+ exportación — catálogo), `folio`, `fecha_emision`, `fecha_recepcion_sii?`, `contraparte_id →contactos`, `rut_contraparte`, `neto`, `exento`, `iva`, `otros_impuestos`, `total`, `fecha_vencimiento`, `referencias jsonb` (OC, HES, DEM, doc referenciado en NC/ND), `documento_referenciado_id?` (NC/ND), `pdf_adjunto`, `xml_adjunto`, `origen` (manual|importado_rcv|api_dte), `estado_sii` (null|aceptado|reclamado|acuse_recibo — futuro), `track_id?`, `cedido` (bool), `estado` (vigente|anulado). Unique `(empresa_id, direccion, tipo_dte, folio, rut_contraparte)`.

**fin_factura_hitos**: `documento_id`, `hito_id`, `monto_neto_aplicado` (permite 1 factura ↔ N hitos y facturación parcial).

**fin_cobros**: `numero`, `cliente_id`, `fecha`, `monto`, `medio` (transferencia|cheque|vale vista|factor), `cuenta_id`, `movimiento_bancario_id?`, `referencia`, `estado`.
**fin_cobro_aplicaciones**: `cobro_id`, `documento_id`, `monto` (abonos parciales; NC también se aplica como rebaja).

### 5.6 Compras (M4)

**fin_solicitudes_compra** (= fila de “Compras y CxP”): `codigo` (C-001), `proyecto_id` (o “General”), `mandante_id` (hereda del proyecto; “Interno” si General), `descripcion`, `proveedor_id →contactos`, `cotizacion_proveedor_adjunto`, `neto_cotizado`, `exento`, `fecha_requerida`, `solicitante_id`, `prioridad`, `aprobado_por`, `fecha_aprobacion`, `visado_por`, `fecha_visado`, `motivo_rechazo?`, `estado_override?` (anulada|rechazada).
**fin_solicitud_lineas**: `producto_id? →inventario`, `descripcion`, `cantidad`, `precio_unitario`, `neto_linea`.

**fin_ordenes_compra**: `numero` (P-0127; se genera al visar), `solicitud_id` (1:1 normalmente; permitir N:1 a futuro), `proveedor_id`, `fecha`, `condicion_pago_dias`, `neto`, `iva`, `total`, `estado` (emitida|parcial|recibida|facturada|cerrada|anulada), `enviada_proveedor_fecha`, `plantilla_id` (null).

**fin_recepciones**: `oc_id`, `fecha`, `recibido_por`, `resultado` (si|parcial|no), `observacion`, `adjunto` (guía proveedor). **fin_recepcion_lineas**: `oc_linea_id`, `cantidad_recibida`, `bodega_id? →inventario`, `movimiento_inventario_id?` (solo si flag activo).

**Facturas de proveedor** = `fin_documentos_tributarios` con `direccion = recibido`, más **fin_factura_oc** (`documento_id`, `oc_id`, `monto_aplicado`).

**fin_pagos**: `numero`, `proveedor_id` (o empleado para reembolsos), `fecha_programada`, `fecha_pago_real` *(AUTO desde banco)*, `monto`, `cuenta_id`, `medio` (transferencia|nómina banco|cheque|tarjeta), `nomina_lote?`, `movimiento_bancario_id?`, `comprobante_adjunto`, `estado` (programado|pagado|anulado).
**fin_pago_aplicaciones**: `pago_id`, `documento_id`, `monto`.

Vista **fin_v_compras**: `siguiente_paso`, `factura_numero`, `total_factura`, `diferencia_vs_oc`, `vence`, `fecha_programada`, `fecha_pago_real`, `comprometido_neto`, `fecha_flujo`, `monto_flujo`, `dias_para_reclamo` (fecha_recepcion_sii + plazo − hoy).

### 5.7 Tesorería (M5)

**fin_importaciones_cartola**: `cuenta_id`, `archivo`, `formato` (perfil de importación), `fecha_desde/hasta`, `filas_total`, `filas_nuevas`, `filas_duplicadas`, `importado_por`.
**fin_perfiles_importacion**: mapeo de columnas por banco (Banco de Chile, Itaú, tarjeta): `columna_fecha`, `columna_glosa`, `columna_cargo`, `columna_abono`|`columna_monto`, formato de fecha, filas a saltar. Editable desde UI.
**fin_movimientos_bancarios**: `cuenta_id`, `fecha`, `glosa`, `monto` (+abono/−cargo), `numero_documento_banco?`, `hash_dedup` (cuenta+fecha+monto+glosa+n° → unique), `categoria_id?`, `proyecto_id?`, `contacto_id?`, `responsable_consulta_id?` (“A quién preguntar”), `tiene_respaldo` (bool), `respaldo_adjunto?`, `rendicion_ref?` (link a rendición/gasto existente, solo lectura), `regla_aplicada_id?`, `comentario`, `importacion_id`.
**fin_conciliaciones**: `movimiento_id`, `entidad_tipo` (cobro|pago|operacion_factoring|traspaso|otro), `entidad_id`, `monto`. (Un movimiento puede cubrir varios pagos — nómina — y viceversa.)
Vista **fin_v_movimientos**: `estado` (por_aclarar|conciliado|conciliado_con_documento), `dias_sin_aclarar`, `alerta_escalar`.

### 5.8 Factoring (M6)

**fin_operaciones_factoring**: `numero_operacion` *(AUTO liquidación)*, `factor_id`, `recurso` (con|sin; hereda), `fecha_cesion`, `pct_anticipo`, `tasa_mora_mensual`, `costo_total` (interés+comisión+gastos) *(AUTO)*, `fecha_anticipo_recibido`, `movimiento_anticipo_id?`, `liquidacion_adjunto`.
**fin_factoring_documentos**: `operacion_id`, `documento_id` (factura de venta), `nominal` (hereda total), `anticipo` (calc), `costo_asignado` (prorrata), `factor_confirma_pago_fecha` (MANUAL), `mora_cobrada` *(AUTO)*, `excedente_recibido_fecha` *(AUTO)*, `excedente_recibido_monto`, `movimiento_excedente_id?`.
Vista **fin_v_factoring**: hereda de la factura/hito `cliente`, `vence`, `fecha_estimada_pago`, `fecha_pago_real`; calcula `dias_mora`, `mora_estimada`, `excedente_esperado`, `estado`, `fecha_flujo`, `monto_flujo`.
> Al ceder una factura: el saldo de la CxC no se “paga”; queda **cedida** (sale del flujo de cobros y entra como excedente). Cuando el cliente paga al factor, el usuario registra `fecha_pago_real` en el hito (o lo trae el informe del factor) → estado “Cliente pagó: confirmar con el factor”.

### 5.9 Flujo de caja (M7)

**fin_flujo_partidas_manuales**: `mes` (date, día 1), `concepto` (anticipos_factoring_planificados|otros_ingresos|remuneraciones|impuestos|creditos_leasing|pago_tarjeta|otro_ingreso|otro_egreso), `monto`, `comentario`, `recurrente` (bool; copia automática a meses siguientes).
**fin_rpc_flujo_caja(empresa_id, meses)** → devuelve la matriz de 2.11 + detalle drill‑down de cada celda.
Snapshot mensual opcional **fin_flujo_snapshots** (para comparar proyectado vs real — P2).

### 5.10 Contabilidad (M10)

**fin_cuentas_contables**: `codigo` (ej. 1.1.01.001), `nombre`, `tipo` (activo|pasivo|patrimonio|ingreso|gasto|orden), `naturaleza` (deudora|acreedora), `nivel`, `padre_id`, `imputable` (bool), `requiere_proyecto` (bool), `requiere_contacto` (bool), `activa`. Plantilla **Plan de cuentas Chile PyME** sembrada por empresa como catálogo (editable; el contador valida).
**fin_periodos_contables**: `anio`, `mes`, `estado` (abierto|cerrado), `cerrado_por`, `fecha_cierre`.
**fin_diarios**: Ventas, Compras, Banco (uno por cuenta), Factoring, Remuneraciones, Ajustes/General, Apertura.
**fin_asientos**: `numero`, `diario_id`, `fecha`, `periodo_id`, `glosa`, `origen_tipo` (factura_venta|factura_compra|nc|cobro|pago|factoring|movimiento|manual|apertura), `origen_id`, `estado` (borrador|contabilizado|anulado), `contabilizado_por`, `asiento_reversa_id?`.
**fin_asiento_lineas**: `asiento_id`, `cuenta_id`, `debe`, `haber`, `proyecto_id?` (analítica), `contacto_id?`, `glosa_linea`, `documento_id?`. Constraint: Σ debe = Σ haber por asiento (trigger al pasar a contabilizado).
**fin_reglas_contables** (motor de asientos por evento, configurable — ver 8.3).

### 5.11 Transversales

**fin_adjuntos**: `entidad_tipo`, `entidad_id`, `tipo` (cotizacion_cliente|oc_cliente|edp|hes|guia|factura_pdf|factura_xml|cartola|comprobante|liquidacion_factor|otro), `storage_path` (bucket Supabase Storage **privado por empresa**: `finanzas/{empresa_id}/…`), `nombre`, `mime`, `tamano`, `subido_por`. Reutilizar el componente/servicio de adjuntos del Core si existe.
**fin_auditoria**: `tabla`, `registro_id`, `accion`, `antes jsonb`, `despues jsonb`, `motivo`, `usuario_id`, `fecha`. Trigger genérico en todas las tablas `fin_*`. (Si el Core ya tiene auditoría, reutilizarla.)
**fin_eventos**: `tipo`, `entidad_tipo`, `entidad_id`, `payload jsonb`, `procesado_contabilidad`, `procesado_notificaciones`.
**fin_tareas_rutina** (estado de la checklist por usuario/fecha).

---

## 6. Flujos y experiencia de usuario por módulo

### 6.0 Navegación

Agregar al menú principal del Core una sección **Finanzas** (mismo patrón de ítems e íconos existentes):

```
Finanzas
├── Resumen            ← Dashboard (página de entrada al hacer clic en "Finanzas")
├── Comercial (CRM)
│   ├── Oportunidades  (Kanban | Tabla)
│   └── Cotizaciones
├── Ventas y Cobranza
│   ├── Hitos por facturar / cobrar   (Tabla "una fila por hito" | Kanban por etapa)
│   ├── Facturas emitidas
│   └── Cobros
├── Compras y Pagos
│   ├── Solicitudes y OC  (Tabla con "Siguiente paso" | Bandeja de aprobación)
│   ├── Facturas recibidas
│   └── Pagos (programación y nómina)
├── Tesorería
│   ├── Banco diario
│   ├── Factoring
│   └── Flujo de caja
├── Proyectos
├── Contabilidad      (visible si flag contabilidad_activa o rol Finanzas/Contador)
│   ├── Asientos · Libro diario · Libro mayor · Balance 8 columnas · EERR
│   ├── Libros de compra y venta / Cuadratura RCV
│   └── Períodos y cierre
├── Rutinas
└── Configuración
```

Componentes transversales (crear una vez, usar en todo el módulo):
- **`<EmpresaActivaBadge>`** visible en el header de cada página de finanzas (evita registrar en la empresa equivocada).
- **`<DataTable>`** (reutilizar la del Core; si no hay, TanStack Table) con: filtros guardados, columnas configurables, agrupación, totales al pie, export CSV/XLSX, edición inline de campos MANUAL, selección múltiple y acciones masivas.
- **`<StageBadge>`** colores semánticos por etapa (tokens del Core): neutro (Cotización enviada/Por iniciar), info (En ejecución), advertencia (Esperando EDP/OC/HES), éxito‑acento (Lista para facturar), info (Por cobrar), peligro (Vencida), éxito (Cobrada).
- **`<NextActionChip>`**: muestra la acción sugerida y, si aplica, el botón que la resuelve (p. ej., “Registrar factura”).
- **`<DocumentChain>`** (inspirado en smart buttons de Odoo): barra en la cabecera de cada documento con los vinculados y contadores: `Oportunidad · Cotización · 3 Hitos · 2 Facturas · 1 Cobro · Proyecto`.
- **`<ActivityTimeline>`** (chatter): historial de auditoría + comentarios + actividades + adjuntos de cualquier entidad.
- **`<MoneyInput>`/`<Money>`**: CLP sin decimales, separador de miles `.`, prefijo `$`; mostrar neto, IVA y total.
- **`<QuickCreate>`**: crear contacto/proyecto desde un combobox sin salir del formulario.
- **Command palette (Ctrl/⌘+K)**: buscar cualquier documento por número/cliente/folio y acciones rápidas (“Nueva solicitud de compra”, “Registrar cobro”). Si el Core ya tiene, extenderla.
- Atajos: `N` nuevo, `/` buscar, `E` editar, `Ctrl+Enter` guardar.

### 6.1 CRM Comercial (M2)

**Etapas de oportunidad (Kanban):** Prospecto (10 %) → Calificada (25 %) → Cotización enviada (50 %) → Negociación (75 %) → Ganada (100 %) | Perdida (0 %, motivo obligatorio).
- Cada columna muestra Σ monto y Σ monto ponderado.
- Al mover a “Cotización enviada” se sugiere crear la cotización (precargada).
- Al **aceptar la cotización** la oportunidad pasa automáticamente a Ganada.
- Tarjeta: cliente, monto, fecha cierre, responsable (avatar), días sin actividad (alerta si > 7).
- Vista tabla, filtros por responsable/cliente/tipo, forecast mensual (Σ ponderado por mes de cierre).

**Cotización (flujo en una sola pantalla):**
1. Cliente (combobox Contactos con perfil financiero de la empresa activa; *QuickCreate* si no existe) → hereda condición de pago y requisitos OC/EDP/HES.
2. Tipo (Servicio/Arriendo/Venta), proyecto existente o “Crear proyecto al aceptar”.
3. Líneas (descripción libre o producto de Inventario; para arriendo: tarifa mensual × meses).
4. Totales en vivo (neto, IVA, total). Guardar = borrador; “Marcar enviada” registra fecha.
5. **“Aceptar cotización”** (modal): fecha de aceptación + evidencia (adjunto) + N° OC cliente (opcional: decide el camino *con OC / sin OC*) + **generador de hitos** (ver 5.5) → crea proyecto (si aplica) y los hitos. Todo en **una transacción**.
6. Revisiones: “Nueva versión” clona como V2 y deja V1 en estado reemplazada.

### 6.2 Ventas y Cobranza (M3)

**Vista principal = “Ventas y CxC” del Excel**, una fila por hito, agrupable por Mandante/Proyecto, con bloques de columnas plegables (Identificación · Comercial · Requisitos · Factura · Cobro). Encima: **barra de etapas** con contadores y montos (clic = filtro):

`Cotización enviada (n/$) · Por iniciar · En ejecución · Esp. EDP · Esp. OC · Esp. HES · ▶ Lista para facturar · Por cobrar · Vencida · Cobrada`

Edición inline de campos MANUAL (trabajo, OC, EDP, HES, fecha estimada). Cada edición recalcula la etapa al instante (lectura desde la vista).

**Drawer de hito** (panel lateral, sin cambiar de página): requisitos como checklist con adjuntos, factura vinculada, cobros, factoring, actividades de cobranza (“con quién hablaste y qué dijo” + fecha prometida → actualiza `fecha_estimada_pago`).

**Registrar factura de venta (manual, M11):**
- Desde un hito “Lista para facturar” o seleccionando varios hitos del mismo cliente → botón **“Registrar factura”**.
- Formulario: tipo DTE (33/34), folio, fecha emisión, montos precargados desde hitos (editable con validación de diferencia), referencias (OC, HES, DEM u otra que exija el cliente), adjuntar PDF y/o XML.
- Si se adjunta **XML DTE**, parsearlo y precargar folio, fecha, RUT, montos y referencias; validar que RUT emisor = empresa activa y RUT receptor = cliente (P1, recomendado).
- Al guardar: hito(s) → “Por cobrar”; vencimiento calculado; evento `factura_venta_registrada`.
- Nota de crédito (61) / débito (56): referencia obligatoria a la factura; ajusta saldo; puede “reabrir” hitos si anula total (con motivo).
- Guía de despacho (52): registrar manualmente y vincular al hito (primer mes en arriendos).

**Registrar cobro:** desde factura, hito o desde **Banco diario** (abono sin conciliar → “Es un cobro de…” con sugerencias por monto/cliente). Permite aplicar un pago a varias facturas y abonos parciales.

**Kanban de cobranza** (opcional, vista alterna): columnas = etapas desde “Lista para facturar”; tarjetas ordenadas por días vencidos.

**Arriendos:** al llegar el mes, el hito del mes siguiente pasa a “En curso” automáticamente (job diario), para que nada quede sin facturar.

### 6.3 Compras y Pagos (M4) — prioridad: **máxima simplicidad**

**Crear solicitud** (formulario corto, una columna, ≤ 8 campos visibles): Proyecto (default: último usado; “General” si no aplica) · Proveedor (combobox + QuickCreate) · Qué se compra · Monto neto · Cotización del proveedor (drag & drop PDF) · Fecha requerida · (opcional) líneas con productos de Inventario. Guardar = queda en “Falta aprobación”.

**Bandeja “Por aprobar” (JP/Gerente)** y **“Por visar” (Finanzas)**: tarjetas con monto, proyecto, presupuesto disponible del proyecto, adjunto en vista previa y botones **Aprobar / Rechazar (motivo)**. En “Por visar” se muestra el **widget de holgura**: holgura del mes de pago estimado antes y después de esta compra (desde el flujo de caja). Acción masiva permitida.

**Visar → genera OC automáticamente** (número correlativo, “Emitir OC al proveedor” = marcar enviada; formato imprimible pendiente).

**Recepción conforme:** botón en la OC: Sí / Parcial (cantidades por línea) / No + adjunto guía del proveedor. Si `integracion_inventario_activa` y la línea tiene producto → crea entrada de stock vía el **servicio/API existente de Inventario** (nunca insert directo en sus tablas si existe una capa de servicio).

**Factura de proveedor** (carga manual o importación RCV, M11):
- Carga manual con PDF/XML; si viene XML, autocompleta.
- **Matching** sugerido: proveedor + monto ± tolerancia + OC abiertas → el usuario confirma.
- Factura sin OC → estado “Factura sin OC: regularizar” con dos salidas: “Crear solicitud retroactiva” (pasa por aprobación/visado) o “Marcar para reclamar en SII” (muestra días restantes del plazo legal).
- 3‑way match: OC ↔ recepción ↔ factura; diferencia > tolerancia → “Revisar diferencia con la OC” (aprobar diferencia con motivo o esperar NC).

**Programación de pagos:** vista calendario/tabla de facturas por pagar (vencidas primero), selección múltiple → “Programar para fecha X” → crea pagos programados → **exportar nómina** (CSV genérico + perfil por banco, P1). Al conciliar el cargo/nómina en Banco diario, los pagos pasan a “Pagado” con fecha real.

**Rendición de gastos (existente):** en Pagos, sección de **reembolsos a empleados** que lee rendiciones aprobadas del módulo existente (solo lectura) y permite programar su pago y conciliarlo. Si `integracion_rendiciones_activa` = false, solo se muestra el link.

### 6.4 Tesorería · Banco diario (M5)

Página orientada a la **rutina de 10–15 minutos**:
1. Cabecera: tarjetas por cuenta (saldo según banco, fecha del saldo, saldo calculado, diferencia), caja en bancos, deuda tarjeta.
2. **Importar cartola** (drag & drop CSV/XLSX → perfil de banco → previsualización → dedupe por hash → confirmar). También alta manual de movimiento.
3. Bandeja de movimientos con pestañas: **Por aclarar · Sugeridos · Conciliados · Escalar**.
4. Cada fila: categoría sugerida por **reglas** (chip “Sugerido por regla X”, aceptar con un clic o `Enter`), documento sugerido (match por monto exacto/aprox., RUT en glosa, fecha cercana), proyecto (obligatorio en Gasto tarjeta), a quién preguntar (usuario), respaldo (adjuntar o vincular rendición existente).
5. “Guardar como regla” desde cualquier fila categorizada.
6. Traspasos entre cuentas: emparejar cargo y abono de dos cuentas propias.
7. Movimientos asignados a una persona → aparecen en su bandeja “Consultas pendientes” (y notificación). Vencido el plazo → “Escalar” y aviso a su jefatura.
8. Tarjeta de crédito: misma lógica; política 48 h para respaldo.

### 6.5 Factoring (M6)

- “Nueva operación”: factor (hereda recurso, % anticipo, tasa), fecha cesión, **seleccionar facturas vigentes no cedidas** del cliente(s) → nominal sumado; costo cobrado y N° operación desde la liquidación (adjunto); fecha y monto de anticipo (conciliable con abono bancario: `neto recibido` debe calzar).
- Tabla “una fila por factura cedida” con el estado de 2.6 y las fechas clave del cliente.
- Botón “Factor confirma pago” (fecha) y “Registrar excedente” (desde Banco diario idealmente).
- Panel de exposición por factor: nominal vigente, anticipos vigentes, mora estimada acumulada, excedentes por recibir.

### 6.6 Flujo de caja (M7)

- Matriz 3 meses (configurable) exactamente como 2.11, con filas CALCULA de solo lectura y filas MANUAL editables inline (ámbar = token “warning‑subtle” del Core).
- **Drill‑down:** clic en cualquier celda calculada → lista de hitos/facturas/compras/operaciones que la componen, con acceso directo para cambiar su fecha estimada o programada (y el flujo se recalcula).
- Gráfico combinado: barras entradas/salidas + línea de caja final + línea punteada de mínimo; meses con holgura negativa destacados en rojo.
- Alertas informativas (por facturar sin fecha, compras sin visar) con botón para resolverlas.
- Vista opcional semanal (13 semanas) — P2.

### 6.7 Proyectos (M1)

Tabla = hoja Proyectos (columnas de 2.10) con barra de presupuesto (consumido vs disponible; gris “Sin presupuesto”). Ficha de proyecto con pestañas: Resumen (KPIs + mini‑gráficos), Hitos, Compras, Facturas, Movimientos (gastos de tarjeta del proyecto), Rendiciones vinculadas (lectura), Rentabilidad.

### 6.8 Rutinas (M9)

Checklist de 2.12 con contador vivo por tarea, link directo a la vista filtrada, marca de hecho por día/semana/mes y racha. El **Cierre mensual** es un asistente: (1) todo conciliado, (2) cuadratura RCV ventas/compras, (3) cuadratura factores, (4) asientos contabilizados (si contabilidad activa), (5) cerrar período, (6) **Generar paquete para el contador** (ZIP: libro ventas, libro compras, facturas con respaldo, cartolas, nóminas, rendiciones, tarjeta, balance y mayor si aplica).

---

## 7. Dashboard Finanzas (M8) — página “Resumen”

Al hacer clic en **Finanzas** se abre este panel. Debe sentirse como un producto premium, rápido (< 1,5 s con datos cacheados) y 100 % alineado al diseño del Core.

### 7.1 Stack sugerido (verificar lo existente primero)

- Si el Core ya usa una librería de gráficos → **usar esa**.
- Si usa shadcn/ui → **shadcn Charts (Recharts)** con los tokens de color del Core (`--chart-1..5` o equivalentes).
- Alternativas open source válidas: **Tremor** (KPIs y charts listos para dashboards en React/Tailwind), **Apache ECharts** (`echarts-for-react`) si se requieren treemaps/sankey; **TanStack Query** para cache y refresco; **date-fns** con locale `es`.
- Todos los números desde **una RPC agregada** (`fin_rpc_dashboard`) + RPC por widget para drill‑down. Nada de sumar en el cliente.
- Respetar modo oscuro si el Core lo soporta. Skeleton loaders con el patrón del Core.

### 7.2 Layout (grid responsivo 12 columnas; móvil apila)

**Barra superior:** empresa activa · fecha de corte (default hoy) · selector de período para gráficos (mes, trimestre, año, rango) · botón “Exportar PDF/PNG” (P2) · última importación de cartola (“Banco actualizado al 03‑11 · hace 1 día”).

**Fila 1 · KPIs (8 tarjetas con sparkline y variación vs mes anterior):**
1. Caja en bancos hoy (y deuda tarjeta debajo)
2. Holgura mínima próximos 3 meses (rojo si < 0, indica el mes)
3. Por cobrar (con IVA) · de eso vencido · cedido
4. Terminado sin facturar (Esp. EDP + OC + HES + Lista) · de eso **listo para facturar hoy**
5. Por pagar (facturas recibidas) · vencido · próximos 30 días
6. Factoring vigente (nominal) · anticipos vigentes · N° en mora
7. Ventas del mes (facturado neto) vs mismo mes año anterior
8. Margen bruto estimado (proyectos activos) %

**Fila 2:**
- **Proyección de caja 3 meses** (8 col): barras entradas/salidas, línea de caja final, línea de mínimo, área de holgura. Drill‑down a Flujo de caja.
- **Embudo de ventas por etapa** (4 col): barras horizontales N° y monto por las 10 etapas del flujo; clic = filtro en Ventas.

**Fila 3:**
- **Aging de CxC** (6 col): por vencer, 1–30, 31–60, 61–90, > 90 días, apilado por cliente (top 5 + otros).
- **Aging de CxP** (6 col): misma estructura para proveedores.

**Fila 4:**
- **Saldos por mandante** (6 col): tabla con terminado sin facturar, por cobrar, vencido, cedido, DSO del cliente; barras inline.
- **Rentabilidad por proyecto** (6 col): vendido vs comprometido vs presupuesto, margen %, semáforo de presupuesto.

**Fila 5:**
- **Pipeline CRM** (4 col): monto por etapa y forecast ponderado del trimestre; tasa de conversión.
- **Ingresos vs egresos 12 meses** (8 col): real desde movimientos categorizados (cobros vs pagos) + facturación emitida vs recibida.

**Fila 6 · “Atención hoy” (centro de acción):** lista priorizada con contador y link: movimientos por aclarar/escalar · facturas sin OC (y días para reclamar) · compras esperando visado · listo para facturar · vencidas sin gestión > 7 días · factoring “cliente pagó: confirmar” · trabajos por facturar sin fecha estimada.

**Indicadores financieros (fila colapsable, P1):** DSO, DPO, ciclo de conversión de caja, % CxC vencida, costo efectivo de factoring del período, IVA DF − IVA CF del mes (estimación F29).

### 7.3 Requisitos de calidad del dashboard

- Cada número es **clicable** y lleva a la vista filtrada que lo explica (trazabilidad tipo Excel).
- Tooltips con fórmula en lenguaje simple (“Saldo de facturas emitidas no pagadas, con IVA”).
- Formato CLP abreviado en tarjetas (`$36,5 M`) y completo en tooltip.
- Empty states diseñados (“Aún no hay movimientos. Importa tu primera cartola”) — recordar que **producción parte vacía**.
- Accesibilidad: contraste AA, no depender solo del color (íconos/etiquetas en estados).
- Paleta: usar tokens del Core; semántica fija (éxito/peligro/advertencia/info) idéntica en badges y gráficos.

---

## 8. Contabilidad (M10)

### 8.1 Modos de operación (flag por empresa)

| Modo | Descripción |
|---|---|
| **Contador externo** (default al inicio) | No se generan asientos. Se producen libros de compra/venta, cuadratura RCV y **paquete mensual** para el contador (que lleva contabilidad y F29), tal como describe el Excel. |
| **Contabilidad integrada** | Cada evento contabilizable genera un asiento en **borrador** según reglas; Finanzas revisa y contabiliza (individual o masivo). Libros, mayor, balance y EERR en vivo. |

El cambio de modo no requiere migración: los eventos quedan registrados desde el día 1 (`fin_eventos`), de modo que al activar la contabilidad se pueden **generar retroactivamente** los asientos de un período abierto.

### 8.2 Plan de cuentas plantilla (resumen; el contador valida)

`1 Activo` → 1.1.01 Caja · 1.1.02 Bancos (una subcuenta por cuenta financiera) · 1.1.03 Clientes · 1.1.04 Documentos cedidos en factoring (si se usa) · 1.1.05 IVA crédito fiscal · 1.1.06 PPM · 1.1.07 Anticipo a proveedores · 1.1.08 Fondos por rendir · 1.1.10 Existencias · 1.2 Activo fijo.
`2 Pasivo` → 2.1.01 Proveedores · 2.1.02 Tarjeta de crédito por pagar · 2.1.03 Obligaciones por factoring (con recurso) · 2.1.04 IVA débito fiscal · 2.1.05 Retenciones · 2.1.06 Remuneraciones por pagar · 2.1.07 Leyes sociales · 2.1.08 Impuesto renta por pagar · 2.2 Créditos y leasing LP.
`3 Patrimonio` → Capital · Resultados acumulados · Resultado del ejercicio.
`4 Ingresos` → 4.1.01 Ventas servicios · 4.1.02 Ingresos por arriendo · 4.1.03 Venta de productos · 4.2 Otros ingresos.
`5 Costos y gastos` → 5.1 Costo directo (por proyecto: materiales, subcontratos, arriendo equipos, transporte) · 5.2 Remuneraciones · 5.3 Gastos generales · 5.4 Gastos financieros (intereses y comisiones factoring, comisiones bancarias, mora) · 5.5 Impuestos no recuperables.

### 8.3 Reglas de asiento (motor configurable `fin_reglas_contables`)

| Evento | Debe | Haber |
|---|---|---|
| Factura venta afecta | Clientes (total) | Ingreso según tipo de hito (neto) · IVA DF (iva) |
| Factura venta exenta | Clientes | Ingreso exento |
| Nota de crédito venta | Ingreso · IVA DF | Clientes |
| Factura compra | Gasto/costo según categoría del proyecto o Existencias (neto) · IVA CF | Proveedores |
| Nota crédito compra | Proveedores | Gasto · IVA CF |
| Cobro | Banco | Clientes |
| Pago proveedor | Proveedores | Banco |
| Factoring con recurso – anticipo | Banco (neto recibido) · Gasto financiero (costo) | Obligación factoring (anticipo) |
| Factoring – cliente paga al factor | Obligación factoring | Clientes (nominal) … y excedente: Banco (excedente) / Clientes |
| Factoring – mora cobrada | Gasto financiero mora | Obligación factoring / Banco |
| Factoring sin recurso – cesión | Banco · Gasto financiero · Doc. por cobrar al factor | Clientes |
| Comisión bancaria | Gasto financiero | Banco |
| Gasto tarjeta (con respaldo) | Gasto categoría (proyecto) · IVA CF si factura | Tarjeta por pagar |
| Pago tarjeta | Tarjeta por pagar | Banco |
| Remuneraciones (pago) | Remuneraciones por pagar | Banco |
| Impuestos F29 (pago) | IVA DF − IVA CF, PPM, retenciones | Banco |
| Traspaso | Banco destino | Banco origen |

> Reglas como datos (cuenta por tipo de hito, por categoría de movimiento, por categoría de compra). Analítica por **proyecto** en cada línea de ingreso/costo. Movimientos “Por aclarar” **no** generan asiento.

### 8.4 Reportes contables

Libro diario · Libro mayor (por cuenta, con saldo) · Balance de comprobación y saldos (8 columnas) · Estado de resultados (por mes y por proyecto) · Balance general · Libro de compras y ventas (formato SII) · **Cuadratura RCV**: importar CSV del Registro de Compras y Ventas del SII y cruzar por tipo/folio/RUT → diferencias (en SII y no en sistema; en sistema y no en SII; montos distintos) · Resumen IVA mensual (insumo F29) · Exportación XLSX/CSV de todo.

### 8.5 Cierre de período

Período cerrado ⇒ no se pueden crear/editar documentos ni asientos con fecha en él (validación servidor + trigger). Reapertura solo Admin/Finanzas con motivo (auditado).

---

## 9. Documentos tributarios y preparación para DTE / SII (M11)

**Hoy (P0):** carga manual de facturas emitidas y recibidas, NC/ND y guías, con adjuntos PDF/XML, en `fin_documentos_tributarios` (`origen = manual`).
**P1:** importación masiva del **RCV** (CSV descargado del SII) para compras y ventas → crea/actualiza documentos con `origen = importado_rcv`, detecta duplicados por (tipo, folio, RUT) y alimenta “facturas recibidas ayer” de la rutina diaria. Alerta de **plazo de reclamo** (8 días corridos desde la recepción en el SII según Ley 19.983; parámetro editable — validar con el contador).
**P1:** parser XML DTE (estándar SII) para autocompletar.

**Futuro (diseño ya preparado):**
```ts
interface ProveedorDTE {
  emitir(doc: DocumentoTributarioInput): Promise<{ folio: number; trackId: string; pdfUrl?: string; xml: string }>;
  consultarEstado(trackId: string): Promise<EstadoSII>;
  obtenerRecibidos(desde: Date, hasta: Date): Promise<DocumentoRecibido[]>;
  aceptarReclamar(doc: DocRef, accion: 'ACD'|'RCD'|'ERM'|'RFP'|'RFT'): Promise<void>;
  ceder(doc: DocRef, cesionario: CesionarioInput): Promise<{ aec: string }>;
}
```
- Implementación inicial: `ProveedorDTEManual` (no hace llamadas; el usuario sube los datos). Futuras: `SimpleFacturaAdapter`, `SIIDirectoAdapter`. Selección por `fin_parametros.flags.dte_proveedor` por empresa.
- Credenciales del proveedor solo en variables de entorno / Supabase Vault, nunca en tablas legibles por el cliente.
- Los botones “Emitir factura electrónica” y “Ceder electrónicamente” existen en la UI deshabilitados con tooltip “Disponible al integrar facturación electrónica”, para que el flujo no cambie al activarlos.

---

## 10. Integración con módulos existentes

| Módulo existente | Integración | Dirección | Reglas |
|---|---|---|---|
| **Contactos** | Clientes, proveedores, factores, contactos de cobranza | Lectura + FK desde tablas `fin_*`; perfil financiero en `fin_contactos_empresa` | No alterar tabla ni datos. Crear contactos nuevos solo vía el servicio/formulario existente de Contactos (QuickCreate lo reutiliza). Mantener la regla de visibilidad que hoy tenga Contactos entre empresas; el **perfil financiero** sí es por empresa. |
| **Inventario** (compartido entre empresas) | Productos en líneas de cotización, solicitudes y OC; entradas de stock al recepcionar; salidas en ventas de productos (P2) | Lectura siempre; escritura **solo vía su servicio** y **solo con flag** `integracion_inventario_activa` | Nunca escribir directo en sus tablas si existe capa de servicio. Guardar `movimiento_inventario_id` para trazabilidad. |
| **Rendición de gastos** | Reembolsos a empleados como CxP; conciliar gastos de tarjeta contra rendiciones; respaldo de movimientos | Lectura + tabla puente (`fin_movimientos_bancarios.rendicion_ref`, `fin_pagos` a empleado) | No modificar estados de rendiciones. Si se requiere marcar “pagada”, hacerlo con una tabla puente propia o un evento que el módulo existente pueda consumir más adelante. |
| **Usuarios / Auth / Empresas** | Roles, membresías, empresa activa | Lectura | Reutilizar. Agregar roles financieros si el sistema de roles lo permite de forma aditiva. |

Antes de integrar, documentar en `docs/finanzas/INTEGRACIONES.md` las tablas/servicios reales encontrados (Fase 0) y las firmas usadas.

---

## 11. Diseño, usabilidad y rendimiento

1. **Fidelidad al Core:** mismos tokens (colores, radios, sombras, espaciado), tipografía, iconografía, layout de página (header, breadcrumbs, acciones primarias a la derecha), patrones de formularios, toasts, modales y drawers. Construir primero 1 pantalla (Compras) y **compararla visualmente** con un módulo existente (Rendición de gastos) antes de seguir.
2. **Velocidad de uso:** cada flujo frecuente en ≤ 3 clics; defaults inteligentes (empresa, proyecto, condiciones heredadas); edición inline; acciones masivas; teclado.
3. **Convenciones Chile:** RUT con formato y validación DV; fechas `dd-mm-aaaa`; CLP sin decimales; zona horaria `America/Santiago`; textos en español neutro‑chileno (EDP, HES, OC, guía, folio).
4. **Indicadores de origen** (herencia del Excel): ícono sutil junto a cada campo: 🔗 HEREDA (no editable, link al origen), ƒ CALCULA (tooltip con fórmula), ⚡ AUTO (muestra si fue manual/importado/API). Usar íconos del set del Core.
5. **Rendimiento:** paginación/virtualización en tablas > 200 filas; índices; vistas con filtros por `empresa_id` primero; caché de dashboard 60 s e invalidación por eventos; transacciones para operaciones multi‑tabla (aceptar cotización, visar, registrar factura con aplicación, conciliar).
6. **Responsive:** aprobaciones, consultas de banco (“¿qué es este gasto?”) y dashboard usables en móvil.
7. **Notificaciones** (in‑app; email si el Core ya lo tiene): solicitud por aprobar/visar, movimiento asignado para aclarar, escalamientos, factura sin OC con plazo de reclamo ≤ 2 días, hito listo para facturar, factura vencida, factoring “cliente pagó”, flujo con FALTA CAJA.

---

## 12. Datos, migraciones y entornos

- **Migraciones** versionadas con la herramienta que use el repo (Supabase CLI `supabase/migrations`, Prisma, Drizzle…). Nombre: `YYYYMMDDHHMM_fin_<descripcion>.sql`. Revisar cada migración con la checklist: *solo CREATE / ALTER ADD / CREATE POLICY / CREATE FUNCTION / CREATE VIEW; ninguna sentencia toca tablas existentes salvo `ADD` explícitamente aprobado en DECISIONES.md*.
- **Probar primero en una rama de Supabase o proyecto local**, nunca directo en producción. El proyecto Supabase es compartido con Innovation Health: confirmar el proyecto correcto antes de aplicar.
- **Seeds:**
  - `seed_fin_catalogos.sql` (producción permitida): parámetros por empresa con los valores del Excel, categorías de movimiento, condiciones de pago, catálogo de tipos DTE, plan de cuentas plantilla, secuencias, diarios, proyecto “General”. **Sin transacciones.**
  - `seed_fin_demo.sql` (solo local/preview, nunca producción): reproduce los datos de ejemplo del Excel (Minera A/B, Constructora C, Industrial D; V‑001…V‑011; C‑001…C‑008; movimientos 03‑11‑2026; operación factoring 7) para validar que las vistas devuelven **los mismos resultados que el Excel** (prueba de regresión, sección 14). Protegido por variable de entorno.
- Los registros demo se crean bajo una **empresa de prueba** o en entorno no productivo; jamás mezclados con datos reales de PERTEC, IH o Zeus.
- Backups: confirmar que el respaldo de Supabase está vigente antes de la primera migración a producción.

---

## 13. Plan de implementación por fases

> Compromisos internos: **módulo de finanzas con dashboard inicial al 15‑11‑2026** y **facturación directa desde el Core al 30‑11‑2026**. Priorizar para cumplirlos; P2 queda como backlog.

### Fase 0 · Descubrimiento (obligatoria, sin escribir código de negocio)
1. Leer estructura del repo, `package.json`, framework, router, librería UI, sistema de tokens/tema, componentes compartidos (tabla, formularios, modales, drawers, toasts, adjuntos), cliente Supabase/ORM, auth y middleware.
2. Identificar: tabla/entidad **empresas**, **membresías/roles**, mecanismo de **empresa activa**, módulos **Contactos**, **Inventario**, **Rendición de gastos** (tablas, servicios, endpoints, RLS actual).
3. Revisar migraciones existentes y convenciones de nombres.
4. Entregar `docs/finanzas/DESCUBRIMIENTO.md` con hallazgos y un **plan ajustado** (carpetas, nombres de tablas, librerías a reutilizar, riesgos). Registrar decisiones en `DECISIONES.md`.

### Fase 1 · Fundaciones (P0)
Navegación Finanzas · selector/insignia de empresa activa · `fin_parametros`, catálogos, secuencias, adjuntos, auditoría, eventos · RLS + tests de aislamiento · componentes transversales (DataTable extendida, StageBadge, Money, DocumentChain, ActivityTimeline, QuickCreate) · Configuración financiera (UI) · `fin_contactos_empresa`.

### Fase 2 · Núcleo operativo (P0)
Proyectos · CRM (oportunidades + cotizaciones + aceptación con generador de hitos) · Ventas y Cobranza (hitos, vista principal, factura manual, NC/ND, guías, cobros) · Compras y Pagos (solicitud, aprobación, visado, OC, recepción, factura proveedor con match, programación y pagos) · funciones SQL de etapa/siguiente paso + vistas.

### Fase 3 · Caja (P0)
Banco diario (importación con perfiles, reglas, conciliación, escalamiento) · Flujo de caja 3 meses con drill‑down · **Dashboard Finanzas v1** (KPIs, proyección, embudo, aging, atención hoy).

### Fase 4 · Complementos (P1)
Factoring completo · Rutinas y asistente de cierre · Importación RCV + cuadratura · parser XML DTE · contabilidad integrada (plan, reglas, asientos, libros, balance, EERR, períodos) · paquete contador · notificaciones · exportación de nóminas por banco · integración inventario (flag) · integración rendiciones (flag) · Dashboard v2 (rentabilidad, CRM, 12 meses, indicadores).

### Fase 5 · Evolución (P2 / backlog)
Adaptador DTE (SimpleFactura u otro) para emisión, acuse/reclamo y cesión AEC · formatos imprimibles (cuando el diseño esté listo) · flujo semanal 13 semanas · snapshots proyectado vs real · consolidado multiempresa para Gerencia · automatizaciones configurables (“cuando… entonces…”) · conexión API bancaria/factor · integración BUK.

Cada fase termina con: migraciones aplicadas en preview, pruebas verdes, demo con `seed_fin_demo`, y nota en `docs/finanzas/CHANGELOG.md`.

---

## 14. Criterios de aceptación y pruebas

### 14.1 Regresión contra el Excel (con `seed_fin_demo`, fecha fija 04‑11‑2026)
Las vistas deben reproducir los resultados del Excel para los mismos datos:
- `etapa_actual` de V‑001…V‑011 igual a la columna G calculada en el Excel.
- `siguiente_paso` de C‑001…C‑008 igual a la columna E.
- Totales del Dashboard del Excel: caja en bancos, deuda tarjeta, por cobrar, vencido, cedido, terminado sin facturar, listo para facturar, por pagar, vencido, próximos 30 días, facturas sin OC, compras esperando visado, factoring vigente, anticipos, mora estimada, excedentes, ventas por etapa (N° y monto) y saldos por mandante.
- Flujo de caja meses 1–3: caja inicio, entradas, salidas, caja final, holgura y alerta.
- Proyectos: vendido, facturado, por facturar, por cobrar, comprometido, disponible, margen y margen %.
> Implementar como test automatizado (SQL o test de integración) con la fecha “hoy” inyectable (`fin_fn_hoy()` que en test devuelve la fecha fija).

### 14.2 Reglas de negocio (tests unitarios por rama)
Cada rama de 2.4, 2.5, 2.6 y 2.7 con un caso positivo y uno negativo; tolerancia factura‑OC en el borde (= tolerancia, tolerancia + 1); pagos parciales; NC que deja saldo 0; factura cedida sale de cobros y entra como excedente; compra no visada fuera del flujo; “Mes 1 incluye atrasado”.

### 14.3 Seguridad multiempresa
- Usuario A (solo PERTEC) no ve ni puede insertar/actualizar registros de IH/Zeus por API directa (bypass de UI) en **todas** las tablas `fin_*`.
- Cambiar empresa activa cambia todos los datos visibles, incluido el dashboard.
- Productos de Inventario visibles desde las tres empresas.
- Storage: adjuntos de una empresa inaccesibles desde otra.

### 14.4 No regresión de módulos existentes
- Suite existente verde.
- Conteo de filas y checksum de tablas de Contactos, Inventario y Rendición de gastos **idénticos** antes y después de migraciones y seeds de catálogo.
- Con flags de integración en `false`, ningún flujo nuevo escribe en tablas de otros módulos.

### 14.5 Usabilidad (checklist manual)
Crear solicitud de compra < 30 s · aprobar/visar en 1 clic desde bandeja · registrar factura desde hito “Lista para facturar” < 45 s · categorizar 20 movimientos con reglas < 3 min · dashboard carga < 1,5 s (datos cacheados) · todas las pantallas en móvil sin scroll horizontal (salvo tablas) · empty states en todas las vistas.

### 14.6 Contabilidad (si se activa)
Todo asiento cuadra · período cerrado bloquea cambios · reversa de documento anula asiento con reversa · balance de comprobación suma cero · libro de ventas = Σ facturas emitidas del mes.

---

## 15. Entregables y Definition of Done

- Código en la estructura del Core, tipado estricto, lint/format del repo sin errores.
- Migraciones + seeds (catálogos y demo separados) + tipos generados.
- Tests de 14.1–14.4 automatizados.
- Documentación en `docs/finanzas/`: `DESCUBRIMIENTO.md`, `DECISIONES.md`, `PREGUNTAS_ABIERTAS.md`, `INTEGRACIONES.md`, `MODELO_DATOS.md` (ERD en Mermaid), `REGLAS.md` (etapas, siguiente paso, factoring, banco, asientos), `CHANGELOG.md`, `MANUAL_USUARIO.md` (rutina diaria/semanal/mensual con capturas).
- Producción: módulos visibles, catálogos cargados, **cero transacciones**, flags de integración apagados, modo contable “Contador externo”.
- Ninguna fila de módulos existentes alterada (evidencia: checksum 14.4).

---

## 16. Preguntas abiertas iniciales (registrar en PREGUNTAS_ABIERTAS.md y avanzar con el default)

| # | Pregunta | Default mientras tanto |
|---|---|---|
| 1 | ¿Quién aprueba cada paso y con qué montos? (Excel: “a definir”) | JP aprueba ≤ $5.000.000 en sus proyectos; sobre eso Gerente; visa Finanzas |
| 2 | Valor definitivo del mínimo de caja por empresa | $20.000.000 PERTEC; 0 en IH y Zeus hasta definir |
| 3 | ¿Contactos es compartido entre empresas o por empresa? | Respetar lo que exista; perfil financiero siempre por empresa |
| 4 | Plazo de reclamo de facturas recibidas | 8 días corridos (validar con contador) |
| 5 | Plan de cuentas definitivo | Plantilla PyME Chile; contador valida antes de activar contabilidad |
| 6 | Contratos de factoring: ¿todos con recurso? | Con recurso (operación actual) |
| 7 | Política tarjeta 48 h | Activa como alerta, sin bloqueo |
| 8 | Formatos de bancos para cartola y nómina | Perfiles genéricos CSV/XLSX editables |
| 9 | ¿Las tres empresas comparten numeración de proyectos? | No: correlativos por empresa |

---

## 17. Glosario

**Mandante:** cliente para quien se ejecuta el proyecto. **Hito facturable:** unidad que se factura (EDP, hito, mes de arriendo, trabajo spot). **OC:** orden de compra (del cliente o al proveedor). **EDP:** estado de pago aprobado por el cliente. **HES:** hoja de entrada de servicio emitida por el cliente (requisito de algunos para facturar). **DEM:** documento de entrega de materiales, referencia exigida por algunos mandantes. **Guía de despacho (DTE 52):** documento de traslado. **Visado:** autorización de Finanzas para comprometer el gasto (“hay plata”), posterior a la aprobación técnica. **Recepción conforme:** confirmación de que lo comprado llegó. **3‑way match:** cuadre OC ↔ recepción ↔ factura. **Factoring con recurso:** si el cliente no paga, el factor cobra a PERTEC. **Sin recurso:** el factor asume el riesgo. **Excedente:** nominal − anticipo − mora, que el factor devuelve cuando el cliente paga. **RCV:** Registro de Compras y Ventas del SII. **Holgura:** caja final − mínimo de caja. **DSO/DPO:** días promedio de cobro/pago.

---

## 18. Referencias consultadas

- Odoo 18 – gestión de facturas de proveedor y 3‑way match: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/manage.html · https://www.cybrosys.com/blog/how-3-way-matching-works-in-odoo-18-purchase-module
- monday CRM – gestión de pipeline: https://support.monday.com/hc/en-us/articles/360013348719-Sales-pipeline-management-with-monday-CRM
- SII – aceptación/reclamo de DTE y acuse de recibo: https://www.sii.cl/servicios_online/guia_aceptacion_reclamo_dte_2.pdf · https://www.sii.cl/destacados/f29/acuse_recibo_facturas.pdf
- Plazo legal de reclamo (Ley 19.983): https://blog.nubox.com/plazo-legal-para-rechazar-una-factura
- Fuente funcional principal: `Finanzas_PERTEC_v2_Punto_de_partida.xlsx` (12 hojas, 7 parámetros con nombre, reglas en «Listas y reglas»).

---

### Prompt de arranque sugerido para Claude Code

```
Lee completo docs/finanzas/PERTEC_Core_Finanzas_Spec.md. Ejecuta SOLO la Fase 0 (Descubrimiento):
analiza el repo y la base de datos (sin modificar nada), y entrega docs/finanzas/DESCUBRIMIENTO.md
y DECISIONES.md con el plan ajustado a nuestro stack y diseño. Respeta las reglas inviolables de la
sección 0 y 1.3 (multiempresa, inventario compartido, no tocar datos existentes, migraciones aditivas,
producción sin transacciones). Espera mi aprobación antes de la Fase 1.
```
