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
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { extraerTexto } from "../lib/cotizador/obra/extraer-texto";
import { formatoDe, FORMATOS_ACEPTADOS } from "../lib/cotizador/obra/formatos";

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
  PDF     leído como TEXTO con pdf-parse: la misma oferta baja de ~20.000 tokens
          (una imagen por página) a ~1.500. Un PDF escaneado no tiene texto y ahí
          sí va como imagen — lo decide lib/ofertas/leer.ts por caracteres/página.
`);
console.log("Todas las verificaciones pasaron.");

// ── El PDF, leído como texto ─────────────────────────────────────────────────
//
// Un borrador en PDF se manda como TEXTO y no como documento: como documento, la
// API procesa una imagen por página y esa entrada enorme dejaba al modelo sin
// techo de salida, con la lectura cortada. Acá se comprueba con un PDF de verdad
// —generado con la misma plantilla que imprime el sistema— que el texto sale, que
// las cifras sobreviven y que el volumen es el que se espera.
const pdfDePrueba = process.env.PDF_DE_PRUEBA;
if (pdfDePrueba) {
  const { extraerTextoDePdf } = await import("../lib/cotizador/obra/extraer-texto");
  const { texto, paginas, porPagina } = await extraerTextoDePdf(readFileSync(pdfDePrueba));
  const caracteresPorPagina = Math.round(texto.length / paginas);

  assert.ok(paginas > 0, "pdf-parse tiene que reportar las páginas");
  assert.equal(porPagina.length, paginas, "el texto tiene que venir separado por página");
  assert.ok(
    caracteresPorPagina > 150,
    `una página con datos tiene más de 150 caracteres, tuvo ${caracteresPorPagina}`,
  );
  // El texto completo es la unión de las páginas: si no, el marcador de imagen
  // quedaría en una página distinta de la que le corresponde.
  for (const [i, textoDePagina] of porPagina.entries()) {
    const muestra = textoDePagina.trim().slice(0, 40);
    if (muestra) assert.ok(texto.includes(muestra), `la página ${i + 1} tiene que estar en el texto`);
  }
  console.log(
    `  PDF real   ${paginas} páginas → ${texto.length} caracteres ` +
      `(~${Math.round(texto.length / 4)} tokens, ${caracteresPorPagina} por página)`,
  );
} else {
  console.log("  PDF real  omitido (definí PDF_DE_PRUEBA con la ruta de un PDF para ejercitarlo)");
}

// ── El predictor PNG, que es la parte más fácil de escribir mal ──────────────
//
// Un PDF puede guardar cada fila de una imagen como la diferencia respecto de la
// fila de arriba, con un byte al principio que dice qué diferencia se usó. Si eso
// no se deshace, cada fila queda corrida un byte respecto de la anterior y la
// imagen sale rayada en diagonal. Se probó al revés: se filtra a mano una imagen
// conocida y se comprueba que vuelve idéntica.
{
  const { deshacerPredictorPng } = await import("../lib/cotizador/obra/extraer-imagenes-pdf");
  const ancho = 4;
  const alto = 3;
  const canales = 3;
  const original = Buffer.from([
    10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 111, 121, 12,
    22, 32, 42, 52, 62, 72, 82, 92, 102, 112, 122,
  ]);
  const bytesPorFila = ancho * canales;

  // Filtro 2 (Up): cada byte guardado es la diferencia con el de la fila anterior.
  const filtrado: number[] = [];
  for (let fila = 0; fila < alto; fila++) {
    filtrado.push(2);
    for (let i = 0; i < bytesPorFila; i++) {
      const actual = original[fila * bytesPorFila + i];
      const arriba = fila === 0 ? 0 : original[(fila - 1) * bytesPorFila + i];
      filtrado.push((actual - arriba) & 0xff);
    }
  }

  const recuperado = deshacerPredictorPng(Buffer.from(filtrado), ancho, canales, 8);
  assert.ok(recuperado, "el predictor tiene que poder deshacerse");
  assert.deepEqual([...recuperado!], [...original], "y devolver la imagen idéntica");

  // Filtro 1 (Sub): la diferencia es con el píxel de la izquierda.
  const conSub: number[] = [];
  for (let fila = 0; fila < alto; fila++) {
    conSub.push(1);
    for (let i = 0; i < bytesPorFila; i++) {
      const actual = original[fila * bytesPorFila + i];
      const izquierda = i >= canales ? original[fila * bytesPorFila + i - canales] : 0;
      conSub.push((actual - izquierda) & 0xff);
    }
  }
  assert.deepEqual(
    [...deshacerPredictorPng(Buffer.from(conSub), ancho, canales, 8)!],
    [...original],
    "el filtro Sub también",
  );

  // Un tipo de filtro que no existe se rechaza en vez de devolver basura.
  assert.equal(deshacerPredictorPng(Buffer.from([9, 0, 0, 0]), 1, 3, 8), null);
  console.log("  Predictor  filtros Up y Sub deshechos, tipo inválido rechazado");
}

// ── Las imágenes de un PDF de verdad ────────────────────────────────────────
if (pdfDePrueba) {
  const { extraerImagenesDePdf } = await import("../lib/cotizador/obra/extraer-imagenes-pdf");
  const sharp = (await import("sharp")).default;
  const imagenes = await extraerImagenesDePdf(readFileSync(pdfDePrueba));

  for (const imagen of imagenes) {
    const info = await sharp(imagen.contenido).metadata();
    assert.ok(info.width && info.width > 0, "cada imagen extraída tiene que abrirse");
    assert.ok(imagen.pagina && imagen.pagina > 0, "y saber en qué página estaba");
    assert.ok(["png", "jpeg"].includes(info.format ?? ""), "y ser PNG o JPEG");
  }
  const indices = imagenes.map((i) => i.indice);
  assert.deepEqual(
    indices,
    [...indices].sort((a, b) => a - b),
    "los índices van en orden de dibujo",
  );
  console.log(`  PDF real   ${imagenes.length} imagen(es) reconstruidas y abiertas sin error`);
}
