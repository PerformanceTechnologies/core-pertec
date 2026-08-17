/**
 * Prueba de la extracción de texto de Excel y Word.
 *
 * Arma un .xlsx y un .docx con la misma oferta OS 010-2026 —encabezado con
 * celdas combinadas, la tabla empezando en la fila 23, fórmulas con y sin
 * resultado, y una segunda hoja de memoria de cálculo— y verifica que el texto
 * que se le manda al modelo traiga lo que importa.
 *
 * Correr con:  npm run probar-extraccion
 */

import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { extraerTexto, formatoDe, FORMATOS_ACEPTADOS } from "../lib/cotizador/obra/extraer-texto";

const TOTAL = 15_885_200;
const LINEA =
  "Traslado de rollos desde bodega a puntos de trabajo CT-6 y CT-7. Incluye: 01 grúa de 30 ton y " +
  "cama baja, incluye Operador, Supervisor, Asesor HSEC, Rigger, combustible y movilización.";

// ── Un Excel como los que llegan de verdad ──────────────────────────────────
async function armarExcel(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("Oferta");
  h.mergeCells("A1:F1");
  h.getCell("A1").value = "PERFORMANCE TECHNOLOGIES SpA — OFERTA TÉCNICA Y ECONÓMICA";
  h.getCell("A3").value = "Oferta N°";
  h.getCell("B3").value = "OS 010 – 2026";
  h.getCell("A4").value = "Fecha";
  h.getCell("B4").value = new Date("2026-08-11T00:00:00Z");
  h.getCell("A5").value = "Cliente";
  h.getCell("B5").value = "AXINNTUS SERVICIOS INDUSTRIALES";
  h.getCell("A10").value = "Turnos";
  h.getCell("B10").value = 1;
  h.getCell("A11").value = "Horas por turno";
  h.getCell("B11").value = 10;
  h.getRow(14).values = ["Cargo", "Dotación", "Régimen"];
  h.getRow(15).values = ["Especialista vulcanizador", 3, "Turno de día — 10 h"];
  // Fórmula CON resultado: se muestra el resultado.
  h.getCell("A20").value = "Total";
  h.getCell("B20").value = { formula: "SUM(B15:B19)", result: 7 };
  h.getRow(23).values = ["Ít", "Cant", "Cargo", "Un", "V. Unit", "V. Total"];
  h.getRow(24).values = [1, 1, LINEA, "Global", TOTAL, { formula: "B24*E24", result: TOTAL }];
  // Fórmula SIN recalcular: tiene que salir vacía, no la fórmula.
  h.getCell("E26").value = "TOTAL NETO";
  h.getCell("F26").value = { formula: "SUM(F24:F25)" } as ExcelJS.CellFormulaValue;
  const m = libro.addWorksheet("Memoria de cálculo");
  m.getRow(1).values = ["Referencia interna", "no es el cuadro de precios de esta oferta"];
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ── Un Word con dos tablas ──────────────────────────────────────────────────
async function armarWord(): Promise<Buffer> {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const par = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  const tabla = (filas: string[][]) =>
    `<w:tbl>${filas
      .map((f) => `<w:tr>${f.map((c) => `<w:tc>${par(c)}</w:tc>`).join("")}</w:tr>`)
      .join("")}</w:tbl>`;

  const cuerpo = [
    par("OFERTA TÉCNICA Y ECONÓMICA"),
    par("Oferta N° OS 010 – 2026 · Cliente: AXINNTUS SERVICIOS INDUSTRIALES"),
    par("El servicio se ejecuta en 01 turno de trabajo de 10 horas."),
    tabla([
      ["Cargo", "Dotación"],
      ["Especialista vulcanizador", "3"],
      ["Total", "7"],
    ]),
    par("6.1 CUADRO DE PRECIOS"),
    tabla([
      ["Ít", "Cant", "Cargo", "Un", "V. Total"],
      ["1", "01", LINEA, "Global", "$ 15.885.200.-"],
      ["", "", "TOTAL NETO — NO INCLUYE IVA", "", "$ 15.885.200.-"],
    ]),
  ].join("");

  const zip = new JSZip();
  zip
    .folder("word")!
    .file(
      "document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`,
    );
  return zip.generateAsync({ type: "nodebuffer" });
}

// ── Formato: por MIME y por extensión ───────────────────────────────────────
assert.equal(formatoDe("application/pdf", "a.pdf"), "pdf");
assert.equal(
  formatoDe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "a.xlsx"),
  "excel",
);
// Windows manda octet-stream: tiene que salvarlo la extensión.
assert.equal(formatoDe("application/octet-stream", "OFERTA.XLSX"), "excel");
assert.equal(formatoDe("application/octet-stream", "oferta.docx"), "word");
assert.equal(formatoDe("image/png", "captura.png"), null);
assert.ok(FORMATOS_ACEPTADOS.includes(".xlsx") && FORMATOS_ACEPTADOS.includes(".docx"));

// ── Excel ───────────────────────────────────────────────────────────────────
const excel = await extraerTexto(await armarExcel(), "excel", "os10.xlsx");

assert.ok(excel.includes("## HOJA: Oferta"), "cada hoja va rotulada");
// Un título combinado sobre 6 columnas no puede llegar 6 veces.
const vecesTitulo = excel.split("PERFORMANCE TECHNOLOGIES SpA").length - 1;
assert.equal(vecesTitulo, 1, `el título combinado apareció ${vecesTitulo} veces`);
assert.ok(excel.includes("## HOJA: Memoria de cálculo"), "la segunda hoja también, para poder distinguirla");
assert.ok(excel.includes("OS 010 – 2026"), "el número de oferta, tal como está escrito");
assert.ok(excel.includes("2026-08-11"), "una fecha sale como fecha, no como número de serie de Excel");
assert.ok(excel.includes(String(TOTAL)), "el monto");
assert.ok(excel.includes(LINEA), "la descripción completa de la línea");
assert.ok(excel.includes("Total | 7"), "una fórmula con resultado muestra el resultado");
// La fórmula sin recalcular NO puede llegar como fórmula: el modelo trataría de resolverla.
assert.ok(!excel.includes("SUM("), "una fórmula nunca se manda como fórmula");
assert.ok(/TOTAL NETO(\s*\|)?\s*$/m.test(excel), "una fórmula sin recalcular queda vacía, no inventada");

// ── Word ────────────────────────────────────────────────────────────────────
const word = await extraerTexto(await armarWord(), "word", "os10.docx");

assert.ok(word.includes("OFERTA TÉCNICA Y ECONÓMICA"), "los párrafos");
assert.ok(word.includes("OS 010 – 2026"), "el número de oferta");
assert.ok(word.includes("Especialista vulcanizador | 3"), "las filas de tabla con el mismo separador");
assert.ok(word.includes(LINEA), "la línea de precio completa");
assert.ok(word.includes("$ 15.885.200.-"), "el monto tal como está escrito");
assert.ok(!word.includes("<w:"), "nada de XML crudo");

// El ORDEN del documento es información: el título dice cuál tabla es el cuadro
// de precios. Agrupar los párrafos y después las tablas lo perdería.
const posTitulo = word.indexOf("6.1 CUADRO DE PRECIOS");
const posDotacion = word.indexOf("Especialista vulcanizador | 3");
const posPrecio = word.indexOf("$ 15.885.200.-");
assert.ok(posDotacion < posTitulo, "la tabla de personal va ANTES del título del cuadro de precios");
assert.ok(posTitulo < posPrecio, "el cuadro de precios va DESPUÉS de su título");

// ── Un archivo sin texto legible se rechaza, no se manda vacío ──────────────
const vacio = new ExcelJS.Workbook();
vacio.addWorksheet("Hoja1");
const excelVacio = Buffer.from(await vacio.xlsx.writeBuffer());
const zipSinDocumento = await new JSZip().generateAsync({ type: "nodebuffer" });

await assert.rejects(() => extraerTexto(excelVacio, "excel", "vacia.xlsx"), /no tiene texto legible/);
await assert.rejects(() => extraerTexto(zipSinDocumento, "word", "raro.docx"), /word\/document\.xml/);

// ── Cuánto cuesta cada formato ──────────────────────────────────────────────
const aprox = (t: string) => Math.round(t.length / 3.3);
console.log(`
Extracción — misma oferta OS 010-2026 en tres formatos

  Excel   ${excel.length} caracteres  ≈ ${aprox(excel)} tokens
  Word    ${word.length} caracteres  ≈ ${aprox(word)} tokens
  PDF     11 páginas → ~3.500 tokens de texto + una imagen por página (~20.000 en total)
`);
console.log("Todas las verificaciones pasaron.");
