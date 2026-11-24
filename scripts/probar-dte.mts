// Facturación electrónica: reglas puras del documento (totales, validaciones) y traducción a SimpleFactura.
// Datos INVENTADOS (el repositorio es público: acá no hay clientes, RUT ni montos reales).
//   npm run probar-dte
import assert from "node:assert/strict";
import {
  calcularTotales,
  documentoVacio,
  estadoSiiDesde,
  montoLinea,
  normalizarDocumento,
  referenciasDeHitos,
  validarCesion,
  validarDocumento,
  vencimientoDesde,
  type DocumentoDte,
  type LineaDte,
} from "../lib/fin/dte/modelo";
import { carpetaDte, carpetaFacturas, nombreDte } from "../lib/archivos/carpetas";
import { armarCesionSimpleFactura, armarDocumentoSimpleFactura, codigoAmbiente, mensajeError, motivoNota, respuestaAcuse, sucursalEnRuta, traducirEstado, traducirRecibido } from "../lib/fin/dte/simplefactura-mapeo";

let n = 0;
const prueba = (nombre: string, f: () => void) => {
  f();
  n++;
  console.log(`  ok  ${nombre}`);
};

const HOY = "2026-11-17";
const IVA = 0.19;
const linea = (p: Partial<LineaDte> = {}): LineaDte => ({ nombre: "Servicio de mantención", descripcion: null, cantidad: 1, unidad: "UN", precio: 100000, descuentoPct: 0, exento: false, codigo: null, ...p });
const receptor = { rut: "76086428-5", razonSocial: "Cliente de Prueba SpA", giro: "Servicios de ingeniería", direccion: "Av. Siempre Viva 742", comuna: "Antofagasta", ciudad: "Antofagasta", contacto: null, correo: null };
const doc = (p: Partial<DocumentoDte> = {}): DocumentoDte => ({ ...documentoVacio(33, HOY), receptor, lineas: [linea()], ...p });
const EMISOR = { rut: "76269769-6", razonSocial: "Empresa Emisora SpA", giro: "Ingeniería", acteco: 711001, direccion: "Calle Uno 123", comuna: "Santiago", ciudad: "Santiago", correo: "dte@ejemplo.cl", telefono: null, sucursal: "Casa Matriz" };

console.log("Totales");
prueba("línea con descuento se redondea a peso", () => {
  assert.equal(montoLinea({ cantidad: 3, precio: 3333.33, descuentoPct: 10 }), 9000);
  assert.equal(montoLinea({ cantidad: 2, precio: 50000, descuentoPct: 0 }), 100000);
});
prueba("factura afecta: neto, IVA 19% y total", () => {
  const t = calcularTotales(doc({ lineas: [linea({ precio: 100000 }), linea({ cantidad: 2, precio: 25000 })] }), IVA);
  assert.deepEqual([t.neto, t.exento, t.iva, t.total], [150000, 0, 28500, 178500]);
});
prueba("factura afecta con una línea exenta", () => {
  const t = calcularTotales(doc({ lineas: [linea({ precio: 100000 }), linea({ precio: 40000, exento: true })] }), IVA);
  assert.deepEqual([t.neto, t.exento, t.iva, t.total], [100000, 40000, 19000, 159000]);
});
prueba("factura exenta (34): todo exento, sin IVA, aunque la línea diga afecta", () => {
  const t = calcularTotales({ tipo: 34, lineas: [linea({ precio: 80000 })], descuentoGlobalPct: 10 }, IVA);
  assert.deepEqual([t.neto, t.exento, t.iva, t.total, t.descuentoGlobal], [0, 80000, 0, 80000, 0]);
});
prueba("descuento global solo rebaja lo afecto", () => {
  const t = calcularTotales(doc({ descuentoGlobalPct: 10, lineas: [linea({ precio: 100000 }), linea({ precio: 50000, exento: true })] }), IVA);
  assert.deepEqual([t.descuentoGlobal, t.neto, t.exento, t.iva, t.total], [10000, 90000, 50000, 17100, 157100]);
});

console.log("Validaciones");
prueba("una factura completa no tiene problemas", () => assert.deepEqual(validarDocumento(doc(), HOY, IVA), []));
prueba("fecha futura y receptor sin giro se rechazan", () => {
  const p = validarDocumento(doc({ fechaEmision: "2026-11-18", receptor: { ...receptor, giro: null } }), HOY, IVA);
  assert.ok(p.some((x) => x.campo === "fechaEmision"));
  assert.ok(p.some((x) => x.campo === "receptor.giro"));
});
prueba("RUT inválido del receptor", () => assert.ok(validarDocumento(doc({ receptor: { ...receptor, rut: "76086428-1" } }), HOY, IVA).some((x) => x.campo === "receptor.rut")));
prueba("factura 33 con todo exento pide usar la 34", () => assert.ok(validarDocumento(doc({ lineas: [linea({ exento: true })] }), HOY, IVA).some((x) => x.texto.includes("34"))));
prueba("nombre de ítem de más de 80 caracteres", () => assert.ok(validarDocumento(doc({ lineas: [linea({ nombre: "x".repeat(81) })] }), HOY, IVA).some((x) => x.campo === "lineas.0.nombre")));
prueba("NC sin referencia ni razón se rechaza", () => {
  const p = validarDocumento(doc({ tipo: 61 }), HOY, IVA);
  assert.ok(p.some((x) => x.campo === "referencias"));
});
prueba("NC que anula, con referencia completa, pasa", () => {
  const nc = doc({ tipo: 61, referencias: [{ tipo: "33", folio: "1234", fecha: "2026-11-10", codRef: 1, razon: "Anula factura por error en el monto" }] });
  assert.deepEqual(validarDocumento(nc, HOY, IVA), []);
});
prueba("NC que corrige texto puede ir en cero", () => {
  const nc = doc({ tipo: 61, lineas: [linea({ nombre: "Corrige giro del receptor", precio: 0, cantidad: 1 })], referencias: [{ tipo: "33", folio: "1234", fecha: "2026-11-10", codRef: 2, razon: "Corrige giro" }] });
  assert.deepEqual(validarDocumento(nc, HOY, IVA), []);
});
prueba("guía de traslado interno sin valores pasa; sin motivo no", () => {
  const g = doc({ tipo: 52, indTraslado: 5, lineas: [linea({ nombre: "Generador 100 kVA", precio: 0 })] });
  assert.deepEqual(validarDocumento(g, HOY, IVA), []);
  assert.ok(validarDocumento({ ...g, indTraslado: null }, HOY, IVA).some((x) => x.campo === "indTraslado"));
});
prueba("guía: si despacha la empresa (2 o 3) exige RUT del transportista", () => {
  const g = doc({ tipo: 52, indTraslado: 6, tipoDespacho: 2 });
  assert.ok(validarDocumento(g, HOY, IVA).some((x) => x.campo === "transporte.rutTransportista"));
  assert.ok(!validarDocumento({ ...g, tipoDespacho: 1 }, HOY, IVA).some((x) => x.campo === "transporte.rutTransportista"));
});
prueba("guía de venta (IndTraslado 1) exige monto", () => {
  const g = doc({ tipo: 52, indTraslado: 1, lineas: [linea({ precio: 0 })] });
  assert.ok(validarDocumento(g, HOY, IVA).some((x) => x.texto.includes("cero")));
});
prueba("guía: chofer con RUT exige nombre", () => {
  const g = doc({ tipo: 52, indTraslado: 6, transporte: { patente: "ABCD12", rutTransportista: null, rutChofer: "11111111-1", nombreChofer: null, direccionDestino: null, comunaDestino: null, ciudadDestino: null } });
  assert.ok(validarDocumento(g, HOY, IVA).some((x) => x.campo === "transporte.nombreChofer"));
});

console.log("Normalización y ayudas");
prueba("la 34 fuerza exento y la guía no lleva vencimiento", () => {
  assert.equal(normalizarDocumento(doc({ tipo: 34 })).lineas[0].exento, true);
  assert.equal(normalizarDocumento(doc({ tipo: 52, indTraslado: 5, fechaVencimiento: "2026-12-17" })).fechaVencimiento, null);
});
prueba("patente se limpia y referencias vacías se descartan", () => {
  const d = normalizarDocumento(doc({ tipo: 52, indTraslado: 5, transporte: { patente: "ab-cd 12", rutTransportista: "", rutChofer: "", nombreChofer: "", direccionDestino: "", comunaDestino: "", ciudadDestino: "" }, referencias: [{ tipo: "", folio: "", fecha: HOY, codRef: null, razon: null }] }));
  assert.equal(d.transporte?.patente, "ABCD12");
  assert.equal(d.referencias.length, 0);
});
prueba("vencimiento desde la condición de pago", () => {
  assert.equal(vencimientoDesde("2026-11-17", 30), "2026-12-17");
  assert.equal(vencimientoDesde("2026-11-17", 0), null);
});
prueba("referencias de hitos: OC y HES sin repetir", () => {
  const r = referenciasDeHitos([{ ocClienteNumero: "4500123", ocClienteFecha: "2026-10-01", hesNumero: "1000" }, { ocClienteNumero: "4500123", ocClienteFecha: null, hesNumero: "1001" }], HOY);
  assert.deepEqual(r.map((x) => `${x.tipo}:${x.folio}`), ["801:4500123", "HES:1000", "HES:1001"]);
});
prueba("factura desde hitos: referencia la guía con que se despachó", () => {
  const r = referenciasDeHitos([{ ocClienteNumero: "4500123", ocClienteFecha: "2026-10-01", hesNumero: null }], HOY, { guias: [{ folio: "1341", fecha: "2026-11-15" }], cotizaciones: [{ numero: "COT-000045", fecha: "2026-10-20" }] });
  assert.deepEqual(r.map((x) => `${x.tipo}:${x.folio}:${x.fecha}`), ["801:4500123:2026-10-01", "52:1341:2026-11-15"]);
});
prueba("guía sin OC: referencia la cotización (802) y no la HES", () => {
  const r = referenciasDeHitos([{ ocClienteNumero: null, ocClienteFecha: null, hesNumero: "999" }], HOY, { paraGuia: true, guias: [{ folio: "1", fecha: HOY }], cotizaciones: [{ numero: "COT-000045", fecha: "2026-10-20" }] });
  assert.deepEqual(r.map((x) => `${x.tipo}:${x.folio}`), ["802:COT-000045"]);
  assert.equal(r[0].razon, "Cotización COT-000045");
});
prueba("estado SII normalizado", () => {
  assert.equal(estadoSiiDesde("Aceptado"), "aceptado");
  assert.equal(estadoSiiDesde("Aceptado con Reparos"), "aceptado_reparos");
  assert.equal(estadoSiiDesde("RECHAZADO"), "rechazado");
  assert.equal(estadoSiiDesde("Recibido"), "pendiente");
  assert.equal(estadoSiiDesde(""), "desconocido");
});
const CESION = { tipoDte: 33 as const, folio: "1234", montoCesion: 200000, cesionarioRut: "76086428-5", cesionarioRazonSocial: "Factor SpA", cesionarioDireccion: "Calle 1", cesionarioCorreo: "ops@factor.cl", personaAutorizada: { rut: "11111111-1", nombre: "Persona Autorizada", correo: "firma@ejemplo.cl" }, correoDeudor: "pagos@cliente.cl", otrasCondiciones: null };
prueba("cesión: total exacto, factor y persona autorizada completos", () => {
  assert.deepEqual(validarCesion(CESION, 200000), []);
  assert.ok(validarCesion({ ...CESION, montoCesion: 150000 }, 200000).some((x) => x.campo === "montoCesion"));
  assert.ok(validarCesion({ ...CESION, cesionarioCorreo: "x" }, 200000).some((x) => x.campo === "cesionarioCorreo"));
  assert.ok(validarCesion({ ...CESION, personaAutorizada: { rut: "", nombre: "", correo: "" } }, 200000).some((x) => x.campo === "personaAutorizada"));
  assert.ok(validarCesion({ ...CESION, correoDeudor: "" }, 200000).some((x) => x.campo === "correoDeudor"));
});

console.log("Traducción a SimpleFactura");
prueba("factura afecta: encabezado, totales y detalle", () => {
  const d = normalizarDocumento(doc({ fechaVencimiento: "2026-12-17", lineas: [linea({ precio: 100000 }), linea({ nombre: "Repuesto", cantidad: 2, precio: 25000, descuentoPct: 10 })], referencias: [{ tipo: "801", folio: "4500123", fecha: "2026-10-01", codRef: null, razon: null }] }));
  const j = armarDocumentoSimpleFactura(EMISOR, d, IVA);
  const enc = j.Documento.Encabezado;
  assert.equal(enc.IdDoc.TipoDTE, 33);
  assert.equal(enc.IdDoc.FchEmis, "2026-11-17");
  assert.equal(enc.IdDoc.FchVenc, "2026-12-17");
  assert.equal(enc.Emisor.RUTEmisor, "76269769-6");
  assert.equal(enc.Receptor.RUTRecep, "76086428-5");
  assert.equal(enc.Totales.MntNeto, 145000);
  assert.equal(enc.Totales.IVA, 27550);
  assert.equal(enc.Totales.MntTotal, 172550);
  assert.equal(j.Documento.Detalle.length, 2);
  assert.equal(j.Documento.Detalle[1].DescuentoPct, 10);
  assert.equal(j.Documento.Detalle[1].DescuentoMonto, 5000);
  assert.equal(j.Documento.Detalle[1].MontoItem, 45000);
  assert.equal(j.Documento.Referencia?.[0].TpoDocRef, "801");
  assert.equal(j.Documento.Referencia?.[0].NroLinRef, 1);
  assert.equal(j.Documento.Referencia?.[0].RazonRef, "Orden de compra");
});
prueba("factura exenta: sin MntNeto ni IVA, líneas con IndExe", () => {
  const j = armarDocumentoSimpleFactura(EMISOR, normalizarDocumento(doc({ tipo: 34 })), IVA);
  assert.equal(j.Documento.Encabezado.Totales.MntExe, 100000);
  assert.equal(j.Documento.Encabezado.Totales.MntNeto, undefined);
  assert.equal(j.Documento.Encabezado.Totales.IVA, undefined);
  assert.equal(j.Documento.Detalle[0].IndExe, 1);
});
prueba("guía: IndTraslado, transporte y sin forma de pago", () => {
  const g = normalizarDocumento(doc({ tipo: 52, indTraslado: 6, tipoDespacho: 2, transporte: { patente: "ABCD12", rutTransportista: null, rutChofer: "11111111-1", nombreChofer: "Juan Pérez", direccionDestino: "Faena Norte km 12", comunaDestino: "Calama", ciudadDestino: "Calama" } }));
  const j = armarDocumentoSimpleFactura(EMISOR, g, IVA);
  assert.equal(j.Documento.Encabezado.IdDoc.IndTraslado, 6);
  assert.equal(j.Documento.Encabezado.IdDoc.TipoDespacho, 2);
  assert.equal(j.Documento.Encabezado.IdDoc.FmaPago, undefined);
  assert.equal(j.Documento.Encabezado.Transporte?.Patente, "ABCD12");
  assert.equal(j.Documento.Encabezado.Transporte?.Chofer?.NombreChofer, "Juan Pérez");
  assert.equal(j.Documento.Encabezado.Transporte?.CmnaDest, "Calama");
});
prueba("NC: referencia con CodRef y razón", () => {
  const nc = normalizarDocumento(doc({ tipo: 61, referencias: [{ tipo: "33", folio: "1234", fecha: "2026-11-10", codRef: 1, razon: "Anula factura" }] }));
  const j = armarDocumentoSimpleFactura(EMISOR, nc, IVA);
  assert.equal(j.Documento.Referencia?.[0].CodRef, 1);
  assert.equal(j.Documento.Referencia?.[0].RazonRef, "Anula factura");
  const conGrado = armarDocumentoSimpleFactura(EMISOR, normalizarDocumento(doc({ tipo: 61, referencias: [{ tipo: "33", folio: "9", fecha: HOY, codRef: 1, razon: "Anula factura N° 9" }] })), IVA);
  assert.equal(conGrado.Documento.Referencia?.[0].RazonRef, "Anula factura Nro. 9");
  assert.equal(j.Documento.Referencia?.[0].FolioRef, "1234");
});
prueba("cesión: cuerpo de /cederFactura", () => {
  const c = armarCesionSimpleFactura(EMISOR, CESION);
  assert.deepEqual(c, { RutEmpresa: "76269769-6", Folio: 1234, RutCesionario: "76086428-5", RutPersonaAutorizada: "11111111-1", CorreoDeudor: "pagos@cliente.cl" });
});
prueba("NC/ND: motivo de la URL = CodRef", () => {
  assert.equal(motivoNota(normalizarDocumento(doc({ tipo: 61, referencias: [{ tipo: "33", folio: "1", fecha: HOY, codRef: 3, razon: "x" }] }))), 3);
  assert.equal(motivoNota(normalizarDocumento(doc({ tipo: 56 }))), 6);
});
prueba("acuse: aceptar = 3; reclamos = 5 con su tipo; ERM no se ofrece", () => {
  assert.deepEqual(respuestaAcuse("ACD"), { respuesta: 3, tipoRechazo: null });
  assert.deepEqual(respuestaAcuse("RCD"), { respuesta: 5, tipoRechazo: 1 });
  assert.deepEqual(respuestaAcuse("RFP"), { respuesta: 5, tipoRechazo: 3 });
  assert.deepEqual(respuestaAcuse("RFT"), { respuesta: 5, tipoRechazo: 4 });
  assert.throws(() => respuestaAcuse("ERM"));
});
prueba("recibido de /documentsReceived (ejemplo oficial)", () => {
  const r = traducirRecibido({ ambiente: "Producción", codigoSii: 33, tipoDte: "Factura Electrónica", respuesta: "PAGO CONTADO", estado: "RECIBIDO EN CORREO", fechaEmision: "30-03-2023", folio: 47433932, razonSocialProveedor: "PROVEEDOR S.A.", rutProveedor: "96689310-9", neto: 5502, exento: 0, iva: 1045, total: 6547 });
  assert.equal(r?.tipoDte, 33);
  assert.equal(r?.folio, "47433932");
  assert.equal(r?.fechaEmision, "2023-03-30");
  assert.equal(r?.total, 6547);
  assert.equal(r?.accion, "ACD");
  assert.equal(traducirRecibido({ folio: 1 }), null);
});
prueba("estado de /documentIssued", () => {
  const e = traducirEstado({ estadoSII: "Documento Aceptado por el SII", estadoAcuse: "Pendiente", trackId: 236460724 });
  assert.equal(e.estadoSii, "aceptado");
  assert.equal(e.trackId, "236460724");
  assert.equal(traducirEstado({ estadoSII: "Envío no llegó al SII" }).estadoSii, "rechazado");
  assert.equal(traducirEstado({ estadoSII: "Documento Enviado al SII" }).estadoSii, "pendiente");
  assert.equal(traducirEstado({ estadoSII: "Emisión de Documento" }).estadoSii, "pendiente");
});
prueba("errores: errors[], data o message", () => {
  assert.equal(mensajeError({ status: 500, message: null, data: "Error al facturar desde api", errors: ["MontoItem Nro 1 no cuadra"] }, 500), "MontoItem Nro 1 no cuadra — Error al facturar desde api");
  assert.equal(mensajeError("API calls quota exceeded!", 429), "API calls quota exceeded!");
});
prueba("sucursal en la URL y ambiente", () => {
  assert.equal(sucursalEnRuta("Casa Matriz"), "Casa_Matriz");
  assert.equal(codigoAmbiente("certificacion"), 0);
  assert.equal(codigoAmbiente("produccion"), 1);
});

prueba("archivo: carpeta por clase, año y mes; sin fecha a «Por revisar»", () => {
  const base = carpetaFacturas("Empresa Demo SpA");
  assert.equal(base, "Gestion financiera/Empresa Demo SpA/Facturas");
  assert.equal(carpetaDte(base, "emitido", "2026-03-14"), `${base}/Emitidos/2026/03 Marzo`);
  assert.equal(carpetaDte(base, "recibido", "2025-12-01"), `${base}/Recibidos/2025/12 Diciembre`);
  assert.equal(carpetaDte(base, "recibido", null), `${base}/Por revisar`);
});

prueba("archivo: nombre legible y sin caracteres que SharePoint rechaza", () => {
  assert.equal(nombreDte({ clase: "emitido", tipoDte: 33, folio: "120", fecha: "2026-03-14", contraparte: "Cliente Uno SpA", rut: "11111111-1" }), "2026-03-14_Factura 120_Cliente Uno SpA");
  assert.equal(nombreDte({ clase: "recibido", tipoDte: 61, folio: "9", fecha: "2026-01-02", contraparte: "Prov: «A/B» Ltda.", rut: "22222222-2" }), "2026-01-02_Nota credito 9_Prov «A B» Ltda (22222222-2)");
  assert.equal(nombreDte({ clase: "recibido", tipoDte: 52, folio: null, fecha: null, contraparte: null, rut: null }), "sin-fecha_Guia despacho s-n_Sin nombre");
});

console.log(`\n${n} pruebas ok`);
