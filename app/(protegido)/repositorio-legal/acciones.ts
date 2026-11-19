"use server";

import { revalidatePath } from "next/cache";
import { exigirAccion } from "@/lib/repositorio-legal/datos";
import { eliminar, mover, renombrar, rutaSegura, validarId } from "@/lib/repositorio-legal/sharepoint";
import { RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

export type Resultado = { ok: true } | { ok: false; error: string };

// Las tres acciones cambian lo que existe en SharePoint: piden «editar» (Usuario especial o
// Administrador), y sharepoint.ts además verifica que el archivo esté dentro del repositorio.
async function correr(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await exigirAccion("editar");
    await fn();
    revalidatePath(RUTA_REPOSITORIO_LEGAL, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo completar." };
  }
}

export async function renombrarDocumento(id: string, nombre: string): Promise<Resultado> {
  return correr(() => renombrar(validarId(id), nombre));
}

export async function moverDocumento(id: string, carpeta: string): Promise<Resultado> {
  const destino = rutaSegura(carpeta);
  if (!destino) return { ok: false, error: "Elige una carpeta de destino." };
  return correr(() => mover(validarId(id), destino));
}

/** A la papelera de SharePoint: se recupera desde el sitio durante 93 días. */
export async function eliminarDocumento(id: string): Promise<Resultado> {
  return correr(() => eliminar(validarId(id)));
}
