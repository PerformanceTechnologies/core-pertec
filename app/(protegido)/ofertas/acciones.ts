"use server";

import { revalidatePath } from "next/cache";
import { asignarMaestro, eliminarOferta, exigirAccesoOfertas, obtenerOferta } from "@/lib/ofertas/datos";

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
