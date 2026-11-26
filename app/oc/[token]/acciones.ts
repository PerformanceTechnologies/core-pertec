"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { responderEnlaceOc } from "@/lib/fin/oc-enlace";

export type EstadoRespuestaOc = { ok: boolean; error?: string; respuesta?: "aceptada" | "modificacion" } | null;

/**
 * La respuesta del proveedor desde la página pública del enlace (sin sesión: lo que autoriza es el código del enlace,
 * que se vuelve a revisar en el servidor). «respuesta» = aceptada | modificacion.
 */
export async function responderOcAction(token: string, _previo: EstadoRespuestaOc, form: FormData): Promise<EstadoRespuestaOc> {
  void _previo; // la firma de useActionState: (estado previo, formulario)
  const respuesta = form.get("respuesta") === "modificacion" ? "modificacion" : "aceptada";
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const r = await responderEnlaceOc(token, respuesta, String(form.get("nombre") ?? ""), String(form.get("comentario") ?? ""), origen);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/oc/${token}`);
  return { ok: true, respuesta };
}
