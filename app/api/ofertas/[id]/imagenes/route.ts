import { NextResponse } from "next/server";
import {
  agregarImagenesAlInventario,
  obtenerOferta,
  quitarImagenDelInventario,
  verificarAccesoOfertasApi,
} from "@/lib/ofertas/datos";
import { agregarImagenSubida, borrarImagen, type ImagenGuardada } from "@/lib/ofertas/imagenes";
import { esFormatoDeLogo } from "@/lib/ofertas/logo";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";
// Abrir una imagen, escalarla y subirla al bucket. No espera a ningún modelo.
export const maxDuration = 30;

/**
 * Agregar y quitar imágenes de una oferta.
 *
 * El borrador aporta las suyas al leerlo, pero eso no alcanza: una foto de la faena
 * sacada después, un plano que llegó por correo o una firma escaneada no están en
 * el archivo original y son exactamente lo que alguien quiere sumar al documento.
 *
 * Va por route handler y no por server action por el mismo motivo que los logos:
 * las actions cortan el cuerpo en 1 MB y una foto de teléfono pesa más. El tope acá
 * es el del servidor (ver lib/subidas.ts), y lo que se guarda es la versión ya
 * normalizada —escalada, sin EXIF—, así que el archivo pesado no llega ni a la base
 * ni al PDF.
 *
 * Subir una imagen NO la pone en el documento: queda en el inventario, sin sección,
 * hasta que alguien elige dónde va. Son dos decisiones distintas y el sistema no
 * adivina la segunda.
 *
 * Quitar vale para cualquier imagen, venga del borrador o no. Antes solo se podían
 * quitar las subidas a mano —el inventario del borrador es el registro de lo que
 * traía el archivo original— pero el cajón de fotos muestra las dos clases y la
 * mayoría son del borrador: un botón que funciona en una de cada diez fotos se lee
 * como un botón roto. Lo que protege ahora es la confirmación, que dice qué se
 * pierde en cada caso, y que el archivo de origen sigue nombrado en la oferta.
 */

/** Una oferta en borrador de esta empresa, o el motivo por el que no se puede tocar. */
async function ofertaEditable(id: string) {
  const oferta = await obtenerOferta(id);
  if (!oferta) return { error: "La oferta no existe.", estado: 404 as const };
  // Igual que el logo y el maestro: una emitida ya salió, y cambiarle las imágenes
  // dejaría el registro diciendo algo distinto de lo que recibió el cliente.
  if (oferta.estado === "emitida") {
    return { error: "La oferta ya está emitida: sus imágenes no se cambian.", estado: 409 as const };
  }
  return { oferta };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoOfertasApi();
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const { id } = await params;

  const resuelto = await ofertaEditable(id);
  if ("error" in resuelto) {
    return NextResponse.json({ error: resuelto.error }, { status: resuelto.estado });
  }

  const formulario = await request.formData();
  const archivos = formulario.getAll("archivo").filter((valor): valor is File => valor instanceof File);
  if (archivos.length === 0) {
    return NextResponse.json({ error: "No se recibió ninguna imagen." }, { status: 400 });
  }

  for (const archivo of archivos) {
    // El mismo conjunto de formatos que un logo, y por la misma razón: todo pasa
    // por sharp antes de guardarse, así que un SVG queda rasterizado.
    if (!esFormatoDeLogo(archivo.type, archivo.name)) {
      return NextResponse.json(
        { error: `"${archivo.name}" no es una imagen: tiene que ser PNG, JPG, WEBP o SVG.` },
        { status: 400 },
      );
    }
    if (archivo.size > LIMITE_SUBIDA) {
      const mb = (archivo.size / 1024 / 1024).toFixed(1).replace(".", ",");
      return NextResponse.json(
        { error: `"${archivo.name}" pesa ${mb} MB y el tope por subida es 4 MB.` },
        { status: 400 },
      );
    }
  }

  const nuevas: ImagenGuardada[] = [];
  try {
    for (const archivo of archivos) {
      // El inventario crece dentro del lote: si no, dos imágenes de la misma subida
      // se llevarían el mismo número.
      nuevas.push(
        await agregarImagenSubida(
          [...resuelto.oferta.imagenes, ...nuevas],
          archivo.name,
          Buffer.from(await archivo.arrayBuffer()),
        ),
      );
    }
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] una imagen subida no se pudo procesar:", detalle);
    // Lo que alcanzó a subirse queda en el bucket sin que nada lo nombre: se limpia
    // acá mismo, porque la fila todavía no se tocó.
    await Promise.all(nuevas.map(borrarImagen));
    return NextResponse.json(
      { error: "No se pudo leer la imagen. Probá con un PNG o un JPG exportado de nuevo." },
      { status: 400 },
    );
  }

  await agregarImagenesAlInventario(id, nuevas);
  return NextResponse.json({ agregadas: nuevas.map((imagen) => imagen.indice) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoOfertasApi();
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const { id } = await params;

  const resuelto = await ofertaEditable(id);
  if ("error" in resuelto) {
    return NextResponse.json({ error: resuelto.error }, { status: resuelto.estado });
  }

  const indice = Number(new URL(request.url).searchParams.get("indice"));
  const imagen = resuelto.oferta.imagenes.find((i) => i.indice === indice);
  if (!imagen) return NextResponse.json({ error: "Esa imagen no está en la oferta." }, { status: 404 });

  // La fila primero: al revés, un fallo al guardar dejaría el inventario apuntando a
  // un archivo que ya no existe.
  const quitada = await quitarImagenDelInventario(id, indice);
  if (quitada) await borrarImagen(quitada);
  return NextResponse.json({ quitada: indice });
}
