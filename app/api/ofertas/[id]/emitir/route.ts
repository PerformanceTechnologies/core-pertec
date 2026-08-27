import { NextResponse } from "next/server";
import {
  guardarEmision,
  accesoAOfertaApi,
  type RegistroEmision,
} from "@/lib/ofertas/datos";
import { ofertaAPdf } from "@/lib/ofertas/pdf";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { enviarOfertaPorCorreo } from "@/lib/ofertas/correo";
import { guardarOfertaEnWorkspace } from "@/lib/ofertas/workspace";
import { guardarPdfEmitido } from "@/lib/ofertas/pdf-archivo";
import { correosValidos, nombreDeArchivoDeOferta } from "@/lib/ofertas/emision";

export const runtime = "nodejs";
// Levanta Chromium, imprime, y después sube y manda. Es el paso más largo del
// módulo y por eso tiene el techo del plan.
export const maxDuration = 300;

/**
 * Emitir la oferta: imprimir, y hacer con el PDF lo que se pidió.
 *
 * Antes emitir era abrir el PDF con `?emitir=1`: imprimía, marcaba el estado y ahí
 * terminaba. El documento quedaba en la pestaña de quien lo generó y lo que pasaba
 * después —guardarlo en alguna parte, mandárselo al cliente— era trabajo a mano que
 * no dejaba rastro. Este paso lo cierra: guarda en el workspace, manda por correo, y
 * anota qué se hizo.
 *
 * El PDF se genera UNA vez y se reusa para las tres cosas. Imprimir levanta Chromium
 * y con las fotos de una oferta tarda; hacerlo tres veces sería el triple de espera y
 * —peor— tres archivos que podrían no ser idénticos si alguien guarda en el medio.
 *
 * Cada destino se hace por separado y se reporta por separado. Si el correo falla,
 * la oferta igual queda emitida y guardada: son tres cosas distintas y que una no
 * salga no invalida las otras. Lo que NO se hace es fingir que salió.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Un solo guard: sesión, acceso a la app y que la oferta sea de quien la pide.
  const acceso = await accesoAOfertaApi(id);
  if (!acceso.oferta) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const { oferta, usuario } = acceso;

  const cuerpo = (await request.json().catch(() => null)) as {
    guardarEnWorkspace?: boolean;
    destinatarios?: string;
    copias?: string;
    asunto?: string;
    mensaje?: string;
  } | null;

  const destinatarios = correosValidos(cuerpo?.destinatarios ?? "");
  const copias = correosValidos(cuerpo?.copias ?? "");
  const quiereCorreo = destinatarios.length > 0;
  const quiereWorkspace = cuerpo?.guardarEnWorkspace === true;

  let pdf: Buffer;
  try {
    pdf = await ofertaAPdf(
      oferta.contenido,
      oferta.empresa,
      oferta.maestroId,
      oferta.logoClienteRuta,
      oferta.imagenes,
    );
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] la impresión al emitir falló:", detalle);
    return NextResponse.json({ error: `No se pudo generar el PDF: ${detalle}` }, { status: 500 });
  }

  const nombreArchivo = nombreDeArchivoDeOferta(oferta.numeroOferta, oferta.cliente);
  const problemas: string[] = [];
  let enWorkspace: string | null = null;

  // Lo PRIMERO que se hace con el PDF: congelarlo. Es el mismo archivo que se va a
  // subir al workspace y a adjuntar al correo, así que guardar este es lo que hace
  // que las tres copias sean la misma, y que descargarla en un año devuelva lo que
  // el cliente recibió y no una reimpresión con el maestro de entonces.
  const pdfRuta = await guardarPdfEmitido(id, pdf);
  if (!pdfRuta) {
    problemas.push(
      "No se pudo guardar la copia del PDF emitido: la descarga va a volver a imprimirlo desde el contenido.",
    );
  }

  if (quiereWorkspace) {
    try {
      const guardado = await guardarOfertaEnWorkspace(new Date().getFullYear(), nombreArchivo, pdf);
      enWorkspace = guardado.webUrl || guardado.ruta;
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      console.error("[ofertas] no se pudo guardar en el workspace:", detalle);
      problemas.push(`No se pudo guardar en el workspace: ${detalle}`);
    }
  }

  let enviadoA: string[] = [];
  if (quiereCorreo) {
    // Delegado: sale de la cuenta de quien emite, no de un buzón de sistema. Sin
    // cuenta conectada no se manda y se dice por qué, en vez de fallar con un 500.
    const token = await accessTokenDeUsuario(usuario.id);
    if (token.estado !== "ok") {
      problemas.push(
        "El correo no se envió: tu cuenta de Microsoft no está conectada. Entrá a Mi Día y volvé a iniciar sesión.",
      );
    } else {
      try {
        await enviarOfertaPorCorreo(token.accessToken, {
          destinatarios,
          copias,
          asunto: (cuerpo?.asunto ?? "").trim() || `Oferta ${oferta.numeroOferta ?? ""}`.trim(),
          cuerpo: cuerpo?.mensaje ?? "",
          nombreArchivo,
          pdf,
        });
        enviadoA = destinatarios;
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        console.error("[ofertas] no se pudo enviar la oferta por correo:", detalle);
        problemas.push(`No se pudo enviar el correo: ${detalle}`);
      }
    }
  }

  // El estado y el registro se guardan igual: el PDF se generó y es el documento que
  // vale. Lo que falló va en `problemas` y la pantalla lo muestra.
  const registro: RegistroEmision = {
    emitidaEn: new Date().toISOString(),
    emitidaPor: usuario.correo,
    enviadoA,
    copias: enviadoA.length > 0 ? copias : [],
    enWorkspace,
    nombreArchivo,
    pdfRuta,
    problemas,
  };
  await guardarEmision(id, registro);

  return NextResponse.json({ emision: registro, bytes: pdf.length });
}
