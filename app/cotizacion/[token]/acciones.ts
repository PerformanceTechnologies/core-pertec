"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { responderEnlaceCotizacion } from "@/lib/fin/cotizacion-enlace";

export type EstadoRespuestaCotizacion = { ok: boolean; error?: string; respuesta?: "aceptada" | "modificacion" } | null;

/**
 * La respuesta del cliente desde la página pública del enlace (sin sesión: lo que autoriza es el código del enlace,
 * que se vuelve a revisar en el servidor). «respuesta» = aceptada | modificacion.
 */
export async function responderCotizacionAction(token: string, _previo: EstadoRespuestaCotizacion, form: FormData): Promise<EstadoRespuestaCotizacion> {
  void _previo; // la firma de useActionState: (estado previo, formulario)
  const respuesta = form.get("respuesta") === "modificacion" ? "modificacion" : "aceptada";
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const r = await responderEnlaceCotizacion(
    token,
    respuesta,
    { nombre: String(form.get("nombre") ?? ""), comentario: String(form.get("comentario") ?? ""), oc: String(form.get("oc") ?? "") },
    origen,
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/cotizacion/${token}`);
  return { ok: true, respuesta };
}
