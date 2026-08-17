import "server-only";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { FormatoPropuesta } from "./formatos";

/**
 * De un archivo de oferta al texto que se le manda al modelo.
 *
 * Un PDF NO pasa por acá: se manda como documento y la API lo procesa entera —
 * texto más una imagen de cada página. Eso es lo correcto para un PDF, donde la
 * tabla está dibujada y hay que verla, pero cuesta caro: las 11 páginas de la
 * OS-10 son ~20.000 tokens de entrada, y el 85% son las imágenes de la portada,
 * el índice y el anexo de fotos.
 *
 * Un Excel y un Word no tienen páginas que rasterizar, y la API tampoco los
 * acepta como documento —los tipos son PDF, texto plano y bloques de contenido—,
 * así que el servidor los abre y manda las celdas y los párrafos como texto. La
 * misma oferta, en Excel, son ~300 tokens.
 *
 * Con "server-only" a propósito: importa exceljs y jszip, y un componente cliente
 * que le pidiera aunque sea una constante se llevaría ExcelJS entero al bundle
 * del navegador. Lo que el cliente necesita —la lista de formatos aceptados—
 * vive en ./formatos.ts, que no importa nada pesado.
 *
 * Lo que se extrae acá es SOLO texto: nada se interpreta, nada se calcula, nada
 * se descarta por parecer irrelevante. Interpretar es tarea del modelo y
 * calcular del servidor (ver ./importar.ts). Si esta función decidiera qué filas
 * importan, un formato distinto al esperado perdería datos en silencio.
 */

/**
 * Excel → texto.
 *
 * Cada hoja va rotulada y cada fila con las celdas separadas por " | ". El
 * rótulo de hoja importa: una planilla suele traer la oferta en una hoja y la
 * memoria de cálculo en otra, y sin el rótulo el modelo mezcla las dos.
 *
 * Se usa el texto MOSTRADO de cada celda, no su fórmula: a una celda con
 * `=SUMA(...)` le interesa el resultado. Cuando la planilla nunca se recalculó
 * ese resultado no existe y la celda sale vacía — es exactamente lo que hay que
 * mostrar, porque el dato no está en el archivo, y la verificación de
 * construirObra lo detecta como descuadre en vez de inventarlo.
 */
async function excelATexto(buffer: Buffer): Promise<string> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);

  const partes: string[] = [];

  libro.eachSheet((hoja) => {
    // Una hoja oculta suele ser la memoria de cálculo o una lista de validación:
    // se incluye igual, rotulada, porque a veces ahí está el precio.
    partes.push(`## HOJA: ${hoja.name}${hoja.state === "hidden" ? " (oculta)" : ""}`);

    hoja.eachRow({ includeEmpty: false }, (fila) => {
      const celdas: string[] = [];
      fila.eachCell({ includeEmpty: true }, (celda) => {
        celdas.push(textoDeCelda(celda));
      });

      // Se recortan las celdas vacías del final, no las del medio: una vacía
      // entre dos con datos es una columna real de la tabla y sacarla corre las
      // demás de lugar.
      while (celdas.length > 0 && celdas[celdas.length - 1] === "") celdas.pop();
      if (celdas.length > 0) partes.push(celdas.join(" | "));
    });

    partes.push("");
  });

  return partes.join("\n").trim();
}

/** El valor mostrado de una celda, como texto de una línea. */
function textoDeCelda(celda: ExcelJS.Cell): string {
  // Una celda combinada devuelve el valor del ancla en TODAS las celdas del
  // rango, así que un título combinado sobre seis columnas llega repetido seis
  // veces. Se emite solo en el ancla.
  if (celda.isMerged && celda.master !== celda) return "";

  const valor = celda.value;
  if (valor === null || valor === undefined) return "";

  // Una fórmula trae su resultado en `result`. Si la planilla nunca se
  // recalculó, no hay resultado: se deja vacío en vez de mandar la fórmula, que
  // el modelo trataría de resolver — y calcular no es su trabajo.
  if (typeof valor === "object" && "formula" in valor) {
    const resultado = (valor as ExcelJS.CellFormulaValue).result;
    return resultado === null || resultado === undefined ? "" : String(resultado);
  }
  if (typeof valor === "object" && "richText" in valor) {
    return (valor as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
  }
  if (typeof valor === "object" && "text" in valor) {
    return String((valor as ExcelJS.CellHyperlinkValue).text ?? "");
  }
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object" && "error" in valor) return "";

  // Los saltos de línea dentro de una celda romperían el formato de filas.
  return String(valor)
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/**
 * Word → texto.
 *
 * Sin dependencia nueva de conversión: un .docx es un zip cuyo
 * `word/document.xml` trae el documento, así que se descomprime y se leen los
 * párrafos y las tablas. Las tablas son lo que importa —el cuadro de precios y
 * el de personal viven ahí— y se emiten con el mismo " | " que el Excel para que
 * el modelo vea la misma forma en los tres formatos.
 *
 * Se lee con `preserveOrder` porque el ORDEN es información: un documento
 * alterna párrafos y tablas, y el título "6.1 CUADRO DE PRECIOS" es lo que dice
 * cuál de las tablas es el cuadro de precios. Sin preservar el orden, el parser
 * agrupa por nombre de nodo —todos los párrafos juntos y todas las tablas
 * juntas—, los títulos quedan lejos de sus tablas y una oferta con dos tablas se
 * vuelve ambigua justo donde no puede serlo.
 */
async function wordATexto(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documento = zip.file("word/document.xml");
  if (!documento) {
    throw new Error("El .docx no tiene word/document.xml: puede estar corrupto o no ser un Word.");
  }

  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false });
  const arbol = parser.parse(await documento.async("string")) as NodoOrdenado[];

  const cuerpo = hijosDe(hijosDe(arbol, "w:document"), "w:body");
  const partes: string[] = [];
  for (const nodo of cuerpo) {
    if ("w:p" in nodo) {
      const texto = textoDeParrafoWord(nodo["w:p"] as NodoOrdenado[]);
      if (texto) partes.push(texto);
    } else if ("w:tbl" in nodo) {
      partes.push("", ...filasDeTablaWord(nodo["w:tbl"] as NodoOrdenado[]), "");
    }
  }

  return partes
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Un nodo en modo `preserveOrder`: un objeto con una sola clave —el nombre del
 * elemento— cuyo valor es la lista ordenada de sus hijos.
 */
type NodoOrdenado = Record<string, unknown>;

function hijos(nodo: NodoOrdenado, nombre: string): NodoOrdenado[] | null {
  const valor = nodo[nombre];
  return Array.isArray(valor) ? (valor as NodoOrdenado[]) : null;
}

/**
 * Los hijos del primer nodo con ese nombre, dentro de una lista ordenada.
 *
 * Hace falta buscar en vez de indexar porque el primer elemento del árbol es la
 * declaración `<?xml?>`, no el documento.
 */
function hijosDe(nodos: NodoOrdenado[], nombre: string): NodoOrdenado[] {
  for (const nodo of nodos) {
    const encontrado = hijos(nodo, nombre);
    if (encontrado) return encontrado;
  }
  return [];
}

/** Las filas de una tabla, cada una con sus celdas separadas por " | ". */
function filasDeTablaWord(tabla: NodoOrdenado[]): string[] {
  const filas: string[] = [];

  for (const nodo of tabla) {
    const fila = hijos(nodo, "w:tr");
    if (!fila) continue;

    const celdas: string[] = [];
    for (const nodoCelda of fila) {
      const celda = hijos(nodoCelda, "w:tc");
      if (!celda) continue;
      // Una celda puede tener varios párrafos: se juntan en una línea para no
      // partir la fila de la tabla.
      const texto = celda
        .map((h) => ("w:p" in h ? textoDeParrafoWord(h["w:p"] as NodoOrdenado[]) : ""))
        .filter(Boolean)
        .join(" ")
        .trim();
      celdas.push(texto);
    }

    while (celdas.length > 0 && celdas[celdas.length - 1] === "") celdas.pop();
    if (celdas.some((c) => c !== "")) filas.push(celdas.join(" | "));
  }

  return filas;
}

/** El texto de un párrafo: la concatenación de sus fragmentos, en orden. */
function textoDeParrafoWord(parrafo: NodoOrdenado[]): string {
  const fragmentos: string[] = [];

  for (const nodo of parrafo) {
    const run = hijos(nodo, "w:r");
    if (!run) continue;

    for (const hijo of run) {
      if ("w:t" in hijo) {
        // En modo preserveOrder el texto viene como [{ "#text": "..." }].
        for (const t of (hijo["w:t"] as NodoOrdenado[]) ?? []) {
          const valor = t["#text"];
          if (valor !== undefined) fragmentos.push(String(valor));
        }
      } else if ("w:br" in hijo || "w:tab" in hijo) {
        fragmentos.push(" ");
      }
    }
  }

  return fragmentos.join("").replace(/\s+/g, " ").trim();
}

/** El texto de un Excel o un Word. Un PDF no pasa por acá. */
export async function extraerTexto(
  buffer: Buffer,
  formato: Exclude<FormatoPropuesta, "pdf">,
  nombreArchivo: string,
): Promise<string> {
  const texto = formato === "excel" ? await excelATexto(buffer) : await wordATexto(buffer);

  if (texto.replace(/[\s|#]/g, "").length < 40) {
    throw new Error(
      `"${nombreArchivo}" no tiene texto legible: puede estar vacío, ser un archivo de imágenes ` +
        "o venir protegido. Si la oferta está escaneada, súbela como PDF.",
    );
  }
  return texto;
}
