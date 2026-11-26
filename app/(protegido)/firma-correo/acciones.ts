"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionDeLaPeticion } from "@/lib/sesion-de-la-peticion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { guardarFirma, guardarTextoFirma, LARGO_MAX_TEXTO, normalizarFirma, PESO_MAX_SUBIDA } from "@/lib/firma-correo";

export type EstadoFirma = { ok: boolean; error?: string } | null;

const TIPOS = ["image/png", "image/jpeg", "image/webp"];

/**
 * Guarda (o quita) la firma de quien está en sesión. Nunca la de otro: el id sale de la sesión,
 * no del formulario. «quitar=1» la borra.
 */
export async function guardarFirmaAction(_previo: EstadoFirma, form: FormData): Promise<EstadoFirma> {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.tipo === "invitado") return { ok: false, error: "Los invitados no tienen firma de correo." };

  try {
    if (form.get("quitar") === "1") {
      await guardarFirma(usuario.id, null);
    } else {
      const archivo = form.get("imagen");
      if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige una imagen." };
      if (!TIPOS.includes(archivo.type)) return { ok: false, error: "La firma tiene que ser una imagen PNG, JPG o WebP." };
      if (archivo.size > PESO_MAX_SUBIDA) return { ok: false, error: "La imagen pesa más de 1 MB. Achícala o guárdala como JPG." };
      await guardarFirma(usuario.id, await normalizarFirma(Buffer.from(await archivo.arrayBuffer())));
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la firma." };
  }
  revalidatePath("/mi-perfil");
  return { ok: true };
}

/** Guarda el texto de la firma de quien está en sesión (vacío = sin texto). Nunca el de otro: el id sale de la sesión. */
export async function guardarTextoFirmaAction(_previo: EstadoFirma, form: FormData): Promise<EstadoFirma> {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.tipo === "invitado") return { ok: false, error: "Los invitados no tienen firma de correo." };
  const texto = String(form.get("texto") ?? "");
  if (texto.length > LARGO_MAX_TEXTO) return { ok: false, error: `El texto de la firma puede tener hasta ${LARGO_MAX_TEXTO} caracteres.` };
  try {
    await guardarTextoFirma(usuario.id, texto);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el texto de la firma." };
  }
  revalidatePath("/mi-perfil");
  return { ok: true };
}
