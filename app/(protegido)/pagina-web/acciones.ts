"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import {
  actualizarSolicitud,
  borrarImagenes,
  eliminarCaso,
  eliminarEquipo,
  eliminarSolicitud,
  guardarCaso,
  guardarConfig,
  guardarEquipo,
} from "@/lib/pagina-web";
import {
  esEstadoSolicitud,
  sanearCaso,
  sanearConfig,
  sanearEquipo,
  BUCKETS_WEB,
  SLUG_APP_PAGINA_WEB,
} from "@/lib/pagina-web-modelo";

// Cada acción exige la app ANTES de tocar nada: una Server Action se invoca por HTTP
// directo, sin pasar por la pantalla, y lib/pagina-web.ts escribe con la llave de
// servicio del sitio. Y cada una vuelve a sanear lo que llega: el formulario ya lo hizo,
// pero lo que llega acá lo pudo mandar cualquiera.

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  const error = e instanceof Error ? e.message.replace(/^\[pagina-web\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

const idValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

// ─── Catálogo ────────────────────────────────────────────────────────────────

export async function guardarEquipoAction(id: string | null, entrada: unknown): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    if (id !== null && !idValido(id)) return { ok: false, error: "Identificador inválido." };
    const v = sanearEquipo(entrada);
    if (!v.ok) return v;
    const nuevo = await guardarEquipo(id, v.datos);
    revalidatePath("/pagina-web");
    return { ok: true, id: nuevo };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarEquipoAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    if (!idValido(id)) return { ok: false, error: "Identificador inválido." };
    await eliminarEquipo(id);
    revalidatePath("/pagina-web");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ─── Casos ───────────────────────────────────────────────────────────────────

export async function guardarCasoAction(id: string | null, entrada: unknown): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    if (id !== null && !idValido(id)) return { ok: false, error: "Identificador inválido." };
    const v = sanearCaso(entrada);
    if (!v.ok) return v;
    const nuevo = await guardarCaso(id, v.datos);
    revalidatePath("/pagina-web/casos");
    return { ok: true, id: nuevo };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarCasoAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    if (!idValido(id)) return { ok: false, error: "Identificador inválido." };
    await eliminarCaso(id);
    revalidatePath("/pagina-web/casos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Borra las imágenes que se subieron en un formulario que después se cerró sin guardar.
 *
 * El formulario manda SOLO las que subió él mismo en esa sesión: una imagen que ya
 * estaba guardada nunca pasa por acá (esas se borran al guardar, ver guardarEquipo).
 */
export async function descartarSubidasAction(bucket: string, urls: string[]): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    const b = BUCKETS_WEB.find((x) => x === bucket);
    if (!b || !Array.isArray(urls)) return { ok: false, error: "Datos inválidos." };
    await borrarImagenes(b, urls.filter((u) => typeof u === "string").slice(0, 50));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ─── Solicitudes ─────────────────────────────────────────────────────────────

export async function actualizarSolicitudAction(id: string, estado: string, notas: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    if (!idValido(id)) return { ok: false, error: "Identificador inválido." };
    if (!esEstadoSolicitud(estado)) return { ok: false, error: `Estado desconocido: ${estado}.` };
    await actualizarSolicitud(id, estado, typeof notas === "string" ? notas.trim().slice(0, 5000) : "");
    revalidatePath("/pagina-web/solicitudes");
    revalidatePath("/", "layout"); // el contador de nuevas del menú
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarSolicitudAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    if (!idValido(id)) return { ok: false, error: "Identificador inválido." };
    await eliminarSolicitud(id);
    revalidatePath("/pagina-web/solicitudes");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ─── Contacto ────────────────────────────────────────────────────────────────

export async function guardarConfigAction(valores: Record<string, unknown>): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
    const v = sanearConfig(valores ?? {});
    if (!v.ok) return v;
    await guardarConfig(v.datos);
    revalidatePath("/pagina-web/contacto");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
