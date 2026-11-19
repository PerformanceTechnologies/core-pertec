"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionDeLaPeticion } from "@/lib/sesion-de-la-peticion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { guardarFirma } from "@/lib/firma-correo";

export type EstadoFirma = { ok: boolean; error?: string } | null;

/** Guarda la firma de quien está en sesión (nunca la de otro: el id sale de la sesión, no del formulario). */
export async function guardarFirmaAction(_previo: EstadoFirma, form: FormData): Promise<EstadoFirma> {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.tipo === "invitado") return { ok: false, error: "Los invitados no tienen firma de correo." };
  try {
    await guardarFirma(usuario.id, String(form.get("firma") ?? ""));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la firma." };
  }
  revalidatePath("/firma-correo");
  return { ok: true };
}
