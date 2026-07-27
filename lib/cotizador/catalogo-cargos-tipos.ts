// Sin "server-only": lo importa tanto la capa de datos del servidor
// (lib/cotizador/catalogo-cargos.ts) como componentes cliente que necesitan el
// tipo y el mapper puro para prellenar un StaffInput desde el catálogo
// (DotacionTab.tsx) — mismo motivo por el que EMPRESAS vive en
// lib/cotizador/empresas.ts en vez de lib/cotizador.ts.

import type { Bono, ModoSueldo, PersonalSpotContratoInput, StaffInput, Turno } from "./motor/types";

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

// Campos "de identidad del cargo" que trae el catálogo — sueldo/líquido,
// bonos, movilización, colación, turno típico. Se usan tanto para prellenar
// un cargo NUEVO como para reaplicar estos valores a uno YA EXISTENTE cuando
// se cambia el selector de Cargo en Dotación (ver DotacionTab.tsx) — en
// ambos casos el resto de los campos (dotación, tipo de contrato, etc.)
// sigue siendo editable a mano después, esto solo prellena el punto de
// partida.
function camposSueldoDesdeCatalogo(cargo: CatalogoCargo) {
  return {
    cargo: cargo.cargo,
    clasificacion: cargo.clasificacion,
    modoSueldo: cargo.modoSueldoTipico,
    base: cargo.modoSueldoTipico === "base" ? (cargo.baseReferencial ?? 800000) : undefined,
    targetLiquido: cargo.modoSueldoTipico === "liquido" ? (cargo.liquidoReferencial ?? undefined) : undefined,
    bonos: cargo.bonosDefault.map((b) => ({ ...b })),
    asigMovilizacion: cargo.asigMovilizacionReferencial,
    asigColacion: cargo.asigColacionReferencial,
  };
}

// Construye un StaffInput nuevo a partir de un cargo del catálogo — se usa como
// punto de partida al agregar dotación en una cotización; el dotacionA/B/Contra
// y tipoContrato siguen los mismos valores por defecto que "+ Agregar cargo".
export function cargoCatalogoAStaffInput(cargo: CatalogoCargo, id: string): StaffInput {
  return {
    id,
    ...camposSueldoDesdeCatalogo(cargo),
    turno: cargo.turnoTipico ?? "7x7",
    dotacionA: 1,
    dotacionB: 0,
    dotacionContra: 0,
    tipoContrato: "plazo_fijo",
    trabajaFestivos: false,
    pctTrabajoPesado: 0,
    horasServicioDia: cargo.horasServicioDiaReferencial ?? 14,
  };
}

// Reaplica sueldo/bonos/movilización/colación/turno de un cargo del catálogo
// a un StaffInput YA EXISTENTE (al cambiar el selector de Cargo) — no toca
// dotación, tipo de contrato ni festivos/trabajo pesado, que son propios de
// esa cotización, no del cargo en sí.
export function patchCargoCatalogoEnStaff(cargo: CatalogoCargo): Partial<StaffInput> {
  return {
    ...camposSueldoDesdeCatalogo(cargo),
    turno: cargo.turnoTipico ?? "7x7",
    horasServicioDia: cargo.horasServicioDiaReferencial ?? 14,
  };
}

// Igual que patchCargoCatalogoEnStaff, pero para el personal SPOT del
// contrato (contrato_permanente) — ese modo no tiene turno ni
// horasServicioDia (usa horasEstimadasMes, un concepto distinto que no
// viene del catálogo), así que no se tocan.
export function patchCargoCatalogoEnPersonalSpotContrato(
  cargo: CatalogoCargo,
): Partial<PersonalSpotContratoInput> {
  return camposSueldoDesdeCatalogo(cargo);
}
