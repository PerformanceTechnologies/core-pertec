// La fecha límite de cada submódulo de Contrato DCH: nombres y cómo se lee un plazo.
//
// Sin "server-only" y sin base, por lo mismo que arranque-modelo.ts: lo importan componentes
// cliente (el chip y su ventana) y la lógica tiene que poder probarse sin Supabase.

import { diasHasta } from "./acreditacion-modelo";

export type ModuloConPlazo =
  | "documentos-generales"
  | "acreditacion"
  | "acreditacion-vehiculos"
  | "logistica"
  | "gastos";

export const MODULOS_CON_PLAZO: Record<ModuloConPlazo, { nombre: string }> = {
  "documentos-generales": { nombre: "Documentos generales" },
  acreditacion: { nombre: "Acreditación Personas" },
  "acreditacion-vehiculos": { nombre: "Acreditación Vehículos" },
  logistica: { nombre: "Logística" },
  gastos: { nombre: "Gastos de arranque" },
};

export function esModuloConPlazo(valor: unknown): valor is ModuloConPlazo {
  // hasOwn y no `in`: «toString» o «constructor» SÍ están `in` cualquier objeto, y llegarían a
  // la base como un submódulo que el check rechaza con un error de Postgres en vez de un
  // mensaje entendible.
  return typeof valor === "string" && Object.hasOwn(MODULOS_CON_PLAZO, valor);
}

/** Cuántos días antes del límite el plazo pasa a «por vencer» (ámbar). */
export const DIAS_AVISO_PLAZO = 14;

export type EstadoDePlazo = "vencido" | "hoy" | "por_vencer" | "al_dia";

export interface LecturaDePlazo {
  /** AAAA-MM-DD. */
  fecha: string;
  /** Días que faltan (negativo si ya pasó). */
  dias: number;
  estado: EstadoDePlazo;
}

/**
 * Cómo se ve un plazo hoy. `hoy` viene de hoyEnChile(): el día cambia a medianoche de
 * Chile, no de UTC, y a las 21:00 en Santiago ya es «mañana» para el servidor.
 */
export function leerPlazo(fecha: string | null | undefined, hoy: string): LecturaDePlazo | null {
  if (!fecha) return null;
  const dias = diasHasta(fecha, hoy);
  if (dias === null) return null;

  const estado: EstadoDePlazo =
    dias < 0 ? "vencido" : dias === 0 ? "hoy" : dias <= DIAS_AVISO_PLAZO ? "por_vencer" : "al_dia";
  return { fecha, dias, estado };
}

/** «faltan 12 días», «vence hoy», «venció hace 3 días». */
export function textoDePlazo(p: LecturaDePlazo): string {
  if (p.dias === 0) return "vence hoy";
  if (p.dias > 0) return `faltan ${p.dias} ${p.dias === 1 ? "día" : "días"}`;
  const atras = -p.dias;
  return `venció hace ${atras} ${atras === 1 ? "día" : "días"}`;
}

// -----------------------------------------------------------------------------
//  Responsables de un submódulo
// -----------------------------------------------------------------------------

/**
 * Los submódulos que tienen responsables. Documentos generales no: ahí el responsable es de cada
 * requisito (ct_contratos_estados), no del módulo entero.
 */
export type ModuloConResponsables = Exclude<ModuloConPlazo, "documentos-generales">;

export function esModuloConResponsables(valor: unknown): valor is ModuloConResponsables {
  return esModuloConPlazo(valor) && valor !== "documentos-generales";
}

/** La aplicación que hay que tener asignada para responder por cada submódulo. */
export const APP_DE_MODULO: Record<ModuloConResponsables, string> = {
  acreditacion: "acreditacion",
  "acreditacion-vehiculos": "acreditacion-vehiculos",
  logistica: "logistica",
  gastos: "gastos-arranque",
};

/** Dónde se trabaja cada submódulo, para los enlaces de Mi Día. */
export const RUTA_DE_MODULO: Record<ModuloConResponsables, string> = {
  acreditacion: "/contratos/acreditacion",
  "acreditacion-vehiculos": "/contratos/acreditacion-vehiculos",
  logistica: "/contratos/logistica",
  gastos: "/contratos/gastos-arranque",
};

/**
 * «Ana», «Ana y Luis», «Ana, Luis y 2 más»: los responsables en poco espacio.
 *
 * Con más de `maximo` nombres el resto se cuenta en vez de listarse: el detalle completo está a un
 * clic, y en una tarjeta de resumen lo que importa es si hay alguien y quién va primero.
 */
export function resumirResponsables(nombres: string[], maximo = 2): string {
  if (nombres.length === 0) return "";
  // El primer nombre alcanza para reconocer a alguien del equipo y ahorra la mitad del espacio.
  const cortos = nombres.map((n) => n.trim().split(/\s+/)[0] || n);
  if (cortos.length <= maximo) {
    return cortos.length === 1 ? cortos[0] : `${cortos.slice(0, -1).join(", ")} y ${cortos[cortos.length - 1]}`;
  }
  return `${cortos.slice(0, maximo).join(", ")} y ${cortos.length - maximo} más`;
}
