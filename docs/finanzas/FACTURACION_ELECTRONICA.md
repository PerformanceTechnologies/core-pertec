# Facturación electrónica (SimpleFactura)

Emitir desde el Core facturas (33), facturas exentas (34), guías de despacho (52), notas de débito (56) y de crédito (61);
ceder facturas (AEC) y responder lo recibido del SII. El proveedor es **SimpleFactura** (`api.simplefactura.cl`), que
firma, numera (folios/CAF) y envía al SII.

Pantalla: **Finanzas › Facturación electrónica** (`/finanzas/facturacion`). Mismo permiso y empresa activa que Gestión financiera.

## El flujo

```
Leads: cotización aceptada ─► Ventas: hitos ─► «Lista para facturar»
                                                   │ (marcar hitos) «Emitir factura electrónica»
                                                   ▼
                            Editor (precargado: cliente de Contactos, líneas, OC/HES, vencimiento)
                                   │ Guardar borrador ─► Facturación › Borradores
                                   │ Emitir ─► SimpleFactura (folio) ─► SII
                                   ▼
            fin_documentos (origen api_dte) ligado a sus hitos ─► «Por cobrar» ─► cobro / factoring / contabilidad
                                   │
              NC / ND electrónica (desde la factura) · Ceder (Facturación › Cesiones) · PDF/XML/estado SII
```

- **Guía de despacho:** «Nueva guía» (traslado suelto: entre bodegas, a faena, a reparación) o desde un hito de arriendo/venta
  («Emitir guía de despacho» en la ficha del hito; el folio queda en el hito).
- **Despacho antes de facturar (venta o arriendo, con o sin OC):** se acepta la cotización en Leads (la OC no es requisito
  para aceptar, sí para facturar) → «Emitir guía de despacho» en el hito (sin OC, la guía referencia la cotización como 802)
  → llega la OC y se anota en el hito → «Emitir factura electrónica»: la factura referencia la OC y la guía (52) sola.
- **Guía suelta:** si se emitió desde «Nueva guía», su ficha tiene «Ligar a un hito»; desde ahí la factura del hito la referencia.
- **Recibidos:** Facturación › Recibidos › «Traer del SII» → aceptar o reclamar (8 días) → «Registrar» en Compras (ligada a su OC
  o como «Factura sin OC: regularizar»). Se reutiliza `registrarFacturaCompraAction`, así las reglas de Compras no se duplican.
- **Cesión:** Facturación › Cesiones › «Ceder factura». Después se registra el anticipo y el costo en Tesorería › Factoring.

## Reglas

| Regla | Dónde |
|---|---|
| Totales (neto, exento, IVA, descuento global) y validaciones del SII (largos, receptor, referencias, guía) | `lib/fin/dte/modelo.ts` (mismas en el editor y en el servidor) |
| La 34 es toda exenta; la 33 necesita algo afecto | `calcularTotales`, `validarDocumento` |
| Fecha: no futura, no más de 30 días atrás; período cerrado bloquea | `validarDocumento`, `emitir` |
| NC/ND: referencia obligatoria con CodRef (1 anula, 2 corrige texto, 3 corrige montos) y razón | `validarDocumento` |
| NC que anula (CodRef 1) por el total: la factura queda anulada y los hitos vuelven a «Lista para facturar» | `registrarEnLibros` |
| Un hito no se factura dos veces | `validarOrigen` |
| Guía: motivo (IndTraslado) obligatorio; sin valores si no es venta | `validarDocumento` |
| Guía: si despacha la empresa (TipoDespacho 2 o 3), RUT del transportista obligatorio (Res. SII 154/2025) | `validarDocumento` |
| Factura desde hitos referencia OC, HES y la guía con que se despachó; sin OC, la cotización (802) | `referenciasDeHitos`, `guiasDeHitos` |
| Cesión: solo 33 a crédito, por el total; factor y persona autorizada completos | `validarCesion` |
| Receptor: siempre desde Contactos (el servidor vuelve a leer el RUT) | `guardarComun` en `acciones-dte.ts` |

## Garantías técnicas

- **No se emite dos veces:** antes de llamar a SimpleFactura la emisión pasa de `borrador/error` a `enviando` con un `update`
  condicionado. Si la respuesta queda en duda (timeout, 502–504), queda «enviando» y la ficha ofrece **Verificar en
  SimpleFactura** (busca tipo + receptor + fecha + total) o marcar a mano. Nunca se reintenta a ciegas.
- **Pruebas sin ensuciar:** en certificación nada se escribe en `fin_documentos`, hitos, saldos, flujo ni contabilidad.
- **Token:** 24 h, guardado cifrado en `fin_dte_sesion` (SimpleFactura da 10 por hora). Ritmo: 550 ms entre llamadas (límite 2/s).
- **Credenciales:** por empresa, en `fin_dte_cuentas`, cifradas (AES-256-GCM con `TOKEN_CIFRADO_KEY`). Las carga el
  administrador del Core en **Administración › Integraciones**; la pantalla nunca las vuelve a mostrar. No van en el
  código ni en Vercel (las variables `SIMPLEFACTURA_*` de `.env.example` solo las usa el script local de pruebas).
- **Emisión bloqueada por omisión:** con la cuenta cargada se consulta (estados, PDF/XML, recibidos), pero emitir, ceder y
  responder al SII exigen «Habilitar emisión» en Integraciones, que solo se ofrece tras una prueba de conexión exitosa.
  Cambiar la cuenta o el ambiente la vuelve a bloquear.
- **Archivo:** cada documento emitido en producción (PDF y XML) y cada recibido sincronizado (PDF) se guarda en SharePoint,
  en `ARCHIVOS CORE/Gestion financiera/<Empresa>/Facturas/Emitidos|Recibidos/AAAA/MM Mes/`, con nombre
  `AAAA-MM-DD_Tipo folio_Contraparte` (los recibidos llevan además el RUT). Una fila por documento en `fin_dte_archivo`,
  ligada a `fin_documentos` cuando existe (para conciliar). Se ve en Facturación › Archivo. La carpeta se cambia en Integraciones.

## Archivos

| Archivo | Qué |
|---|---|
| `supabase/fin/0016_facturacion_electronica.sql` | Tablas `fin_dte_emisiones`, `fin_dte_recibidos`, `fin_dte_cesiones`, `fin_dte_sesion`, `fin_dte_cuentas`, `fin_dte_archivo`; columnas en `fin_documentos`, `fin_factores`, `empresas` |
| `lib/fin/dte/modelo.ts` | Documento SII puro, catálogos, totales, validaciones |
| `lib/fin/dte/proveedor.ts` | Interfaz `ProveedorDte` (cambiar de proveedor = otro adaptador) |
| `lib/fin/dte/simplefactura-mapeo.ts` | Traducción pura a/desde el JSON de SimpleFactura |
| `lib/fin/dte/cuenta.ts` | Cuenta del proveedor por empresa (cifrada), emisión habilitada, carpeta |
| `lib/fin/dte/archivo.ts` | Archivo en SharePoint y su índice (`fin_dte_archivo`) |
| `lib/fin/dte/simplefactura.ts` | Cliente HTTP (token, ritmo, errores, cuenta demo) |
| `lib/fin/dte/servicio.ts` | Orquestación: borradores, emitir, libros, estado, recibidos, cesión |
| `app/(protegido)/gestion-financiera/acciones-dte.ts` | Server Actions con permisos |
| `app/(protegido)/finanzas/(gestion)/facturacion/` | Panel, editor nuevo, ficha |
| `app/api/finanzas/dte/[id]/[archivo]` | PDF/XML (los entrega SimpleFactura en el momento) |
| `app/api/finanzas/dte/archivo/[id]/[que]` | PDF/XML archivados en SharePoint |
| `app/(protegido)/integraciones/` | Administración › Integraciones (cuenta, emisión, carpeta) |
| `scripts/probar-dte.mts` | `npm run probar-dte` |

Permisos (Permisos de flujos): emitir = «Factura»; recibidos = «Recibe conforme»; ceder = «Maneja el factoring»;
configuración = admin del Core.

## Puesta en marcha

1. Correr `supabase/fin/0016_facturacion_electronica.sql` en el editor SQL de Supabase.
2. Administración › Integraciones (admin del Core, con la empresa elegida arriba): cargar usuario y clave (o el token de
   integración) de SimpleFactura y el ambiente. Se prueba sola al guardar. Con la cuenta **demo pública**, en pruebas,
   el RUT emisor de prueba `78181331-1`.
3. Facturación › Configuración (admin): datos del emisor, sucursal, persona autorizada a ceder, encender.
4. Cuando se quiera emitir: Integraciones › «Habilitar emisión». En producción, además en SimpleFactura: certificado
   digital, folios por tipo y correo de intercambio `intercambio@chilesystems.com` en el SII (sin eso no llegan XML/PDF
   de los recibidos).

## Lo que SimpleFactura no documenta (validar en las pruebas)

- Qué ambiente usa la emisión (se infiere: el configurado en la empresa de SimpleFactura).
- El acuse de recibo de mercaderías (ERM) no existe en su API: el Core ofrece aceptar (ACD) y los tres reclamos.
- `tipoRechazo` al aceptar: se manda `null`.
- La cesión es asíncrona en el SII: el Core la marca «cedida» cuando SimpleFactura la acepta; el resultado final se ve en sus trazas.
- Sin webhooks: el estado SII se consulta con «Consultar estado».
