import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";

/**
 * Un invitado (Gmail u otro correo de fuera) NO tiene cuenta Microsoft de PERTEC: mandarlo a «Conectar
 * SharePoint» lo llevaba al login de Microsoft, que no lo deja entrar, y perdía su sesión del Core.
 * Para un invitado SharePoint pasa por la app del Core, así que no hay nada que conectar: se vuelve.
 */
export async function volverSiEsInvitado(destino: string): Promise<void> {
  const correo = (await auth())?.user?.email;
  const u = correo ? await obtenerUsuarioActivo(correo) : null;
  if (u?.tipo === "invitado") redirect(destino);
}
