"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { alternarReaccion, asignarRol, borrarMensaje, contarNuevos, empresaDelMuro, listarMensajes, mensajesDesde, publicarMensaje, reaccionesDe } from "@/lib/muro";
import type { MensajeMuro, ReaccionesMuro } from "@/lib/muro-modelo";

type Falla = { ok: false; error: string };
const fallo = (e: unknown): Falla => ({ ok: false, error: e instanceof Error ? e.message : "Ocurrió un error inesperado." });

/** Cualquier persona activa del Core, en su empresa activa. La empresa la decide el servidor, nunca el navegador. */
async function contexto() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) redirect("/ingresar");
  const empresa = await empresaDelMuro(usuario);
  if (!empresa) throw new Error("No tienes una empresa activa.");
  return { usuario, empresa };
}

export async function publicarAction(texto: string, respuestaA: string | null = null): Promise<{ ok: true; mensaje: MensajeMuro } | Falla> {
  try {
    const { usuario, empresa } = await contexto();
    if (respuestaA !== null && !/^[0-9a-f-]{36}$/.test(String(respuestaA))) return { ok: false, error: "Publicación inválida." };
    return { ok: true, mensaje: await publicarMensaje(usuario, empresa, String(texto ?? ""), respuestaA) };
  } catch (e) {
    return fallo(e);
  }
}

/** Lo nuevo desde el último mensaje que ya tiene la pantalla (el chat pregunta cada pocos segundos). */
export async function nuevosAction(
  desde: string,
  visibles: string[],
): Promise<{ ok: true; nuevos: MensajeMuro[]; borrados: string[]; reacciones: ReaccionesMuro | null; empresaId: string } | Falla> {
  try {
    const { empresa } = await contexto();
    if (Number.isNaN(Date.parse(desde))) return { ok: false, error: "Fecha inválida." };
    const ids = (Array.isArray(visibles) ? visibles : []).filter((v) => /^[0-9a-f-]{36}$/.test(v));
    // Lo nuevo y las reacciones de lo que ya está en pantalla, a la vez. Las de lo que llegó recién
    // se piden después, solo si llegó algo. `null` = no se pudieron leer: la pantalla se queda con
    // las que ya tiene.
    const [nuevo, deVisibles] = await Promise.all([mensajesDesde(empresa.id, desde, ids), reaccionesDe(ids)]);
    const deNuevos = nuevo.nuevos.length ? await reaccionesDe(nuevo.nuevos.map((m) => m.id)) : {};
    const reacciones = deVisibles && deNuevos ? { ...deVisibles, ...deNuevos } : null;
    return { ok: true, ...nuevo, reacciones, empresaId: empresa.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function anterioresAction(
  antesDe: string,
): Promise<{ ok: true; mensajes: MensajeMuro[]; respuestas: MensajeMuro[]; hayMas: boolean; reacciones: ReaccionesMuro } | Falla> {
  try {
    const { empresa } = await contexto();
    if (Number.isNaN(Date.parse(antesDe))) return { ok: false, error: "Fecha inválida." };
    const r = await listarMensajes(empresa.id, antesDe);
    // Se suman a lo que ya hay (no lo reemplazan): si no se pueden leer, `{}` no borra nada.
    return { ok: true, ...r, reacciones: (await reaccionesDe([...r.mensajes, ...r.respuestas].map((m) => m.id))) ?? {} };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Para el aviso del menú: cuántos mensajes nuevos de otros hay en el muro de la empresa activa
 * desde la última visita (`vistos`: empresa → fecha, lo guarda el navegador). Sin visita previa
 * en esa empresa no cuenta nada: la vara empieza ahora.
 */
export async function nuevosEnMuroAction(vistos: Record<string, string>): Promise<{ empresaId: string; cuantos: number } | null> {
  try {
    const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
    if (!usuario) return null;
    const empresa = await empresaDelMuro(usuario);
    if (!empresa) return null;
    const desde = vistos && typeof vistos[empresa.id] === "string" ? vistos[empresa.id] : null;
    if (!desde || Number.isNaN(Date.parse(desde))) return { empresaId: empresa.id, cuantos: 0 };
    return { empresaId: empresa.id, cuantos: await contarNuevos(empresa.id, desde, usuario.correo) };
  } catch {
    return null;
  }
}

export async function reaccionarAction(mensajeId: string, emoji: string): Promise<{ ok: true; reacciones: ReaccionesMuro | null } | Falla> {
  try {
    const { usuario, empresa } = await contexto();
    if (!/^[0-9a-f-]{36}$/.test(mensajeId)) return { ok: false, error: "Mensaje inválido." };
    return { ok: true, reacciones: await alternarReaccion(usuario, empresa.id, mensajeId, emoji) };
  } catch (e) {
    return fallo(e);
  }
}

export async function borrarAction(id: string): Promise<{ ok: true } | Falla> {
  try {
    const { usuario, empresa } = await contexto();
    if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Mensaje inválido." };
    await borrarMensaje(usuario, empresa.id, id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function asignarRolAction(correo: string, rol: string): Promise<{ ok: true } | Falla> {
  try {
    const { usuario, empresa } = await contexto();
    await asignarRol(usuario, empresa, String(correo ?? ""), String(rol ?? ""));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
