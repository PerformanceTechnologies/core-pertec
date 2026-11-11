/**
 * La OC: totales con decimales (UF y USD), el HTML del PDF para las tres empresas y las reglas del flujo.
 *
 * Correr con:  npx tsx scripts/probar-oc.mts
 * Con  PDF_SALIDA=/carpeta  además imprime un PDF y una imagen por empresa (necesita Chromium: `npx playwright install chromium`).
 */

import assert from "node:assert/strict";
import { htmlDeOc, esc, nombreArchivoOc, textoDePago, type DatosOc } from "../lib/fin/oc-documento";
import { aPesos, coloresDeEmpresa, formatoMonto, netoLineaOc, totalesOc, type LineaOc } from "../lib/fin/oc-modelo";
import { PARAMETROS_DEFAULT, siguientePasoCompra, type CompraBase } from "../lib/fin/reglas";

// ── Totales ────────────────────────────────────────────────────────────────────
const lineas: LineaOc[] = [
  { productoId: null, descripcion: "Repuestos <chancador>", cantidad: 3, unidad: "un", precioUnitario: 1_500_000, descuentoPct: 0.1, exento: false, nota: "Marca original" },
  { productoId: null, descripcion: "Flete", cantidad: 1, unidad: "un", precioUnitario: 250_000, descuentoPct: 0, exento: true, nota: null },
];
assert.deepEqual(totalesOc(lineas, 0.19, "CLP"), { neto: 4_050_000, exento: 250_000, iva: 769_500, total: 5_069_500 });

// UF: dos decimales, nada de redondear a peso entero.
const uf: LineaOc[] = [{ productoId: null, descripcion: "Arriendo", cantidad: 3, unidad: "mes", precioUnitario: 12.345, descuentoPct: 0, exento: false, nota: null }];
assert.equal(netoLineaOc(uf[0], "UF"), 37.04);
assert.deepEqual(totalesOc(uf, 0.19, "UF"), { neto: 37.04, exento: 0, iva: 7.04, total: 44.08 });
assert.equal(aPesos(44.08, "UF", 38_500.5), 1_697_102);
assert.equal(aPesos(1500, "CLP", 1), 1500);
assert.equal(aPesos(100, "USD", 0), 0, "sin tipo de cambio no se inventa un monto");

assert.equal(formatoMonto(1234567, "CLP"), "$1.234.567");
assert.equal(formatoMonto(12.3, "UF"), "UF 12,30");
assert.equal(formatoMonto(1234.5, "USD"), "US$ 1.234,50");

// ── PDF por empresa ────────────────────────────────────────────────────────────
const EMPRESAS = [
  { slug: "pertec", nombre: "Performance Technologies SpA", rut: "76.123.456-7" },
  { slug: "zeus", nombre: "Zeus Ingeniería SpA", rut: "77.234.567-8" },
  { slug: "performance-service", nombre: "Performance Service SpA", rut: "78.345.678-9" },
];

function datos(e: (typeof EMPRESAS)[number], extra: Partial<DatosOc> = {}): DatosOc {
  return {
    empresa: { slug: e.slug, nombre: e.nombre, rut: e.rut, direccion: "Av. Industrial 1234, Santiago", giro: "Servicios de ingeniería y mantención industrial", telefono: "+56 2 2345 6789", correo: "compras@empresa.cl", web: "www.empresa.cl", condicionesOc: null },
    logo: null, numero: "OC-000012", fecha: "2026-11-11", titulo: "Repuestos para chancador <planta Norte>", proyecto: "Mantención Planta Norte", solicitante: "Hugo Antivil",
    proveedor: { nombre: "Ferretería Industrial Ltda.", rut: "76.555.444-3", giro: "Venta de repuestos", direccion: "Camino Real 55, Calama", telefono: "+56 55 2111222", correo: "ventas@ferreteria.cl" },
    atencion: "Juan Soto", moneda: "CLP", tipoCambio: 1, lineas, tasaIva: 0.19, entregaLugar: "Faena Planta Norte, Calama", entregaPlazo: "5 días hábiles", fechaRequerida: "2026-11-20",
    formaPago: "Transferencia", condicionPagoDias: 30, observaciones: "Despachar con guía y certificado de calidad.", condiciones: null,
    firmas: { solicitado: { nombre: "Hugo Antivil", fecha: "2026-11-11" }, aprobado: { nombre: "María Pérez", fecha: "2026-11-11" }, visado: { nombre: "Carlos Rojas", fecha: "2026-11-11" } },
    ...extra,
  };
}

for (const e of EMPRESAS) {
  const html = htmlDeOc(datos(e));
  const c = coloresDeEmpresa(e.slug);
  assert.ok(html.includes(esc(e.nombre)) && html.includes("OC-000012"), `${e.slug}: nombre y número`);
  for (const otra of EMPRESAS.filter((x) => x.slug !== e.slug)) assert.ok(!html.includes(otra.nombre), `${e.slug}: no debe mostrar a ${otra.slug}`);
  assert.ok(html.includes(c.acento) && html.includes(c.claro), `${e.slug}: lleva SU color y SU fondo claro`);
  assert.ok(!html.includes("<planta Norte>") && !html.includes("<chancador>"), "se escapa el HTML de títulos y descripciones");
  assert.ok(html.includes("$5.069.500") && html.includes("$769.500") && html.includes("Exento"));
  assert.ok(!html.includes("marca-agua\">"), "una OC con número no lleva marca de agua");
  assert.ok(html.includes("Pago a 30 días") && html.includes("Transferencia"));
  assert.ok(html.includes("Facturar a") && html.includes("Condiciones generales") && html.includes("Visado por"));
}
assert.ok(htmlDeOc(datos(EMPRESAS[0], { numero: null })).includes('class="marca-agua"'), "sin número: marca de agua BORRADOR");
assert.ok(htmlDeOc(datos(EMPRESAS[0], { numero: null })).includes("Se asigna al visar"));
assert.ok(htmlDeOc(datos(EMPRESAS[0], { firmas: { solicitado: null, aprobado: null, visado: null } })).includes("Pendiente"));

// Moneda extranjera: se muestra el equivalente en pesos con su tipo de cambio.
{
  const html = htmlDeOc(datos(EMPRESAS[0], { moneda: "UF", tipoCambio: 38_500.5, lineas: uf }));
  assert.ok(html.includes("UF 44,08") && html.includes("Equivalente en pesos") && html.includes("$1.697.102"));
}
// Condiciones propias de la empresa mandan sobre las de omisión.
assert.ok(htmlDeOc(datos({ ...EMPRESAS[0] }, { empresa: { ...datos(EMPRESAS[0]).empresa, condicionesOc: "Garantía de 12 meses." } })).includes("Garantía de 12 meses."));

assert.equal(textoDePago({ formaPago: null, condicionPagoDias: 0 }), "Contado contra factura");
assert.equal(textoDePago({ formaPago: null, condicionPagoDias: null }), null);
assert.equal(nombreArchivoOc({ numero: "OC-000012", titulo: "x", proveedor: { nombre: "Ferretería/Industrial: Ltda.", rut: null, giro: null, direccion: null, telefono: null, correo: null } }), "OC-000012 - Ferretería Industrial Ltda..pdf");
assert.equal(nombreArchivoOc({ numero: null, titulo: "x", proveedor: null }), "Borrador OC.pdf");

// ── El flujo: borrador → aprobación → visado → envío → respuesta → factura ──────
const P = PARAMETROS_DEFAULT;
const HOY = "2026-11-11";
const base: CompraBase = {
  id: "c1", codigo: "C-0001", proyectoId: null, proveedorId: "p1", descripcion: "x", netoCotizado: 1000, aprobadoPor: null, fechaAprobacion: null, fechaVisado: null, ocNumero: null,
  recepcion: null, facturaFolio: null, facturaTotal: null, facturaVence: null, fechaProgramada: null, fechaPagoReal: null, comentario: null, anulada: false,
};
const oc: CompraBase = { ...base, formatoOc: true, enviadaAprobacion: false };
assert.equal(siguientePasoCompra(oc, P, HOY), "Borrador: enviar a aprobación");
assert.equal(siguientePasoCompra({ ...oc, devueltaMotivo: "Falta cotización" }, P, HOY), "Devuelta: corregir y reenviar");
assert.equal(siguientePasoCompra({ ...oc, enviadaAprobacion: true }, P, HOY), "Falta aprobación JP o gerente");
const aprobada = { ...oc, enviadaAprobacion: true, aprobadoPor: "María", fechaAprobacion: HOY };
assert.equal(siguientePasoCompra(aprobada, P, HOY), "Falta visado de Finanzas");
const visada = { ...aprobada, fechaVisado: HOY, ocNumero: "OC-000012" };
assert.equal(siguientePasoCompra(visada, P, HOY), "Enviar OC al proveedor");
assert.equal(siguientePasoCompra({ ...visada, ocEnviada: true }, P, HOY), "Esperar respuesta del proveedor");
assert.equal(siguientePasoCompra({ ...visada, ocEnviada: true, ocRespuesta: "rechazada" }, P, HOY), "OC rechazada por el proveedor");
assert.equal(siguientePasoCompra({ ...visada, ocEnviada: true, ocRespuesta: "aceptada" }, P, HOY), "Esperar factura del proveedor", "aceptada por el proveedor: pasa directo a facturas, sin recepción de mercadería");
// Anulada gana siempre, también sobre un borrador.
assert.equal(siguientePasoCompra({ ...oc, anulada: true }, P, HOY), "Anulada");
// Las compras anteriores (sin formato OC) siguen el flujo de siempre.
assert.equal(siguientePasoCompra({ ...base, aprobadoPor: "X", fechaAprobacion: HOY, fechaVisado: HOY, ocNumero: "OC-1" }, P, HOY), "Esperar recepción conforme");

// ── Leer la cotización de un proveedor con IA ──────────────────────────────────
import { buscarProveedor, normalizarLectura, rutPlano, type LecturaCotizacion } from "../lib/fin/oc-ia-datos";

const lectura = (extra: Partial<LecturaCotizacion> = {}): LecturaCotizacion => ({
  numeroCotizacion: "COT-88", fecha: "2026-11-10", titulo: "Repuestos chancador", moneda: null, preciosIncluyenIva: false,
  proveedor: { razonSocial: "Ferretería Industrial Ltda.", rut: "76.555.444-3", atencion: "Juan Soto", correo: "ventas@ferreteria.cl", telefono: null, direccion: null },
  lineas: [
    { descripcion: "Rodamiento 22318", cantidad: 4, unidad: "un", precioUnitario: 100_000, descuentoPct: 10, exento: false },
    { descripcion: "Flete", cantidad: 1, unidad: null, precioUnitario: 50_000, descuentoPct: null, exento: true },
  ],
  totalDeclarado: 475_400, plazoEntrega: "5 días hábiles", formaPago: "Transferencia", condicionPagoDias: 30, lugarEntrega: null, observaciones: null, ilegibles: [], ...extra,
});
{
  // Neto 4×100.000 −10 % = 360.000 afecto + 50.000 exento; IVA 68.400 → 478.400. Con total declarado igual no hay avisos.
  const ok = normalizarLectura(lectura({ totalDeclarado: 478_400 }), 0.19);
  assert.equal(ok.moneda, "CLP", "sin moneda impresa se asume pesos");
  assert.equal(ok.lineas.length, 2);
  assert.equal(ok.lineas[0].descuentoPct, 0.1, "el descuento llega en % y se guarda como fracción");
  assert.equal(ok.lineas[1].unidad, "un", "sin unidad impresa se usa «un»");
  assert.equal(ok.condicionPagoDias, 30);
  assert.deepEqual(ok.avisos, [], "si el total cuadra no hay nada que revisar");

  // Si la suma no calza con el total impreso, se avisa (no se «arregla»).
  const mal = normalizarLectura(lectura({ totalDeclarado: 999_999 }), 0.19);
  assert.ok(mal.avisos.some((a) => a.includes("no coincide con el total")));

  // Precios con IVA incluido: el servidor los pasa a neto (119.000 → 100.000), y lo exento no se toca.
  const conIva = normalizarLectura(lectura({ preciosIncluyenIva: true, lineas: [{ descripcion: "Bomba", cantidad: 1, unidad: "un", precioUnitario: 119_000, descuentoPct: null, exento: false }, { descripcion: "Flete exento", cantidad: 1, unidad: "un", precioUnitario: 50_000, descuentoPct: null, exento: true }], totalDeclarado: 169_000 }), 0.19);
  assert.equal(conIva.lineas[0].precioUnitario, 100_000);
  assert.equal(conIva.lineas[1].precioUnitario, 50_000);
  assert.ok(conIva.avisos.some((a) => a.includes("incluyen IVA")));
  assert.ok(!conIva.avisos.some((a) => a.includes("no coincide")), "169.000 = 100.000 × 1,19 + 50.000 exento");

  // Sin precio legible: queda en cero y se avisa. Sin ítems: se avisa. Basura numérica no rompe nada.
  const sinPrecio = normalizarLectura(lectura({ lineas: [{ descripcion: "Algo", cantidad: null, unidad: null, precioUnitario: null, descuentoPct: 500, exento: false }], totalDeclarado: null }), 0.19);
  assert.equal(sinPrecio.lineas[0].precioUnitario, 0);
  assert.equal(sinPrecio.lineas[0].cantidad, 1);
  assert.equal(sinPrecio.lineas[0].descuentoPct, 1, "un descuento absurdo se acota al 100 %");
  assert.ok(sinPrecio.avisos.some((a) => a.includes("precio legible")));
  assert.ok(normalizarLectura(lectura({ lineas: [], totalDeclarado: null }), 0.19).avisos.some((a) => a.includes("no encontró ítems")));

  // UF: se respeta la moneda impresa y los decimales.
  const enUf = normalizarLectura(lectura({ moneda: "UF", lineas: [{ descripcion: "Arriendo", cantidad: 3, unidad: "mes", precioUnitario: 12.345, descuentoPct: null, exento: false }], totalDeclarado: 44.08 }), 0.19);
  assert.equal(enUf.moneda, "UF");
  assert.deepEqual(enUf.avisos, []);

  // Lo ilegible se nombra, y el título cae en el primer ítem si el documento no lo trae.
  const ileg = normalizarLectura(lectura({ titulo: null, ilegibles: ["la fecha de entrega"], totalDeclarado: null }), 0.19);
  assert.ok(ileg.avisos.some((a) => a.includes("la fecha de entrega")));
  assert.equal(ileg.titulo, "Rodamiento 22318");
}
{
  const contactos = [
    { id: "1", nombre: "Ferretería Industrial Ltda.", rut: "76.555.444-3" },
    { id: "2", nombre: "Otra Empresa SpA", rut: "77.111.222-K" },
    { id: "3", nombre: "Otra Empresa SpA", rut: "77.999.888-1" },
  ];
  assert.equal(rutPlano("77.111.222-k"), "77111222K");
  assert.equal(buscarProveedor(contactos, "765554443", null)?.id, "1", "por RUT, con o sin puntos y guion");
  assert.equal(buscarProveedor(contactos, null, "FERRETERIA industrial ltda")?.id, "1", "por nombre, sin tildes ni mayúsculas");
  assert.equal(buscarProveedor(contactos, null, "Otra Empresa SpA"), null, "dos con el mismo nombre: no se adivina");
  assert.equal(buscarProveedor(contactos, "11.111.111-1", "Desconocido S.A."), null);
}

console.log("probar-oc: todo bien");

// ── Impresión opcional ─────────────────────────────────────────────────────────
if (process.env.PDF_SALIDA) {
  const { chromium } = await import("playwright");
  const { writeFileSync } = await import("node:fs");
  const { pieDeOc } = await import("../lib/fin/oc-documento");
  const browser = await chromium.launch({ headless: true });
  for (const e of EMPRESAS) {
    for (const variante of ["emitida", "borrador"] as const) {
      const d = datos(e, variante === "borrador" ? { numero: null, firmas: { solicitado: { nombre: "Hugo Antivil", fecha: "2026-11-11" }, aprobado: null, visado: null } } : {});
      const page = await browser.newPage();
      await page.setViewportSize({ width: 794, height: 1123 });
      await page.setContent(htmlDeOc(d), { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      const pdf = await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: pieDeOc(d), preferCSSPageSize: true });
      writeFileSync(`${process.env.PDF_SALIDA}/oc-${e.slug}-${variante}.pdf`, pdf);
      await page.screenshot({ path: `${process.env.PDF_SALIDA}/oc-${e.slug}-${variante}.png`, fullPage: true });
      await page.close();
    }
  }
  await browser.close();
  console.log("PDFs e imágenes en", process.env.PDF_SALIDA);
}
