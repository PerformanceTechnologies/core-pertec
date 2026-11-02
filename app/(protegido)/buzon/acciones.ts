"use server";

import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarNotificaciones, marcarLeidas, type Notificacion } from "@/lib/buzon";
import { recordarVencimientos } from "@/lib/tareas-avisos";

async function usuarioActual() {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) throw new Error("No autorizado");
  return usuario;
}

/** Solo las pendientes: las que la persona ya abrió no vuelven a aparecer. */
export async function listarMisNotificacionesAction(): Promise<Notificacion[]> {
  const usuario = await usuarioActual();
  // Los avisos de "vence hoy / vencida" se crean al vuelo, una vez por tarea y día.
  await recordarVencimientos(usuario.correo).catch(() => {});
  return listarNotificaciones(usuario, 30, true);
}

export async function marcarNotificacionesLeidasAction(ids?: string[]): Promise<void> {
  await marcarLeidas(await usuarioActual(), ids);
}
