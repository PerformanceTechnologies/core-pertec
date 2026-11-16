import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { borrarArchivos, leerArchivo } from "@/lib/archivos/almacen";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, RUTA_LEADS, auditar, contextoFinApi, contextoLeadsApi } from "@/lib/fin/datos";

export const runtime = "nodejs";

/** Quien solo tiene Leads ve y quita la documentación de leads y cotizaciones; Finanzas, todo. */
async function documento(id: string) {
  const ctxFin = await contextoFinApi();
  const ctx = ctxFin ?? (await contextoLeadsApi());
  if (!ctx || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: a } = await supabaseAdmin.from("fin_adjuntos").select("*").eq("id", id).eq("empresa_id", ctx.empresa.id).maybeSingle();
  if (!a || (!ctxFin && !["cotizacion", "oportunidad"].includes(a.entidad_tipo))) return null;
  return { ctx, a };
}

/** El archivo para verlo en la ventana (inline, no como descarga). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await documento((await params).id);
  if (!d) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const contenido = await leerArchivo("finanzas", String(d.a.ruta));
  if (!contenido) return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 502 });
  return new NextResponse(new Uint8Array(contenido), {
    headers: {
      "Content-Type": String(d.a.mime ?? "application/octet-stream"),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(d.a.nombre))}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Quita el documento: el archivo (SharePoint o respaldo) y su registro. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await documento((await params).id);
  if (!d) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  await borrarArchivos("finanzas", [String(d.a.ruta)]);
  const { error } = await supabaseAdmin.from("fin_adjuntos").delete().eq("id", d.a.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditar(d.ctx, "fin_adjuntos", String(d.a.entidad_id), "quitar adjunto", String(d.a.nombre));
  revalidatePath(RUTA_FIN, "layout");
  revalidatePath(RUTA_LEADS, "layout");
  return NextResponse.json({ ok: true });
}
