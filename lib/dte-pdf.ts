import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { parsearXmlDte, type DteParseado } from "./xml-dte";

/**
 * Un PDF de una factura armado desde su XML (DTE). Los documentos que vienen de Odoo traen solo el
 * XML firmado, sin PDF, y el visor de Facturas Históricas necesita un PDF para mostrarlos.
 *
 * Se arma con pdf-lib (JavaScript puro) y no con el navegador que usan las cotizaciones: así sale en
 * milisegundos, sin esperar que arranque Chromium en cada apertura.
 */

const NOMBRES_DTE: Record<number, string> = {
  33: "FACTURA ELECTRÓNICA",
  34: "FACTURA NO AFECTA O EXENTA ELECTRÓNICA",
  39: "BOLETA ELECTRÓNICA",
  41: "BOLETA EXENTA ELECTRÓNICA",
  43: "LIQUIDACIÓN FACTURA ELECTRÓNICA",
  46: "FACTURA DE COMPRA ELECTRÓNICA",
  52: "GUÍA DE DESPACHO ELECTRÓNICA",
  56: "NOTA DE DÉBITO ELECTRÓNICA",
  61: "NOTA DE CRÉDITO ELECTRÓNICA",
  110: "FACTURA DE EXPORTACIÓN ELECTRÓNICA",
};

const TINTA = rgb(0.12, 0.12, 0.12);
const GRIS = rgb(0.42, 0.42, 0.42);
const BORDE = rgb(0.85, 0.85, 0.85);
const ROJO = rgb(0.78, 0.1, 0.1);
const FONDO = rgb(0.96, 0.96, 0.96);

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 40;

const peso = (n: number | null) => (n === null ? "-" : `$${Math.round(n).toLocaleString("es-CL")}`);
const cantidad = (n: number | null) => (n === null ? "-" : n.toLocaleString("es-CL", { maximumFractionDigits: 4 }));
const fecha = (f: string | null) => (f ? f.split("-").reverse().join("-") : "-");

/** Las fuentes estándar del PDF solo traen WinAnsi: lo que no entra se cambia por «?». */
function limpio(fuente: PDFFont, texto: string): string {
  let r = "";
  for (const ch of texto.replace(/\s+/g, " ")) {
    try {
      fuente.encodeText(ch);
      r += ch;
    } catch {
      r += "?";
    }
  }
  return r;
}

/** Corta un texto en líneas que quepan en `ancho`. */
function lineas(fuente: PDFFont, texto: string, tam: number, ancho: number): string[] {
  const palabras = limpio(fuente, texto).split(" ");
  const out: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
    else {
      if (actual) out.push(actual);
      actual = p;
      // Una palabra más larga que el ancho se corta a la fuerza.
      while (fuente.widthOfTextAtSize(actual, tam) > ancho && actual.length > 1) {
        let i = actual.length - 1;
        while (i > 1 && fuente.widthOfTextAtSize(actual.slice(0, i), tam) > ancho) i--;
        out.push(actual.slice(0, i));
        actual = actual.slice(i);
      }
    }
  }
  if (actual) out.push(actual);
  return out.length ? out : [""];
}

export interface OpcionesPdfDte {
  /** Vista previa de un borrador: folio «BORRADOR», marca de agua y pie que avisa que no tiene valor tributario. */
  borrador?: boolean;
  /** Líneas extra bajo los totales (referencias, observaciones, traslado…), como «Etiqueta: texto». */
  notas?: string[];
}

export async function pdfDesdeDte(dte: DteParseado, opciones: OpcionesPdfDte = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const { emisor, receptor, detalle } = dte.datos;
  doc.setTitle(`${NOMBRES_DTE[dte.tipoDte ?? 0] ?? "Documento"} ${dte.folio ?? ""}`.trim());

  let pagina: PDFPage = doc.addPage([A4.ancho, A4.alto]);
  let y = A4.alto - MARGEN;
  const derecha = A4.ancho - MARGEN;

  const texto = (t: string, x: number, yy: number, tam = 9, f: PDFFont = normal, color = TINTA) =>
    pagina.drawText(limpio(f, t), { x, y: yy, size: tam, font: f, color });
  const textoDerecha = (t: string, xDer: number, yy: number, tam = 9, f: PDFFont = normal, color = TINTA) =>
    texto(t, xDer - f.widthOfTextAtSize(limpio(f, t), tam), yy, tam, f, color);

  // ── Cabecera: emisor a la izquierda, el recuadro rojo del SII a la derecha ──
  const anchoRecuadro = 190;
  const xRecuadro = derecha - anchoRecuadro;
  const nombreDoc = NOMBRES_DTE[dte.tipoDte ?? 0] ?? `DOCUMENTO TIPO ${dte.tipoDte ?? "?"}`;
  const lineasDoc = lineas(negrita, nombreDoc, 10, anchoRecuadro - 20);
  const altoRecuadro = 26 + lineasDoc.length * 13 + 18;
  pagina.drawRectangle({ x: xRecuadro, y: y - altoRecuadro, width: anchoRecuadro, height: altoRecuadro, borderColor: ROJO, borderWidth: 1.5 });
  let yr = y - 16;
  const centrado = (t: string, tam: number, f: PDFFont) => {
    const l = limpio(f, t);
    pagina.drawText(l, { x: xRecuadro + (anchoRecuadro - f.widthOfTextAtSize(l, tam)) / 2, y: yr, size: tam, font: f, color: ROJO });
    yr -= tam + 4;
  };
  centrado(`R.U.T.: ${emisor.rut ?? "-"}`, 10, negrita);
  for (const l of lineasDoc) centrado(l, 10, negrita);
  centrado(opciones.borrador ? "BORRADOR" : `N° ${dte.folio ?? "-"}`, 11, negrita);

  let ye = y - 4;
  for (const l of lineas(negrita, emisor.razonSocial ?? "-", 13, xRecuadro - MARGEN - 16)) {
    texto(l, MARGEN, ye, 13, negrita);
    ye -= 16;
  }
  if (emisor.giro) {
    for (const l of lineas(normal, emisor.giro, 8.5, xRecuadro - MARGEN - 16).slice(0, 3)) {
      texto(l, MARGEN, ye, 8.5, normal, GRIS);
      ye -= 11;
    }
  }
  y = Math.min(ye, y - altoRecuadro) - 18;

  // ── Receptor y fecha ──
  const filasReceptor: [string, string][] = [
    ["Señor(es)", receptor.razonSocial ?? "-"],
    ["R.U.T.", receptor.rut ?? "-"],
    ["Giro", receptor.giro ?? "-"],
    ["Dirección", receptor.direccion ?? "-"],
    ["Fecha de emisión", fecha(dte.fechaEmision)],
  ];
  const altoReceptor = filasReceptor.length * 14 + 12;
  pagina.drawRectangle({ x: MARGEN, y: y - altoReceptor, width: derecha - MARGEN, height: altoReceptor, borderColor: BORDE, borderWidth: 1 });
  let yf = y - 16;
  for (const [etiqueta, valor] of filasReceptor) {
    texto(etiqueta, MARGEN + 10, yf, 8.5, negrita, GRIS);
    texto(lineas(normal, valor, 9, derecha - MARGEN - 120)[0], MARGEN + 105, yf, 9);
    yf -= 14;
  }
  y -= altoReceptor + 18;

  // ── Detalle ──
  const col = { item: MARGEN + 8, cant: derecha - 215, precio: derecha - 110, monto: derecha - 8 };
  const anchoItem = col.cant - 60 - col.item;
  const encabezado = () => {
    pagina.drawRectangle({ x: MARGEN, y: y - 18, width: derecha - MARGEN, height: 18, color: FONDO });
    texto("Ítem", col.item, y - 12.5, 8.5, negrita, GRIS);
    textoDerecha("Cantidad", col.cant, y - 12.5, 8.5, negrita, GRIS);
    textoDerecha("Precio unit.", col.precio, y - 12.5, 8.5, negrita, GRIS);
    textoDerecha("Monto", col.monto, y - 12.5, 8.5, negrita, GRIS);
    y -= 24;
  };
  encabezado();

  const filas = detalle.length > 0 ? detalle : [{ nombre: "Sin detalle de ítems.", descripcion: null, cantidad: null, precioUnitario: null, monto: null }];
  for (const item of filas) {
    const lNombre = lineas(negrita, item.nombre || "-", 9, anchoItem);
    const lDesc = item.descripcion ? lineas(normal, item.descripcion, 8, anchoItem).slice(0, 6) : [];
    const alto = lNombre.length * 12 + lDesc.length * 10 + 6;
    if (y - alto < MARGEN + 120) {
      pagina = doc.addPage([A4.ancho, A4.alto]);
      y = A4.alto - MARGEN;
      encabezado();
    }
    let yi = y - 2;
    for (const l of lNombre) {
      texto(l, col.item, yi, 9, negrita);
      yi -= 12;
    }
    for (const l of lDesc) {
      texto(l, col.item, yi, 8, normal, GRIS);
      yi -= 10;
    }
    textoDerecha(cantidad(item.cantidad), col.cant, y - 2, 9);
    textoDerecha(peso(item.precioUnitario), col.precio, y - 2, 9);
    textoDerecha(peso(item.monto), col.monto, y - 2, 9);
    y -= alto;
    pagina.drawLine({ start: { x: MARGEN, y: y + 2 }, end: { x: derecha, y: y + 2 }, thickness: 0.5, color: BORDE });
    y -= 6;
  }

  // ── Totales ──
  y -= 8;
  const totales: [string, number | null, boolean][] = [
    ["Monto neto", dte.montoNeto, false],
    ["Monto exento", dte.montoExento, false],
    ["IVA (19%)", dte.montoIva, false],
    ["TOTAL", dte.montoTotal, true],
  ];
  for (const [etiqueta, valor, fuerte] of totales) {
    if (valor === null && !fuerte) continue;
    if (fuerte) pagina.drawRectangle({ x: derecha - 210, y: y - 5, width: 210, height: 18, color: FONDO });
    texto(etiqueta, derecha - 200, y, fuerte ? 10 : 9, fuerte ? negrita : normal, fuerte ? TINTA : GRIS);
    textoDerecha(peso(valor), col.monto, y, fuerte ? 10 : 9, fuerte ? negrita : normal);
    y -= fuerte ? 22 : 15;
  }

  // ── Notas (referencias, observaciones…) ──
  if (opciones.notas?.length) {
    y -= 6;
    for (const nota of opciones.notas) {
      const [etiqueta, ...resto] = nota.split(": ");
      const cuerpo = resto.length ? resto.join(": ") : etiqueta;
      const ls = lineas(normal, cuerpo, 8.5, derecha - MARGEN - 110);
      if (y - ls.length * 11 < MARGEN + 20) {
        pagina = doc.addPage([A4.ancho, A4.alto]);
        y = A4.alto - MARGEN;
      }
      if (resto.length) texto(etiqueta, MARGEN, y, 8.5, negrita, GRIS);
      ls.forEach((l, i) => texto(l, resto.length ? MARGEN + 110 : MARGEN, y - i * 11, 8.5));
      y -= ls.length * 11 + 4;
    }
  }

  // ── Pie en cada página (y la marca de agua si es un borrador) ──
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    if (opciones.borrador) {
      p.drawText("BORRADOR", { x: 120, y: 260, size: 96, font: negrita, color: rgb(0.85, 0.85, 0.85), opacity: 0.45, rotate: degrees(35) });
    }
    const pie = limpio(
      normal,
      opciones.borrador
        ? `Borrador: vista previa sin valor tributario. Al emitir se asignan el folio y el timbre del SII · Página ${i + 1} de ${paginas.length}`
        : `Representación generada desde el XML del documento tributario electrónico · Página ${i + 1} de ${paginas.length}`,
    );
    p.drawText(pie, { x: MARGEN, y: 22, size: 7, font: normal, color: GRIS });
  });

  return doc.save();
}

const soloRut = (r: string | null | undefined) => (r ?? "").replace(/[^0-9kK]/g, "").toUpperCase();

/**
 * El PDF de un XML de DTE tal como está guardado (bytes o texto). Si el XML trae varios documentos
 * (un EnvioDTE), elige el del folio y tipo pedidos, o el que tiene a `rutPropio` como receptor o
 * emisor; si no, el primero. null si el XML no trae ningún documento legible.
 */
export async function pdfDesdeXmlDte(
  xml: Buffer | string,
  elegir: { folio?: string | number | null; tipoDte?: number | null; rutPropio?: string | null } = {},
): Promise<Uint8Array | null> {
  const dtes = parsearXmlDte(typeof xml === "string" ? xml : xml.toString("latin1"));
  const folio = elegir.folio != null && elegir.folio !== "" ? Number(String(elegir.folio).replace(/\D/g, "")) : null;
  const propio = soloRut(elegir.rutPropio);
  const dte =
    (folio !== null && dtes.find((d) => d.folio === folio && (!elegir.tipoDte || d.tipoDte === elegir.tipoDte))) ||
    (propio && dtes.find((d) => soloRut(d.rutReceptor) === propio || soloRut(d.datos.emisor.rut) === propio)) ||
    dtes[0];
  return dte ? pdfDesdeDte(dte) : null;
}
