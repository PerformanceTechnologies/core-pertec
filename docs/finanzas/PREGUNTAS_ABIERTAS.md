# Gestión financiera · Preguntas abiertas

Lo que falta definir. Mientras tanto se usa el valor por omisión indicado, que se puede cambiar
en **Configuración** sin tocar código (salvo donde se indica).

| # | Pregunta | Mientras tanto |
|---|---|---|
| 1 | ¿Quién aprueba y quién visa cada compra, y con qué montos? | Sin roles (decisión U2): cualquiera con la aplicación aprueba y visa; queda registrado quién lo hizo. |
| 2 | Mínimo de caja definitivo por empresa | PERTEC $20.000.000; Zeus Mining y Performance Service $0 (Configuración → Parámetros). |
| 3 | Plazo de reclamo de facturas recibidas (Ley 19.983) | 8 días corridos, editable. Validar con el contador. |
| 4 | Plan de cuentas definitivo | Plantilla PyME cargada para las tres empresas; el contador la valida antes de activar la contabilidad integrada. Modo por omisión: contador externo. |
| 5 | ¿Todos los contratos de factoring son con recurso? | Con recurso por omisión; cada factor y operación lo puede cambiar. |
| 6 | Política de gastos con tarjeta (rendir en 48 h) | No se controla todavía; los gastos de tarjeta entran por cartola y se categorizan con proyecto. |
| 7 | Formatos de cartola de cada banco | Detección automática de columnas (CSV/XLSX). Si un banco no se reconoce, mandar un ejemplo para ajustar `lib/fin/cartola.ts`. |
| 8 | ¿Las empresas comparten numeración de proyectos? | No: correlativos por empresa (`PRY-0001`…). |
| 9 | Diseño de formatos imprimibles (cotización, OC) | Botón «Imprimir» visible y deshabilitado («Formato en diseño»). |
| 10 | Proveedor de facturación electrónica (SimpleFactura u otro) | Botones «Emitir factura electrónica» y «Ceder electrónicamente» deshabilitados; se registra a mano lo emitido en el SII. |
| 11 | Integración con Contratos | Pendiente de análisis (decisión U4). |
| 12 | Integración con Rendición de gastos (reembolsos como cuentas por pagar) | No integrado; sin escrituras en sus tablas. |
| 13 | Importación del RCV del SII y lector de XML DTE | Pendiente (P1). Hoy los documentos se registran a mano desde el hito o la compra. |
| 14 | Notificaciones por correo | Pendiente; hoy los avisos están en el Resumen, la cartilla del módulo y las Rutinas. |
| 15 | ¿Qué hacer con un documento cuyo total no es neto + exento + IVA? | No genera asiento y la pantalla de Contabilidad lo muestra para corregirlo. |
