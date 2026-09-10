import type { FilaLead } from "./datos";
import { estaEstancada, sinActividad } from "./crm-filtro";

// Las series que dibujan los gráficos del detalle de CRM. Puras y sin React (ver
// scripts/probar-crm.mts): los componentes de ApexCharts solo reciben lo que estas
// funciones devuelven.
//
// Todas trabajan sobre los leads YA FILTRADOS, igual que en Facturas: los gráficos
// muestran lo mismo que la tabla de abajo.

export interface EscalonDelEmbudo {
  etapa: string;
  /** El valor del filtro que aplica el clic. */
  filtro: string;
  cantidad: number;
  monto: number;
  montoPonderado: number;
}

/**
 * El embudo: las oportunidades ABIERTAS por etapa, en el orden real de Odoo.
 *
 * Solo abiertas, y eso es lo que lo hace un embudo: mezclarle las ganadas y las perdidas
 * lo convierte en un histograma de historia, que se contesta con la tendencia de más
 * abajo. El orden sale de crm.stage.sequence (columna etapa_secuencia): ordenar por monto
 * o alfabéticamente da un gráfico que se ve igual pero no significa nada.
 */
export function embudo(leads: FilaLead[]): EscalonDelEmbudo[] {
  const porEtapa = new Map<string, EscalonDelEmbudo & { secuencia: number }>();
  for (const l of leads) {
    if (l.estado !== "abierta") continue;
    const etapa = l.etapa ?? "Sin etapa";
    const escalon =
      porEtapa.get(etapa) ??
      { etapa, filtro: etapa, cantidad: 0, monto: 0, montoPonderado: 0, secuencia: l.etapa_secuencia ?? 999 };
    escalon.cantidad += 1;
    escalon.monto += l.monto_esperado ?? 0;
    escalon.montoPonderado += l.monto_ponderado ?? 0;
    porEtapa.set(etapa, escalon);
  }
  return [...porEtapa.values()]
    .sort((a, b) => a.secuencia - b.secuencia || a.etapa.localeCompare(b.etapa, "es"))
    .map(({ secuencia: _secuencia, ...resto }) => resto);
}

export interface PuntoMensual {
  /** "2026-08": la clave con la que el clic arma el rango de fechas. */
  mes: string;
  creadas: number;
  ganadas: number;
  perdidas: number;
  montoGanado: number;
}

/**
 * Creadas, ganadas y perdidas por mes, del más viejo al más nuevo y sin huecos.
 *
 * Las creadas van por su fecha de creación y las cerradas por su fecha de CIERRE: son dos
 * cosas distintas y contarlas por la misma fecha es el error que hace que un mes bueno de
 * cierres se le atribuya al mes en que entraron los leads.
 */
export function tendenciaMensual(leads: FilaLead[]): PuntoMensual[] {
  const porMes = new Map<string, PuntoMensual>();
  const punto = (mes: string) => {
    const actual = porMes.get(mes) ?? { mes, creadas: 0, ganadas: 0, perdidas: 0, montoGanado: 0 };
    porMes.set(mes, actual);
    return actual;
  };

  for (const l of leads) {
    const creado = l.fecha_creacion?.slice(0, 7);
    if (creado) punto(creado).creadas += 1;

    if (l.estado === "ganada" || l.estado === "perdida") {
      // Sin fecha de cierre no se puede ubicar en el tiempo: cae en el mes de creación,
      // que es lo más cerca de la verdad que hay.
      const cerrado = (l.fecha_cierre_real ?? l.fecha_creacion)?.slice(0, 7);
      if (cerrado) {
        const p = punto(cerrado);
        if (l.estado === "ganada") {
          p.ganadas += 1;
          p.montoGanado += l.monto_esperado ?? 0;
        } else {
          p.perdidas += 1;
        }
      }
    }
  }

  const meses = [...porMes.keys()].sort();
  if (meses.length === 0) return [];
  return mesesEntre(meses[0], meses[meses.length - 1]).map(
    (mes) => porMes.get(mes) ?? { mes, creadas: 0, ganadas: 0, perdidas: 0, montoGanado: 0 },
  );
}

/** Todos los meses de un extremo al otro, inclusive. Tope de 600 (50 años) por seguridad. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [anio, mes] = desde.split("-").map(Number);
  for (let i = 0; i < 600; i += 1) {
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    meses.push(clave);
    if (clave >= hasta) break;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

/** El primer y el último día de un mes "2026-08", para el filtro de fechas. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export interface Porcion {
  filtro: string;
  etiqueta: string;
  cantidad: number;
  monto: number;
}

/** Ganadas, perdidas y abiertas: el reparto que contesta "cómo venimos". */
export function porEstado(leads: FilaLead[]): Porcion[] {
  const grupos = [
    { filtro: "ganada", etiqueta: "Ganadas", estado: "ganada" },
    { filtro: "perdida", etiqueta: "Perdidas", estado: "perdida" },
    { filtro: "abierta", etiqueta: "Abiertas", estado: "abierta" },
  ];
  return grupos
    .map((g) => {
      const suyas = leads.filter((l) => l.estado === g.estado);
      return {
        filtro: g.filtro,
        etiqueta: g.etiqueta,
        cantidad: suyas.length,
        monto: suyas.reduce((a, l) => a + (l.monto_esperado ?? 0), 0),
      };
    })
    .filter((p) => p.cantidad > 0);
}

/**
 * Por qué se pierden.
 *
 * Es la única lista de esta pantalla que sirve para cambiar algo: si el motivo más
 * repetido es "precio" no se arregla haciendo más llamadas. Las que no tienen motivo se
 * cuentan aparte en vez de desaparecer, porque "perdimos y no anotamos por qué" también
 * es un dato.
 */
export function motivosDePerdida(leads: FilaLead[]): Porcion[] {
  const porMotivo = new Map<string, Porcion>();
  for (const l of leads) {
    if (l.estado !== "perdida") continue;
    const etiqueta = l.motivo_perdida ?? "Sin motivo anotado";
    const actual = porMotivo.get(etiqueta) ?? { filtro: "perdida", etiqueta, cantidad: 0, monto: 0 };
    actual.cantidad += 1;
    actual.monto += l.monto_esperado ?? 0;
    porMotivo.set(etiqueta, actual);
  }
  return [...porMotivo.values()].sort((a, b) => b.cantidad - a.cantidad);
}

export interface Vendedor {
  nombre: string;
  abiertas: number;
  ganadas: number;
  perdidas: number;
  montoAbierto: number;
  montoGanado: number;
}

/**
 * Cada vendedor con su pipeline y su resultado, ordenado por monto abierto.
 *
 * Las tres columnas juntas y no solo el pipeline: alguien con mucho abierto y nada ganado
 * y alguien con poco abierto porque ya cerró son la misma barra si solo se mira lo
 * abierto.
 */
export function porVendedor(leads: FilaLead[], cuantos = 8): Vendedor[] {
  const porNombre = new Map<string, Vendedor>();
  for (const l of leads) {
    const nombre = l.vendedor ?? "Sin asignar";
    const v =
      porNombre.get(nombre) ??
      { nombre, abiertas: 0, ganadas: 0, perdidas: 0, montoAbierto: 0, montoGanado: 0 };
    if (l.estado === "abierta") {
      v.abiertas += 1;
      v.montoAbierto += l.monto_esperado ?? 0;
    }
    if (l.estado === "ganada") {
      v.ganadas += 1;
      v.montoGanado += l.monto_esperado ?? 0;
    }
    if (l.estado === "perdida") v.perdidas += 1;
    porNombre.set(nombre, v);
  }
  return [...porNombre.values()]
    .sort((a, b) => b.montoAbierto - a.montoAbierto || b.abiertas - a.abiertas)
    .slice(0, cuantos);
}

export interface TramoDeAntiguedad {
  etiqueta: string;
  desde: number;
  hasta: number | null;
  cantidad: number;
  monto: number;
}

/** Los tramos de antigüedad del pipeline, en el orden en que se leen. */
export const TRAMOS_DE_ANTIGUEDAD: { etiqueta: string; desde: number; hasta: number | null }[] = [
  { etiqueta: "Esta semana", desde: 0, hasta: 7 },
  { etiqueta: "8 a 30 días", desde: 8, hasta: 30 },
  { etiqueta: "31 a 60", desde: 31, hasta: 60 },
  { etiqueta: "61 a 90", desde: 61, hasta: 90 },
  { etiqueta: "Más de 90", desde: 91, hasta: null },
];

/**
 * Cuánto tiempo llevan sin moverse las oportunidades abiertas.
 *
 * Se mide desde el último cambio de etapa, no desde la creación: una oportunidad de hace
 * seis meses que avanzó ayer está viva, y una de hace tres semanas que nadie tocó no.
 */
export function antiguedadDelPipeline(leads: FilaLead[], hoy: string): TramoDeAntiguedad[] {
  const dia = 24 * 60 * 60 * 1000;
  const tramos: TramoDeAntiguedad[] = TRAMOS_DE_ANTIGUEDAD.map((t) => ({ ...t, cantidad: 0, monto: 0 }));
  for (const l of leads) {
    if (l.estado !== "abierta") continue;
    const referencia = l.fecha_ultimo_movimiento ?? l.fecha_creacion;
    if (!referencia) continue;
    const dias = Math.round(
      (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${referencia.slice(0, 10)}T00:00:00Z`)) / dia,
    );
    const tramo = tramos.find((t) => dias >= t.desde && (t.hasta === null || dias <= t.hasta)) ?? tramos[0];
    tramo.cantidad += 1;
    tramo.monto += l.monto_esperado ?? 0;
  }
  return tramos;
}

export interface Aviso {
  /** El filtro que muestra exactamente lo que el aviso cuenta. */
  filtro: string;
  texto: string;
  cantidad: number;
}

/**
 * Lo que hay que arreglar en los datos, contado.
 *
 * Va arriba y no escondido: en el CRM de verdad hay nueve de doce oportunidades con monto
 * 0 y casi ninguna con fecha de cierre, así que cualquier gráfico de montos se ve vacío y
 * parece un error del panel. Decirlo convierte un gráfico raro en una tarea concreta.
 */
export function avisosDeCalidad(leads: FilaLead[], hoy: string): Aviso[] {
  const abiertas = leads.filter((l) => l.estado === "abierta");
  const avisos: Aviso[] = [
    {
      filtro: "sin_monto",
      cantidad: abiertas.filter((l) => (l.monto_esperado ?? 0) <= 0).length,
      texto: "sin monto esperado: no entran en ninguna proyección",
    },
    {
      filtro: "sin_actividad",
      cantidad: abiertas.filter(sinActividad).length,
      texto: "sin próxima actividad agendada",
    },
    {
      filtro: "estancadas",
      cantidad: abiertas.filter((l) => estaEstancada(l, hoy)).length,
      texto: "sin moverse de etapa hace más de un mes",
    },
    {
      filtro: "atrasadas",
      cantidad: abiertas.filter((l) => !!l.fecha_cierre_estimada && l.fecha_cierre_estimada < hoy).length,
      texto: "con el cierre estimado ya vencido",
    },
  ];
  return avisos.filter((a) => a.cantidad > 0);
}
