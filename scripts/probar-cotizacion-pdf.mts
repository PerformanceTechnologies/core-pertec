/**
 * El PDF y el correo de la cotización de Leads, para las tres empresas del grupo.
 *
 * Correr con:  npm run probar-cotizacion-pdf
 * Con  PDF_SALIDA=/carpeta  además imprime un PDF por empresa (necesita Chromium: `npx playwright install chromium`).
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { condicionesDelDocumento, esc, htmlDeCotizacion, pieDeCotizacion, vigenteHasta, type DatosDocumento } from "../lib/fin/cotizacion-documento";
import { asuntoDeCotizacion, mensajeDeCotizacion } from "../lib/fin/cotizacion-correo";
import { totalesCotizacion } from "../lib/fin/modelo";
import { cuerpoHtml } from "../lib/ofertas/correo-html";

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
    atencion: "María Pérez", tasaIva: 0.19, descuentoGeneral: null, incluirDatosPago: true, condicionPagoDias: 30, formaPago: null, plazoEntrega: "10 días hábiles", requiereOc: true, requiereEdp: false, requiereHes: true, notas: "Incluye repuestos menores.\nNo incluye andamios.",
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
  assert.deepEqual(t, { bruto: 2_950_000, descuento: 0, neto: 2_700_000, exento: 250_000, iva: 513_000, total: 3_463_000 });
  assert.ok(html.includes("$3.463.000") && html.includes("$513.000") && html.includes("Exento"));
  assert.ok(html.includes("Desc."), "con descuento aparece su columna");
  assert.ok(html.includes("Datos para el pago") && html.includes("Banco de Chile"));
  assert.ok(html.includes("10-11-2026") && html.includes("10-12-2026"), "fecha de emisión y de vigencia en dd-mm-aaaa");
}

// Descuento general: se reparte entre lo afecto y lo exento, y el IVA sale solo de lo afecto.
{
  const base = datos(EMPRESAS[0]);
  const pct = totalesCotizacion(base.lineas, 0.19, { tipo: "pct", valor: 10 });
  assert.deepEqual(pct, { bruto: 2_950_000, descuento: 295_000, neto: 2_430_000, exento: 225_000, iva: 461_700, total: 3_116_700 });
  assert.equal(pct.neto + pct.exento + pct.iva, pct.total);
  const monto = totalesCotizacion(base.lineas, 0.19, { tipo: "monto", valor: 100_000 });
  assert.equal(monto.descuento, 100_000);
  assert.equal(monto.neto + monto.exento, 2_850_000);
  // Nunca pasa del 100 % ni deja un neto negativo.
  assert.equal(totalesCotizacion(base.lineas, 0.19, { tipo: "pct", valor: 500 }).total, 0);
  assert.equal(totalesCotizacion(base.lineas, 0.19, { tipo: "monto", valor: 9_999_999_999 }).total, 0);
  assert.deepEqual(totalesCotizacion(base.lineas, 0.19, { tipo: "pct", valor: 0 }), totalesCotizacion(base.lineas, 0.19));
  const h = htmlDeCotizacion({ ...base, descuentoGeneral: { tipo: "pct", valor: 10 } });
  assert.ok(h.includes("Subtotal") && h.includes("Descuento (10%)") && h.includes("−$295.000") && h.includes("$3.116.700"), "el PDF muestra el descuento y el total rebajado");
  assert.ok(!htmlDeCotizacion(base).includes("Descuento (") && !htmlDeCotizacion(base).includes("Subtotal"), "sin descuento general no aparece su línea");
  assert.ok(mensajeDeCotizacion({ ...base, descuentoGeneral: { tipo: "pct", valor: 10 } }).includes("Descuento aplicado: $295.000.") && mensajeDeCotizacion({ ...base, descuentoGeneral: { tipo: "pct", valor: 10 } }).includes("$3.116.700"));
}

// Los datos de pago salen solo si se pidió (apagado por omisión), y «Atención» no lleva «Preparada por».
assert.ok(!htmlDeCotizacion(datos(EMPRESAS[0], { incluirDatosPago: false })).includes("Datos para el pago"));
assert.ok(htmlDeCotizacion(datos(EMPRESAS[0], { incluirDatosPago: true })).includes("Datos para el pago"));
assert.ok(!htmlDeCotizacion(datos(EMPRESAS[0])).includes("Preparada por"));

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

// El correo se arma con párrafos y <br> (no con pre-wrap, que Outlook ignora) y no deja pasar HTML.
{
  const h = cuerpoHtml(mensajeDeCotizacion(datos(EMPRESAS[0])));
  assert.ok(!h.includes("pre-wrap"));
  assert.ok((h.match(/<p /g) ?? []).length >= 6, "un párrafo por bloque del mensaje");
  assert.ok(h.includes("<br>&nbsp;&nbsp;• Mantención preventiva") || h.includes("&nbsp;&nbsp;•"), "las viñetas conservan su sangría");
  assert.ok(h.includes("Estimado/a María Pérez:</p>"));
  assert.equal(cuerpoHtml("a <b>x</b>\r\n\r\nb"), cuerpoHtml("a <b>x</b>\n\nb"));
  assert.ok(cuerpoHtml("a <script>").includes("&lt;script&gt;"));
}

// Arriendo: tarifa mensual × meses.
const arr = htmlDeCotizacion(datos(EMPRESAS[0], { tipo: "arriendo", lineas: [{ productoId: null, descripcion: "Grupo electrógeno", cantidad: 1, unidad: "un", precioUnitario: 800_000, descuentoPct: 0, exento: false, meses: 6 }] }));
assert.ok(arr.includes("6 meses de arriendo") && arr.includes("$4.800.000") && arr.includes("Tarifa"));

// Las rutas con navegador están declaradas en next.config (si no, falla recién en Vercel).
const cfg = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
for (const ruta of ["pdf", "enviar"]) assert.ok(cfg.includes(`"/api/leads/cotizaciones/\\\\[id\\\\]/${ruta}": [...NAVEGADOR`), `next.config: falta la entrada de ${ruta}`);

console.log("✓ PDF y correo de la cotización: 3 empresas, escapes, totales, condiciones y rutas con navegador");

if (process.env.PDF_SALIDA) {
  const { chromium } = await import("playwright");
  const { imprimirCotizacion, ZOOM_MIN } = await import("../lib/fin/cotizacion-impresion");
  const nav = await chromium.launch({ headless: true, executablePath: process.env.CHROME_RUTA || undefined });
  const lineas = (n: number, largas = false) => Array.from({ length: n }, (_, i) => ({ productoId: null, descripcion: largas ? `Servicio de mantención preventiva del equipo ${i + 1}, incluye inspección, lubricación y ajuste de componentes` : `Mantención preventiva del equipo ${i + 1}`, cantidad: 1 + (i % 3), unidad: "un", precioUnitario: 150_000 + i * 10_000, descuentoPct: i % 4 === 0 ? 0.05 : 0, exento: false, meses: null }));
  for (const e of EMPRESAS) {
    const logo = readFileSync(new URL(`../public/empresas/${e.slug}-completo.png`, import.meta.url)).toString("base64");
    for (const [n, esperado, largas] of [[1, 1, false], [2, 1, false], [5, 1, false], [8, 1, false], [11, 1, false], [14, "libre", false], [18, "libre", false], [4, 1, true], [8, "libre", true], [60, "varias", false]] as const) {
      const d = { ...datos(e, { lineas: lineas(n, largas), descuentoGeneral: { tipo: "pct", valor: 10 }, incluirDatosPago: n !== 5 }), logo: `data:image/png;base64,${logo}` };
      const page = await nav.newPage();
      const r = await imprimirCotizacion(page, d);
      // El resto del documento nunca cambia de tamaño: la única regla de zoom es la de la tabla.
      const zoomDeLaPagina = await page.evaluate(() => document.querySelector<HTMLElement>(".pagina")!.style.zoom);
      if (process.env.DIAGNOSTICO) console.log("   filas:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("table.lineas tbody tr")].slice(0, 2).map((tr) => [Math.round(tr.getBoundingClientRect().height), [...tr.children].map((c) => [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height), c.textContent!.trim().slice(0, 25)])]))));
      await page.close();
      writeFileSync(`${process.env.PDF_SALIDA}/${e.slug}-${n}-lineas${largas ? "-largas" : ""}.pdf`, r.pdf);
      console.log(`${e.slug} · ${n} líneas${largas ? " largas" : ""} → ${r.paginas} hoja(s), ${r.modo}, zoom ${r.zoom.toFixed(2)}${r.espacioJusto ? ", márgenes justos" : ""}, ocupa ${Math.round(r.ocupacion * 100)} % de la hoja`);
      if (esperado === 1) {
        assert.equal(r.paginas, 1, `${e.slug} con ${n} líneas${largas ? " largas" : ""} debe caber en una hoja`);
        assert.ok(r.zoom >= ZOOM_MIN, "las filas no se achican por debajo del mínimo legible");
      }
      if (esperado === "varias") assert.ok(r.paginas >= 2 && r.modo === "varias-hojas", `${e.slug} con ${n} líneas sigue en una segunda hoja`);
      // Con pocas líneas NADA se achica: el texto queda como siempre.
      if (n <= 5 && !largas) assert.equal(r.zoom, 1, `${e.slug} con ${n} líneas no debe achicar nada`);
      assert.equal(zoomDeLaPagina, "", "solo la tabla se achica");
    }
  }
  await nav.close();
  console.log(`PDF de ejemplo en ${process.env.PDF_SALIDA}`);
}
