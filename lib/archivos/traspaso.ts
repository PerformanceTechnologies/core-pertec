import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pertecWebSupabase } from "@/lib/pertec-web-supabase";
import { enlacePermanente, esReferenciaSharePoint, leerArchivo } from "./almacen";
import { borrarDeSharePoint, listarCarpetaDeSharePoint, nombreUnico, subirASharePoint } from "./sharepoint-core";
import {
  CARPETA_MANTENCION,
  CARPETA_OFERTAS_EMITIDAS,
  CARPETA_OFERTAS_IMAGENES,
  CARPETA_OFERTAS_LOGOS,
  CARPETA_OFERTAS_MAESTROS,
  carpetaCertificado,
  carpetaFinanzas,
  carpetaGastosProyecto,
  carpetaRendicion,
  carpetaTarea,
  carpetaVehiculo,
  nombrePdfEmitido,
} from "./carpetas";

// -----------------------------------------------------------------------------
//  Traspaso a SharePoint de los archivos que ya estaban en Supabase Storage.
//
//  Por módulo y por tandas: cada llamada recorre filas en orden de id desde un cursor,
//  baja cada archivo de su bucket, lo sube a su carpeta ordenada (ver ./carpetas.ts) y
//  cambia la referencia en la fila. Corta antes del tope de tiempo de Vercel y devuelve
//  el cursor para seguir. NO borra nada en Supabase: el original queda donde estaba.
//
//  Un archivo que falla se deja con su ruta vieja (se sigue abriendo como siempre) y se
//  informa; la vuelta siguiente lo vuelve a intentar.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Lote {
  migrados: number;
  errores: string[];
  /** Por dónde seguir; null si el módulo terminó. */
  cursor: string | null;
}

interface Modulo {
  clave: string;
  nombre: string;
  /** Cuántos archivos quedan en Supabase. */
  contar: () => Promise<number>;
  lote: (cursor: string | null, hasta: number) => Promise<Lote>;
}

const FILAS_POR_PAGINA = 25;

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif", txt: "text/plain", csv: "text/csv", xml: "application/xml", zip: "application/zip",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const extensionDe = (...nombres: (string | null | undefined)[]) => {
  for (const n of nombres) {
    const m = /\.([a-z0-9]{1,6})$/i.exec(n ?? "");
    if (m) return m[1].toLowerCase();
  }
  return "bin";
};

const viejo = (ruta: unknown): ruta is string => typeof ruta === "string" && ruta.length > 0 && !esReferenciaSharePoint(ruta);

/** Baja el archivo de su bucket y lo sube a SharePoint. Sin respaldo: si falla, lanza. */
async function pasar(o: {
  buckets: string[];
  ruta: string;
  cliente?: SupabaseClient;
  carpeta: string;
  nombre?: string | null;
  tipo?: string | null;
  nombreFinal?: string;
}): Promise<string> {
  let contenido: Buffer | null = null;
  for (const b of o.buckets) {
    contenido = await leerArchivo(b, o.ruta, o.cliente);
    if (contenido) break;
  }
  if (!contenido) throw new Error(`no está en ${o.buckets.join(" ni en ")}`);
  const ext = extensionDe(o.ruta, o.nombre);
  return subirASharePoint(o.carpeta, o.nombreFinal ?? nombreUnico(o.nombre ?? "archivo", ext), contenido, o.tipo || MIME[ext] || "application/octet-stream");
}

/** Recorre una tabla por id desde el cursor, en páginas, hasta el tope de tiempo. */
async function recorrer(
  o: { cliente?: SupabaseClient; tabla: string; columnas: string; filtro?: (q: any) => any },
  cursor: string | null,
  hasta: number,
  fila: (f: any, errores: string[]) => Promise<number>,
): Promise<Lote> {
  const cliente = o.cliente ?? supabaseAdmin;
  const r: Lote = { migrados: 0, errores: [], cursor };
  for (;;) {
    let q = cliente.from(o.tabla).select(o.columnas).order("id").limit(FILAS_POR_PAGINA);
    if (r.cursor) q = q.gt("id", r.cursor);
    if (o.filtro) q = o.filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${o.tabla}: ${error.message}`);
    if (!data?.length) return { ...r, cursor: null };
    for (const f of data as any[]) {
      if (Date.now() > hasta) return r;
      r.migrados += await fila(f, r.errores);
      r.cursor = String(f.id);
    }
    if (data.length < FILAS_POR_PAGINA) return { ...r, cursor: null };
  }
}

async function contarFilas(o: { cliente?: SupabaseClient; tabla: string; columnas: string; filtro?: (q: any) => any }, cuenta: (f: any) => number): Promise<number> {
  const cliente = o.cliente ?? supabaseAdmin;
  let total = 0;
  let cursor: string | null = null;
  for (;;) {
    let q = cliente.from(o.tabla).select(o.columnas).order("id").limit(500);
    if (cursor) q = q.gt("id", cursor);
    if (o.filtro) q = o.filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${o.tabla}: ${error.message}`);
    for (const f of (data ?? []) as any[]) total += cuenta(f);
    if (!data || data.length < 500) return total;
    cursor = String((data as any[])[data.length - 1].id);
  }
}

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- Módulos ------------------------------------------------------------------

async function nombresPorId(tabla: string, columnas: string, ids: string[]): Promise<Map<string, any>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabaseAdmin.from(tabla).select(columnas).in("id", [...new Set(ids)]);
  return new Map(((data ?? []) as any[]).map((d) => [String(d.id), d]));
}

const tareas: Modulo = (() => {
  const t = { tabla: "crm_tareas_notas", columnas: "id, tarea_id, archivos" };
  const pendientes = (f: any) => ((f.archivos ?? []) as any[]).filter((a) => viejo(a?.ruta)).length;
  return {
    clave: "tareas",
    nombre: "Tareas (adjuntos de notas)",
    contar: () => contarFilas(t, pendientes),
    lote: async (cursor, hasta) => {
      return recorrer(t, cursor, hasta, async (f, errores) => {
        if (!pendientes(f)) return 0;
        const tarea = (await nombresPorId("crm_tareas", "id, titulo", [f.tarea_id])).get(String(f.tarea_id));
        let n = 0;
        const archivos = [];
        for (const a of f.archivos as any[]) {
          if (!viejo(a?.ruta)) { archivos.push(a); continue; }
          try {
            const ruta = await pasar({ buckets: ["tareas"], ruta: a.ruta, carpeta: carpetaTarea({ id: f.tarea_id, titulo: tarea?.titulo }), nombre: a.nombre, tipo: a.tipo });
            archivos.push({ ...a, ruta });
            n++;
          } catch (e) {
            errores.push(`Tarea «${tarea?.titulo ?? f.tarea_id}» · ${a.nombre}: ${motivo(e)}`);
            archivos.push(a);
          }
        }
        if (n) {
          const { error } = await supabaseAdmin.from(t.tabla).update({ archivos }).eq("id", f.id);
          if (error) throw new Error(`guardar la nota ${f.id}: ${error.message}`);
        }
        return n;
      });
    },
  };
})();

const flota: Modulo = (() => {
  const t = { tabla: "flo_documentos", columnas: "id, vehiculo_id, archivo_ruta, archivo_nombre", filtro: (q: any) => q.not("archivo_ruta", "is", null).not("archivo_ruta", "like", "sp:%") };
  return {
    clave: "flota",
    nombre: "Flota (documentos de vehículos)",
    contar: () => contarFilas(t, (f) => (viejo(f.archivo_ruta) ? 1 : 0)),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        const v = (await nombresPorId("flo_vehiculos", "id, patente", [f.vehiculo_id])).get(String(f.vehiculo_id));
        try {
          const ruta = await pasar({ buckets: ["flota"], ruta: f.archivo_ruta, carpeta: carpetaVehiculo({ id: f.vehiculo_id, patente: v?.patente }), nombre: f.archivo_nombre });
          const { error } = await supabaseAdmin.from(t.tabla).update({ archivo_ruta: ruta }).eq("id", f.id);
          if (error) throw new Error(error.message);
          return 1;
        } catch (e) {
          errores.push(`Vehículo ${v?.patente ?? f.vehiculo_id} · ${f.archivo_nombre}: ${motivo(e)}`);
          return 0;
        }
      }),
  };
})();

const inventario: Modulo = (() => {
  const t = { tabla: "inv_productos", columnas: "id, nombre, sku, certificado_ruta, certificado_nombre", filtro: (q: any) => q.not("certificado_ruta", "is", null).not("certificado_ruta", "like", "sp:%") };
  return {
    clave: "inventario",
    nombre: "Inventario (certificados)",
    contar: () => contarFilas(t, (f) => (viejo(f.certificado_ruta) ? 1 : 0)),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        try {
          const ruta = await pasar({ buckets: ["inventario"], ruta: f.certificado_ruta, carpeta: carpetaCertificado(f), nombre: f.certificado_nombre });
          const { error } = await supabaseAdmin.from(t.tabla).update({ certificado_ruta: ruta }).eq("id", f.id);
          if (error) throw new Error(error.message);
          return 1;
        } catch (e) {
          errores.push(`Producto ${f.nombre} · ${f.certificado_nombre}: ${motivo(e)}`);
          return 0;
        }
      }),
  };
})();

const finanzas: Modulo = (() => {
  const t = { tabla: "fin_adjuntos", columnas: "id, empresa_id, entidad_tipo, entidad_id, ruta, nombre, mime", filtro: (q: any) => q.not("ruta", "like", "sp:%") };
  return {
    clave: "finanzas",
    nombre: "Gestión financiera (respaldos)",
    contar: () => contarFilas(t, (f) => (viejo(f.ruta) ? 1 : 0)),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        if (!viejo(f.ruta)) return 0;
        const empresa = (await nombresPorId("empresas", "id, nombre", [f.empresa_id])).get(String(f.empresa_id));
        try {
          const ruta = await pasar({ buckets: ["finanzas"], ruta: f.ruta, carpeta: carpetaFinanzas(empresa?.nombre, f.entidad_tipo, f.entidad_id), nombre: f.nombre, tipo: f.mime });
          const { error } = await supabaseAdmin.from(t.tabla).update({ ruta }).eq("id", f.id);
          if (error) throw new Error(error.message);
          return 1;
        } catch (e) {
          errores.push(`${empresa?.nombre ?? "Empresa"} · ${f.nombre}: ${motivo(e)}`);
          return 0;
        }
      }),
  };
})();

const rendiciones: Modulo = (() => {
  const t = { tabla: "rendiciones", columnas: "id, nombre_quien_rinde, titulo_rendicion, creado_en, gastos" };
  const pendientes = (f: any) => ((f.gastos ?? []) as any[]).filter((g) => viejo(g?.archivoPath)).length;
  return {
    clave: "rendiciones",
    nombre: "Rendir gastos (respaldos)",
    contar: () => contarFilas(t, pendientes),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        if (!pendientes(f)) return 0;
        const carpeta = carpetaRendicion({ id: f.id, quien: f.nombre_quien_rinde, titulo: f.titulo_rendicion, creadoEn: f.creado_en });
        const cambios = new Map<string, string>();
        for (const g of f.gastos as any[]) {
          // Pasado el tope, se guarda lo hecho y el resto queda para la vuelta siguiente: si
          // Vercel cortara a mitad de fila, lo subido quedaría en SharePoint sin anotar.
          if (Date.now() > hasta + 8_000) break;
          if (!viejo(g?.archivoPath) || cambios.has(g.archivoPath)) continue;
          try {
            cambios.set(g.archivoPath, await pasar({ buckets: ["rendiciones-respaldos"], ruta: g.archivoPath, carpeta, nombre: g.archivoNombre, tipo: g.archivoTipo }));
          } catch (e) {
            errores.push(`Rendición «${f.titulo_rendicion}» · ${g.archivoNombre ?? g.archivoPath}: ${motivo(e)}`);
          }
        }
        if (!cambios.size) return 0;
        // Se relee la fila justo antes de guardar: si alguien la editó mientras tanto, no se pisa.
        const { data: actual } = await supabaseAdmin.from(t.tabla).select("gastos").eq("id", f.id).maybeSingle();
        const gastos = ((actual?.gastos ?? []) as any[]).map((g) => (g?.archivoPath && cambios.has(g.archivoPath) ? { ...g, archivoPath: cambios.get(g.archivoPath) } : g));
        const { error } = await supabaseAdmin.from(t.tabla).update({ gastos }).eq("id", f.id);
        if (error) throw new Error(`guardar la rendición ${f.id}: ${error.message}`);
        return cambios.size;
      }),
  };
})();

const ofertas: Modulo = (() => {
  const t = { tabla: "ofertas_documentos", columnas: "id, numero_oferta, cliente, emision, imagenes, logo_cliente_ruta, logo_cliente_nombre" };
  const pendientes = (f: any) =>
    (viejo(f.emision?.pdfRuta) ? 1 : 0) + (viejo(f.logo_cliente_ruta) ? 1 : 0) + ((f.imagenes ?? []) as any[]).filter((i) => viejo(i?.ruta)).length;
  return {
    clave: "ofertas",
    nombre: "Ofertas técnicas (PDF emitidos, imágenes y logos de cliente)",
    contar: () => contarFilas(t, pendientes),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        if (!pendientes(f)) return 0;
        const etiqueta = f.numero_oferta ?? f.cliente ?? f.id;
        const cambios: Record<string, unknown> = {};
        let n = 0;
        if (viejo(f.emision?.pdfRuta)) {
          try {
            const ruta = await pasar({ buckets: ["ofertas-emitidas"], ruta: f.emision.pdfRuta, carpeta: CARPETA_OFERTAS_EMITIDAS, tipo: "application/pdf", nombreFinal: nombrePdfEmitido({ id: f.id, numero: f.numero_oferta, cliente: f.cliente }) });
            cambios.emision = { ...f.emision, pdfRuta: ruta };
            n++;
          } catch (e) {
            errores.push(`Oferta ${etiqueta} · PDF emitido: ${motivo(e)}`);
          }
        }
        if (viejo(f.logo_cliente_ruta)) {
          try {
            cambios.logo_cliente_ruta = await pasar({ buckets: ["logos", "ofertas-logos"], ruta: f.logo_cliente_ruta, carpeta: CARPETA_OFERTAS_LOGOS, nombre: f.logo_cliente_nombre ?? "logo cliente.png", tipo: "image/png" });
            n++;
          } catch (e) {
            errores.push(`Oferta ${etiqueta} · logo del cliente: ${motivo(e)}`);
          }
        }
        const imagenes = (f.imagenes ?? []) as any[];
        if (imagenes.some((i) => viejo(i?.ruta))) {
          const nuevas = [];
          let cambio = false;
          for (const i of imagenes) {
            if (!viejo(i?.ruta)) { nuevas.push(i); continue; }
            try {
              nuevas.push({ ...i, ruta: await pasar({ buckets: ["ofertas-imagenes"], ruta: i.ruta, carpeta: CARPETA_OFERTAS_IMAGENES, nombre: i.nombre }) });
              cambio = true;
              n++;
            } catch (e) {
              errores.push(`Oferta ${etiqueta} · imagen ${i.nombre}: ${motivo(e)}`);
              nuevas.push(i);
            }
          }
          if (cambio) cambios.imagenes = nuevas;
        }
        if (Object.keys(cambios).length) {
          const { error } = await supabaseAdmin.from(t.tabla).update(cambios).eq("id", f.id);
          if (error) throw new Error(`guardar la oferta ${etiqueta}: ${error.message}`);
        }
        return n;
      }),
  };
})();

const maestros: Modulo = (() => {
  const t = { tabla: "ofertas_maestros", columnas: "id, nombre, archivo_ruta, archivo_nombre", filtro: (q: any) => q.not("archivo_ruta", "is", null).not("archivo_ruta", "like", "sp:%") };
  return {
    clave: "maestros",
    nombre: "Ofertas técnicas (maestros)",
    contar: () => contarFilas(t, (f) => (viejo(f.archivo_ruta) ? 1 : 0)),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        try {
          const ruta = await pasar({ buckets: ["ofertas-maestros"], ruta: f.archivo_ruta, carpeta: CARPETA_OFERTAS_MAESTROS, nombre: f.archivo_nombre ?? f.nombre });
          const { error } = await supabaseAdmin.from(t.tabla).update({ archivo_ruta: ruta }).eq("id", f.id);
          if (error) throw new Error(error.message);
          return 1;
        } catch (e) {
          errores.push(`Maestro «${f.nombre}»: ${motivo(e)}`);
          return 0;
        }
      }),
  };
})();

const logosEmpresas: Modulo = (() => {
  const t = { tabla: "cotizador_empresas", columnas: "id, nombre, logo_ruta, logo_nombre", filtro: (q: any) => q.not("logo_ruta", "is", null).not("logo_ruta", "like", "sp:%") };
  return {
    clave: "logos",
    nombre: "Ofertas técnicas (logos de empresas)",
    contar: () => contarFilas(t, (f) => (viejo(f.logo_ruta) ? 1 : 0)),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        try {
          const ruta = await pasar({ buckets: ["logos", "ofertas-logos"], ruta: f.logo_ruta, carpeta: CARPETA_OFERTAS_LOGOS, nombre: f.logo_nombre ?? `Logo ${f.nombre}.png`, tipo: "image/png" });
          const { error } = await supabaseAdmin.from(t.tabla).update({ logo_ruta: ruta }).eq("id", f.id);
          if (error) throw new Error(error.message);
          return 1;
        } catch (e) {
          errores.push(`Logo de ${f.nombre}: ${motivo(e)}`);
          return 0;
        }
      }),
  };
})();

// Los dos de pertec-web: el archivo queda en SharePoint y la URL guardada pasa a ser el enlace
// del Core (pide sesión). Solo se toman los que viven en el bucket público de siempre.
const esDelBucket = (url: unknown, bucket: string) => typeof url === "string" && url.includes(`/storage/v1/object/public/${bucket}/`);

const mantencion: Modulo = (() => {
  const t = { cliente: pertecWebSupabase, tabla: "checklist_run_items", columnas: "id, fotos" };
  const pendientes = (f: any) => ((f.fotos ?? []) as any[]).filter((x) => viejo(x?.path) && esDelBucket(x?.url, "equipos")).length;
  return {
    clave: "mantencion",
    nombre: "Mantención (fotos de evidencia)",
    contar: () => contarFilas(t, pendientes),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        if (!pendientes(f)) return 0;
        let n = 0;
        const fotos = [];
        for (const x of f.fotos as any[]) {
          if (!(viejo(x?.path) && esDelBucket(x?.url, "equipos"))) { fotos.push(x); continue; }
          try {
            const ruta = await pasar({ buckets: ["equipos"], cliente: pertecWebSupabase, ruta: x.path, carpeta: CARPETA_MANTENCION, nombre: x.nombre });
            fotos.push({ ...x, path: ruta, url: enlacePermanente(ruta, "proyectos", x.nombre) });
            n++;
          } catch (e) {
            errores.push(`Foto ${x.nombre}: ${motivo(e)}`);
            fotos.push(x);
          }
        }
        if (n) {
          const { error } = await pertecWebSupabase.from(t.tabla).update({ fotos }).eq("id", f.id);
          if (error) throw new Error(`guardar las fotos ${f.id}: ${error.message}`);
        }
        return n;
      }),
  };
})();

const gastosProyectos: Modulo = (() => {
  const t = { cliente: pertecWebSupabase, tabla: "proyectos", columnas: "id, nombre, gastos" };
  const archivosDe = (f: any) => ((f.gastos ?? []) as any[]).flatMap((g) => (g?.archivos ?? []) as any[]);
  const pendientes = (f: any) => archivosDe(f).filter((a) => viejo(a?.path) && esDelBucket(a?.url, "gastos")).length;
  return {
    clave: "proyectos",
    nombre: "Proyectos (boletas de gastos)",
    contar: () => contarFilas(t, pendientes),
    lote: (cursor, hasta) =>
      recorrer(t, cursor, hasta, async (f, errores) => {
        if (!pendientes(f)) return 0;
        const cambios = new Map<string, { path: string; url: string }>();
        for (const a of archivosDe(f)) {
          if (!(viejo(a?.path) && esDelBucket(a?.url, "gastos")) || cambios.has(a.path)) continue;
          try {
            const ruta = await pasar({ buckets: ["gastos"], cliente: pertecWebSupabase, ruta: a.path, carpeta: carpetaGastosProyecto(f), nombre: a.nombre, tipo: a.tipo });
            cambios.set(a.path, { path: ruta, url: enlacePermanente(ruta, "proyectos", a.nombre) });
          } catch (e) {
            errores.push(`Proyecto «${f.nombre}» · ${a.nombre}: ${motivo(e)}`);
          }
        }
        if (!cambios.size) return 0;
        const { data: actual } = await pertecWebSupabase.from(t.tabla).select("gastos").eq("id", f.id).maybeSingle();
        const gastos = ((actual?.gastos ?? []) as any[]).map((g) =>
          g?.archivos ? { ...g, archivos: (g.archivos as any[]).map((a) => (a?.path && cambios.has(a.path) ? { ...a, ...cambios.get(a.path) } : a)) } : g,
        );
        const { error } = await pertecWebSupabase.from(t.tabla).update({ gastos }).eq("id", f.id);
        if (error) throw new Error(`guardar el proyecto «${f.nombre}»: ${error.message}`);
        return cambios.size;
      }),
  };
})();

export const MODULOS_TRASPASO: Modulo[] = [tareas, flota, inventario, finanzas, rendiciones, ofertas, maestros, logosEmpresas, mantencion, gastosProyectos];

/**
 * Archivos en «Rendiciones» que ninguna rendición nombra: copias que quedaron de una tanda
 * cortada a mitad de camino. Con `limpiar`, se mandan a la papelera del sitio (recuperables).
 */
export async function sobrantesDeRendiciones(limpiar: boolean): Promise<{ total: number; sobrantes: string[]; enviadosAPapelera: number }> {
  const { data, error } = await supabaseAdmin.from("rendiciones").select("gastos");
  if (error) throw new Error(`rendiciones: ${error.message}`);
  const usados = new Set<string>();
  for (const f of (data ?? []) as any[]) for (const g of (f.gastos ?? []) as any[]) if (esReferenciaSharePoint(g?.archivoPath)) usados.add(g.archivoPath);
  const archivos = await listarCarpetaDeSharePoint("Rendiciones");
  const sobra = archivos.filter((a) => !usados.has(a.ref));
  if (limpiar && sobra.length) await borrarDeSharePoint(sobra.map((a) => a.ref));
  return { total: archivos.length, sobrantes: sobra.map((a) => a.ruta), enviadosAPapelera: limpiar ? sobra.length : 0 };
}
