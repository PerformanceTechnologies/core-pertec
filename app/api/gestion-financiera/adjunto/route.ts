import { NextResponse } from "next/server";
import { guardarArchivo } from "@/lib/archivos/almacen";
import { nombreUnico } from "@/lib/archivos/sharepoint-core";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, auditar, contextoFinApi } from "@/lib/fin/datos";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";

const TIPOS: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/xml": "xml", "application/xml": "xml",
  "text/csv": "csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const ENTIDADES: Record<string, string> = {
  cotizacion: "fin_cotizaciones", hito: "fin_hitos", documento: "fin_documentos", compra: "fin_compras", movimiento: "fin_movimientos",
  operacion_factoring: "fin_operaciones_factoring", cobro: "fin_cobros", pago: "fin_pagos", proyecto: "fin_proyectos",
};

/** Sube un respaldo al bucket privado «finanzas» bajo la carpeta de la empresa activa. */
export async function POST(request: Request) {
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const fd = await request.formData().catch(() => null);
  const archivo = fd?.get("archivo");
  const entidadTipo = String(fd?.get("entidadTipo") ?? "");
  const entidadId = String(fd?.get("entidadId") ?? "");
  const tipo = String(fd?.get("tipo") ?? "otro").slice(0, 30);
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (!Object.hasOwn(TIPOS, archivo.type)) return NextResponse.json({ error: "Sube un PDF, una imagen, un XML o una planilla." }, { status: 400 });
  if (archivo.size > LIMITE_SUBIDA) return NextResponse.json({ error: "El archivo pasa el tope de 4 MB." }, { status: 413 });
  const tabla = ENTIDADES[entidadTipo];
  if (!tabla || !/^[0-9a-f-]{36}$/.test(entidadId)) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
  const { data: dueño } = await supabaseAdmin.from(tabla).select("id").eq("id", entidadId).eq("empresa_id", ctx.empresa.id).maybeSingle();
  if (!dueño) return NextResponse.json({ error: "Ese registro no existe o es de otra empresa." }, { status: 404 });

  let ruta: string;
  try {
    ruta = await guardarArchivo({
      carpeta: `Gestion financiera/${ctx.empresa.nombre}/${entidadTipo}/${entidadId}`,
      nombre: nombreUnico(archivo.name, TIPOS[archivo.type]),
      contenido: Buffer.from(await archivo.arrayBuffer()),
      tipo: archivo.type,
      respaldo: { bucket: "finanzas", ruta: `${ctx.empresa.id}/${entidadTipo}/${entidadId}/${randomUUID()}.${TIPOS[archivo.type]}` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar el archivo." }, { status: 500 });
  }
  const { data, error: e2 } = await supabaseAdmin
    .from("fin_adjuntos")
    .insert({ empresa_id: ctx.empresa.id, entidad_tipo: entidadTipo, entidad_id: entidadId, tipo, ruta, nombre: archivo.name.slice(0, 200), mime: archivo.type, tamano: archivo.size, subido_por: ctx.usuario.correo })
    .select("id")
    .single();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  // Un movimiento con respaldo adjunto queda con respaldo.
  if (entidadTipo === "movimiento") await supabaseAdmin.from("fin_movimientos").update({ tiene_respaldo: true }).eq("id", entidadId);
  await auditar(ctx, tabla, entidadId, "adjuntar", archivo.name);
  revalidatePath(RUTA_FIN, "layout");
  return NextResponse.json({ ok: true, id: data!.id });
}
