"use server";

import { revalidatePath } from "next/cache";
import { cargarRepositorioCompleto, exigirAccion } from "@/lib/repositorio-legal/datos";
import { CARPETA_POR_REVISAR, CARPETA_SOCIEDADES, planDeOrden, resumirPlan, type OpcionesOrden, type Operacion, type ResumenPlan } from "@/lib/repositorio-legal/orden";
import { RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";
import { borrarCarpetasVacias, crearCarpeta, eliminar, moverYRenombrar, olvidarArbol, rutaSegura } from "@/lib/repositorio-legal/sharepoint";

// Ordenar el repositorio: solo quien puede ver lo confidencial (Administrador del módulo o del Core).
// El plan SIEMPRE se recalcula en el servidor: del navegador llegan solo las opciones y qué ids aplicar,
// y se ejecuta únicamente lo que el plan del servidor dice para esos ids.

export interface OpcionesDelFormulario {
  eliminarVersionesAnteriores: boolean;
  /** Slug de la sociedad a la que va lo que no dice de quién es (solicitudes armadas para una sola). */
  porOmision: string | null;
  carpetas: Record<string, string>;
}

function limpiarOpciones(o: OpcionesDelFormulario): OpcionesOrden {
  const carpetas: Record<string, string> = {};
  for (const [slug, nombre] of Object.entries(o?.carpetas ?? {})) {
    const limpio = rutaSegura(String(nombre ?? "")).replace(/\//g, " ").trim().slice(0, 80);
    if (/^[a-z0-9-]{1,60}$/.test(slug) && limpio) carpetas[slug] = limpio;
  }
  return { eliminarVersionesAnteriores: Boolean(o?.eliminarVersionesAnteriores), carpetas };
}

export type ResultadoPlan = { ok: true; ops: Operacion[]; resumen: ResumenPlan } | { ok: false; error: string };

async function plan(opciones: OpcionesDelFormulario, fresco: boolean): Promise<Operacion[]> {
  const porOmision = opciones?.porOmision && /^[a-z0-9-]{1,60}$/.test(opciones.porOmision) ? opciones.porOmision : null;
  const repo = await cargarRepositorioCompleto({ fresco, incluirOcultos: true, porOmision });
  return planDeOrden(repo.documentos, repo.sociedades, limpiarOpciones(opciones));
}

export async function calcularPlan(opciones: OpcionesDelFormulario): Promise<ResultadoPlan> {
  try {
    await exigirAccion("confidencial");
    const ops = await plan(opciones, true);
    return { ok: true, ops, resumen: resumirPlan(ops) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo calcular el plan." };
  }
}

export type ResultadoLote = { ok: true; hechos: number; errores: { ruta: string; error: string }[] } | { ok: false; error: string };

/** Aplica un lote de operaciones (por id). Mueve, renombra y manda a la papelera. */
export async function aplicarLote(opciones: OpcionesDelFormulario, ids: string[]): Promise<ResultadoLote> {
  try {
    await exigirAccion("confidencial");
    const pedidos = new Set(ids.slice(0, 40));
    const ops = (await plan(opciones, false)).filter((o) => pedidos.has(o.id) && o.accion !== "mantener");
    let hechos = 0;
    const errores: { ruta: string; error: string }[] = [];
    for (const o of ops) {
      try {
        if (o.accion === "eliminar") await eliminar(o.id);
        else if (o.destino && o.nombre) await moverYRenombrar(o.id, o.destino, o.nombre);
        hechos += 1;
      } catch (e) {
        const codigo = (e as { statusCode?: number })?.statusCode;
        // Ya no existe (otro lote lo eliminó o alguien lo movió): no es un error para quien ordena.
        if (codigo === 404) continue;
        errores.push({ ruta: o.rutaActual, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { ok: true, hechos, errores };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo aplicar el lote." };
  } finally {
    olvidarArbol();
  }
}

/** Al terminar: crea las sociedades nuevas y borra (a la papelera) las carpetas que quedaron vacías. */
export async function terminarOrden(nuevas: string[]): Promise<{ ok: true; carpetasBorradas: number } | { ok: false; error: string }> {
  try {
    await exigirAccion("confidencial");
    const nombres = nuevas.map((n) => rutaSegura(String(n)).replace(/\//g, " ").trim().slice(0, 80)).filter(Boolean);
    for (const n of nombres) await crearCarpeta(`${CARPETA_SOCIEDADES}/${n}`);
    const carpetasBorradas = await borrarCarpetasVacias([CARPETA_POR_REVISAR, ...nombres.map((n) => `${CARPETA_SOCIEDADES}/${n}`)]);
    revalidatePath(RUTA_REPOSITORIO_LEGAL, "layout");
    return { ok: true, carpetasBorradas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo terminar." };
  }
}
