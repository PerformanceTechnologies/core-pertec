import "server-only";
import pdfParse from "pdf-parse";
import { parsearXmlDte } from "../../xml-dte";
import { extraerDatosFacturaCompra } from "../../extraer-datos-factura-compra";
import { rutLimpio } from "./libros";

// -----------------------------------------------------------------------------
//  Lee un DTE subido a mano (XML del SII o su PDF) y dice qué es: emitido o recibido (según el RUT de la empresa),
//  tipo, folio, fecha, contraparte y montos. El XML es exacto; el PDF es una lectura del texto (se puede corregir).
// -----------------------------------------------------------------------------

export interface DocLeido {
  clase: "emitido" | "recibido" | null;
  tipoDte: number | null;
  folio: string | null;
  fecha: string | null;
  rut: string | null;
  nombre: string | null;
  neto: number | null;
  exento: number | null;
  iva: number | null;
  total: number | null;
  refTipo: number | null;
  refFolio: string | null;
}

const VACIO: DocLeido = { clase: null, tipoDte: null, folio: null, fecha: null, rut: null, nombre: null, neto: null, exento: null, iva: null, total: null, refTipo: null, refFolio: null };

/** El texto del XML respetando su encoding (el SII usa ISO-8859-1). */
export function textoXml(b: Buffer): string {
  const cabeza = b.subarray(0, 200).toString("latin1");
  return /encoding=["']utf-8/i.test(cabeza) ? b.toString("utf8") : b.toString("latin1");
}

export function leerXml(xml: string, rutPropio: string): DocLeido {
  const d = parsearXmlDte(xml)[0];
  if (!d) return VACIO;
  const propio = rutLimpio(rutPropio);
  const emisor = rutLimpio(d.datos.emisor.rut);
  const receptor = rutLimpio(d.rutReceptor);
  const clase = emisor === propio ? "emitido" : receptor === propio ? "recibido" : null;
  const ref = /<Referencia>[\s\S]*?<TpoDocRef>\s*(\d+)\s*<\/TpoDocRef>[\s\S]*?<FolioRef>\s*(\d+)\s*<\/FolioRef>/i.exec(xml);
  return {
    clase,
    tipoDte: d.tipoDte,
    folio: d.folio !== null ? String(d.folio) : null,
    fecha: d.fechaEmision,
    rut: clase === "emitido" ? receptor || null : emisor || null,
    nombre: clase === "emitido" ? d.razonSocialReceptor : d.datos.emisor.razonSocial,
    neto: d.montoNeto,
    exento: d.montoExento,
    iva: d.montoIva,
    total: d.montoTotal,
    refTipo: ref ? Number(ref[1]) : null,
    refFolio: ref ? ref[2] : null,
  };
}

const RX_RECEPTOR = /SE[ÑN]OR\(?ES\)?\s*:\s*(.+?)\s*R\.?\s*U\.?\s*T\.?\s*:?\s*([\d.\s]{7,12}-\s*[\dkK])/i;
const monto = (texto: string, etiqueta: RegExp): number | null => {
  const m = new RegExp(`${etiqueta.source}\\s*[:$]*\\s*\\$?\\s*([\\d.]+)`, "i").exec(texto);
  return m ? Number(m[1].replace(/\./g, "")) || null : null;
};

function tipoDeTexto(tipo: string | null, texto: string): number | null {
  const t = (tipo ?? "").toLowerCase();
  if (/cr[ée]dito/.test(t)) return 61;
  if (/d[ée]bito/.test(t)) return 56;
  if (/gu[ií]a/.test(t)) return 52;
  if (/factura/.test(t)) return /FACTURA DE COMPRA/i.test(texto) ? 46 : /EXENTA/i.test(texto.slice(0, 1500)) ? 34 : 33;
  return null;
}

export async function leerPdf(b: Buffer, rutPropio: string): Promise<DocLeido> {
  let texto = "";
  try {
    texto = (await pdfParse(b)).text ?? "";
  } catch {
    return VACIO;
  }
  const x = extraerDatosFacturaCompra(texto, rutPropio);
  const propio = rutLimpio(rutPropio);
  const r = RX_RECEPTOR.exec(texto);
  const rutReceptor = r ? rutLimpio(r[2]) : null;
  const plano = texto.replace(/[\s.]/g, "");
  const clase = rutReceptor === propio ? "recibido" : plano.includes(propio) ? "emitido" : null;
  const ref = /(?:Factura|FACTURA)[^\n]{0,40}?N[°º]?\s*:?\s*(\d+)/.exec(texto.slice(texto.search(/Referencia/i) >= 0 ? texto.search(/Referencia/i) : texto.length));
  return {
    clase,
    tipoDte: tipoDeTexto(x.tipoDocumentoDetectado, texto),
    folio: x.folio !== null ? String(x.folio) : null,
    fecha: x.fechaEmision,
    rut: clase === "emitido" ? rutReceptor : x.rutEmisor ? rutLimpio(x.rutEmisor) : null,
    nombre: clase === "emitido" ? (r ? r[1].trim().replace(/[.,\s]+$/, "") : null) : x.razonSocialEmisor,
    neto: monto(texto, /MONTO NETO|NETO/),
    exento: monto(texto, /MONTO EXENTO|EXENTO/),
    iva: monto(texto, /I\.?V\.?A\.?(?:\s*19\s*%)?/),
    total: x.montoTotal,
    refTipo: ref ? 33 : null,
    refFolio: ref ? ref[1] : null,
  };
}
