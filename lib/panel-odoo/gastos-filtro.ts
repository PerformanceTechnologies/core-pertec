import type { FilaGasto } from "./datos";

// Filtrado, orden y totales del detalle de Gastos. Todo puro y sin React (ver
// scripts/probar-gastos.mts): el componente solo dibuja lo que estas funciones devuelven.
//
// Mismo patrón que ./facturas-filtro.ts, ./crm-filtro.ts y ./ventas-filtro.ts. Lo propio
// de acá es que un gasto tiene dos vidas: la del dinero (quién lo puso, a quién hay que
// devolvérselo) y la del trámite (si está rendido, aprobado, contabilizado).

export type CampoOrden =
  | "fecha"
  | "monto_total"
  | "monto_pendiente"
  | "empleado"
  | "categoria"
  | "proveedor";
export type Sentido = "asc" | "desc";

export interface Criterios {
  texto: string;
  estado: string;
  empleado: string;
  categoria: string;
  tipoDocumento: string;
  proveedor: string;
  desde: string;
  hasta: string;
  orden: CampoOrden;
  sentido: Sentido;
}

export const CRITERIOS_INICIALES: Criterios = {
  texto: "",
  estado: "",
  empleado: "",
  categoria: "",
  tipoDocumento: "",
  proveedor: "",
  desde: "",
  hasta: "",
  orden: "fecha",
  sentido: "desc",
};

/** Días que puede quedarse un gasto en borrador antes de considerarlo olvidado. */
export const DIAS_PARA_OLVIDARSE = 30;

const DIA = 24 * 60 * 60 * 1000;

/** Días entre una fecha de Odoo (que puede traer hora) y hoy. */
export function diasDesde(fecha: string | null, hoy: string): number | null {
  if (!fecha) return null;
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`)) / DIA);
}

/** Todavía no salió de la persona que lo cargó: ni presentado. */
export function sinRendir(g: FilaGasto): boolean {
  return g.estado === "draft";
}

/** Presentado y esperando que alguien lo apruebe. */
export function esperandoAprobacion(g: FilaGasto): boolean {
  return g.estado === "submitted";
}

/**
 * Lo puso la persona de su bolsillo y todavía no se le devolvió.
 *
 * `own_account` es "pagado por el empleado", así que mientras quede monto pendiente es
 * plata que la empresa le debe. Es la pregunta que más importa de esta pantalla para
 * quien rinde.
 */
export function porReembolsar(g: FilaGasto): boolean {
  return g.forma_pago === "own_account" && (g.monto_pendiente ?? 0) > 0;
}

/** Sin ningún adjunto en Odoo. El campo es confiable: los rendidos traen 1. */
export function sinRespaldo(g: FilaGasto): boolean {
  return g.respaldos === 0;
}

/** Sin la categoría del panel: no entra en ningún desglose. */
export function sinCategoria(g: FilaGasto): boolean {
  return !g.categoria;
}

/** Odoo lo marcó como repetido de otro (mismo recibo o mismo gasto). */
export function marcadoDuplicado(g: FilaGasto): boolean {
  return (g.duplicados ?? 0) > 0;
}

/** En borrador hace más de un mes: nadie lo va a rendir solo. */
export function olvidado(g: FilaGasto, hoy: string): boolean {
  if (!sinRendir(g)) return false;
  const dias = diasDesde(g.fecha, hoy);
  return dias !== null && dias >= DIAS_PARA_OLVIDARSE;
}

/** Se le imputó a un fondo por rendir. */
export function conFondo(g: FilaGasto): boolean {
  return !!g.fondo;
}

export type GrupoDeEstado = "Trámite" | "Dinero" | "Atención";

export const ESTADO_FILTROS: {
  valor: string;
  etiqueta: string;
  grupo: GrupoDeEstado;
  cumple: (g: FilaGasto, hoy: string) => boolean;
}[] = [
  { valor: "draft", etiqueta: "En borrador", grupo: "Trámite", cumple: sinRendir },
  { valor: "submitted", etiqueta: "Esperando aprobación", grupo: "Trámite", cumple: esperandoAprobacion },
  { valor: "approved", etiqueta: "Aprobados", grupo: "Trámite", cumple: (g) => g.estado === "approved" },
  { valor: "in_report", etiqueta: "En una rendición", grupo: "Trámite", cumple: (g) => g.estado === "in_report" },
  { valor: "posted", etiqueta: "Contabilizados", grupo: "Trámite", cumple: (g) => g.estado === "posted" },
  { valor: "paid", etiqueta: "Pagados", grupo: "Trámite", cumple: (g) => g.estado === "paid" || g.estado === "in_payment" },
  { valor: "por_reembolsar", etiqueta: "Por reembolsar a la persona", grupo: "Dinero", cumple: porReembolsar },
  {
    valor: "empresa",
    etiqueta: "Pagados por la empresa",
    grupo: "Dinero",
    cumple: (g) => g.forma_pago === "company_account",
  },
  { valor: "con_fondo", etiqueta: "Imputados a un fondo", grupo: "Dinero", cumple: conFondo },
  { valor: "sin_fondo", etiqueta: "Sin fondo", grupo: "Dinero", cumple: (g) => !conFondo(g) },
  { valor: "sin_respaldo", etiqueta: "Sin respaldo adjunto", grupo: "Atención", cumple: sinRespaldo },
  { valor: "sin_categoria", etiqueta: "Sin categoría", grupo: "Atención", cumple: sinCategoria },
  { valor: "duplicados", etiqueta: "Marcados como repetidos", grupo: "Atención", cumple: marcadoDuplicado },
  {
    valor: "olvidados",
    etiqueta: `En borrador hace +${DIAS_PARA_OLVIDARSE} días`,
    grupo: "Atención",
    cumple: olvidado,
  },
];

export const GRUPOS_DE_ESTADO: GrupoDeEstado[] = ["Trámite", "Dinero", "Atención"];

function normalizar(valor: string): string {
  // Sin tildes ni mayúsculas: "alimentacion" tiene que encontrar "Alimentación".
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function textoBuscable(g: FilaGasto): string {
  return [
    g.descripcion,
    g.empleado,
    g.proveedor,
    g.concepto,
    g.categoria_odoo,
    g.fondo,
    g.atribuido_a,
    g.contraparte,
    g.proyecto,
    g.asiento,
  ]
    .filter(Boolean)
    .join(" ");
}

export function filtrarGastos(gastos: FilaGasto[], criterios: Criterios, hoy: string): FilaGasto[] {
  const aguja = normalizar(criterios.texto);
  const filtroEstado = ESTADO_FILTROS.find((e) => e.valor === criterios.estado);

  return gastos.filter((g) => {
    if (aguja && !normalizar(textoBuscable(g)).includes(aguja)) return false;
    if (filtroEstado && !filtroEstado.cumple(g, hoy)) return false;
    if (criterios.empleado && (g.empleado ?? "Sin asignar") !== criterios.empleado) return false;
    if (criterios.categoria && (g.categoria ?? "") !== criterios.categoria) return false;
    if (criterios.tipoDocumento && (g.tipo_documento ?? "") !== criterios.tipoDocumento) return false;
    if (criterios.proveedor && (g.proveedor ?? "") !== criterios.proveedor) return false;
    const fecha = g.fecha?.slice(0, 10) ?? null;
    if (criterios.desde && (!fecha || fecha < criterios.desde)) return false;
    if (criterios.hasta && (!fecha || fecha > criterios.hasta)) return false;
    return true;
  });
}

export function ordenarGastos(gastos: FilaGasto[], campo: CampoOrden, sentido: Sentido): FilaGasto[] {
  const signo = sentido === "asc" ? 1 : -1;
  // Copia: el arreglo que llega es el del servidor y ordenarlo en el lugar haría que un
  // re-render vea otro orden del que pidió.
  return [...gastos].sort((a, b) => {
    const va = a[campo];
    const vb = b[campo];
    // Los nulos siempre al final, sin importar el sentido.
    if ((va === null || va === undefined) && (vb === null || vb === undefined)) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * signo;
    return String(va).localeCompare(String(vb), "es") * signo;
  });
}

export interface ResumenGastos {
  cantidad: number;
  monto: number;
  sinRendir: number;
  montoSinRendir: number;
  esperandoAprobacion: number;
  montoPorReembolsar: number;
  sinRespaldo: number;
  sinCategoria: number;
  duplicados: number;
  olvidados: number;
  /** IVA de lo que tiene documento con IVA: lo recuperable. */
  montoImpuesto: number;
}

export function resumirGastos(gastos: FilaGasto[], hoy: string): ResumenGastos {
  const resumen: ResumenGastos = {
    cantidad: gastos.length,
    monto: 0,
    sinRendir: 0,
    montoSinRendir: 0,
    esperandoAprobacion: 0,
    montoPorReembolsar: 0,
    sinRespaldo: 0,
    sinCategoria: 0,
    duplicados: 0,
    olvidados: 0,
    montoImpuesto: 0,
  };
  for (const g of gastos) {
    resumen.monto += g.monto_total;
    resumen.montoImpuesto += g.monto_impuesto ?? 0;
    if (sinRendir(g)) {
      resumen.sinRendir += 1;
      resumen.montoSinRendir += g.monto_total;
    }
    if (esperandoAprobacion(g)) resumen.esperandoAprobacion += 1;
    if (porReembolsar(g)) resumen.montoPorReembolsar += g.monto_pendiente ?? 0;
    if (sinRespaldo(g)) resumen.sinRespaldo += 1;
    if (sinCategoria(g)) resumen.sinCategoria += 1;
    if (marcadoDuplicado(g)) resumen.duplicados += 1;
    if (olvidado(g, hoy)) resumen.olvidados += 1;
  }
  return resumen;
}

/** Hoy en Chile como YYYY-MM-DD, para comparar contra las fechas de Odoo. */
export function hoyEnChileIso(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}
