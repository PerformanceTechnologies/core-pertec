# Gestión financiera · Decisiones

Cuando la especificación chocó con una convención real del repo, ganó el repo (regla 0.4 de la
especificación). Cada decisión con su motivo.

## Decisiones del usuario (04-11-2026)

- **U1 · Empresas:** solo PERTEC, Zeus Mining y Performance Service (`EMPRESAS_CON_FINANZAS` en `lib/fin/datos.ts`). Innovation Health no entra.
- **U2 · Sin roles por ahora:** quien tiene la aplicación puede hacer todo. Las aprobaciones y visados quedan registrados con el correo de quien los hizo (auditoría), sin restricción por monto.
- **U3 · Cotizador nuevo e independiente:** `fin_cotizaciones` no usa nada del Cotizador existente.
- **U4 · Proyectos nuevo e independiente:** `fin_proyectos` no usa el módulo Proyectos ni Contratos. Contratos se analizará e integrará después.
- **U5 · Fuente funcional:** el Excel «Finanzas PERTEC v2».

## Decisiones técnicas

- **D1 · Reglas en TypeScript, no en funciones SQL.** El Core no tiene lógica en la base: todo vive en `lib/` con pruebas `tsx`. La etapa del hito (2.4), el siguiente paso de la compra (2.5), el estado del factoring (2.6), el estado del movimiento (2.7), el flujo y el dashboard están en `lib/fin/reglas.ts`. La «fecha de hoy inyectable» (`fin_fn_hoy()`) es el parámetro `hoy` de cada función: la regresión corre con 04-11-2026.
- **D2 · Separación por empresa en el servidor, no con RLS por `auth.uid()`.** El Core consulta con service role y RLS activado sin políticas (el cliente no puede leer nada directo). Toda lectura filtra por `empresa_id` de `contextoFin()`; toda escritura sobre un registro existente pasa por `exigirDeEmpresa(tabla, id, empresaId)`. Los route handlers usan `contextoFinApi()`. Los adjuntos van a `finanzas/{empresa}/{entidad}/{id}/…` en un bucket privado y se sirven con enlace firmado tras verificar la empresa.
- **D3 · La OC vive en la compra.** La especificación separa solicitud y OC; el Excel las tiene en una sola fila (C-001…C-008). `fin_compras` guarda la solicitud y, al visar, el número de OC (`OC-000001`) y su estado. Menos tablas y el mismo flujo del Excel.
- **D4 · Contactos global, perfil por empresa.** `finanzas_contactos` no tiene empresa: se respeta. Condición de pago y requisitos (OC, EDP, HES) por empresa en `fin_perfiles` (equivale a `fin_contactos_empresa` de la especificación). Los contactos nuevos se crean en Contactos, no aquí.
- **D5 · Nombres de tablas cortos.** `fin_documentos` (= `fin_documentos_tributarios`), `fin_movimientos` (= `fin_movimientos_bancarios`), `fin_reglas` (reglas de categorización), `fin_perfiles`.
- **D6 · Migración única por módulo** en `supabase/fin/0001_gestion_financiera.sql` (convención del repo), en vez de `YYYYMMDDHHMM_fin_*.sql`. Solo `create table if not exists`, índices, función de correlativos, bucket e `insert … on conflict do nothing`. Revisada: ningún `drop`, `truncate`, `delete` ni `update` sobre tablas existentes.
- **D7 · Sin seed demo en SQL.** La regresión contra el Excel (sección 14.1) corre en `scripts/probar-fin.mts` con los mismos datos del Excel en memoria, sin tocar ninguna base. Así no hay riesgo de que datos de ejemplo lleguen a producción. Producción parte vacía, con catálogos.
- **D8 · Motor contable puro con reglas fijas** (`lib/fin/contabilidad.ts`) en vez de la tabla configurable `fin_reglas_contables`. La cuenta de cada categoría de movimiento sí es configurable. Un asiento que no cuadra no se emite y la pantalla de Contabilidad avisa qué documento lo causó.
- **D9 · Inventario solo lectura.** La línea de cotización y de compra puede apuntar a un producto (`producto_id`), pero no se escriben movimientos de stock (la especificación lo deja tras un flag apagado).
- **D10 · Los saldos se calculan, no se guardan.** Saldo de factura, aplicado, cedido, días para reclamo, etapa y siguiente paso se derivan al leer (`cargarVistaDe`). Así nunca quedan desfasados.
- **D11 · Correlativos por empresa** con `fin_siguiente_numero(empresa, tipo)` (bloqueo de fila), uno por tipo: `PRY-0001`, `OPO-0001`, `COT-000001`, `V-0001` (hito), `C-0001` (compra), `OC-000001`, `COB-000001`, `PAG-000001`, `FAC-OP-0001` (operación de factoring), `AS-000001` (asiento).
- **D12 · Cartolas sin perfiles por banco.** `lib/fin/cartola.ts` detecta la fila de encabezados (fecha, glosa, monto o cargo/abono) en CSV o Excel. Deduplica por huella (`cuenta|fecha|monto|glosa|n°`), así reimportar no duplica.
- **D13 · Sin notificaciones por correo todavía.** La atención diaria vive en el Resumen («Atención hoy»), en la cartilla del módulo y en las Rutinas.
