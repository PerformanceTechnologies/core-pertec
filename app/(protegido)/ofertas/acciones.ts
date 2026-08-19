"use server";

import { revalidatePath } from "next/cache";
import { eliminarOferta, exigirAccesoOfertas, obtenerOferta } from "@/lib/ofertas/datos";

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
