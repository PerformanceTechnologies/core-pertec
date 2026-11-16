import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { carpetaFinanzas, carpetaOcProveedor, carpetaVentaCliente } from "@/lib/archivos/carpetas";
import { RUTA_FIN, RUTA_LEADS, auditar, contextoFinApi, contextoLeadsApi, type ContextoFin } from "@/lib/fin/datos";

export const ENTIDADES_ADJUNTO: Record<string, string> = {
  cotizacion: "fin_cotizaciones", oportunidad: "fin_oportunidades", hito: "fin_hitos", documento: "fin_documentos", compra: "fin_compras", movimiento: "fin_movimientos",
  operacion_factoring: "fin_operaciones_factoring", cobro: "fin_cobros", pago: "fin_pagos", proyecto: "fin_proyectos",
};

/** Tipos de archivo aceptados (por MIME) y su extensión. */
export const TIPOS_ADJUNTO: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/xml": "xml", "application/xml": "xml",
  "text/csv": "csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/msword": "doc",
};

/** Tope de la subida directa a SharePoint (no pasa por el servidor). */
export const TOPE_ADJUNTO_DIRECTO = 100 * 1024 * 1024;

/** Quién sube y a qué carpeta va. Quien solo tiene Leads puede documentar leads y cotizaciones. */
export async function prepararAdjunto(entidadTipo: string, entidadId: string): Promise<{ ok: true; ctx: ContextoFin; tabla: string; carpeta: string } | { ok: false; error: string; status: number }> {
  const ctxFin = await contextoFinApi();
  const ctx = ctxFin ?? (await contextoLeadsApi());
  if (!ctx) return { ok: false, error: "No autorizado", status: 403 };
  if (!ctxFin && entidadTipo !== "cotizacion" && entidadTipo !== "oportunidad") return { ok: false, error: "No autorizado", status: 403 };
  const tabla = ENTIDADES_ADJUNTO[entidadTipo];
  if (!tabla || !/^[0-9a-f-]{36}$/.test(entidadId)) return { ok: false, error: "Registro inválido.", status: 400 };
  const { data: dueño } = await supabaseAdmin.from(tabla).select("*").eq("id", entidadId).eq("empresa_id", ctx.empresa.id).maybeSingle();
  if (!dueño) return { ok: false, error: "Ese registro no existe o es de otra empresa.", status: 404 };

  // Compras quedan en la carpeta de su proveedor; ventas (cotizaciones, leads, hitos), en la de su cliente.
  const fila = dueño as { proveedor_id?: string | null; cliente_id?: string | null };
  const esVenta = ["cotizacion", "hito", "oportunidad"].includes(entidadTipo);
  const contactoId = entidadTipo === "compra" ? fila.proveedor_id : esVenta ? fila.cliente_id : null;
  let carpeta = esVenta ? carpetaVentaCliente(ctx.empresa.nombre, null) : carpetaFinanzas(ctx.empresa.nombre, entidadTipo, entidadId);
  if (contactoId) {
    const { data: c } = await supabaseAdmin.from("finanzas_contactos").select("razon_social").eq("id", contactoId).maybeSingle();
    if (c?.razon_social) carpeta = entidadTipo === "compra" ? carpetaOcProveedor(ctx.empresa.nombre, c.razon_social) : carpetaVentaCliente(ctx.empresa.nombre, c.razon_social);
  }
  return { ok: true, ctx, tabla, carpeta };
}

/** Deja registrado el archivo ya guardado. */
export async function registrarAdjunto(o: { ctx: ContextoFin; tabla: string; entidadTipo: string; entidadId: string; tipo: string; ruta: string; nombre: string; mime: string; tamano: number }): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabaseAdmin
    .from("fin_adjuntos")
    .insert({ empresa_id: o.ctx.empresa.id, entidad_tipo: o.entidadTipo, entidad_id: o.entidadId, tipo: o.tipo.slice(0, 30), ruta: o.ruta, nombre: o.nombre.slice(0, 200), mime: o.mime, tamano: o.tamano, subido_por: o.ctx.usuario.correo })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (o.entidadTipo === "movimiento") await supabaseAdmin.from("fin_movimientos").update({ tiene_respaldo: true }).eq("id", o.entidadId);
  await auditar(o.ctx, o.tabla, o.entidadId, "adjuntar", o.nombre);
  revalidatePath(RUTA_FIN, "layout");
  revalidatePath(RUTA_LEADS, "layout");
  return { id: data!.id };
}
