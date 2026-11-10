/**
 * El PDF y el correo de la cotización de Leads, para las tres empresas del grupo.
 *
 * Correr con:  npm run probar-cotizacion-pdf
 * Con  PDF_SALIDA=/carpeta  además imprime un PDF por empresa (necesita Chromium: `npx playwright install chromium`).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { condicionesDelDocumento, esc, htmlDeCotizacion, pieDeCotizacion, vigenteHasta, type DatosDocumento } from "../lib/fin/cotizacion-documento";
import { asuntoDeCotizacion, mensajeDeCotizacion } from "../lib/fin/cotizacion-correo";
import { totalesCotizacion } from "../lib/fin/modelo";

const EMPRESAS = [
  { slug: "pertec", nombre: "Performance Technologies SpA", rut: "76.123.456-7", prefijo: "COT" },
  { slug: "zeus", nombre: "Zeus Ingeniería SpA", rut: "77.234.567-8", prefijo: "ZEU" },
  { slug: "performance-service", nombre: "Performance Service SpA", rut: "78.345.678-9", prefijo: "PSE" },
];

function datos(e: (typeof EMPRESAS)[number], extra: Partial<DatosDocumento> = {}): DatosDocumento {
  return {
    empresa: { nombre: e.nombre, rut: e.rut, direccion: "Av. Industrial 1234, Santiago", giro: "Servicios de ingeniería y mantención industrial", telefono: "+56 2 2345 6789", correo: "comercial@empresa.cl", web: "www.empresa.cl", datosBancarios: "Banco: Banco de Chile\nCuenta corriente N°: 123456789\nTitular: " + e.nombre, pie: "Los valores no incluyen traslados fuera de la región." },
    logo: null,
    numero: `${e.prefijo}-000123`, version: 1, titulo: "Mantención mensual de chancadores <planta Norte>", fecha: "2026-11-10", validezDias: 30, tipo: "servicio", estado: "borrador",
    cliente: { nombre: "Minera Los Andes S.A.", rut: "96.555.444-3", giro: "Minería", direccion: "Camino Real 55, Calama", telefono: "+56 55 2111222", correo: "compras@mla.cl" },
    atencion: "María Pérez", tasaIva: 0.19, condicionPagoDias: 30, formaPago: null, plazoEntrega: "10 días hábiles", requiereOc: true, requiereEdp: false, requiereHes: true, notas: "Incluye repuestos menores.\nNo incluye andamios.",
    lineas: [
      { productoId: null, descripcion: "Mantención preventiva mensual <b>chancador</b>", cantidad: 2, unidad: "un", precioUnitario: 1_500_000, descuentoPct: 0.1, exento: false, meses: null },
      { productoId: null, descripcion: "Informe técnico", cantidad: 1, unidad: "un", precioUnitario: 250_000, descuentoPct: 0, exento: true, meses: null },
    ],
    emisor: { nombre: "Hugo Pérez", correo: "hugo@pertec.cl" },
    ...extra,
  };
}

for (const e of EMPRESAS) {
  const d = datos(e);
  const html = htmlDeCotizacion(d);
  // Cada empresa lleva SU nombre, SU número y SU prefijo, y nada de las otras.
  assert.ok(html.includes(esc(e.nombre)) && html.includes(`${e.prefijo}-000123`), `${e.slug}: nombre y número`);
  for (const otra of EMPRESAS.filter((x) => x.slug !== e.slug)) assert.ok(!html.includes(otra.nombre), `${e.slug}: no debe mostrar a ${otra.slug}`);
  // Lo que escriben las personas no puede inyectar HTML.
  assert.ok(!html.includes("<planta Norte>") && !html.includes("<b>chancador</b>"), "se escapa el HTML de títulos y descripciones");
  assert.ok(html.includes("&lt;planta Norte&gt;"));
  // Totales: 2 × 1.500.000 con 10 % = 2.700.000 afecto + 250.000 exento; IVA 19 % = 513.000.
  const t = totalesCotizacion(d.lineas, d.tasaIva);
  assert.deepEqual(t, { neto: 2_700_000, exento: 250_000, iva: 513_000, total: 3_463_000 });
  assert.ok(html.includes("$3.463.000") && html.includes("$513.000") && html.includes("Exento"));
  assert.ok(html.includes("Desc."), "con descuento aparece su columna");
  assert.ok(html.includes("Datos para el pago") && html.includes("Banco de Chile"));
  assert.ok(html.includes("10-11-2026") && html.includes("10-12-2026"), "fecha de emisión y de vigencia en dd-mm-aaaa");
}

// Sin descuentos ni exentos ni datos bancarios, esas partes no salen.
const simple = htmlDeCotizacion(datos(EMPRESAS[0], { lineas: [{ productoId: null, descripcion: "Servicio", cantidad: 1, unidad: "un", precioUnitario: 100_000, descuentoPct: 0, exento: false, meses: null }], notas: null, empresa: { ...datos(EMPRESAS[0]).empresa, datosBancarios: null, pie: null } }));
assert.ok(!simple.includes("Datos para el pago") && !simple.includes("Observaciones") && !simple.includes("<th class=\"n\">Desc.</th>"));

// Un logo que no sea un PNG en base64 se descarta (no se puede colar un atributo).
assert.ok(!htmlDeCotizacion(datos(EMPRESAS[0], { logo: 'data:image/png;base64,AAA" onerror="x' })).includes("onerror"));
assert.ok(htmlDeCotizacion(datos(EMPRESAS[0], { logo: "data:image/png;base64,iVBORw0KGgo=" })).includes('<img src="data:image/png;base64,iVBORw0KGgo="'));

// Vigencia y condiciones.
assert.equal(vigenteHasta("2026-11-10", 30), "2026-12-10");
const cond = condicionesDelDocumento(datos(EMPRESAS[0]));
assert.ok(cond.some((c) => c.etiqueta === "Forma de pago" && /30 días/.test(c.texto)), "sin forma de pago escrita, sale la de los días");
assert.ok(cond.some((c) => c.etiqueta === "Facturación" && /orden de compra \(OC\) y hoja de entrada de servicio \(HES\)/.test(c.texto)));
assert.ok(condicionesDelDocumento(datos(EMPRESAS[0], { formaPago: "50 % anticipo" })).some((c) => c.texto === "50 % anticipo"));
assert.ok(condicionesDelDocumento(datos(EMPRESAS[0], { condicionPagoDias: 0, formaPago: null })).some((c) => /Contado/.test(c.texto)));

// Pie con paginación, y el texto de la empresa escapado.
const pie = pieDeCotizacion(datos(EMPRESAS[1], { empresa: { ...datos(EMPRESAS[1]).empresa, pie: "<script>x</script>" } }));
assert.ok(pie.includes("pageNumber") && pie.includes("totalPages") && !pie.includes("<script>"));

// Correo: sale de la cotización.
const m = mensajeDeCotizacion(datos(EMPRESAS[0]));
assert.ok(m.startsWith("Estimado/a María Pérez:") && m.includes("$3.463.000") && m.includes("hasta el 10-12-2026") && m.includes("Hugo Pérez"));
assert.ok(m.includes("Plazo de entrega: 10 días hábiles"));
assert.equal(asuntoDeCotizacion(datos(EMPRESAS[0], { version: 2 })), "Cotización COT-000123 V2 · Mantención mensual de chancadores <planta Norte> — Performance Technologies SpA");
assert.ok(mensajeDeCotizacion(datos(EMPRESAS[0], { atencion: null })).startsWith("Estimados de Minera Los Andes S.A.:"));
assert.ok(mensajeDeCotizacion(datos(EMPRESAS[0], { lineas: Array.from({ length: 8 }, (_, i) => ({ productoId: null, descripcion: `Ítem ${i + 1}`, cantidad: 1, unidad: "un", precioUnitario: 1000, descuentoPct: 0, exento: false, meses: null })) })).includes("y 3 más"));

// Arriendo: tarifa mensual × meses.
const arr = htmlDeCotizacion(datos(EMPRESAS[0], { tipo: "arriendo", lineas: [{ productoId: null, descripcion: "Grupo electrógeno", cantidad: 1, unidad: "un", precioUnitario: 800_000, descuentoPct: 0, exento: false, meses: 6 }] }));
assert.ok(arr.includes("6 meses de arriendo") && arr.includes("$4.800.000") && arr.includes("Tarifa"));

// Las rutas con navegador están declaradas en next.config (si no, falla recién en Vercel).
const cfg = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
for (const ruta of ["pdf", "enviar"]) assert.ok(cfg.includes(`"/api/leads/cotizaciones/\\\\[id\\\\]/${ruta}": [...NAVEGADOR`), `next.config: falta la entrada de ${ruta}`);

console.log("✓ PDF y correo de la cotización: 3 empresas, escapes, totales, condiciones y rutas con navegador");

if (process.env.PDF_SALIDA) {
  const { chromium } = await import("playwright");
  const nav = await chromium.launch({ headless: true, executablePath: process.env.CHROME_RUTA || undefined });
  for (const e of EMPRESAS) {
    const d = datos(e);
    const logo = readFileSync(new URL(`../public/empresas/${e.slug}-completo.png`, import.meta.url)).toString("base64");
    const page = await nav.newPage();
    await page.setContent(htmlDeCotizacion({ ...d, logo: `data:image/png;base64,${logo}` }), { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: `${process.env.PDF_SALIDA}/${e.slug}.pdf`, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: pieDeCotizacion(d), margin: { top: "8mm", bottom: "16mm", left: "0", right: "0" } });
  }
  await nav.close();
  console.log(`PDF de ejemplo en ${process.env.PDF_SALIDA}`);
}
