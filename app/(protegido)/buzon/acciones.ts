"use server";

import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarNotificaciones, marcarLeidas, type Notificacion } from "@/lib/buzon";

async function usuarioActual() {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) throw new Error("No autorizado");
  return usuario;
}

export async function listarMisNotificacionesAction(): Promise<Notificacion[]> {
  return listarNotificaciones(await usuarioActual(), 30);
}

export async function marcarNotificacionesLeidasAction(ids?: string[]): Promise<void> {
  await marcarLeidas(await usuarioActual(), ids);
}
