import "server-only";
import { odooSearchRead } from "./odoo/cliente";
import { rutaBaseFacturas, tokenAppFacturas } from "./sharepoint-facturas";
import { obtenerAccessToken } from "./contratos/graph-credenciales";
import { parsearXmlDte } from "./xml-dte";
import { pdfDesdeDte } from "./dte-pdf";

/**
 * Traer de Odoo a Facturas Históricas los documentos que faltan.
 *
 * El histórico en SharePoint (HISTORICO DE SII: XML_SII para ventas, DTE_SII para compras)
 * llega hasta junio de 2026; desde julio la facturación vive en Odoo. Esto COPIA el XML del DTE
 * de cada documento (el que Odoo guarda en `l10n_cl_dte_file`) a la carpeta de su año y mes, y
 * después el indexador de siempre lo carga en el Core. En Odoo no se toca nada.
 *
 * Junto a cada XML se guarda también su PDF, con el mismo nombre y extensión .pdf: el PDF oficial
 * que generó Odoo si lo tiene (`invoice_pdf_report_id`, casi todas las ventas), y si no (las
 * compras, que llegan solo como XML del proveedor) uno armado desde el XML (lib/dte-pdf.ts).
 *
 * Idempotente: un archivo que ya está en la carpeta (mismo nombre) no se vuelve a subir, así que
 * se puede correr de nuevo sin duplicar.
 */

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const GRAPH = "https://graph.microsoft.com/v1.0";

export type TipoMigracion = "ventas" | "compras";

export interface MovimientoOdoo {
  id: number;
  invoice_date: string | false;
  l10n_latam_document_type_id_code: string | false;
  l10n_latam_document_number: string | false;
  partner_id_vat: string | false;
  l10n_cl_dte_file: [number, string] | false;
  /** El PDF que generó Odoo (ventas emitidas o impresas). */
  invoice_pdf_report_id?: [number, string] | false;
}

export interface ResultadoMigracion {
  tipo: TipoMigracion;
  encontrados: number;
  subidos: number;
  yaEstaban: number;
  sinXml: number;
  /** PDFs guardados junto al XML: de Odoo, armados desde el XML, o que ya estaban. */
  pdfs: { deOdoo: number; armados: number; yaEstaban: number };
  errores: string[];
  /** Los meses que recibieron archivos (para indexarlos después). */
  meses: { anio: number; mes: number }[];
  /** Los que quedaron sin revisar porque se acabó el tiempo: se sigue abriendo el enlace de nuevo. */
  pendientes: number;
}

/** Un aviso de avance por documento, para mostrarlo mientras corre. */
export interface AvanceMigracion {
  n: number;
  total: number;
  nombre: string;
  estado: "subido" | "ya estaba" | "sin XML" | "error";
  detalle?: string;
}

/** Escribe con el token de la app; si el sitio no le da permiso de escritura, con el de quien lo pidió. */
async function tokenDeEscritura(correo: string, usarPersona: boolean): Promise<string> {
  return usarPersona ? obtenerAccessToken(correo) : tokenAppFacturas();
}

async function graph(token: string, ruta: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GRAPH}${ruta}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, cache: "no-store" });
}

const codificar = (ruta: string) => ruta.split("/").map(encodeURIComponent).join("/");

/**
 * La carpeta del mes («2026/07 Julio» o «2026/07», según cómo estén nombradas las que ya hay en
 * esa carpeta), creándola si no existe. Devuelve su id.
 */
async function carpetaDelMes(token: string, tipo: TipoMigracion, anio: number, mes: number, memo: Map<string, string>): Promise<string> {
  const clave = `${tipo}|${anio}|${mes}`;
  const recordada = memo.get(clave);
  if (recordada) return recordada;
  const { sitio, ruta } = rutaBaseFacturas(tipo);

  const asegurar = async (padre: string, nombre: string): Promise<string> => {
    const r = await graph(token, `/sites/${sitio}/drive/root:/${codificar(padre)}:/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (r.ok) return ((await r.json()) as { id: string }).id;
    if (r.status === 409) {
      const e = await graph(token, `/sites/${sitio}/drive/root:/${codificar(`${padre}/${nombre}`)}?$select=id`);
      if (e.ok) return ((await e.json()) as { id: string }).id;
    }
    throw new Error(`No se pudo crear «${padre}/${nombre}» (HTTP ${r.status}).`);
  };

  await asegurar(ruta, String(anio));
  // ¿Cómo se llaman los meses en esta carpeta? Se copia la costumbre de lo que ya hay.
  const hijos = await graph(token, `/sites/${sitio}/drive/root:/${codificar(`${ruta}/${anio}`)}:/children?$select=name,folder&$top=50`);
  let nombres: string[] = [];
  if (hijos.ok) nombres = ((await hijos.json()) as { value: { name: string; folder?: unknown }[] }).value.filter((h) => h.folder).map((h) => h.name);
  const mm = String(mes).padStart(2, "0");
  const existente = nombres.find((n) => n.trim().slice(0, 2) === mm);
  let nombre = existente;
  if (!nombre) {
    // Sin meses todavía en ese año: se mira el año anterior para saber el formato.
    const anterior = await graph(token, `/sites/${sitio}/drive/root:/${codificar(`${ruta}/${anio - 1}`)}:/children?$select=name,folder&$top=50`);
    let conNombre = true;
    if (anterior.ok) {
      const previos = ((await anterior.json()) as { value: { name: string; folder?: unknown }[] }).value.filter((h) => h.folder).map((h) => h.name);
      if (previos.length > 0) conNombre = previos.some((n) => /\s/.test(n.trim()));
    }
    nombre = conNombre ? `${mm} ${MESES[mes - 1]}` : mm;
  }
  const id = await asegurar(`${ruta}/${anio}`, nombre);
  memo.set(clave, id);
  return id;
}

/** Sube un archivo si no existe uno con el mismo nombre. true = subido, false = ya estaba. */
async function subirSiNoEsta(token: string, sitio: string, carpetaId: string, nombre: string, contenido: Buffer | Uint8Array, tipoContenido = "application/xml"): Promise<boolean> {
  const r = await graph(token, `/sites/${sitio}/drive/items/${carpetaId}:/${encodeURIComponent(nombre)}:/content?@microsoft.graph.conflictBehavior=fail`, {
    method: "PUT",
    headers: { "Content-Type": tipoContenido },
    body: new Uint8Array(contenido),
  });
  if (r.ok) return true;
  if (r.status === 409) return false;
  const detalle = await r.text().catch(() => "");
  throw Object.assign(new Error(`HTTP ${r.status} ${detalle.slice(0, 160)}`), { status: r.status });
}

/** El nombre con que se guarda en SharePoint el XML de un documento de Odoo. */
export function nombreArchivoMigrado(tipo: TipoMigracion, m: MovimientoOdoo): string {
  const tipoDte = m.l10n_latam_document_type_id_code || "DTE";
  const folio = String(m.l10n_latam_document_number || m.id).replace(/[^\w-]/g, "");
  const rut = String(m.partner_id_vat || "").replace(/[^0-9kK-]/g, "");
  // Compras: el folio se repite entre proveedores, así que el nombre lleva el RUT del emisor.
  return tipo === "ventas" ? `DTE_${tipoDte}_${folio}.xml` : `DTE_${tipoDte}_${folio}_${rut || "sinrut"}.xml`;
}

/** El nombre del PDF que acompaña al XML migrado: el mismo, con .pdf. */
export const nombrePdfMigrado = (nombreXml: string) => nombreXml.replace(/\.xml$/i, ".pdf");

const RUT_PROPIO = (process.env.SII_RUT_EMPRESA ?? "77590967-6").replace(/[^0-9kK]/g, "").toUpperCase();

/** Un PDF armado desde el XML del DTE (el documento de la empresa si el XML trae varios). */
async function pdfDesdeXml(xml: Buffer): Promise<Uint8Array | null> {
  const dtes = parsearXmlDte(xml.toString("latin1"));
  const dte = dtes.find((d) => (d.rutReceptor ?? "").replace(/[^0-9kK]/g, "").toUpperCase() === RUT_PROPIO) ?? dtes[0];
  return dte ? pdfDesdeDte(dte) : null;
}

export async function migrarDesdeOdoo(opciones: {
  tipo: TipoMigracion;
  desde: string;
  correo: string;
  limite?: number;
  /** Se llama después de cada documento. */
  alAvanzar?: (a: AvanceMigracion) => void;
  /** Hora (ms) en que hay que dejar de subir para alcanzar a indexar antes del límite de la función. */
  hasta?: number;
}): Promise<ResultadoMigracion> {
  const { tipo, desde, correo } = opciones;
  const dominio =
    tipo === "ventas"
      ? [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["invoice_date", ">=", desde], ["l10n_cl_dte_file", "!=", false]]
      : [["move_type", "in", ["in_invoice", "in_refund"]], ["state", "!=", "cancel"], ["invoice_date", ">=", desde], ["l10n_cl_dte_file", "!=", false]];
  const total = await odooSearchRead<MovimientoOdoo>(
    "account.move",
    dominio,
    ["invoice_date", "l10n_latam_document_type_id_code", "l10n_latam_document_number", "partner_id_vat", "l10n_cl_dte_file", "invoice_pdf_report_id"],
    { order: "invoice_date asc, id asc", limit: opciones.limite },
  );

  const resultado: ResultadoMigracion = { tipo, encontrados: total.length, subidos: 0, yaEstaban: 0, sinXml: 0, pdfs: { deOdoo: 0, armados: 0, yaEstaban: 0 }, errores: [], meses: [], pendientes: 0 };
  const avisar = (nombre: string, estado: AvanceMigracion["estado"], detalle?: string) =>
    opciones.alAvanzar?.({ n: resultado.subidos + resultado.yaEstaban + resultado.sinXml + resultado.errores.length, total: total.length, nombre, estado, detalle });
  const { sitio } = rutaBaseFacturas(tipo);
  const memo = new Map<string, string>();
  const meses = new Set<string>();
  let usarPersona = false;
  let token = await tokenDeEscritura(correo, usarPersona);

  // De a 20: el contenido de los adjuntos viene en base64 y no conviene pedirlos todos juntos.
  for (let i = 0; i < total.length; i += 20) {
    if (opciones.hasta && Date.now() > opciones.hasta) {
      resultado.pendientes = total.length - i;
      break;
    }
    const lote = total.slice(i, i + 20);
    const ids = lote.flatMap((m) => [m.l10n_cl_dte_file ? m.l10n_cl_dte_file[0] : 0, m.invoice_pdf_report_id ? m.invoice_pdf_report_id[0] : 0]).filter(Boolean);
    const adjuntos = await odooSearchRead<{ id: number; datas: string | false }>("ir.attachment", [["id", "in", ids]], ["datas"]);
    const datosDe = new Map(adjuntos.map((a) => [a.id, a.datas]));

    for (const m of lote) {
      const datas = m.l10n_cl_dte_file ? datosDe.get(m.l10n_cl_dte_file[0]) : false;
      if (!datas || !m.invoice_date) {
        resultado.sinXml++;
        avisar(`#${m.id}`, "sin XML");
        continue;
      }
      const [anio, mes] = m.invoice_date.split("-").map(Number);
      const nombre = nombreArchivoMigrado(tipo, m);

      for (let intento = 0; intento < 2; intento++) {
        try {
          const carpeta = await carpetaDelMes(token, tipo, anio, mes, memo);
          const xml = Buffer.from(datas, "base64");
          const subido = await subirSiNoEsta(token, sitio, carpeta, nombre, xml);
          if (subido) resultado.subidos++;
          else resultado.yaEstaban++;
          meses.add(`${anio}-${mes}`);

          // El PDF, al lado del XML. Si falla, el XML igual queda: se anota y se sigue.
          let detallePdf: string;
          try {
            const pdfOdoo = m.invoice_pdf_report_id ? datosDe.get(m.invoice_pdf_report_id[0]) : false;
            const pdf = pdfOdoo ? Buffer.from(pdfOdoo, "base64") : await pdfDesdeXml(xml);
            if (!pdf) throw new Error("el XML no trae un documento legible");
            if (await subirSiNoEsta(token, sitio, carpeta, nombrePdfMigrado(nombre), pdf, "application/pdf")) {
              if (pdfOdoo) resultado.pdfs.deOdoo++;
              else resultado.pdfs.armados++;
              detallePdf = pdfOdoo ? "PDF de Odoo guardado" : "PDF armado desde el XML guardado";
            } else {
              resultado.pdfs.yaEstaban++;
              detallePdf = "PDF ya estaba";
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            resultado.errores.push(`${nombrePdfMigrado(nombre)}: ${msg}`);
            detallePdf = `PDF con error: ${msg}`;
          }
          avisar(nombre, subido ? "subido" : "ya estaba", detallePdf);
          break;
        } catch (e) {
          const status = (e as { status?: number }).status;
          const msg = e instanceof Error ? e.message : String(e);
          // La app solo tiene lectura en el sitio: se sigue con la cuenta de quien lo pidió.
          if (!usarPersona && (status === 403 || status === 401 || /HTTP 40[13]/.test(msg))) {
            usarPersona = true;
            memo.clear();
            token = await tokenDeEscritura(correo, true);
            continue;
          }
          resultado.errores.push(`${nombre}: ${msg}`);
          avisar(nombre, "error", msg);
          break;
        }
      }
    }
  }

  resultado.meses = [...meses].map((k) => {
    const [anio, mes] = k.split("-").map(Number);
    return { anio, mes };
  });
  return resultado;
}
