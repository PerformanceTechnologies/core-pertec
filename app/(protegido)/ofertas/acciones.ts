"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  asignarMaestro,
  duplicarOferta,
  eliminarOferta,
  exigirOferta,
  guardarImagenesElegidas,
} from "@/lib/ofertas/datos";
import { borrarImagenes } from "@/lib/ofertas/imagenes";
import { borrarPdfEmitido } from "@/lib/ofertas/pdf-archivo";
import { SECCIONES_CON_IMAGENES, type SeccionConImagenes } from "@/lib/ofertas/tipos";

/**
 * Borra una oferta del listado.
 *
 * Solo las que están en borrador: una emitida ya salió para afuera y su registro
 * es lo único que queda de lo que se mandó. Si de verdad hay que sacarla, alguien
 * con acceso a la base lo hace a conciencia, no por un clic al lado del nombre.
 */
// Las acciones que reciben un id pasan por exigirOferta y no por
// exigirAccesoOfertas: además del acceso a la app, verifica que la oferta sea de
// quien la manda. Sin eso, cualquiera con la app podía editar, duplicar o borrar la
// de otro mandando el id.
export async function eliminarOfertaAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { oferta } = await exigirOferta(id);
  if (oferta.estado === "emitida") return;

  // Los archivos primero: si se borra la fila y falla el bucket, quedan archivos que
  // nada nombra y nadie va a encontrar.
  await borrarImagenes(oferta.imagenes);
  await borrarPdfEmitido(oferta.emision?.pdfRuta ?? null);
  await eliminarOferta(id);
  revalidatePath("/ofertas");
}

/**
 * Duplica una oferta y abre el duplicado.
 *
 * Vale también para una emitida —de hecho es su caso principal—: una emitida es de
 * solo lectura, y hasta ahora el único camino para la siguiente parecida era volver a
 * subir un borrador. Duplicar no la toca: crea un documento nuevo.
 */
export async function duplicarOfertaAction(formData: FormData) {
  // El guard ya devuelve el usuario, y su ID es lo que espera la columna: pasarle el
  // correo hacía fallar el insert —creado_por es un uuid— y la pantalla mostraba
  // "A server error occurred" sin más.
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { usuario } = await exigirOferta(id);
  const nuevo = await duplicarOferta(id, usuario.id);
  if (!nuevo) return;

  revalidatePath("/ofertas");
  // Se abre el duplicado: duplicar es para trabajar en la copia, no para dejarla en
  // el listado y tener que buscarla entre las demás.
  redirect(`/ofertas/${nuevo}`);
}

/**
 * Cambia con qué maestro se imprime una oferta.
 *
 * Solo en borradores: una emitida ya salió con un formato y cambiárselo dejaría el
 * registro diciendo algo distinto de lo que recibió el cliente.
 */
export async function asignarMaestroAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const maestroId = String(formData.get("maestroId") ?? "");
  if (!id) return;

  const { oferta } = await exigirOferta(id);
  if (oferta.estado === "emitida") return;

  await asignarMaestro(id, maestroId || null);
  revalidatePath(`/ofertas/${id}`);
}

/**
 * Guarda dónde va cada imagen del borrador.
 *
 * El formulario manda un campo "seccion-<n>" por imagen con lo elegido: vacío para
 * no usarla, la clave de una sección, o "firma-<i>" para que sea la rúbrica del
 * firmante que está en esa posición. Un solo control por imagen y no uno para la
 * sección más otro para la firma: son la misma pregunta —dónde va esta imagen— y
 * separarlas permitía contestar las dos a la vez.
 *
 * Se valida todo contra el INVENTARIO de esa oferta, contra la lista de secciones
 * que existen y contra los firmantes que tiene: un índice inventado no dibuja nada,
 * pero tampoco tiene por qué quedar guardado.
 */
export async function elegirImagenesAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { oferta } = await exigirOferta(id);
  if (oferta.estado === "emitida") return;

  const cuantosFirmantes = oferta.contenido.cierre?.firmantes.length ?? 0;
  // En el orden del inventario, que es el del documento y el de las miniaturas.
  const porSeccion: Partial<Record<SeccionConImagenes, number[]>> = {};
  const firmas = new Map<number, number>();

  for (const imagen of oferta.imagenes) {
    const elegida = String(formData.get(`seccion-${imagen.indice}`) ?? "");

    if (elegida.startsWith("firma-")) {
      const firmante = Number(elegida.slice("firma-".length));
      if (!Number.isInteger(firmante) || firmante < 0 || firmante >= cuantosFirmantes) continue;
      // Si dos imágenes dicen ser la rúbrica de la misma persona gana la primera
      // del inventario: alguien tiene que ganar, y que sea siempre la misma.
      if (!firmas.has(firmante)) firmas.set(firmante, imagen.indice);
      continue;
    }

    const seccion = elegida as SeccionConImagenes;
    if (!SECCIONES_CON_IMAGENES.includes(seccion)) continue;
    porSeccion[seccion] = [...(porSeccion[seccion] ?? []), imagen.indice];
  }

  await guardarImagenesElegidas(id, porSeccion, firmas);
  revalidatePath(`/ofertas/${id}`);
}
