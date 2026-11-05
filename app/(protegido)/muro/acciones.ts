"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { borrarMensaje, empresaDelMuro, listarMensajes, mensajesDesde, publicarMensaje } from "@/lib/muro";
import type { MensajeMuro } from "@/lib/muro-modelo";

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
export async function nuevosAction(desde: string, visibles: string[]): Promise<{ ok: true; nuevos: MensajeMuro[]; borrados: string[]; empresaId: string } | Falla> {
  try {
    const { empresa } = await contexto();
    if (Number.isNaN(Date.parse(desde))) return { ok: false, error: "Fecha inválida." };
    const ids = (Array.isArray(visibles) ? visibles : []).filter((v) => /^[0-9a-f-]{36}$/.test(v));
    return { ok: true, ...(await mensajesDesde(empresa.id, desde, ids)), empresaId: empresa.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function anterioresAction(antesDe: string): Promise<{ ok: true; mensajes: MensajeMuro[]; respuestas: MensajeMuro[]; hayMas: boolean } | Falla> {
  try {
    const { empresa } = await contexto();
    if (Number.isNaN(Date.parse(antesDe))) return { ok: false, error: "Fecha inválida." };
    return { ok: true, ...(await listarMensajes(empresa.id, antesDe)) };
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
