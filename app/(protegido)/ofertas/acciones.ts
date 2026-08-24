"use server";

import { revalidatePath } from "next/cache";
import {
  asignarMaestro,
  eliminarOferta,
  exigirAccesoOfertas,
  guardarImagenesElegidas,
  obtenerOferta,
} from "@/lib/ofertas/datos";
import { borrarImagenes } from "@/lib/ofertas/imagenes";
import { SECCIONES_CON_IMAGENES, type SeccionConImagenes } from "@/lib/ofertas/tipos";

/**
 * Borra una oferta del listado.
 *
 * Solo las que están en borrador: una emitida ya salió para afuera y su registro
 * es lo único que queda de lo que se mandó. Si de verdad hay que sacarla, alguien
 * con acceso a la base lo hace a conciencia, no por un clic al lado del nombre.
 */
export async function eliminarOfertaAction(formData: FormData) {
  await exigirAccesoOfertas();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const oferta = await obtenerOferta(id);
  if (!oferta || oferta.estado === "emitida") return;

  // Las imágenes primero: si se borra la fila y falla el bucket, quedan archivos
  // que nada nombra.
  await borrarImagenes(oferta.imagenes);
  await eliminarOferta(id);
  revalidatePath("/ofertas");
}

/**
 * Cambia con qué maestro se imprime una oferta.
 *
 * Solo en borradores: una emitida ya salió con un formato y cambiárselo dejaría el
 * registro diciendo algo distinto de lo que recibió el cliente.
 */
export async function asignarMaestroAction(formData: FormData) {
  await exigirAccesoOfertas();
  const id = String(formData.get("id") ?? "");
  const maestroId = String(formData.get("maestroId") ?? "");
  if (!id) return;

  const oferta = await obtenerOferta(id);
  if (!oferta || oferta.estado === "emitida") return;

  await asignarMaestro(id, maestroId || null);
  revalidatePath(`/ofertas/${id}`);
}

/**
 * Guarda dónde va cada imagen del borrador.
 *
 * El formulario manda un campo "seccion-<n>" por imagen: la sección elegida, o
 * vacío para no usarla. Se valida todo contra el INVENTARIO de esa oferta y contra
 * la lista de secciones que existen — un índice inventado o una sección que no
 * existe no dibuja nada, pero tampoco tiene por qué quedar guardado.
 */
export async function elegirImagenesAction(formData: FormData) {
  await exigirAccesoOfertas();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const oferta = await obtenerOferta(id);
  if (!oferta || oferta.estado === "emitida") return;

  // En el orden del inventario, que es el del documento y el de las miniaturas.
  const porSeccion: Partial<Record<SeccionConImagenes, number[]>> = {};
  for (const imagen of oferta.imagenes) {
    const elegida = String(formData.get(`seccion-${imagen.indice}`) ?? "") as SeccionConImagenes;
    if (!SECCIONES_CON_IMAGENES.includes(elegida)) continue;
    porSeccion[elegida] = [...(porSeccion[elegida] ?? []), imagen.indice];
  }

  const existentes = new Set(oferta.imagenes.map((imagen) => imagen.indice));
  const firmaCruda = Number(formData.get("firma") ?? 0);
  const firma = existentes.has(firmaCruda) ? firmaCruda : null;

  await guardarImagenesElegidas(id, porSeccion, firma);
  revalidatePath(`/ofertas/${id}`);
}
