// Prueba de punta a punta contra SimpleFactura en CERTIFICACIÓN (cuenta demo). No toca la base del Core.
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/e2e-simplefactura.mts
import { crearProveedorSimpleFactura, buscarEmitido } from "../lib/fin/dte/simplefactura";
import { cuentaDesdeEntorno } from "../lib/fin/dte/cuenta";
import { documentoVacio, normalizarDocumento, validarDocumento, type DocumentoDte } from "../lib/fin/dte/modelo";
import { writeFileSync } from "node:fs";

const cuenta = cuentaDesdeEntorno();
if (!cuenta) throw new Error("Faltan SIMPLEFACTURA_EMAIL/PASSWORD o SIMPLEFACTURA_TOKEN en .env.local.");
if (cuenta.ambiente !== "certificacion") throw new Error("Solo en certificación.");
const OUT = process.argv[2] ?? ".";
const HOY = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const IVA = 0.19;
const prov = crearProveedorSimpleFactura(cuenta);
const emisor = { rut: "", razonSocial: "", giro: null, acteco: null, direccion: null, comuna: null, ciudad: null, correo: null, telefono: null, sucursal: "Casa Matriz" };
const receptor = { rut: "11111111-1", razonSocial: "Cliente de Prueba Core", giro: "Servicios de ingeniería", direccion: "Calle 12", comuna: "Paine", ciudad: "Santiago", contacto: null, correo: null };
const base = (p: Partial<DocumentoDte>): DocumentoDte => normalizarDocumento({ ...documentoVacio(33, HOY), receptor, ...p } as DocumentoDte);
const linea = (nombre: string, precio: number, extra = {}) => ({ nombre, descripcion: null, cantidad: 1, unidad: "UN", precio, descuentoPct: 0, exento: false, codigo: null, ...extra });

async function paso<T>(nombre: string, f: () => Promise<T>): Promise<T | null> {
  try {
    const r = await f();
    console.log(`OK   ${nombre}:`, typeof r === "object" && r && !(r instanceof Buffer) ? JSON.stringify(r).slice(0, 300) : r instanceof Buffer ? `${r.length} bytes` : r);
    return r;
  } catch (e) {
    console.log(`FALLA ${nombre}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
const emitir = async (nombre: string, d: DocumentoDte) => {
  const prob = validarDocumento(d, HOY, IVA);
  if (prob.length) { console.log(`INVALIDO ${nombre}:`, prob.map((p) => p.texto)); return null; }
  return paso(`emitir ${nombre}`, () => prov.emitir(emisor, d, IVA));
};

await paso("probar conexión", () => prov.probarConexion(emisor));
const f33 = await emitir("factura 33", base({ fechaVencimiento: null, formaPago: 2, lineas: [linea("Servicio de mantención preventiva", 100000, { descripcion: "Faena Norte · EDP noviembre" }), linea("Repuesto filtro", 25000, { cantidad: 2, descuentoPct: 10 })], referencias: [{ tipo: "801", folio: "4500123", fecha: HOY, codRef: null, razon: null }, { tipo: "HES", folio: "1000234", fecha: HOY, codRef: null, razon: null }] }));
if (f33) {
  await paso("estado 33", () => prov.consultarEstado(emisor, 33, f33.folio));
  const pdf = await paso("PDF 33", () => prov.pdf(emisor, 33, f33.folio));
  if (pdf) writeFileSync(`${OUT}/factura-33-${f33.folio}.pdf`, pdf);
  const xml = await paso("XML 33", () => prov.xml(emisor, 33, f33.folio));
  if (xml) writeFileSync(`${OUT}/factura-33-${f33.folio}.xml`, xml);
  await paso("buscar emitido (verificación de envíos en duda)", () => buscarEmitido(cuenta, emisor, 33, receptor.rut, HOY, 172550));
  const nc = await emitir("NC 61 anula", base({ tipo: 61, formaPago: 1, lineas: [linea("Servicio de mantención preventiva", 100000), linea("Repuesto filtro", 25000, { cantidad: 2, descuentoPct: 10 })], referencias: [{ tipo: "33", folio: f33.folio, fecha: HOY, codRef: 1, razon: `Anula factura ${f33.folio}` }] }));
  if (nc) { const p = await paso("PDF NC", () => prov.pdf(emisor, 61, nc.folio)); if (p) writeFileSync(`${OUT}/nota-credito-61-${nc.folio}.pdf`, p); }
}
const f33b = await emitir("factura 33 (para ND)", base({ formaPago: 2, lineas: [linea("Arriendo generador 100 kVA", 450000, { unidad: "MES" })] }));
if (f33b) await emitir("ND 56 intereses", base({ tipo: 56, formaPago: 2, lineas: [linea("Intereses por mora", 10000)], referencias: [{ tipo: "33", folio: f33b.folio, fecha: HOY, codRef: 3, razon: "Intereses por pago fuera de plazo" }] }));
const f34 = await emitir("factura exenta 34", base({ tipo: 34, formaPago: 2, lineas: [linea("Capacitación exenta", 80000)] }));
if (f34) { const p = await paso("PDF 34", () => prov.pdf(emisor, 34, f34.folio)); if (p) writeFileSync(`${OUT}/factura-exenta-34-${f34.folio}.pdf`, p); }
const gVenta = await emitir("guía 52 venta", base({ tipo: 52, indTraslado: 1, tipoDespacho: 2, lineas: [linea("Bomba sumergible 5HP", 380000)], transporte: { patente: "ABCD12", rutTransportista: "19721099-0", rutChofer: "19721099-0", nombreChofer: "Tomas Vega", direccionDestino: "Faena Norte km 12", comunaDestino: "Calama", ciudadDestino: "Calama" } }));
if (gVenta) { const p = await paso("PDF guía venta", () => prov.pdf(emisor, 52, gVenta.folio)); if (p) writeFileSync(`${OUT}/guia-venta-52-${gVenta.folio}.pdf`, p); }
const gArr = await emitir("guía 52 arriendo (no venta, valorizada)", base({ tipo: 52, indTraslado: 6, tipoDespacho: 2, lineas: [linea("Generador 100 kVA (arriendo)", 450000)], transporte: { patente: "ABCD12", rutTransportista: "19721099-0", rutChofer: "19721099-0", nombreChofer: "Tomas Vega", direccionDestino: "Faena Norte km 12", comunaDestino: "Calama", ciudadDestino: "Calama" } }));
if (gArr) { const p = await paso("PDF guía arriendo", () => prov.pdf(emisor, 52, gArr.folio)); if (p) writeFileSync(`${OUT}/guia-arriendo-52-${gArr.folio}.pdf`, p); }
await emitir("guía 52 traslado interno sin valores", base({ tipo: 52, indTraslado: 5, tipoDespacho: 3, receptor: { ...receptor, rut: "78181331-1", razonSocial: "CHILESYSTEMS SPA", giro: "Servicios informáticos", direccion: "Bodega 2", comuna: "Quilicura" }, lineas: [linea("Andamio multidireccional", 0, { cantidad: 20 })], transporte: { patente: "ABCD12", rutTransportista: "19721099-0", rutChofer: "19721099-0", nombreChofer: "Tomas Vega", direccionDestino: "Bodega 2", comunaDestino: "Quilicura", ciudadDestino: "Santiago" } }));
const desde = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
const rec = await paso("recibidos últimos 60 días", async () => { const r = await prov.recibidos(emisor, desde, HOY); return { cantidad: r.length, primeros: r.slice(0, 3) }; });
void rec;
for (const t of [33, 34, 52, 56, 61]) await paso(`folios sin uso ${t}`, () => prov.folios!(emisor, t));
console.log("EMITIDOS:", JSON.stringify({ f33: f33?.folio, f33b: f33b?.folio, f34: f34?.folio, gVenta: gVenta?.folio, gArr: gArr?.folio }));
