"use server";

import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarNotificaciones, marcarLeidas, pendientesPorEmpresa, type Notificacion } from "@/lib/buzon";
import { contextoDeEmpresa } from "@/lib/empresas";
import { SLUG_POR_OMISION } from "@/lib/empresas-modelo";
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
  // Cada empresa tiene su campana: solo las de la empresa activa. Las sin empresa (antiguas o
  // automáticas) son de PERTEC, la empresa por omisión.
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const enPorOmision = (activa?.slug ?? SLUG_POR_OMISION) === SLUG_POR_OMISION;
  const todas = await listarNotificaciones(usuario, 100, true);
  return todas.filter((n) => (n.empresa_id ? n.empresa_id === activa?.id : enPorOmision)).slice(0, 30);
}

export async function marcarNotificacionesLeidasAction(ids?: string[]): Promise<void> {
  await marcarLeidas(await usuarioActual(), ids);
}

/** Pendientes de otras empresas, por id de empresa: el selector parpadea mientras haya alguna. */
export async function pendientesOtrasEmpresasAction(): Promise<Record<string, number>> {
  const usuario = await usuarioActual();
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  return pendientesPorEmpresa(usuario, activa?.id ?? null);
}
