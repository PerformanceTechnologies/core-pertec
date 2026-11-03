"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { volverACargaAnterior } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH } from "@/lib/valorizacion-historica-modelo";

export type Resultado = { ok: true } | { ok: false; error: string };

/** Solo el administrador: deja activa otra vez la carga anterior del Excel. */
export async function volverACargaAnteriorAction(id: string): Promise<Resultado> {
  try {
    const u = await exigirAccesoApp(SLUG_APP_VH);
    if (u.rol !== "admin") return { ok: false, error: "Solo el administrador del Core puede cambiar la carga." };
    if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Carga inválida." };
    await volverACargaAnterior(id);
    revalidatePath(RUTA_VH, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^\[valorizacion-historica\]\s*/, "") : "No se pudo cambiar la carga." };
  }
}
