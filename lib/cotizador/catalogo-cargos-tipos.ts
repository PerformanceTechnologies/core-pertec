// Sin "server-only": lo importa tanto la capa de datos del servidor
// (lib/cotizador/catalogo-cargos.ts) como componentes cliente que necesitan el
// tipo y el mapper puro para prellenar un StaffInput desde el catálogo
// (DotacionTab.tsx) — mismo motivo por el que EMPRESAS vive en
// lib/cotizador/empresas.ts en vez de lib/cotizador.ts.

import type { Bono, ModoSueldo, StaffInput, Turno } from "./motor/types";

export interface CatalogoCargo {
  id: string;
  cargo: string;
  area: string | null;
  clasificacion: "directo" | "indirecto";
  turnoTipico: Turno | null;
  modoSueldoTipico: ModoSueldo;
  baseReferencial: number | null;
  liquidoReferencial: number | null;
  bonosDefault: Bono[];
  asigMovilizacionReferencial: number;
  asigColacionReferencial: number;
  horasServicioDiaReferencial: number | null;
  activo: boolean;
}

export interface DatosCargoCatalogo {
  cargo: string;
  area: string | null;
  clasificacion: "directo" | "indirecto";
  turnoTipico: Turno | null;
  modoSueldoTipico: ModoSueldo;
  baseReferencial: number | null;
  liquidoReferencial: number | null;
  bonosDefault: Bono[];
  asigMovilizacionReferencial: number;
  asigColacionReferencial: number;
  horasServicioDiaReferencial: number | null;
}

// Construye un StaffInput nuevo a partir de un cargo del catálogo — se usa como
// punto de partida al agregar dotación en una cotización; el dotacionA/B/Contra
// y tipoContrato siguen los mismos valores por defecto que "+ Agregar cargo".
export function cargoCatalogoAStaffInput(cargo: CatalogoCargo, id: string): StaffInput {
  return {
    id,
    cargo: cargo.cargo,
    clasificacion: cargo.clasificacion,
    turno: cargo.turnoTipico ?? "7x7",
    dotacionA: 1,
    dotacionB: 0,
    dotacionContra: 0,
    tipoContrato: "plazo_fijo",
    modoSueldo: cargo.modoSueldoTipico,
    base: cargo.modoSueldoTipico === "base" ? (cargo.baseReferencial ?? 800000) : undefined,
    targetLiquido: cargo.modoSueldoTipico === "liquido" ? (cargo.liquidoReferencial ?? undefined) : undefined,
    bonos: cargo.bonosDefault.map((b) => ({ ...b })),
    asigMovilizacion: cargo.asigMovilizacionReferencial,
    asigColacion: cargo.asigColacionReferencial,
    trabajaFestivos: false,
    pctTrabajoPesado: 0,
    horasServicioDia: cargo.horasServicioDiaReferencial ?? 14,
  };
}
