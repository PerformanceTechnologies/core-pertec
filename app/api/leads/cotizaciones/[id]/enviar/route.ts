import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, RUTA_LEADS, auditar, contextoLeadsApi } from "@/lib/fin/datos";
import { cotizacionParaDocumento } from "@/lib/fin/cotizacion-datos";
import { cotizacionAPdf, nombreArchivoCotizacion } from "@/lib/fin/cotizacion-pdf";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { enviarOfertaPorCorreo } from "@/lib/ofertas/correo";
import { correosValidos } from "@/lib/ofertas/emision";
import { guardarArchivo } from "@/lib/archivos/almacen";
import { nombreUnico } from "@/lib/archivos/sharepoint-core";
import { carpetaVentaCliente } from "@/lib/archivos/carpetas";

export const runtime = "nodejs";
// Levanta Chromium, imprime y manda: el paso más largo del módulo.
export const maxDuration = 120;

/**
 * Enviar la cotización al cliente: imprime el PDF, lo manda desde el Outlook de quien envía (queda en
 * SUS enviados y el cliente le responde a esa persona) y deja el rastro en Finanzas:
 *   · la cotización pasa a «Enviada» (con fecha y destinatarios),
 *   · el lead avanza a «Cotización enviada» si estaba antes,
 *   · queda una actividad de correo en la cotización y en el lead,
 *   · el PDF exacto que recibió el cliente se guarda como respaldo.
 * Si el correo falla, NADA de eso se registra: no se finge un envío.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoLeadsApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Cotización inválida" }, { status: 400 });

  const cuerpo = (await request.json().catch(() => null)) as { destinatarios?: string; copias?: string; asunto?: string; mensaje?: string } | null;
  const destinatarios = correosValidos(cuerpo?.destinatarios ?? "");
  const copias = correosValidos(cuerpo?.copias ?? "");
  if (destinatarios.length === 0) return NextResponse.json({ error: "Escribe al menos un correo válido en «Para»." }, { status: 400 });
  const asunto = (cuerpo?.asunto ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const mensaje = (cuerpo?.mensaje ?? "").slice(0, 8000);
  if (!asunto) return NextResponse.json({ error: "Falta el asunto." }, { status: 400 });
  if (!mensaje.trim()) return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });

  let datos;
  try {
    datos = await cotizacionParaDocumento(ctx, id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "No se encontró la cotización." }, { status: 404 });
  }
  if (!["borrador", "enviada"].includes(datos.estado)) return NextResponse.json({ error: "Solo se envía una cotización en borrador o ya enviada. Crea una nueva versión." }, { status: 409 });

  const token = await accessTokenDeUsuario(ctx.usuario.id);
  if (token.estado !== "ok") return NextResponse.json({ error: "Tu cuenta de Microsoft no está conectada. Entra a Mi Día y vuelve a iniciar sesión." }, { status: 409 });

  let pdf: Buffer;
  try {
    pdf = await cotizacionAPdf(datos.documento);
  } catch (e) {
    console.error("[leads] la impresión al enviar falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el PDF. Inténtalo de nuevo." }, { status: 500 });
  }
  const d = datos.documento;
  const nombreArchivo = nombreArchivoCotizacion(d.numero, d.version, d.cliente?.nombre ?? null);

  try {
    await enviarOfertaPorCorreo(token.accessToken, { destinatarios, copias, asunto, cuerpo: mensaje, nombreArchivo, pdf });
  } catch (e) {
    console.error("[leads] no se pudo enviar la cotización:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo enviar el correo. Revisa los destinatarios y vuelve a intentarlo." }, { status: 502 });
  }

  // Desde acá el correo YA salió: lo que falle se avisa, pero no se deshace ni se reintenta el envío.
  const problemas: string[] = [];
  const ahora = new Date().toISOString();
  const lista = destinatarios.join(", ");
  try {
    await supabaseAdmin
      .from("fin_cotizaciones")
      .update({ estado: "enviada", fecha_envio: ctx.hoy, enviada_a: lista, enviada_en: ahora, actualizado_en: ahora })
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id);
    if (datos.oportunidadId) {
      await supabaseAdmin.from("fin_oportunidades").update({ etapa: "cotizacion", probabilidad: 50, actualizado_en: ahora }).eq("id", datos.oportunidadId).eq("empresa_id", ctx.empresa.id).in("etapa", ["prospecto", "calificada"]);
    }
    const texto = `Cotización ${d.numero}${d.version > 1 ? ` V${d.version}` : ""} enviada a ${lista}`;
    const filas = [{ empresa_id: ctx.empresa.id, entidad_tipo: "cotizacion", entidad_id: id, tipo: "correo", texto, fecha: ctx.hoy, creado_por: ctx.usuario.correo }];
    if (datos.oportunidadId) filas.push({ empresa_id: ctx.empresa.id, entidad_tipo: "oportunidad", entidad_id: datos.oportunidadId, tipo: "correo", texto, fecha: ctx.hoy, creado_por: ctx.usuario.correo });
    await supabaseAdmin.from("fin_actividades").insert(filas);
    await auditar(ctx, "fin_cotizaciones", id, "enviar", `Enviada a ${lista}`, { despues: { asunto, copias } });
  } catch (e) {
    console.error("[leads] el correo salió pero no se pudo registrar:", e instanceof Error ? e.message : e);
    problemas.push("El correo salió, pero no se pudo registrar el cambio de estado. Márcala «Enviada» a mano.");
  }

  // Respaldo: el PDF exacto que recibió el cliente (como cualquier adjunto de Finanzas).
  try {
    const ruta = await guardarArchivo({
      carpeta: carpetaVentaCliente(ctx.empresa.nombre, d.cliente?.nombre),
      nombre: nombreUnico(nombreArchivo, "pdf"),
      contenido: pdf,
      tipo: "application/pdf",
      respaldo: { bucket: "finanzas", ruta: `${ctx.empresa.id}/cotizacion/${id}/${randomUUID()}.pdf` },
    });
    await supabaseAdmin.from("fin_adjuntos").insert({ empresa_id: ctx.empresa.id, entidad_tipo: "cotizacion", entidad_id: id, tipo: "cotizacion_cliente", ruta, nombre: nombreArchivo.slice(0, 200), mime: "application/pdf", tamano: pdf.length, subido_por: ctx.usuario.correo });
  } catch (e) {
    console.error("[leads] no se pudo guardar el respaldo del PDF enviado:", e instanceof Error ? e.message : e);
    problemas.push("No se pudo guardar una copia del PDF enviado como respaldo.");
  }

  revalidatePath(RUTA_FIN, "layout");
  revalidatePath(RUTA_LEADS, "layout");
  return NextResponse.json({ ok: true, enviadoA: destinatarios, problemas });
}
