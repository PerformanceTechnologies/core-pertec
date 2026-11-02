import "server-only";
import { crearNotificacion } from "./buzon";
import { hoyEnSantiago } from "./graph-calendario";
import { tareasPendientesDe } from "./tareas";
import { resumirMisTareas, tituloDeColumna, type Tarea } from "./tareas-modelo";

// -----------------------------------------------------------------------------
//  Avisos de Tareas a la campana de notificaciones.
//
//  Son PERSONALES (destinatario): le llegan solo a quien le toca, nunca a quien hizo
//  el cambio, y nunca a alguien que no participa de la tarea (así una tarea privada
//  no se filtra por la campana). Si el buzón falla, la tarea igual se guardó.
// -----------------------------------------------------------------------------

const MODULO = "tareas";
const enlace = (id: string) => `/tareas?abrir=${id}`;

/** Los que participan: responsables y quien asignó, sin repetir, en minúsculas. */
function participantes(t: Pick<Tarea, "responsables" | "asignadoPor">): string[] {
  return [...new Set([...t.responsables, ...(t.asignadoPor ? [t.asignadoPor] : [])].map((c) => c.toLowerCase()))];
}

async function avisar(
  para: string[],
  actor: string,
  datos: { tipo: string; titulo: string; cuerpo?: string; tareaId: string; severidad?: "info" | "alerta" | "urgente" },
): Promise<void> {
  const yo = actor.toLowerCase();
  const marca = Date.now();
  await Promise.all(
    para
      .filter((c) => c && c !== yo)
      .map((destinatario) =>
        crearNotificacion({
          modulo: MODULO,
          tipo: datos.tipo,
          titulo: datos.titulo,
          cuerpo: datos.cuerpo,
          enlace: enlace(datos.tareaId),
          severidad: datos.severidad ?? "info",
          clave: `tarea:${datos.tareaId}:${datos.tipo}:${destinatario}:${marca}`,
          destinatario,
        }).catch(() => false),
      ),
  );
}

/** A quienes quedaron como responsables y antes no lo eran. */
export async function avisarAsignacion(
  tarea: Pick<Tarea, "id" | "titulo">,
  nuevos: string[],
  actor: { correo: string; nombre: string | null },
): Promise<void> {
  await avisar(nuevos.map((c) => c.toLowerCase()), actor.correo, {
    tipo: "asignada",
    titulo: `Te asignaron: ${tarea.titulo}`,
    cuerpo: `Por ${actor.nombre ?? actor.correo}`,
    tareaId: tarea.id,
  });
}

export async function avisarCambioDeEstado(
  tarea: Pick<Tarea, "id" | "titulo" | "responsables" | "asignadoPor">,
  de: string,
  a: string,
  actor: { correo: string; nombre: string | null },
): Promise<void> {
  await avisar(participantes(tarea), actor.correo, {
    tipo: "estado",
    titulo: `${tarea.titulo}: ${tituloDeColumna(a)}`,
    cuerpo: `${actor.nombre ?? actor.correo} la movió de «${tituloDeColumna(de)}» a «${tituloDeColumna(a)}»`,
    tareaId: tarea.id,
  });
}

export async function avisarNota(
  tarea: Pick<Tarea, "id" | "titulo" | "responsables" | "asignadoPor">,
  actor: { correo: string; nombre: string | null },
  resumen: string,
): Promise<void> {
  await avisar(participantes(tarea), actor.correo, {
    tipo: "nota",
    titulo: `Nueva nota en: ${tarea.titulo}`,
    cuerpo: `${actor.nombre ?? actor.correo}: ${resumen.slice(0, 140)}`,
    tareaId: tarea.id,
  });
}

/**
 * "Vence hoy" y "vencida" para las tareas de esta persona. Se llama al abrir la campana:
 * la clave lleva la fecha, así que cada aviso nace una sola vez por tarea y por día.
 */
export async function recordarVencimientos(correo: string): Promise<void> {
  const hoy = hoyEnSantiago().iso;
  const r = resumirMisTareas(await tareasPendientesDe(correo), correo, hoy);
  const destinatario = correo.toLowerCase();
  await Promise.all([
    ...r.hoy.map((t) =>
      crearNotificacion({
        modulo: MODULO, tipo: "vence-hoy", titulo: `Vence hoy: ${t.titulo}`, cuerpo: `Está en «${tituloDeColumna(t.estado)}»`,
        enlace: enlace(t.id), severidad: "alerta", clave: `tarea:${t.id}:vence-hoy:${destinatario}:${hoy}`, destinatario,
      }),
    ),
    ...r.vencidas.map((t) =>
      crearNotificacion({
        modulo: MODULO, tipo: "vencida", titulo: `Vencida: ${t.titulo}`, cuerpo: `Debía estar lista el ${new Date(`${t.fechaLimite}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "long", timeZone: "UTC" })}`,
        enlace: enlace(t.id), severidad: "urgente", clave: `tarea:${t.id}:vencida:${destinatario}:${hoy}`, destinatario,
      }),
    ),
  ]);
}
