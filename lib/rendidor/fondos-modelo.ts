// Fondos por rendir: el vocabulario que comparten el servidor y la pantalla (sin "server-only").
//
// Un FONDO es el dinero que la empresa entrega a una persona (quien rinde). Los INFORMES (las
// rendiciones de siempre) se cargan contra un fondo ACTIVO. Todo lo que pasa con el dinero queda
// en el LIBRO de movimientos y el saldo del fondo es siempre la suma de ese libro.

export type EstadoFondo =
  | "en_validacion"
  | "rechazado"
  | "validado"
  | "por_transferir"
  | "activo"
  | "devolucion_pendiente"
  | "cerrado"
  | "cerrado_con_saldo"
  | "anulado";

export const ETIQUETA_ESTADO_FONDO: Record<EstadoFondo, string> = {
  en_validacion: "En validación",
  rechazado: "Rechazado",
  validado: "Validado · por asignar",
  por_transferir: "Por transferir",
  activo: "Activo",
  devolucion_pendiente: "Devolución por confirmar",
  cerrado: "Cerrado",
  cerrado_con_saldo: "Cerrado con saldo a favor",
  anulado: "Anulado",
};

export const TONO_ESTADO_FONDO: Record<EstadoFondo, string> = {
  en_validacion: "bg-amber-500/12 text-amber-700",
  rechazado: "bg-rose-500/12 text-rose-600",
  validado: "bg-sky-500/12 text-sky-700",
  por_transferir: "bg-violet-500/12 text-violet-700",
  activo: "bg-emerald-500/12 text-emerald-700",
  devolucion_pendiente: "bg-amber-500/12 text-amber-700",
  cerrado: "bg-tinta/[0.07] text-gris",
  cerrado_con_saldo: "bg-teal-500/12 text-teal-700",
  anulado: "bg-tinta/[0.07] text-gris-suave",
};

export type RolFondos = "validador" | "asignador" | "tesoreria" | "revisor" | "administrador";

export const ROLES_FONDOS: { rol: RolFondos; nombre: string; detalle: string }[] = [
  { rol: "validador", nombre: "Validador", detalle: "Aprueba o rechaza las solicitudes de fondo" },
  { rol: "asignador", nombre: "Asignador", detalle: "Crea y asigna fondos; maneja fondos fijos y reposiciones" },
  { rol: "tesoreria", nombre: "Tesorería", detalle: "Transfiere fondos, reembolsos y reposiciones; confirma devoluciones" },
  { rol: "revisor", nombre: "Revisor", detalle: "Revisa los informes y cada boleta: acepta, observa o rechaza" },
  { rol: "administrador", nombre: "Administración", detalle: "Parámetros, roles, libro, anulaciones y ajustes" },
];

export type TipoMovimiento = "TRANSFERENCIA_FONDO" | "GASTO" | "REEMBOLSO" | "DEVOLUCION_SALDO" | "REPOSICION" | "AJUSTE" | "ANULACION";

/** El signo que cada tipo aplica al saldo (AJUSTE y ANULACION lo traen explícito). */
export const SIGNO_MOVIMIENTO: Record<Exclude<TipoMovimiento, "AJUSTE" | "ANULACION">, 1 | -1> = {
  TRANSFERENCIA_FONDO: 1,
  GASTO: -1,
  REEMBOLSO: 1,
  DEVOLUCION_SALDO: -1,
  REPOSICION: 1,
};

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  TRANSFERENCIA_FONDO: "Transferencia del fondo",
  GASTO: "Gasto",
  REEMBOLSO: "Reembolso",
  DEVOLUCION_SALDO: "Devolución de saldo",
  REPOSICION: "Reposición",
  AJUSTE: "Ajuste",
  ANULACION: "Anulación",
};

/** Los movimientos con dinero real se concilian con el banco; los gastos no. */
export const CON_BANCO: TipoMovimiento[] = ["TRANSFERENCIA_FONDO", "REEMBOLSO", "DEVOLUCION_SALDO", "REPOSICION"];

export interface Fondo {
  id: string;
  empresaId: string;
  codigo: string;
  rendidorCorreo: string;
  rendidorNombre: string;
  origen: "solicitud" | "directa";
  motivo: string | null;
  centroCosto: string | null;
  fechaEstimada: string | null;
  montoSolicitado: number | null;
  montoAutorizado: number | null;
  esFijo: boolean;
  montoFijo: number | null;
  montoPorTransferir: number | null;
  estado: EstadoFondo;
  solicitadoPor: string | null;
  asignadoPor: string | null;
  asignadoEn: string | null;
  activadoEn: string | null;
  venceEn: string | null;
  cerradoEn: string | null;
  motivoRechazo: string | null;
  motivoAnulacion: string | null;
  devolucionMonto: number | null;
  devolucionReferencia: string | null;
  ciclo: number;
  creadoEn: string;
  /** Calculado del libro. */
  saldo: number;
  /** Lo transferido en total (fondo + reembolsos + reposiciones), del libro. */
  transferido: number;
  /** Gastos aceptados, del libro. */
  gastado: number;
}

export interface Movimiento {
  id: string;
  fondoId: string;
  informeId: string | null;
  boletaId: string | null;
  tipo: TipoMovimiento;
  monto: number;
  signo: 1 | -1;
  saldoResultante: number;
  usuario: string;
  fecha: string;
  referenciaBanco: string | null;
  comprobante: string | null;
  estadoConciliacion: "pendiente" | "conciliado" | "no_aplica";
  motivo: string | null;
}

export interface Parametros {
  umbralAvisoLimite: number;
  plazoRendicionDias: number;
  maxInformesAbiertos: number;
  bloquearConVencidos: boolean;
  umbralValidacionDirecta: number | null;
}

export const PARAMETROS_POR_OMISION: Parametros = {
  umbralAvisoLimite: 0.9,
  plazoRendicionDias: 30,
  maxInformesAbiertos: 1,
  bloquearConVencidos: true,
  umbralValidacionDirecta: null,
};

/** Un fondo activo con su fecha límite pasada: no es un estado, es un indicador. */
export function estaVencido(f: Pick<Fondo, "estado" | "venceEn">, hoyIso: string): boolean {
  return f.estado === "activo" && !!f.venceEn && f.venceEn < hoyIso;
}

// ---------- Boletas (los gastos de un informe) ----------------------------------

export type EstadoBoleta = "cargada" | "aceptada" | "observada" | "rechazada";

export const ETIQUETA_BOLETA: Record<EstadoBoleta, string> = {
  cargada: "Cargada",
  aceptada: "Aceptada",
  observada: "Observada",
  rechazada: "Rechazada",
};

export const TONO_BOLETA: Record<EstadoBoleta, string> = {
  cargada: "bg-tinta/[0.06] text-gris",
  aceptada: "bg-emerald-500/12 text-emerald-700",
  observada: "bg-amber-500/12 text-amber-700",
  rechazada: "bg-rose-500/12 text-rose-600",
};

/** El gasto rendido mientras se trabaja: cargadas + aceptadas (las rechazadas no suman). */
export function gastoRendido(gastos: { total: number; revision?: { estado: EstadoBoleta } | null }[]): number {
  return gastos.filter((g) => (g.revision?.estado ?? "cargada") !== "rechazada").reduce((s, g) => s + (Number(g.total) || 0), 0);
}

export const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
