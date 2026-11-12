// Sin "server-only": lo usan la página (servidor) y el listado de «Mis gastos» (navegador).
import type { EstadoRendicion, GastoRendicion } from "./tipos";

/**
 * El ciclo de un gasto, visto desde «Mis gastos»:
 *   borrador   → recién ingresado, suelto, todavía no está en ningún informe.
 *   en informe → se asignó a un informe que está en manos de quien rinde o en revisión.
 *   cerrado    → el informe se aprobó: el gasto quedó validado y espera su conciliación.
 *   rechazado  → quien revisó rechazó esa boleta.
 */
export type EstadoGasto = "borrador" | "en_informe" | "cerrado" | "rechazado";

export const ETIQUETA_ESTADO_GASTO: Record<EstadoGasto, string> = {
  borrador: "Borrador",
  en_informe: "En informe",
  cerrado: "Cerrado",
  rechazado: "Rechazado",
};

export const TONO_ESTADO_GASTO: Record<EstadoGasto, string> = {
  borrador: "bg-tinta/[0.06] text-gris",
  en_informe: "bg-sky-500/12 text-sky-700",
  cerrado: "bg-emerald-500/12 text-emerald-700",
  rechazado: "bg-rose-500/12 text-rose-600",
};

/** Informes ya aprobados: sus gastos quedan validados y pasan a conciliar. */
const INFORME_VALIDADO: EstadoRendicion[] = ["aprobada", "pagada", "cargada_odoo", "reembolso_pendiente", "reembolsada", "cerrada"];

/** El estado de un gasto según dónde está: suelto (null) o en un informe en tal estado. */
export function estadoDeGasto(g: Pick<GastoRendicion, "revision">, estadoInforme: EstadoRendicion | null): EstadoGasto {
  if (!estadoInforme) return "borrador";
  if (g.revision?.estado === "rechazada") return "rechazado";
  return INFORME_VALIDADO.includes(estadoInforme) ? "cerrado" : "en_informe";
}

export interface FilaMiGasto {
  id: string;
  fecha: string | null;
  proveedor: string;
  numeroDocumento: string | null;
  categoria: GastoRendicion["categoria"];
  tipoDocumento: GastoRendicion["tipoDocumento"];
  total: number;
  estado: EstadoGasto;
  informeId: string | null;
  informeTitulo: string | null;
  proyectoNombre?: string | null;
  conciliado?: boolean;
  /** El documento de respaldo, si tiene (se ve en un popup desde el listado). */
  respaldo?: { nombre: string; tipo: string } | null;
}

export const esFactura = (t: GastoRendicion["tipoDocumento"]) => t === "factura_electronica" || t === "factura_exenta_no_afecta";

/** Otro gasto que parece el mismo (en cualquier estado: borrador, en informe o cerrado). */
export interface Repetido {
  enRendicionId: string;
  /** Título del informe, o «Mis gastos» si el otro está suelto (borrador). */
  enTitulo: string;
  esBolsa: boolean;
  quien: string;
  estado: EstadoGasto;
  proveedor: string;
  fecha: string | null;
  total: number;
  numeroDocumento: string | null;
  /** Mismo proveedor, folio y monto. Si no, solo coincide proveedor, fecha y monto. */
  fuerte: boolean;
}

export const textoRepetido = (r: Repetido) =>
  `${r.fuerte ? "Mismo proveedor, folio y monto" : "Mismo proveedor, fecha y monto"} que ${r.esBolsa ? `un borrador de ${r.quien}` : `«${r.enTitulo}»`} (${ETIQUETA_ESTADO_GASTO[r.estado]})`;
