import "server-only";
import { supabaseAdmin } from "./supabase-admin";

/** El largo máximo de la firma: suficiente para nombre, cargo, empresa, teléfono y web. */
export const LARGO_FIRMA = 1000;

/**
 * La firma de correo de una persona, o null.
 *
 * Los invitados no tienen: entran con un código, no con una cuenta de la empresa, y no mandan
 * correos a clientes desde el Core. Sin la columna (SQL sin correr) tampoco: se lee como «sin
 * firma» y el correo sale igual que antes.
 */
export async function firmaDe(usuario: { id: string; tipo?: string | null }): Promise<string | null> {
  if (usuario.tipo === "invitado") return null;
  const { data, error } = await supabaseAdmin.from("usuarios").select("firma_correo").eq("id", usuario.id).maybeSingle();
  if (error || !data) return null;
  const firma = typeof data.firma_correo === "string" ? data.firma_correo.trim() : "";
  return firma || null;
}

export async function guardarFirma(usuarioId: string, firma: string): Promise<void> {
  const limpia = firma.replace(/\r\n?/g, "\n").trim().slice(0, LARGO_FIRMA);
  const { error } = await supabaseAdmin.from("usuarios").update({ firma_correo: limpia || null }).eq("id", usuarioId);
  if (error) {
    if (/firma_correo/.test(error.message)) throw new Error("Falta correr el SQL supabase/usuarios/0003_firma_correo.sql.");
    throw new Error(error.message);
  }
}
