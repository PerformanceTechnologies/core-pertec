import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, auditar, contextoFinApi, exigirDeEmpresa } from "@/lib/fin/datos";
import { exigirRol } from "@/lib/fin/flujos";
import { ocParaDocumento } from "@/lib/fin/oc-datos";
import { ocAPdf } from "@/lib/fin/oc-pdf";
import { nombreArchivoOc } from "@/lib/fin/oc-documento";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { enviarOfertaPorCorreo } from "@/lib/ofertas/correo";
import { correosValidos } from "@/lib/ofertas/emision";
import { guardarArchivo } from "@/lib/archivos/almacen";
import { nombreUnico } from "@/lib/archivos/sharepoint-core";
import { carpetaOcProveedor } from "@/lib/archivos/carpetas";

export const runtime = "nodejs";
// Levanta Chromium, imprime y manda: el paso más largo del módulo.
export const maxDuration = 120;

/**
 * Enviar la OC al proveedor: imprime el PDF, lo manda desde el Outlook de quien envía (queda en SUS enviados y el
 * proveedor le responde a esa persona) y deja el rastro en la solicitud:
 *   · pasa a «Esperar respuesta del proveedor» (con fecha y destinatarios),
 *   · queda en el historial,
 *   · el PDF exacto que recibió el proveedor se guarda como respaldo.
 * Si el correo falla, NADA de eso se registra: no se finge un envío.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  try {
    await exigirRol(ctx, "compras_visador", { accion: "enviar la OC al proveedor" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado" }, { status: 403 });
  }

  const cuerpo = (await request.json().catch(() => null)) as { destinatarios?: string; copias?: string; asunto?: string; mensaje?: string } | null;
  const destinatarios = correosValidos(cuerpo?.destinatarios ?? "");
  const copias = correosValidos(cuerpo?.copias ?? "");
  if (destinatarios.length === 0) return NextResponse.json({ error: "Escribe al menos un correo válido en «Para»." }, { status: 400 });
  const asunto = (cuerpo?.asunto ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const mensaje = (cuerpo?.mensaje ?? "").slice(0, 8000);
  if (!asunto) return NextResponse.json({ error: "Falta el asunto." }, { status: 400 });
  if (!mensaje.trim()) return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });

  let compra;
  let datos;
  try {
    compra = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    datos = await ocParaDocumento(ctx, id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "No se encontró la solicitud." }, { status: 404 });
  }
  if (!compra.formato_oc) return NextResponse.json({ error: "Esta compra es anterior al formato de OC: no tiene PDF." }, { status: 409 });
  if (compra.estado_override) return NextResponse.json({ error: "La solicitud está anulada." }, { status: 409 });
  if (!compra.oc_numero || !compra.fecha_visado) return NextResponse.json({ error: "La OC se envía después de visarla." }, { status: 409 });

  const token = await accessTokenDeUsuario(ctx.usuario.id);
  if (token.estado !== "ok") return NextResponse.json({ error: "Tu cuenta de Microsoft no está conectada. Entra a Mi Día y vuelve a iniciar sesión." }, { status: 409 });

  let pdf: Buffer;
  try {
    pdf = await ocAPdf(datos.documento);
  } catch (e) {
    console.error("[compras] la impresión de la OC al enviar falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el PDF. Inténtalo de nuevo." }, { status: 500 });
  }
  const nombreArchivo = nombreArchivoOc(datos.documento);

  try {
    await enviarOfertaPorCorreo(token.accessToken, { destinatarios, copias, asunto, cuerpo: mensaje, nombreArchivo, pdf });
  } catch (e) {
    console.error("[compras] no se pudo enviar la OC:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo enviar el correo. Revisa los destinatarios y vuelve a intentarlo." }, { status: 502 });
  }

  // Desde acá el correo YA salió: lo que falle se avisa, pero no se deshace ni se reintenta el envío.
  const problemas: string[] = [];
  const lista = destinatarios.join(", ");
  try {
    const { error } = await supabaseAdmin
      .from("fin_compras")
      // Al (re)enviar se espera una respuesta nueva: la anterior (p. ej. un rechazo) ya no vale.
      .update({ oc_enviada_en: new Date().toISOString(), oc_enviada_a: lista, oc_enviada_fecha: ctx.hoy, oc_respuesta: null, oc_respuesta_fecha: null, oc_respuesta_por: null, oc_respuesta_obs: null, actualizado_en: new Date().toISOString() })
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id);
    if (error) throw new Error(error.message);
    await auditar(ctx, "fin_compras", id, "oc_enviada", `OC ${compra.oc_numero} enviada a ${lista}`, { despues: { asunto, copias } });
  } catch (e) {
    console.error("[compras] el correo salió pero no se pudo registrar:", e instanceof Error ? e.message : e);
    problemas.push("El correo salió, pero no se pudo registrar el envío. Márcala «OC enviada» a mano.");
  }

  // Respaldo: el PDF exacto que recibió el proveedor.
  try {
    const ruta = await guardarArchivo({
      carpeta: carpetaOcProveedor(ctx.empresa.nombre, datos.documento.proveedor?.nombre),
      nombre: nombreUnico(nombreArchivo, "pdf"),
      contenido: pdf,
      tipo: "application/pdf",
      respaldo: { bucket: "finanzas", ruta: `${ctx.empresa.id}/compra/${id}/${randomUUID()}.pdf` },
    });
    await supabaseAdmin.from("fin_adjuntos").insert({ empresa_id: ctx.empresa.id, entidad_tipo: "compra", entidad_id: id, tipo: "oc_enviada", ruta, nombre: nombreArchivo.slice(0, 200), mime: "application/pdf", tamano: pdf.length, subido_por: ctx.usuario.correo });
  } catch (e) {
    console.error("[compras] no se pudo guardar el respaldo de la OC enviada:", e instanceof Error ? e.message : e);
    problemas.push("No se pudo guardar una copia del PDF enviado como respaldo.");
  }

  revalidatePath(RUTA_FIN, "layout");
  revalidatePath("/finanzas", "layout");
  return NextResponse.json({ ok: true, enviadoA: destinatarios, problemas });
}
