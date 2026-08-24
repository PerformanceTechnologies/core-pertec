import "server-only";
import pdfParse from "pdf-parse";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { FormatoPropuesta } from "./formatos";

/**
 * De un archivo de oferta al texto que se le manda al modelo.
 *
 * Un PDF puede ir de dos formas y la diferencia es de dos órdenes de magnitud.
 * Como documento, la API lo procesa entero —texto MÁS una imagen de cada página—
 * y las 11 páginas de la OS-10 son ~20.000 tokens de entrada, de los cuales el
 * 85% son las imágenes de la portada, el índice y el anexo de fotos: páginas que
 * no tienen ningún dato. Como texto extraído acá, la misma oferta son ~1.500.
 *
 * Y eso no es solo ahorro: esa entrada enorme era la que hacía que el modelo se
 * quedara sin techo de salida y la lectura saliera cortada a la mitad.
 *
 * Lo que se pierde es la disposición: en un PDF las columnas de una tabla vienen
 * pegadas ("ÍTCANTCARGOUNV. UNITV. TOTAL") y hay que inferirlas por el orden. El
 * modelo lo hace bien y las instrucciones lo advierten; y para el caso donde el
 * texto no existe —un PDF escaneado, que es una foto— quien llama decide mandarlo
 * como documento (ver lib/ofertas/leer.ts).
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
 * PDF → texto, página por página.
 *
 * Se devuelve el texto SEPARADO por página y no como un bloque, porque en un PDF
 * es lo único que ubica a las imágenes: se extraen aparte (ver
 * ./extraer-imagenes-pdf.ts) y de ellas se sabe en qué página se dibujan, no en
 * qué punto del párrafo. Con el texto por página, el marcador [IMAGEN n] se puede
 * poner al final de la página donde estaba, que es una aproximación buena: las
 * fotos del anexo están en las páginas del anexo y el membrete en la primera.
 *
 * La cantidad de páginas también sirve para decidir si el texto alcanza: un PDF
 * escaneado devuelve casi nada por página y ahí hay que mirarlo, no leerlo.
 *
 * El render por página replica el de pdf-parse —un salto de línea cuando cambia la
 * coordenada Y— porque su implementación no está expuesta y la necesitamos igual
 * para no cambiar cómo se lee el texto.
 */
export async function extraerTextoDePdf(
  buffer: Buffer,
): Promise<{ texto: string; paginas: number; porPagina: string[] }> {
  const porPagina: string[] = [];

  const resultado = await pdfParse(buffer, {
    pagerender: async (pagina: {
      getTextContent: (opciones: unknown) => Promise<{ items: { str: string; transform: number[] }[] }>;
    }) => {
      const contenido = await pagina.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      let ultimaY: number | undefined;
      let texto = "";
      for (const item of contenido.items) {
        texto += ultimaY === item.transform[5] || ultimaY === undefined ? item.str : `\n${item.str}`;
        ultimaY = item.transform[5];
      }
      porPagina.push(texto);
      return texto;
    },
  } as Parameters<typeof pdfParse>[1]);

  return { texto: resultado.text.trim(), paginas: resultado.numpages, porPagina };
}

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
/** Una imagen incrustada en el borrador, en el orden en que aparece. */
export interface ImagenExtraida {
  /** 1, 2, 3… El mismo número que el marcador [IMAGEN n] del texto. */
  indice: number;
  /** El nombre dentro del archivo: "image4.png". Sirve para diagnosticar. */
  nombre: string;
  contenido: Buffer;
  /**
   * En qué página se dibuja. Solo la saben los PDF.
   *
   * En un .docx el marcador va en su lugar exacto dentro del texto y esto no hace
   * falta; en un PDF el texto y las imágenes se extraen por caminos distintos y la
   * página es lo único que las ubica.
   */
  pagina?: number;
}

/**
 * Word → texto e imágenes.
 *
 * Las imágenes salen EN ORDEN y el texto lleva un marcador `[IMAGEN n]` en el
 * lugar donde estaban. Eso es lo que hace que después se puedan repartir bien: el
 * modelo ve "Por Performance Services [IMAGEN 9] Alfonso Hachim Fulgeri" y sabe
 * que esa imagen es la firma, y ve las que caen bajo "Fotografías de referencia
 * incluidas" y sabe que son del anexo. Sin el marcador, un puñado de imágenes
 * sueltas no se puede ubicar.
 *
 * El rId de cada `a:blip` se resuelve contra word/_rels/document.xml.rels, que es
 * el que dice qué archivo de word/media/ le corresponde.
 */
async function wordATextoEImagenes(buffer: Buffer): Promise<{ texto: string; imagenes: ImagenExtraida[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const documento = zip.file("word/document.xml");
  if (!documento) {
    throw new Error("El .docx no tiene word/document.xml: puede estar corrupto o no ser un Word.");
  }

  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false });
  const relaciones = await mapaDeRelaciones(zip, parser);
  const arbol = parser.parse(await documento.async("string")) as NodoOrdenado[];

  const cuerpo = hijosDe(hijosDe(arbol, "w:document"), "w:body");
  const partes: string[] = [];
  // Los rId en orden de aparición: el mismo archivo puede estar dos veces y cada
  // aparición es un marcador distinto.
  const enOrden: string[] = [];

  for (const nodo of cuerpo) {
    if ("w:p" in nodo) {
      const texto = textoDeParrafoWord(nodo["w:p"] as NodoOrdenado[], enOrden);
      if (texto) partes.push(texto);
    } else if ("w:tbl" in nodo) {
      partes.push("", ...filasDeTablaWord(nodo["w:tbl"] as NodoOrdenado[]), "");
    }
  }

  const imagenes: ImagenExtraida[] = [];
  for (const [i, rId] of enOrden.entries()) {
    const ruta = relaciones.get(rId);
    if (!ruta) continue;
    const archivo = zip.file(`word/${ruta}`);
    if (!archivo) continue;
    imagenes.push({
      indice: i + 1,
      nombre: ruta.split("/").pop() ?? ruta,
      contenido: Buffer.from(await archivo.async("arraybuffer")),
    });
  }

  return {
    texto: partes
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    imagenes,
  };
}

/** rId → "media/image4.png", desde word/_rels/document.xml.rels. */
async function mapaDeRelaciones(zip: JSZip, parser: XMLParser): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const rels = zip.file("word/_rels/document.xml.rels");
  if (!rels) return mapa;

  const arbol = parser.parse(await rels.async("string")) as NodoOrdenado[];
  for (const nodo of hijosDe(arbol, "Relationships")) {
    if (!("Relationship" in nodo)) continue;
    const atributos = (nodo[":@"] ?? {}) as Record<string, string>;
    if (!String(atributos["@_Type"] ?? "").endsWith("/image")) continue;
    // Un Target externo (una imagen enlazada, no incrustada) no está en el zip.
    if (atributos["@_TargetMode"] === "External") continue;
    mapa.set(atributos["@_Id"], atributos["@_Target"]);
  }
  return mapa;
}

/** Los rId de las imágenes de un run, en orden, buscando en profundidad. */
function rIdsDeImagenes(nodo: unknown, encontrados: string[]): void {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) rIdsDeImagenes(hijo, encontrados);
    return;
  }
  if (!nodo || typeof nodo !== "object") return;

  for (const [clave, valor] of Object.entries(nodo as Record<string, unknown>)) {
    if (clave === ":@") continue;
    if (clave === "a:blip") {
      const atributos = ((nodo as Record<string, unknown>)[":@"] ?? {}) as Record<string, string>;
      const rId = atributos["@_r:embed"];
      if (rId) encontrados.push(rId);
      continue;
    }
    rIdsDeImagenes(valor, encontrados);
  }
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
function textoDeParrafoWord(parrafo: NodoOrdenado[], imagenes?: string[]): string {
  const fragmentos: string[] = [];

  for (const nodo of parrafo) {
    const run = hijos(nodo, "w:r");
    if (!run) continue;

    for (const hijo of run) {
      // Una imagen deja un marcador en el texto, en su lugar exacto: es lo que
      // permite después decir cuál es la firma y cuáles las fotos del anexo.
      if (imagenes && "w:drawing" in hijo) {
        const antes = imagenes.length;
        rIdsDeImagenes(hijo["w:drawing"], imagenes);
        for (let i = antes; i < imagenes.length; i++) fragmentos.push(` [IMAGEN ${i + 1}] `);
        continue;
      }
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

/**
 * El texto de un Excel o un Word, con las imágenes del Word si trae.
 *
 * El texto de un Word lleva marcadores `[IMAGEN n]` donde estaban las imágenes.
 * Quien no las use puede pedir el texto limpio con `extraerTexto`, que es lo que
 * hace el importador del Cotizador: ahí los marcadores serían ruido.
 */
export async function extraerDeArchivo(
  buffer: Buffer,
  formato: Exclude<FormatoPropuesta, "pdf">,
  nombreArchivo: string,
): Promise<{ texto: string; imagenes: ImagenExtraida[] }> {
  const leido =
    formato === "excel"
      ? { texto: await excelATexto(buffer), imagenes: [] as ImagenExtraida[] }
      : await wordATextoEImagenes(buffer);

  if (leido.texto.replace(/[\s|#]/g, "").replace(/\[IMAGEN \d+\]/g, "").length < 40) {
    throw new Error(
      `"${nombreArchivo}" no tiene texto legible: puede estar vacío, ser un archivo de imágenes ` +
        "o venir protegido. Si la oferta está escaneada, súbela como PDF.",
    );
  }
  return leido;
}

/** El texto solo, sin los marcadores de imagen. Un PDF no pasa por acá. */
export async function extraerTexto(
  buffer: Buffer,
  formato: Exclude<FormatoPropuesta, "pdf">,
  nombreArchivo: string,
): Promise<string> {
  const { texto } = await extraerDeArchivo(buffer, formato, nombreArchivo);
  return texto.replace(/\s*\[IMAGEN \d+\]\s*/g, " ").replace(/[ \t]{2,}/g, " ");
}
