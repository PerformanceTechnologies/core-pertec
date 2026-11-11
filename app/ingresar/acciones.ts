"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { enviarCodigo } from "@/lib/invitados";

/** Paso 1 del invitado: pide el código. Siempre responde lo mismo (no revela quién tiene acceso). */
export async function pedirCodigoAction(correo: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await enviarCodigo(correo);
    return { ok: true };
  } catch (e) {
    console.error("[invitados] no se pudo enviar el código:", e);
    return { ok: false, error: "No pudimos enviar el código. Intenta de nuevo en un rato." };
  }
}

/** Paso 2: entra con el código. Si no sirve, vuelve con un mensaje. */
export async function entrarComoInvitadoAction(correo: string, codigo: string): Promise<{ error: string } | void> {
  try {
    await signIn("invitado", { correo, codigo, redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "El código no es válido o venció. Pide uno nuevo." };
    throw e; // el redirect de un ingreso exitoso
  }
}
