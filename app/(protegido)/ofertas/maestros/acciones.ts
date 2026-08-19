"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoOfertas } from "@/lib/ofertas/datos";
import {
  actualizarEstiloMaestro,
  eliminarMaestro,
  marcarPredeterminado,
  obtenerMaestro,
} from "@/lib/ofertas/maestros";
import { ESTILO_PERTEC } from "@/lib/ofertas/estilo";

/** Guarda los tokens editados a mano. */
export async function guardarMaestroAction(formData: FormData) {
  await exigirAccesoOfertas();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Se arma el parcial con las claves que conoce el estilo y nada más: un campo
  // extra en el formulario no puede terminar en el CSS.
  const parcial: Record<string, string> = {};
  for (const campo of Object.keys(ESTILO_PERTEC)) {
    const valor = formData.get(campo);
    if (typeof valor === "string" && valor.trim() !== "") parcial[campo] = valor.trim();
  }

  await actualizarEstiloMaestro(id, String(formData.get("nombre") ?? "").trim() || "Maestro", parcial);
  revalidatePath("/ofertas/maestros");
}

export async function predeterminarMaestroAction(formData: FormData) {
  await exigirAccesoOfertas();
  const id = String(formData.get("id") ?? "");
  if (id) await marcarPredeterminado(id);
  revalidatePath("/ofertas/maestros");
}

export async function eliminarMaestroAction(formData: FormData) {
  await exigirAccesoOfertas();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // El predeterminado no se borra de un clic: dejaría a todas las ofertas sin
  // formato elegido de golpe. Primero se marca otro.
  const maestro = await obtenerMaestro(id);
  if (!maestro || maestro.predeterminado) return;

  await eliminarMaestro(id);
  revalidatePath("/ofertas/maestros");
}
