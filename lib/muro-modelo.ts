// Muro: el vocabulario que comparten el servidor y el chat (sin "server-only").

export interface PersonaMuro {
  correo: string;
  nombre: string;
}

export interface MensajeMuro {
  id: string;
  autorCorreo: string;
  autorNombre: string;
  texto: string;
  menciones: string[];
  creadoEn: string;
  /** La publicación a la que responde (null: es una publicación). */
  respuestaA: string | null;
}

export const LARGO_MAXIMO_MURO = 4000;

/** Una mención dentro del texto guardado: @{correo}. */
const MENCION = /@\{([^\s{}@]+@[^\s{}]+)\}/g;

/** Los correos mencionados en un texto, sin repetir y en minúsculas. */
export function mencionesDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(MENCION)].map((m) => m[1].toLowerCase()))];
}

export type Trozo = { tipo: "texto"; texto: string } | { tipo: "mencion"; correo: string };

/** El texto en trozos, para dibujar cada mención como una etiqueta. */
export function trozosDe(texto: string): Trozo[] {
  const trozos: Trozo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(MENCION)) {
    if (m.index! > desde) trozos.push({ tipo: "texto", texto: texto.slice(desde, m.index) });
    trozos.push({ tipo: "mencion", correo: m[1].toLowerCase() });
    desde = m.index! + m[0].length;
  }
  if (desde < texto.length) trozos.push({ tipo: "texto", texto: texto.slice(desde) });
  return trozos;
}

/** El texto plano, con cada mención como @Nombre (para avisos y vistas previas). */
export function textoPlano(texto: string, nombre: (correo: string) => string): string {
  return trozosDe(texto).map((t) => (t.tipo === "texto" ? t.texto : `@${nombre(t.correo)}`)).join("");
}

/** Las reacciones del Muro, en el orden en que se muestran. */
export const REACCIONES = ["👍", "❤️", "😂", "🎉", "😮"] as const;
export type Reaccion = (typeof REACCIONES)[number];
export const NOMBRE_REACCION: Record<Reaccion, string> = { "👍": "Me gusta", "❤️": "Me encanta", "😂": "Me divierte", "🎉": "Celebrar", "😮": "Me sorprende" };

/** mensaje → emoji → correos de quienes reaccionaron. */
export type ReaccionesMuro = Record<string, Partial<Record<Reaccion, string[]>>>;

export function esReaccion(v: unknown): v is Reaccion {
  return REACCIONES.includes(v as Reaccion);
}

/**
 * Mezcla lo que respondió el servidor con lo que ya está en pantalla. De los mensajes que se
 * consultaron manda el servidor (si de uno no vino nada, es que ya no tiene reacciones); el resto
 * queda como estaba, así una consulta parcial nunca borra lo que no preguntó.
 */
export function combinarReacciones(actual: ReaccionesMuro, consultados: string[], delServidor: ReaccionesMuro): ReaccionesMuro {
  const salida = { ...actual };
  for (const id of consultados) delete salida[id];
  return { ...salida, ...delServidor };
}

// ---------- Roles ---------------------------------------------------------------

export const ROLES_MURO = ["moderador", "miembro", "sin_borrar"] as const;
export type RolMuro = (typeof ROLES_MURO)[number];
export const NOMBRE_ROL_MURO: Record<RolMuro, string> = { moderador: "Moderador", miembro: "Miembro", sin_borrar: "Sin borrar" };
export const DETALLE_ROL_MURO: Record<RolMuro, string> = {
  moderador: "Borra cualquier mensaje",
  miembro: "Borra solo sus mensajes",
  sin_borrar: "No puede borrar mensajes",
};
export function esRolMuro(v: unknown): v is RolMuro {
  return typeof v === "string" && (ROLES_MURO as readonly string[]).includes(v);
}
/** Qué puede borrar alguien: todo, solo lo propio o nada. */
export type PermisoBorrar = "todo" | "propios" | "nada";
export const permisoDeRol = (rol: RolMuro): PermisoBorrar => (rol === "moderador" ? "todo" : rol === "miembro" ? "propios" : "nada");
