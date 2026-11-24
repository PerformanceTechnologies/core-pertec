import "server-only";
import { revalidatePath } from "next/cache";
import { RUTA_FIN, auditar, type ContextoFin } from "../datos";
import { exigirRol } from "../flujos";
import { archivarDte } from "./archivo";
import { leerPdf, leerXml, textoXml, type DocLeido } from "./leer-documento";
import { CORTE_LIBROS, claveDocumento, registrarEnLibros, rutLimpio } from "./libros";
import { supabaseAdmin } from "../../supabase-admin";

// Facturación › Archivo › «Subir documento»: un DTE (XML y/o PDF) que no llegó solo. Queda en SharePoint, en el
// archivo y, si es desde el corte y mueve dinero, en los libros (con la misma regla de «por conciliar»).
// Lo llama la ruta /api/finanzas/dte/archivo/subir (una ruta, no una Server Action: los PDF pasan de 1 MB).

type Res = { ok: true; mensaje?: string } | { ok: false; error: string };

const TOPE = 15 * 1024 * 1024;
const txt = (fd: FormData, k: string, max = 120) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
};

export async function subirDocumento(ctx: ContextoFin, fd: FormData): Promise<Res> {
  try {
    await exigirRol(ctx, "ventas_facturador", { accion: "cargar documentos tributarios" });
    const archivos = fd.getAll("archivos").filter((f): f is File => f instanceof File && f.size > 0);
    if (!archivos.length) return { ok: false, error: "Elige el XML y/o el PDF del documento." };
    if (archivos.length > 2) return { ok: false, error: "Sube un documento a la vez (su XML y su PDF)." };
    if (archivos.some((f) => f.size > TOPE)) return { ok: false, error: "Cada archivo puede pesar hasta 15 MB." };
    const rutPropio = ctx.empresa.rut ?? "";
    if (!rutPropio) return { ok: false, error: "La empresa no tiene RUT configurado." };
    let pdf: Buffer | null = null;
    let xml: Buffer | null = null;
    for (const f of archivos) {
      const b = Buffer.from(await f.arrayBuffer());
      const nombre = f.name.toLowerCase();
      if (nombre.endsWith(".xml") || b.subarray(0, 5).toString() === "<?xml") xml = b;
      else if (b.subarray(0, 5).toString() === "%PDF-") pdf = b;
      else return { ok: false, error: `«${f.name}» no es un PDF ni un XML.` };
    }
    // El XML manda; el PDF completa lo que falte.
    const deXml: DocLeido | null = xml ? leerXml(textoXml(xml), rutPropio) : null;
    const dePdf: DocLeido | null = pdf ? await leerPdf(pdf, rutPropio) : null;
    const base = { ...(dePdf ?? {}), ...Object.fromEntries(Object.entries(deXml ?? {}).filter(([, v]) => v !== null)) } as DocLeido;
    // Lo que la persona corrigió en el formulario gana.
    const clase = (txt(fd, "clase") as DocLeido["clase"]) ?? base.clase;
    const tipoDte = Number(txt(fd, "tipo")) || base.tipoDte;
    const folio = (txt(fd, "folio")?.replace(/\D/g, "") || base.folio) ?? null;
    const fecha = txt(fd, "fecha") ?? base.fecha;
    const rut = txt(fd, "rut") ? rutLimpio(txt(fd, "rut")) : base.rut;
    const nombre = txt(fd, "nombre", 200) ?? base.nombre;
    const total = Number(txt(fd, "total")?.replace(/\D/g, "")) || base.total || 0;
    const falta = [!clase && "si es emitido o recibido", !tipoDte && "el tipo", !folio && "el folio", !(fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) && "la fecha"].filter(Boolean);
    if (falta.length) return { ok: false, error: `No se pudo leer ${falta.join(", ")}. Complétalo en el formulario (o sube el XML, que es exacto).` };
    if ((clase !== "emitido" && clase !== "recibido") || !tipoDte || !folio || !fecha) return { ok: false, error: "Datos incompletos." };
    const neto = base.neto ?? (tipoDte === 34 ? 0 : Math.round(total / 1.19));
    const exento = base.exento ?? (tipoDte === 34 ? total : 0);
    const iva = base.iva ?? Math.max(0, total - neto - exento);

    // 1) Libros (desde el corte, tipos con dinero).
    let documentoId: string | null = null;
    let enLibros = false;
    if (fecha >= CORTE_LIBROS) {
      const r = await registrarEnLibros(
        ctx.empresa.id,
        [{ direccion: clase, tipoDte, folio, fecha, rut, nombre, neto, exento, iva, total, refTipo: base.refTipo, refFolio: base.refFolio }],
        { origen: "manual", quien: ctx.usuario.correo },
      );
      documentoId = r.ids.get(claveDocumento(clase, tipoDte, folio, rut)) ?? null;
      enLibros = r.creados > 0;
    }
    // 2) SharePoint + archivo.
    const aviso = await archivarDte(ctx.empresa, { clase, tipoDte, folio, fecha, rut, nombre, neto, iva, exento, total, pdf, xml, documentoId, origen: "manual" });
    await auditar(ctx, "fin_dte_archivo", null, "subir", `${clase} tipo ${tipoDte} folio ${folio} (${nombre ?? rut ?? "sin nombre"})`);
    if (documentoId) await supabaseAdmin.from("fin_dte_archivo").update({ documento_id: documentoId }).eq("empresa_id", ctx.empresa.id).eq("clase", clase).eq("tipo_dte", tipoDte).eq("folio", folio).is("documento_id", null);
    revalidatePath("/finanzas/facturacion");
    revalidatePath(RUTA_FIN, "layout");
    const que = `${clase === "emitido" ? "Emitido" : "Recibido"} folio ${folio}${nombre ? ` de ${nombre}` : ""}`;
    if (aviso) return { ok: true, mensaje: `${que}: registrado, pero ${aviso}` };
    return { ok: true, mensaje: `${que} guardado en el archivo${enLibros ? " y en los libros" : documentoId ? " (ya estaba en los libros)" : ""}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "Ocurrió un error inesperado." };
  }
}
