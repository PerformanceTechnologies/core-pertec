import "server-only";
import { puedeVerApp } from "../autorizacion";
import { hoyEnSantiago } from "../graph-calendario";
import type { UsuarioConAcceso } from "../tipos";
import { listarPlazos } from "./plazos";
import { listarResponsablesDeModulos } from "./responsables-de-modulo";
import { APP_DE_MODULO, MODULOS_CON_PLAZO, RUTA_DE_MODULO, leerPlazo, textoDePlazo, type ModuloConResponsables } from "./plazos-modelo";

export interface PlazoPendiente {
  clave: string;
  texto: string;
  /** Lo que va en la insignia: los días que faltan, o «vencido». */
  etiqueta: string;
  cantidad: number;
  href: string;
}

/**
 * Los plazos de Contratos de los submódulos donde esta persona es responsable y que ya están vencidos, vencen hoy o
 * están por vencer (14 días). Para Mi Día: antes no los leía.
 */
export async function plazosDeContratosPendientes(usuario: UsuarioConAcceso): Promise<PlazoPendiente[]> {
  try {
    const [responsables, plazos] = await Promise.all([listarResponsablesDeModulos(), listarPlazos()]);
    const hoy = hoyEnSantiago().iso;
    const salida: PlazoPendiente[] = [];
    for (const modulo of Object.keys(APP_DE_MODULO) as ModuloConResponsables[]) {
      if (!responsables[modulo]?.some((r) => r.id === usuario.id)) continue;
      if (!(await puedeVerApp(usuario, APP_DE_MODULO[modulo]))) continue;
      const p = leerPlazo(plazos[modulo], hoy);
      if (!p || p.estado === "al_dia") continue;
      salida.push({
        clave: modulo,
        texto: `${MODULOS_CON_PLAZO[modulo].nombre}: ${textoDePlazo(p)}`,
        etiqueta: p.estado === "vencido" ? "vencido" : p.dias === 0 ? "hoy" : `${p.dias} d`,
        cantidad: 1,
        href: RUTA_DE_MODULO[modulo],
      });
    }
    return salida.sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  } catch (e) {
    console.error("[contratos] No se pudieron leer los plazos pendientes:", e instanceof Error ? e.message : e);
    return [];
  }
}
