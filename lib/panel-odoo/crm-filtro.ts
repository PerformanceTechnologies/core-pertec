import type { FilaLead } from "./datos";

// Filtrado, orden y totales del detalle de CRM. Todo puro y sin React (ver
// scripts/probar-crm.mts): el componente solo dibuja lo que estas funciones devuelven.
//
// Mismo patrón que ./facturas-filtro.ts, con una diferencia de fondo: acá el filtro por
// "estado" es el eje principal, porque una oportunidad ganada, una perdida y una abierta
// no se miran juntas casi nunca.

export type CampoOrden =
  | "fecha_creacion"
  | "fecha_cierre_estimada"
  | "monto_esperado"
  | "monto_ponderado"
  | "probabilidad"
  | "partner_nombre"
  | "etapa_secuencia";
export type Sentido = "asc" | "desc";

export interface Criterios {
  texto: string;
  estado: string;
  etapa: string;
  vendedor: string;
  desde: string;
  hasta: string;
  orden: CampoOrden;
  sentido: Sentido;
}

export const CRITERIOS_INICIALES: Criterios = {
  texto: "",
  estado: "",
  etapa: "",
  vendedor: "",
  desde: "",
  hasta: "",
  orden: "fecha_creacion",
  sentido: "desc",
};

/** Días sin que la oportunidad cambie de etapa a partir de los cuales se considera estancada. */
export const DIAS_PARA_ESTANCARSE = 30;

const DIA = 24 * 60 * 60 * 1000;

/** Días entre una fecha de Odoo (que puede traer hora) y hoy. */
export function diasDesde(fecha: string | null, hoy: string): number | null {
  if (!fecha) return null;
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`)) / DIA);
}

/**
 * Una oportunidad abierta que no se mueve de etapa desde hace un mes.
 *
 * Es la pregunta útil de un pipeline: no "cuánto hay" sino "qué está muerto y sigue
 * contando como si estuviera vivo". Solo aplica a las abiertas: una ganada de marzo no
 * está estancada, está cerrada.
 */
export function estaEstancada(l: FilaLead, hoy: string): boolean {
  if (l.estado !== "abierta") return false;
  const dias = diasDesde(l.fecha_ultimo_movimiento ?? l.fecha_creacion, hoy);
  return dias !== null && dias >= DIAS_PARA_ESTANCARSE;
}

/** Abierta cuyo cierre estimado ya pasó: el compromiso venció y sigue ahí. */
export function estaAtrasada(l: FilaLead, hoy: string): boolean {
  return l.estado === "abierta" && !!l.fecha_cierre_estimada && l.fecha_cierre_estimada < hoy;
}

/** Abierta sin próxima actividad agendada: nadie la está trabajando. */
export function sinActividad(l: FilaLead): boolean {
  return l.estado === "abierta" && !l.actividad_proxima;
}

/** Abierta sin monto esperado: no se puede proyectar nada con ella. */
export function sinMonto(l: FilaLead): boolean {
  return l.estado === "abierta" && (l.monto_esperado ?? 0) <= 0;
}

export type GrupoDeEstado = "Estado" | "Atención" | "Tipo";

export const ESTADO_FILTROS: {
  valor: string;
  etiqueta: string;
  grupo: GrupoDeEstado;
  cumple: (l: FilaLead, hoy: string) => boolean;
}[] = [
  { valor: "abierta", etiqueta: "Abiertas", grupo: "Estado", cumple: (l) => l.estado === "abierta" },
  { valor: "ganada", etiqueta: "Ganadas", grupo: "Estado", cumple: (l) => l.estado === "ganada" },
  { valor: "perdida", etiqueta: "Perdidas", grupo: "Estado", cumple: (l) => l.estado === "perdida" },
  { valor: "cerradas", etiqueta: "Cerradas (ganadas + perdidas)", grupo: "Estado", cumple: (l) => l.estado === "ganada" || l.estado === "perdida" },
  { valor: "estancadas", etiqueta: `Estancadas (+${DIAS_PARA_ESTANCARSE} días sin moverse)`, grupo: "Atención", cumple: estaEstancada },
  { valor: "atrasadas", etiqueta: "Cierre estimado vencido", grupo: "Atención", cumple: estaAtrasada },
  { valor: "sin_actividad", etiqueta: "Sin próxima actividad", grupo: "Atención", cumple: (l) => sinActividad(l) },
  { valor: "sin_monto", etiqueta: "Sin monto esperado", grupo: "Atención", cumple: (l) => sinMonto(l) },
  { valor: "opportunity", etiqueta: "Oportunidades", grupo: "Tipo", cumple: (l) => l.tipo === "opportunity" },
  { valor: "lead", etiqueta: "Leads sin calificar", grupo: "Tipo", cumple: (l) => l.tipo === "lead" },
];

export const GRUPOS_DE_ESTADO: GrupoDeEstado[] = ["Estado", "Atención", "Tipo"];

function normalizar(valor: string): string {
  // Sin tildes ni mayúsculas: "compania" tiene que encontrar "COMPAÑÍA".
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function textoBuscable(l: FilaLead): string {
  return [
    l.nombre,
    l.partner_nombre,
    l.contacto,
    l.vendedor,
    l.equipo,
    l.etapa,
    l.ciudad,
    l.correo,
    l.telefono,
    l.origen,
    l.campana,
    l.motivo_perdida,
    ...(l.etiquetas ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function filtrarLeads(leads: FilaLead[], criterios: Criterios, hoy: string): FilaLead[] {
  const aguja = normalizar(criterios.texto);
  const filtroEstado = ESTADO_FILTROS.find((e) => e.valor === criterios.estado);

  return leads.filter((l) => {
    if (aguja && !normalizar(textoBuscable(l)).includes(aguja)) return false;
    if (filtroEstado && !filtroEstado.cumple(l, hoy)) return false;
    if (criterios.etapa && (l.etapa ?? "") !== criterios.etapa) return false;
    if (criterios.vendedor && (l.vendedor ?? "Sin asignar") !== criterios.vendedor) return false;
    // El rango es sobre la fecha de CREACIÓN: es la que toda oportunidad tiene.
    const creada = l.fecha_creacion?.slice(0, 10) ?? null;
    if (criterios.desde && (!creada || creada < criterios.desde)) return false;
    if (criterios.hasta && (!creada || creada > criterios.hasta)) return false;
    return true;
  });
}

export function ordenarLeads(leads: FilaLead[], campo: CampoOrden, sentido: Sentido): FilaLead[] {
  const signo = sentido === "asc" ? 1 : -1;
  // Copia: el arreglo que llega es el del servidor y ordenarlo en el lugar haría que un
  // re-render vea otro orden del que pidió.
  return [...leads].sort((a, b) => {
    const va = a[campo];
    const vb = b[campo];
    // Los nulos siempre al final, sin importar el sentido.
    if (va === null && vb === null) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * signo;
    return String(va).localeCompare(String(vb), "es") * signo;
  });
}

export interface ResumenCrm {
  cantidad: number;
  abiertas: number;
  ganadas: number;
  perdidas: number;
  montoAbierto: number;
  montoPonderado: number;
  montoGanado: number;
  /** Ganadas sobre cerradas, en fracción. null si todavía no se cerró ninguna. */
  tasaDeConversion: number | null;
  estancadas: number;
  atrasadas: number;
  sinActividad: number;
  sinMonto: number;
}

export function resumirLeads(leads: FilaLead[], hoy: string): ResumenCrm {
  const resumen: ResumenCrm = {
    cantidad: leads.length,
    abiertas: 0,
    ganadas: 0,
    perdidas: 0,
    montoAbierto: 0,
    montoPonderado: 0,
    montoGanado: 0,
    tasaDeConversion: null,
    estancadas: 0,
    atrasadas: 0,
    sinActividad: 0,
    sinMonto: 0,
  };
  for (const l of leads) {
    if (l.estado === "abierta") {
      resumen.abiertas += 1;
      resumen.montoAbierto += l.monto_esperado ?? 0;
      resumen.montoPonderado += l.monto_ponderado ?? 0;
    }
    if (l.estado === "ganada") {
      resumen.ganadas += 1;
      resumen.montoGanado += l.monto_esperado ?? 0;
    }
    if (l.estado === "perdida") resumen.perdidas += 1;
    if (estaEstancada(l, hoy)) resumen.estancadas += 1;
    if (estaAtrasada(l, hoy)) resumen.atrasadas += 1;
    if (sinActividad(l)) resumen.sinActividad += 1;
    if (sinMonto(l)) resumen.sinMonto += 1;
  }
  const cerradas = resumen.ganadas + resumen.perdidas;
  resumen.tasaDeConversion = cerradas > 0 ? resumen.ganadas / cerradas : null;
  return resumen;
}

/**
 * Rellena el estado de las filas que todavía no lo tienen.
 *
 * Las columnas de estado (y el orden de etapa, y las perdidas) llegan con la
 * sincronización nueva. Entre que esto se despliega y que el cron corre por primera vez,
 * las filas viejas de la cache tienen `estado` en null: sin este relleno la pantalla
 * mostraría todo con estado "—", el embudo vacío y la conversión sin calcular, que se lee
 * como que el panel está roto.
 *
 * El relleno es fiel a lo que había: la sincronización vieja pedía SOLO las activas, así
 * que toda fila sin estado es una oportunidad abierta.
 */
export function conEstadoPorOmision(filas: FilaLead[]): FilaLead[] {
  return filas.map((f) => (f.estado ? f : { ...f, estado: f.activa === false ? "perdida" : "abierta" }));
}

/** Hoy en Chile como YYYY-MM-DD, para comparar contra las fechas de Odoo. */
export function hoyEnChileIso(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}
