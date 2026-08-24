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
 * Guarda qué imágenes del borrador van al documento.
 *
 * Los números se validan contra el INVENTARIO de esa oferta, no contra lo que
 * venga en el formulario: un índice que no existe no dibuja nada, pero tampoco
 * tiene por qué quedar guardado.
 */
export async function elegirImagenesAction(formData: FormData) {
  await exigirAccesoOfertas();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const oferta = await obtenerOferta(id);
  if (!oferta || oferta.estado === "emitida") return;

  const existentes = new Set(oferta.imagenes.map((imagen) => imagen.indice));
  const fotos = formData
    .getAll("foto")
    .map((valor) => Number(valor))
    .filter((indice) => existentes.has(indice));

  const firmaCruda = Number(formData.get("firma") ?? 0);
  const firma = existentes.has(firmaCruda) ? firmaCruda : null;

  await guardarImagenesElegidas(id, fotos, firma);
  revalidatePath(`/ofertas/${id}`);
}
