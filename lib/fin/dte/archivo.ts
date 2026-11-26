import "server-only";
import { supabaseAdmin } from "../../supabase-admin";
import { carpetaDte, carpetaFacturas, nombreDte } from "../../archivos/carpetas";
import { subirASharePoint } from "../../archivos/sharepoint-core";
import { pdfDesdeXmlDte } from "../../dte-pdf";

// -----------------------------------------------------------------------------
//  Archivo de documentos tributarios (solo servidor).
//
//  Cada DTE emitido o recibido tiene una fila en fin_dte_archivo con sus datos (tipo, folio, fecha, contraparte,
//  montos) y la referencia a su PDF y XML en SharePoint («Gestion financiera/<Empresa>/Facturas/Emitidos|Recibidos/
//  AAAA/MM Mes/…»). Lo llena el ordenamiento de la carpeta histórica y, de ahí en adelante, cada emisión y cada
//  sincronización de recibidos. Archivar nunca hace fallar la operación que lo pidió: si SharePoint no responde, se
//  registra igual la fila y el archivo se puede volver a bajar del proveedor.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ClaseDte = "emitido" | "recibido";

export interface FilaArchivo {
  id: string;
  clase: ClaseDte;
  tipoDte: number | null;
  folio: string | null;
  fecha: string | null;
  rut: string | null;
  nombre: string | null;
  neto: number | null;
  iva: number | null;
  exento: number | null;
  total: number | null;
  pdf: boolean;
  xml: boolean;
  documentoId: string | null;
  origen: string;
}

const aFila = (r: any): FilaArchivo => ({
  id: r.id,
  clase: r.clase,
  tipoDte: r.tipo_dte,
  folio: r.folio,
  fecha: r.fecha,
  rut: r.rut_contraparte,
  nombre: r.nombre_contraparte,
  neto: r.neto === null ? null : Number(r.neto),
  iva: r.iva === null ? null : Number(r.iva),
  exento: r.exento === null ? null : Number(r.exento),
  total: r.total === null ? null : Number(r.total),
  pdf: Boolean(r.pdf_ref),
  xml: Boolean(r.xml_ref),
  documentoId: r.documento_id,
  origen: r.origen,
});

export type TiposArchivo = "todos" | "sin_guias" | "guias";

export interface FiltroArchivo {
  clase: ClaseDte;
  /** Guías aparte (pestaña propia) o todo junto. */
  tipos?: TiposArchivo;
  /** Un tipo de documento en particular (33, 61…), dentro de los de `tipos`. */
  tipoDte?: number | null;
  anio?: number | null;
  mes?: number | null;
  q?: string | null;
  limite?: number;
}

function conTipos(q: any, tipos: TiposArchivo | undefined): any {
  if (tipos === "guias") return q.eq("tipo_dte", 52);
  if (tipos === "sin_guias") return q.or("tipo_dte.is.null,tipo_dte.neq.52");
  return q;
}

/** Cuántos documentos hay en el archivo por pestaña (emitidos sin guías, guías emitidas, recibidos). */
export async function contarArchivo(empresaId: string): Promise<{ emitidos: number; guias: number; recibidos: number }> {
  const c = async (clase: ClaseDte, tipos: TiposArchivo) => {
    const { count, error } = await conTipos(supabaseAdmin.from("fin_dte_archivo").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("clase", clase), tipos);
    return error ? 0 : count ?? 0;
  };
  const [emitidos, guias, recibidos] = await Promise.all([c("emitido", "sin_guias"), c("emitido", "guias"), c("recibido", "todos")]);
  return { emitidos, guias, recibidos };
}

/** Documentos del archivo, más nuevos primero. Si la tabla aún no existe (falta la migración 0016), lista vacía. */
export async function listarArchivo(empresaId: string, f: FiltroArchivo): Promise<{ filas: FilaArchivo[]; total: number; anios: number[] }> {
  let q = conTipos(supabaseAdmin.from("fin_dte_archivo").select("*", { count: "exact" }).eq("empresa_id", empresaId).eq("clase", f.clase), f.tipos);
  if (f.anio) {
    const desde = f.mes ? `${f.anio}-${String(f.mes).padStart(2, "0")}-01` : `${f.anio}-01-01`;
    const hasta = f.mes ? (f.mes === 12 ? `${f.anio + 1}-01-01` : `${f.anio}-${String(f.mes + 1).padStart(2, "0")}-01`) : `${f.anio + 1}-01-01`;
    q = q.gte("fecha", desde).lt("fecha", hasta);
  }
  const texto = (f.q ?? "").replace(/[%,()]/g, " ").trim();
  if (texto) q = q.or(`folio.ilike.%${texto}%,nombre_contraparte.ilike.%${texto}%,rut_contraparte.ilike.%${texto.replace(/\./g, "")}%`);
  const { data, count, error } = await q.order("fecha", { ascending: false, nullsFirst: false }).order("folio", { ascending: false }).limit(f.limite ?? 300);
  if (error) {
    if (/fin_dte_archivo/.test(error.message)) return { filas: [], total: 0, anios: [] };
    throw new Error(`No se pudo leer el archivo de documentos: ${error.message}`);
  }
  const { data: rango } = await supabaseAdmin.from("fin_dte_archivo").select("fecha").eq("empresa_id", empresaId).eq("clase", f.clase).not("fecha", "is", null).order("fecha", { ascending: true }).limit(1);
  const primero = Number(String(rango?.[0]?.fecha ?? "").slice(0, 4)) || new Date().getFullYear();
  const anios: number[] = [];
  for (let a = new Date().getFullYear(); a >= primero; a--) anios.push(a);
  const filas = (data ?? []).map(aFila);
  await ligarConLibros(empresaId, filas);
  return { filas, total: count ?? 0, anios };
}

const rutClave = (r: string | null) => (r ?? "").replace(/[^0-9kK]/g, "").toUpperCase();

/**
 * Liga las filas sin documento a fin_documentos (misma dirección, tipo, folio y RUT): lo registrado después en Ventas o
 * Compras aparece «Registrado» y queda disponible para conciliar. Corrige en la base lo que encuentre.
 */
export async function ligarConLibros(empresaId: string, filas: FilaArchivo[]): Promise<void> {
  const sueltas = filas.filter((f) => !f.documentoId && f.tipoDte && f.folio);
  if (!sueltas.length) return;
  const { data } = await supabaseAdmin
    .from("fin_documentos")
    .select("id, direccion, tipo_dte, folio, rut_contraparte")
    .eq("empresa_id", empresaId)
    .in("folio", [...new Set(sueltas.map((f) => f.folio!))]);
  const mapa = new Map((data ?? []).map((d: any) => [`${d.direccion}|${d.tipo_dte}|${d.folio}|${rutClave(d.rut_contraparte)}`, d.id as string]));
  for (const f of sueltas) {
    const id = mapa.get(`${f.clase}|${f.tipoDte}|${f.folio}|${rutClave(f.rut)}`);
    if (!id) continue;
    f.documentoId = id;
    await supabaseAdmin.from("fin_dte_archivo").update({ documento_id: id }).eq("id", f.id).is("documento_id", null);
  }
}

/** Referencia de SharePoint del PDF o XML de una fila (solo de la empresa indicada). */
export async function refArchivo(empresaId: string, id: string, que: "pdf" | "xml"): Promise<{ ref: string; nombre: string } | null> {
  const { data } = await supabaseAdmin.from("fin_dte_archivo").select("*").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  if (!data) return null;
  const ref = que === "pdf" ? data.pdf_ref : data.xml_ref;
  if (!ref) return null;
  return { ref, nombre: `${nombreDte({ clase: data.clase, tipoDte: data.tipo_dte, folio: data.folio, fecha: data.fecha, contraparte: data.nombre_contraparte, rut: data.rut_contraparte })}.${que}` };
}

export interface DteParaArchivar {
  clase: ClaseDte;
  tipoDte: number;
  folio: string;
  fecha: string | null;
  rut: string | null;
  nombre: string | null;
  neto?: number | null;
  iva?: number | null;
  exento?: number | null;
  total?: number | null;
  pdf?: Buffer | null;
  xml?: Buffer | null;
  documentoId?: string | null;
  origen: "emision" | "recibido_api" | "manual";
}

/** Carpeta base de la empresa (la de Integraciones o la de omisión). */
async function carpetaBase(empresaId: string, empresaNombre: string): Promise<string> {
  const { data } = await supabaseAdmin.from("fin_dte_cuentas").select("carpeta_sp").eq("empresa_id", empresaId).maybeSingle();
  return (data?.carpeta_sp as string | null) || carpetaFacturas(empresaNombre);
}

/**
 * Sube el PDF/XML a su carpeta y deja (o completa) la fila del archivo. No lanza: devuelve un aviso si algo falló.
 * Si el documento ya estaba archivado con su archivo, no lo vuelve a subir.
 */
export async function archivarDte(empresa: { id: string; nombre: string }, d: DteParaArchivar): Promise<string | null> {
  try {
    const rut = d.rut ? d.rut.replace(/\./g, "").toUpperCase() : null;
    const { data: ya } = await supabaseAdmin
      .from("fin_dte_archivo")
      .select("id, pdf_ref, xml_ref, documento_id")
      .eq("empresa_id", empresa.id)
      .eq("clase", d.clase)
      .eq("tipo_dte", d.tipoDte)
      .eq("folio", d.folio)
      .eq("rut_contraparte", rut ?? "")
      .maybeSingle();
    const carpeta = carpetaDte(await carpetaBase(empresa.id, empresa.nombre), d.clase, d.fecha);
    const nombre = nombreDte({ clase: d.clase, tipoDte: d.tipoDte, folio: d.folio, fecha: d.fecha, contraparte: d.nombre, rut });
    let aviso: string | null = null;
    const subir = async (b: Buffer | null | undefined, ext: "pdf" | "xml", actual: string | null | undefined) => {
      if (!b || actual) return actual ?? null;
      try {
        return await subirASharePoint(carpeta, `${nombre}.${ext}`, b, ext === "pdf" ? "application/pdf" : "application/xml", true);
      } catch (e) {
        aviso = `No se pudo guardar el ${ext.toUpperCase()} en SharePoint: ${e instanceof Error ? e.message : String(e)}`;
        return null;
      }
    };
    // Si llega solo el XML (recibidos del SII, documentos subidos sin PDF), el PDF se arma desde él.
    let pdf = d.pdf;
    if (!pdf && d.xml && !ya?.pdf_ref) {
      try {
        const armado = await pdfDesdeXmlDte(d.xml, { folio: d.folio, tipoDte: d.tipoDte });
        pdf = armado ? Buffer.from(armado) : null;
      } catch {
        pdf = null; // sin PDF igual queda archivado el XML
      }
    }
    const pdf_ref = await subir(pdf, "pdf", ya?.pdf_ref);
    const xml_ref = await subir(d.xml, "xml", ya?.xml_ref);
    const fila = {
      empresa_id: empresa.id,
      clase: d.clase,
      tipo_dte: d.tipoDte,
      folio: d.folio,
      fecha: d.fecha,
      rut_contraparte: rut ?? "",
      nombre_contraparte: d.nombre,
      neto: d.neto ?? null,
      iva: d.iva ?? null,
      exento: d.exento ?? null,
      total: d.total ?? null,
      pdf_ref,
      xml_ref,
      ruta: carpeta,
      documento_id: d.documentoId ?? ya?.documento_id ?? null,
      origen: d.origen,
      actualizado_en: new Date().toISOString(),
    };
    const { error } = ya ? await supabaseAdmin.from("fin_dte_archivo").update(fila).eq("id", ya.id) : await supabaseAdmin.from("fin_dte_archivo").insert(fila);
    if (error) return `No se pudo registrar el documento en el archivo: ${error.message}`;
    return aviso;
  } catch (e) {
    return `No se pudo archivar el documento: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Todas las filas que calzan con el filtro (para el Excel), en páginas de 1000. */
export async function todasDelArchivo(empresaId: string, f: Omit<FiltroArchivo, "limite">): Promise<FilaArchivo[]> {
  const out: FilaArchivo[] = [];
  for (let i = 0; i < 20000; i += 1000) {
    let q = conTipos(supabaseAdmin.from("fin_dte_archivo").select("*").eq("empresa_id", empresaId).eq("clase", f.clase), f.tipos);
    if (f.tipoDte) q = q.eq("tipo_dte", f.tipoDte);
    if (f.anio) {
      const desde = f.mes ? `${f.anio}-${String(f.mes).padStart(2, "0")}-01` : `${f.anio}-01-01`;
      const hasta = f.mes ? (f.mes === 12 ? `${f.anio + 1}-01-01` : `${f.anio}-${String(f.mes + 1).padStart(2, "0")}-01`) : `${f.anio + 1}-01-01`;
      q = q.gte("fecha", desde).lt("fecha", hasta);
    }
    const texto = (f.q ?? "").replace(/[%,()]/g, " ").trim();
    if (texto) q = q.or(`folio.ilike.%${texto}%,nombre_contraparte.ilike.%${texto}%,rut_contraparte.ilike.%${texto.replace(/\./g, "")}%`);
    const { data, error } = await q.order("fecha", { ascending: false, nullsFirst: false }).order("id").range(i, i + 999);
    if (error) throw new Error(`No se pudo leer el archivo de documentos: ${error.message}`);
    out.push(...(data ?? []).map(aFila));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export interface ResumenArchivo {
  /** Por año (o por mes, si se filtró un año): documentos, facturado (facturas + ND) y notas de crédito. */
  periodos: { periodo: string; documentos: number; facturas: number; notasCredito: number; neto: number }[];
  /** Las contrapartes con más monto en el filtro. */
  contrapartes: { nombre: string; rut: string | null; documentos: number; neto: number }[];
}

/** Totales del filtro: lo facturado menos notas de crédito, sin guías (no son venta ni compra). */
export function resumirArchivo(filas: FilaArchivo[], porMes: boolean, soloGuias = false): ResumenArchivo {
  const per = new Map<string, ResumenArchivo["periodos"][number]>();
  const con = new Map<string, ResumenArchivo["contrapartes"][number]>();
  for (const f of filas) {
    if (f.tipoDte === 52 && !soloGuias) continue;
    const signo = f.tipoDte === 61 ? -1 : 1;
    const monto = (f.total ?? 0) * signo;
    const p = (f.fecha ?? "").slice(0, porMes ? 7 : 4) || "Sin fecha";
    const x = per.get(p) ?? { periodo: p, documentos: 0, facturas: 0, notasCredito: 0, neto: 0 };
    x.documentos++;
    if (signo < 0) x.notasCredito += f.total ?? 0;
    else x.facturas += f.total ?? 0;
    x.neto += monto;
    per.set(p, x);
    const k = f.rut || f.nombre || "—";
    const c = con.get(k) ?? { nombre: f.nombre ?? f.rut ?? "—", rut: f.rut, documentos: 0, neto: 0 };
    c.documentos++;
    c.neto += monto;
    con.set(k, c);
  }
  return {
    periodos: [...per.values()].sort((a, b) => b.periodo.localeCompare(a.periodo)),
    contrapartes: [...con.values()].sort((a, b) => b.neto - a.neto).slice(0, 15),
  };
}

/** Una fila del archivo con sus referencias (solo de la empresa indicada). */
export async function filaDelArchivo(empresaId: string, id: string): Promise<(FilaArchivo & { pdfRef: string | null; xmlRef: string | null; ruta: string | null }) | null> {
  const { data } = await supabaseAdmin.from("fin_dte_archivo").select("*").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  return data ? { ...aFila(data), pdfRef: data.pdf_ref ?? null, xmlRef: data.xml_ref ?? null, ruta: data.ruta ?? null } : null;
}
