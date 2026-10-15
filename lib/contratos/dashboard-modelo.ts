// El cálculo del dashboard: cómo se resumen los cuatro módulos en un solo tablero.
//
// Sin "server-only" y sin tocar la base, por lo mismo que arranque-modelo.ts: son funciones
// puras sobre lo que ya se leyó, y tienen que poder probarse sin Supabase ni SharePoint.
//
// Una regla recorre todo el archivo: el dashboard NO inventa números. Cada cifra sale de la
// misma función que usa su módulo (calcularAvance, resumir, resumirDotacion…), así que lo que el
// tablero dice y lo que dice el módulo no pueden discrepar.

import type { Avance } from "./contratos-estado";
import type { EtapasDeRequisitos } from "./documento-estado";
import { diasHasta, type Alerta, type Etapa, type ResumenDeDotacion } from "./acreditacion-modelo";
import {
  MODULOS,
  esAlerta,
  faseDe,
  type Categoria,
  type ModuloArranque,
  type Partida,
  type ResumenDeArranque,
} from "./arranque-modelo";
import { textoDePlazo, type LecturaDePlazo } from "./plazos-modelo";
import { formatearPatente, type AlertaDeVehiculo, type EtapaVehiculo } from "./vehiculos-modelo";
import type { PendientesDeCotizacion, ResumenDePresupuesto } from "./gastos-modelo";

export type ClaveDeModulo = "documentos" | "acreditacion" | "vehiculos" | "logistica" | "gastos";

/** Qué tan bien o mal está algo, para el color: el mismo vocabulario en todo el tablero. */
export type Tono = "ok" | "curso" | "aviso" | "critico" | "neutro" | "marca";

// -----------------------------------------------------------------------------
//  Lo que lee cada módulo
// -----------------------------------------------------------------------------

export interface GrupoDeDocumentos {
  nombre: string;
  href: string;
  avance: Avance;
  etapas: EtapasDeRequisitos;
}

export interface ResumenDeDocumentos {
  estado: "ok";
  total: Avance;
  etapas: EtapasDeRequisitos;
  grupos: GrupoDeDocumentos[];
}

/** Documentos generales vive en SharePoint: puede faltar la conexión, o fallar la lectura. */
export type DocumentosDelTablero =
  | ResumenDeDocumentos
  | { estado: "sin_conexion" }
  | { estado: "error"; mensaje: string };

export interface MovimientoReciente {
  id: number;
  accion: string;
  detalle: string | null;
  usuario: string;
  /** El nombre de la persona a la que se refiere. */
  persona: string;
  personaId: string;
  cuando: string;
}

export interface ResumenDeAcreditacion {
  personas: number;
  bajas: number;
  /** Personas activas por etapa del camino. */
  etapas: Record<Etapa, number>;
  avance: Avance;
  dotacion: ResumenDeDotacion;
  /** Personas activas que todavía no cuentan como contratadas (sin fecha de ingreso o «sin contrato aún»). */
  sinContrato: number;
  /** Documentos que más faltan en toda la nómina. */
  faltantes: { nombre: string; faltan: number; exigido: number }[];
  /** Todas las alertas, la más urgente primero. */
  alertas: Alerta[];
  vencidos: number;
  porVencer: number;
  contratosPorTerminar: number;
  /** Cursos y exámenes de las personas activas: lo reservado, lo atrasado y lo ya rendido. */
  capacitaciones: {
    enCurso: number;
    examenes: number;
    cursos: number;
    atrasadas: number;
    estaSemana: number;
    realizadas: number;
    aprobadas: number;
    reprobadas: number;
  };
  /** Avance por cargo, de documentos. */
  porCargo: { nombre: string; personas: number; contratadas: number; acreditadas: number; porcentaje: number }[];
  movimientos: MovimientoReciente[];
  fechaInicio: string | null;
  contrato: string;
  administrador: string | null;
}

/** Lo que el tablero muestra de Acreditación Vehículos: lo mismo que de las personas, sin contratos. */
export interface ResumenDeVehiculos {
  vehiculos: number;
  bajas: number;
  /** Vehículos activos por etapa del camino. */
  etapas: Record<EtapaVehiculo, number>;
  avance: Avance;
  dotacion: ResumenDeDotacion;
  /** Documentos que más faltan en toda la flota. */
  faltantes: { nombre: string; faltan: number; exigido: number }[];
  /** Todas las alertas, la más urgente primero. */
  alertas: AlertaDeVehiculo[];
  vencidos: number;
  porVencer: number;
  /** Avance por tipo de vehículo, de documentos. */
  porCategoria: { nombre: string; vehiculos: number; acreditados: number; porcentaje: number }[];
}

export interface DetalleDeEstado {
  clave: string;
  etiqueta: string;
  cantidad: number;
  monto: number;
}

export interface DetalleDeCategoria {
  nombre: string;
  partidas: number;
  presupuestado: number;
  real: number;
}

export interface DetalleDeMes {
  /** «2026-10». */
  mes: string;
  /** «oct». */
  etiqueta: string;
  presupuestado: number;
  real: number;
  cantidad: number;
}

export interface PartidaDestacada {
  id: string;
  numero: number;
  descripcion: string;
  categoria: string;
  /** Para «próximas»: la fecha requerida y los días que faltan (negativo si ya pasó). */
  fecha: string | null;
  dias: number | null;
  estado: string;
  presupuestado: number | null;
  real: number | null;
}

export interface ResumenDeArranqueDelTablero {
  modulo: ModuloArranque;
  resumen: ResumenDeArranque;
  /** Cuántas partidas hay en total, contando las canceladas o anuladas. */
  total: number;
  porEstado: DetalleDeEstado[];
  porCategoria: DetalleDeCategoria[];
  porMes: DetalleDeMes[];
  /** Lo que viene (logística) o lo más grande (gastos): lo que vale la pena mirar primero. */
  proximas: PartidaDestacada[];
  /** Las que están en alerta: atrasadas (logística) o sobre presupuesto (gastos). */
  enAlerta: PartidaDestacada[];
  /**
   * Solo Gastos: el presupuesto contra lo comprometido y lo pagado, con las cotizaciones que esperan
   * respuesta. Ausente si no se pudo leer (migración 0026 sin correr): el tablero cae al resumen de
   * antes en vez de romperse.
   */
  presupuesto?: ResumenDePresupuesto & { pendientes: PendientesDeCotizacion };
}

// -----------------------------------------------------------------------------
//  Formato
// -----------------------------------------------------------------------------

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Un monto en pesos en pocas letras, para donde no cabe «$1.234.567»: «$12,5 M», «$850 mil».
 *
 * «M» son millones, como se dice en Chile («doce millones y medio»). Con decimal solo si hace
 * falta: «$12 M» y no «$12,0 M».
 */
export function pesosCompactos(monto: number | null | undefined): string {
  if (monto === null || monto === undefined) return "—";
  const abs = Math.abs(monto);
  const signo = monto < 0 ? "-" : "";

  const decimal = (n: number) => {
    const t = (Math.round(n * 10) / 10).toString().replace(".", ",");
    return t;
  };

  if (abs >= 1_000_000_000) return `${signo}$${decimal(abs / 1_000_000_000)} MM`;
  if (abs >= 1_000_000) return `${signo}$${decimal(abs / 1_000_000)} M`;
  if (abs >= 10_000) return `${signo}$${Math.round(abs / 1_000)} mil`;
  return `${signo}$${Math.round(abs).toLocaleString("es-CL")}`;
}

export function etiquetaDeMes(mes: string): string {
  const [, m] = mes.split("-");
  return MESES[Number(m) - 1] ?? mes;
}

// -----------------------------------------------------------------------------
//  Logística y Gastos de arranque: de las partidas al tablero
// -----------------------------------------------------------------------------

/** Cuántos meses muestra el gráfico de gasto: el último semestre alcanza para ver una tendencia. */
const MESES_DEL_GRAFICO = 6;

function aDestacada(p: Partida, categorias: Map<string, string>, hoy: string): PartidaDestacada {
  return {
    id: p.id,
    numero: p.numero,
    descripcion: p.descripcion,
    categoria: categorias.get(p.categoriaId) ?? "Sin categoría",
    fecha: p.fecha,
    dias: diasHasta(p.fecha, hoy),
    estado: p.estado,
    presupuestado: p.montoPresupuestado,
    real: p.montoReal,
  };
}

/**
 * Todo lo que el tablero muestra de un módulo de arranque, calculado de una vez desde sus
 * partidas.
 *
 * Lo cancelado y lo anulado salen de las cuentas igual que en `resumir` («fuera»): una partida
 * anulada no es presupuesto ni es una pendiente. Aparecen solo en el detalle por estado, para
 * que el total cuadre con lo que se ve en la lista del módulo.
 */
export function analizarArranque(
  modulo: ModuloArranque,
  partidas: Partida[],
  categorias: Categoria[],
  resumen: ResumenDeArranque,
  hoy: string,
): ResumenDeArranqueDelTablero {
  const config = MODULOS[modulo];
  const nombreDeCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));

  const porEstado: DetalleDeEstado[] = config.estados.map((e) => ({
    clave: e.clave,
    etiqueta: e.etiqueta,
    cantidad: 0,
    monto: 0,
  }));
  const estadoPorClave = new Map(porEstado.map((e) => [e.clave, e]));

  const categoriaAcumulada = new Map<string, DetalleDeCategoria>();
  const mesAcumulado = new Map<string, DetalleDeMes>();

  for (const p of partidas) {
    const estado = estadoPorClave.get(p.estado);
    if (estado) {
      estado.cantidad++;
      estado.monto += p.montoReal ?? p.montoPresupuestado ?? 0;
    }

    if (faseDe(modulo, p.estado) === "fuera") continue;

    const nombre = nombreDeCategoria.get(p.categoriaId) ?? "Sin categoría";
    const c = categoriaAcumulada.get(nombre) ?? { nombre, partidas: 0, presupuestado: 0, real: 0 };
    c.partidas++;
    c.presupuestado += p.montoPresupuestado ?? 0;
    c.real += p.montoReal ?? 0;
    categoriaAcumulada.set(nombre, c);

    if (p.fecha) {
      const mes = p.fecha.slice(0, 7);
      const m =
        mesAcumulado.get(mes) ??
        { mes, etiqueta: etiquetaDeMes(mes), presupuestado: 0, real: 0, cantidad: 0 };
      m.cantidad++;
      m.presupuestado += p.montoPresupuestado ?? 0;
      m.real += p.montoReal ?? 0;
      mesAcumulado.set(mes, m);
    }
  }

  // Por plata en gastos y por cantidad en logística: lo que pesa en cada uno.
  const porCategoria = [...categoriaAcumulada.values()]
    .sort((a, b) =>
      modulo === "gastos"
        ? Math.max(b.presupuestado, b.real) - Math.max(a.presupuestado, a.real) || b.partidas - a.partidas
        : b.partidas - a.partidas || a.nombre.localeCompare(b.nombre, "es"),
    )
    .slice(0, 6);

  // Los últimos meses CON datos, en orden cronológico: un mes vacío en medio no se inventa.
  const porMes = [...mesAcumulado.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-MESES_DEL_GRAFICO);

  const vivas = partidas.filter((p) => faseDe(modulo, p.estado) !== "fuera");

  const proximas =
    modulo === "logistica"
      ? vivas
          .filter((p) => faseDe(modulo, p.estado) !== "final" && p.fecha)
          .sort((a, b) => (a.fecha as string).localeCompare(b.fecha as string))
          .slice(0, 5)
          .map((p) => aDestacada(p, nombreDeCategoria, hoy))
      : [...vivas]
          .sort((a, b) => (b.montoReal ?? b.montoPresupuestado ?? 0) - (a.montoReal ?? a.montoPresupuestado ?? 0))
          .slice(0, 5)
          .map((p) => aDestacada(p, nombreDeCategoria, hoy));

  const enAlerta = vivas
    .filter((p) => esAlerta(modulo, p, hoy))
    .sort((a, b) =>
      modulo === "logistica"
        ? (a.fecha as string).localeCompare(b.fecha as string)
        : (b.montoReal ?? 0) - (b.montoPresupuestado ?? 0) - ((a.montoReal ?? 0) - (a.montoPresupuestado ?? 0)),
    )
    .slice(0, 5)
    .map((p) => aDestacada(p, nombreDeCategoria, hoy));

  return { modulo, resumen, total: partidas.length, porEstado, porCategoria, porMes, proximas, enAlerta };
}

// -----------------------------------------------------------------------------
//  El tablero entero
// -----------------------------------------------------------------------------

/** Un módulo tal como lo ve el encabezado: su avance, su plazo y cuánto pide atención. */
export interface ModuloDelTablero {
  clave: ClaveDeModulo;
  nombre: string;
  href: string;
  avance: Avance;
  /** Lo que se cuenta: «validados», «contratadas», «ejecutadas»… */
  unidad: string;
  plazo: LecturaDePlazo | null;
  alertas: number;
  /**
   * Nombres de quienes responden por el módulo. Undefined si el módulo no tiene responsables como
   * concepto (Documentos generales: ahí se asigna cada requisito); vacío si todavía nadie.
   */
  responsables?: string[];
}

/**
 * El avance general del contrato: el promedio del avance de cada módulo que tiene algo que
 * medir.
 *
 * Promedio simple entre MÓDULOS, no suma de todo: sumar mezclaría 34 requisitos de documentos con
 * 12 partidas de logística, y el módulo con más filas decidiría solo. Cada módulo es una pata
 * del arranque y pesa lo mismo. Un módulo sin nada que medir (0 partidas cargadas) no cuenta:
 * contarlo como 0% daría por atrasado a un contrato por algo que aún nadie empezó a registrar.
 */
export function avanceGeneral(modulos: ModuloDelTablero[]): { porcentaje: number; medidos: number } {
  const medibles = modulos.filter((m) => m.avance.total > 0);
  if (medibles.length === 0) return { porcentaje: 0, medidos: 0 };
  const suma = medibles.reduce((n, m) => n + m.avance.porcentaje, 0);
  return { porcentaje: Math.round(suma / medibles.length), medidos: medibles.length };
}

/** El tono de un avance, con el mismo criterio de `estadoDeAvance`: gris, cian, verde. */
export function tonoDeAvance(avance: Avance): Tono {
  if (avance.total === 0) return "neutro";
  if (avance.porcentaje >= 100) return "ok";
  return "curso";
}

export interface Atencion {
  clave: string;
  modulo: ClaveDeModulo;
  tono: Tono;
  titulo: string;
  detalle: string;
  href: string;
  /** Para ordenar: menor = más urgente (los días que faltan, negativos si ya pasó). */
  urgencia: number;
}

const NOMBRE_DE_MODULO: Record<ClaveDeModulo, string> = {
  documentos: "Documentos generales",
  acreditacion: "Acreditación Personas",
  vehiculos: "Acreditación Vehículos",
  logistica: "Logística",
  gastos: "Gastos de arranque",
};

export function nombreDeModulo(clave: ClaveDeModulo): string {
  return NOMBRE_DE_MODULO[clave];
}

/** Para donde el nombre completo no cabe: la línea de tiempo, donde dos módulos comparten marca. */
const NOMBRE_CORTO: Record<ClaveDeModulo, string> = {
  documentos: "Documentos",
  acreditacion: "Acred. Personas",
  vehiculos: "Acred. Vehículos",
  logistica: "Logística",
  gastos: "Gastos",
};

/**
 * Lo que requiere atención HOY, de todos los módulos, en una lista priorizada.
 *
 * Reúne cuatro clases de cosa: fechas límite vencidas o por vencer, documentos de personal
 * vencidos, contratos que terminan, y partidas atrasadas o sobre presupuesto. Es la respuesta a
 * «¿qué hago primero?»: lo que ya pasó antes que lo que está por pasar.
 *
 * Un plazo vencido de un módulo que ya está completo no es una alerta: cumplido es cumplido.
 */
export function reunirAtencion(datos: {
  modulos: ModuloDelTablero[];
  acreditacion: ResumenDeAcreditacion | null;
  /** Opcional: un tablero armado antes de existir Acreditación Vehículos no lo trae. */
  vehiculos?: ResumenDeVehiculos | null;
  logistica: ResumenDeArranqueDelTablero | null;
  gastos: ResumenDeArranqueDelTablero | null;
  limite?: number;
}): Atencion[] {
  const salida: Atencion[] = [];

  for (const m of datos.modulos) {
    if (!m.plazo || m.plazo.estado === "al_dia") continue;
    if (m.avance.total > 0 && m.avance.porcentaje >= 100) continue;
    salida.push({
      clave: `plazo-${m.clave}`,
      modulo: m.clave,
      tono: m.plazo.estado === "vencido" ? "critico" : "aviso",
      titulo: `Fecha límite de ${m.nombre}`,
      detalle: `${textoDePlazo(m.plazo)} · va en ${m.avance.porcentaje}%`,
      href: m.href,
      urgencia: m.plazo.dias,
    });
  }

  const a = datos.acreditacion;
  if (a) {
    // Los documentos y contratos se agrupan por persona: diez avisos de una misma persona son
    // una línea, no diez.
    const porPersona = new Map<string, Alerta[]>();
    for (const al of a.alertas) {
      const lista = porPersona.get(al.personaId) ?? [];
      lista.push(al);
      porPersona.set(al.personaId, lista);
    }
    for (const [personaId, lista] of porPersona) {
      const peor = lista[0];
      const vencidos = lista.filter((x) => x.tipo === "vencido").length;
      const resto = lista.length - 1;
      salida.push({
        clave: `persona-${personaId}`,
        modulo: "acreditacion",
        tono: peor.dias < 0 ? "critico" : "aviso",
        titulo: peor.persona,
        detalle:
          `${peor.tipo === "contrato" ? "Contrato" : peor.asunto} ` +
          (peor.tipo === "capacitacion"
            ? peor.dias < 0
              ? `atrasado ${-peor.dias} d`
              : "es hoy"
            : `${peor.dias < 0 ? `venció hace ${-peor.dias} d` : peor.dias === 0 ? "vence hoy" : `vence en ${peor.dias} d`}`) +
          (resto > 0 ? ` · y ${resto} más${vencidos > 1 ? ` (${vencidos} vencidos)` : ""}` : ""),
        href: `/contratos/acreditacion/${personaId}`,
        urgencia: peor.dias,
      });
    }
  }

  const v = datos.vehiculos;
  if (v) {
    // Igual que con las personas: diez avisos de un mismo vehículo son una línea, no diez.
    const porVehiculo = new Map<string, AlertaDeVehiculo[]>();
    for (const al of v.alertas) {
      const lista = porVehiculo.get(al.vehiculoId) ?? [];
      lista.push(al);
      porVehiculo.set(al.vehiculoId, lista);
    }
    for (const [vehiculoId, lista] of porVehiculo) {
      const peor = lista[0];
      const vencidos = lista.filter((x) => x.tipo === "vencido").length;
      const resto = lista.length - 1;
      salida.push({
        clave: `vehiculo-${vehiculoId}`,
        modulo: "vehiculos",
        tono: peor.dias < 0 ? "critico" : "aviso",
        titulo: formatearPatente(peor.patente),
        detalle:
          `${peor.asunto} ` +
          `${peor.dias < 0 ? `venció hace ${-peor.dias} d` : peor.dias === 0 ? "vence hoy" : `vence en ${peor.dias} d`}` +
          (resto > 0 ? ` · y ${resto} más${vencidos > 1 ? ` (${vencidos} vencidos)` : ""}` : ""),
        href: `/contratos/acreditacion-vehiculos/${vehiculoId}`,
        urgencia: peor.dias,
      });
    }
  }

  for (const [clave, r] of [
    ["logistica", datos.logistica],
    ["gastos", datos.gastos],
  ] as const) {
    if (!r) continue;
    const config = MODULOS[clave === "logistica" ? "logistica" : "gastos"];
    for (const p of r.enAlerta) {
      const atrasoEnDias = p.dias ?? 0;
      salida.push({
        clave: `${clave}-${p.id}`,
        modulo: clave,
        tono: clave === "logistica" ? "critico" : "aviso",
        titulo: p.descripcion,
        detalle:
          clave === "logistica"
            ? `Requerido hace ${-atrasoEnDias} d · ${p.categoria}`
            : `Sobre presupuesto por ${pesosCompactos((p.real ?? 0) - (p.presupuestado ?? 0))} · ${p.categoria}`,
        href: `${config.ruta}/${p.id}`,
        urgencia: clave === "logistica" ? atrasoEnDias : -1,
      });
    }
  }

  // El presupuesto de Gastos: lo que se pasa, o se va a pasar, y las cotizaciones que no contestan.
  const pres = datos.gastos?.presupuesto;
  if (pres) {
    if (pres.enRiesgo && pres.disponibleProyectado !== null) {
      salida.push({
        clave: "gastos-presupuesto",
        modulo: "gastos",
        tono: "critico",
        titulo: "Presupuesto de Gastos en riesgo",
        detalle: `Con las mejores cotizaciones el gasto supera el presupuesto por ${pesosCompactos(-pres.disponibleProyectado)}`,
        href: MODULOS.gastos.ruta,
        urgencia: -1,
      });
    }
    for (const i of pres.items.filter((x) => x.sobre && x.presupuesto !== null)) {
      salida.push({
        clave: `gastos-item-${i.id}`,
        modulo: "gastos",
        tono: "aviso",
        titulo: `Ítem sobre presupuesto: ${i.nombre}`,
        detalle: `Proyecta ${pesosCompactos(i.proyectado - (i.presupuesto ?? 0))} sobre lo asignado`,
        href: MODULOS.gastos.ruta,
        urgencia: -1,
      });
    }
    if (pres.pendientes.respuestaAtrasada > 0) {
      const n = pres.pendientes.respuestaAtrasada;
      salida.push({
        clave: "gastos-cotizaciones-atrasadas",
        modulo: "gastos",
        tono: "aviso",
        titulo: `${n} ${n === 1 ? "cotización sin respuesta" : "cotizaciones sin respuesta"}`,
        detalle: "Ya pasó la fecha en que se esperaba el precio",
        href: MODULOS.gastos.ruta,
        urgencia: -1,
      });
    }
  }

  return salida
    .sort((x, y) => x.urgencia - y.urgencia || x.titulo.localeCompare(y.titulo, "es"))
    .slice(0, datos.limite ?? 8);
}

export interface SaludDelContrato {
  tono: Tono;
  titulo: string;
  frase: string;
}

/**
 * El «semáforo» de arriba: cómo va el contrato en una palabra.
 *
 * Crítico si algo ya se pasó (un plazo vencido sin completar, un documento vencido, una
 * partida atrasada); con atención si algo está por pasar o hay un gasto sobre presupuesto; en
 * curso si no hay nada de eso. Nunca dice «todo bien» sin haber medido nada.
 */
export function saludDelContrato(atenciones: Atencion[], medidos: number): SaludDelContrato {
  if (medidos === 0 && atenciones.length === 0) {
    return {
      tono: "neutro",
      titulo: "Sin datos todavía",
      frase: "Cuando se empiecen a cargar documentos, personas y partidas, acá verás cómo va el contrato.",
    };
  }

  const criticas = atenciones.filter((a) => a.tono === "critico").length;
  if (criticas > 0) {
    return {
      tono: "critico",
      titulo: "Requiere acción",
      frase: `${criticas} ${criticas === 1 ? "cosa ya se pasó" : "cosas ya se pasaron"} y ${criticas === 1 ? "necesita" : "necesitan"} atención hoy.`,
    };
  }
  if (atenciones.length > 0) {
    return {
      tono: "aviso",
      titulo: "Con atención",
      frase: `${atenciones.length} ${atenciones.length === 1 ? "punto por vencer o fuera de lo previsto" : "puntos por vencer o fuera de lo previsto"}.`,
    };
  }
  return { tono: "ok", titulo: "En curso", frase: "Sin vencimientos ni desvíos a la vista." };
}

/**
 * El ritmo que hace falta para llegar a la fecha límite de un módulo.
 *
 * No compara contra el inicio del contrato —las fechas límite del arranque caen ANTES de que el
 * contrato empiece, así que no hay una base de tiempo desde la cual medir—: dice lo que sí se
 * sabe con certeza, cuánto falta por hacer y cuántos días quedan, y de ahí el ritmo necesario.
 * «Faltan 13 en 18 días» se entiende sin saber cuándo se empezó.
 */
export interface RitmoNecesario {
  /** Lo que falta por hacer. */
  pendientes: number;
  /** Días que quedan (negativo si ya pasó la fecha). */
  dias: number;
  estado: "completo" | "vencido" | "hoy" | "en_plazo";
  /** Cuánto hay que cerrar por día, si quedan días. */
  porDia: number | null;
}

export function ritmoNecesario(avance: Avance, plazo: LecturaDePlazo | null): RitmoNecesario | null {
  if (!plazo || avance.total === 0) return null;

  const pendientes = avance.pendientes;
  if (pendientes === 0) return { pendientes, dias: plazo.dias, estado: "completo", porDia: null };
  if (plazo.dias < 0) return { pendientes, dias: plazo.dias, estado: "vencido", porDia: null };
  if (plazo.dias === 0) return { pendientes, dias: 0, estado: "hoy", porDia: null };
  return { pendientes, dias: plazo.dias, estado: "en_plazo", porDia: pendientes / plazo.dias };
}

/** «2 por día», «≈ 4 por semana»: lo que hay que cerrar para llegar, en la unidad que se entiende. */
export function textoDeRitmo(porDia: number): string {
  if (porDia >= 1) {
    const n = Math.round(porDia * 10) / 10;
    return `${String(n).replace(".", ",")} por día`;
  }
  const porSemana = Math.max(1, Math.round(porDia * 7));
  return `≈ ${porSemana} por semana`;
}

// -----------------------------------------------------------------------------
//  Del dato crudo a lo que muestra cada pieza
// -----------------------------------------------------------------------------

/** Los datos de cada módulo, o null si esa persona no lo ve o no se pudo leer. */
export interface DatosDelTablero {
  documentos: DocumentosDelTablero | null;
  acreditacion: ResumenDeAcreditacion | null;
  vehiculos?: ResumenDeVehiculos | null;
  logistica: ResumenDeArranqueDelTablero | null;
  gastos: ResumenDeArranqueDelTablero | null;
}

/** Las fechas límite de cada módulo, ya leídas contra la fecha de hoy. */
export type PlazosDelTablero = Partial<Record<ClaveDeModulo, LecturaDePlazo | null>>;

/** Quién responde por cada módulo, por nombre. Solo los módulos que tienen responsables. */
export type ResponsablesDelTablero = Partial<Record<ClaveDeModulo, string[]>>;

/**
 * Los módulos que el tablero puede medir, con su avance.
 *
 * Solo entran los que esta persona ve y se pudieron leer. Documentos generales entra únicamente
 * si SharePoint respondió: sin conexión no hay avance que decir, y un 0% inventado haría creer
 * que no se ha hecho nada.
 */
export function armarModulos(
  datos: DatosDelTablero,
  plazos: PlazosDelTablero,
  responsables: ResponsablesDelTablero = {},
): ModuloDelTablero[] {
  const salida: ModuloDelTablero[] = [];

  if (datos.documentos?.estado === "ok") {
    salida.push({
      clave: "documentos",
      nombre: NOMBRE_DE_MODULO.documentos,
      href: "/contratos/DOCUMENTOS%20GENERALES",
      avance: datos.documentos.total,
      unidad: "requisitos entregados",
      plazo: plazos.documentos ?? null,
      alertas: 0,
    });
  }
  if (datos.acreditacion) {
    salida.push({
      clave: "acreditacion",
      nombre: NOMBRE_DE_MODULO.acreditacion,
      href: "/contratos/acreditacion",
      avance: datos.acreditacion.avance,
      unidad: "documentos cargados",
      plazo: plazos.acreditacion ?? null,
      alertas: datos.acreditacion.alertas.length,
      responsables: responsables.acreditacion ?? [],
    });
  }
  if (datos.vehiculos) {
    salida.push({
      clave: "vehiculos",
      nombre: NOMBRE_DE_MODULO.vehiculos,
      href: "/contratos/acreditacion-vehiculos",
      avance: datos.vehiculos.avance,
      unidad: "documentos cargados",
      plazo: plazos.vehiculos ?? null,
      alertas: datos.vehiculos.alertas.length,
      responsables: responsables.vehiculos ?? [],
    });
  }
  if (datos.logistica) {
    salida.push({
      clave: "logistica",
      nombre: NOMBRE_DE_MODULO.logistica,
      href: MODULOS.logistica.ruta,
      avance: datos.logistica.resumen.avance,
      unidad: MODULOS.logistica.unidad,
      plazo: plazos.logistica ?? null,
      alertas: datos.logistica.resumen.alertas,
      responsables: responsables.logistica ?? [],
    });
  }
  if (datos.gastos) {
    salida.push({
      clave: "gastos",
      nombre: NOMBRE_DE_MODULO.gastos,
      href: MODULOS.gastos.ruta,
      avance: datos.gastos.resumen.avance,
      unidad: MODULOS.gastos.unidad,
      plazo: plazos.gastos ?? null,
      alertas: datos.gastos.resumen.alertas,
      responsables: responsables.gastos ?? [],
    });
  }
  return salida;
}

export type IconoDeIndicador =
  | "documentos"
  | "dotacion"
  | "acreditadas"
  | "flota"
  | "logistica"
  | "gastos"
  | "alertas";

export interface Indicador {
  clave: string;
  icono: IconoDeIndicador;
  etiqueta: string;
  valor: string;
  /** Lo que acompaña al número: contra qué se mide, y lo que llama la atención. */
  ayuda: string;
  /** 0–100, si el indicador es un avance; la barrita de abajo. */
  avance?: number;
  tono: Tono;
  href: string;
}

/** Los seis indicadores de arriba: lo más importante de cada módulo en una tarjeta. */
export function armarIndicadores(datos: DatosDelTablero, totalDeAtenciones: number): Indicador[] {
  const salida: Indicador[] = [];

  if (datos.documentos?.estado === "ok") {
    const { total, etapas } = datos.documentos;
    salida.push({
      clave: "documentos",
      icono: "documentos",
      etiqueta: "Documentos generales",
      valor: `${total.porcentaje}%`,
      ayuda:
        total.total === 0
          ? "sin requisitos"
          : `${total.subidos} de ${total.total} requisitos · ${etapas.validado} ${etapas.validado === 1 ? "validado" : "validados"}`,
      avance: total.porcentaje,
      tono: tonoDeAvance(total),
      href: "/contratos/DOCUMENTOS%20GENERALES",
    });
  }

  if (datos.acreditacion) {
    const a = datos.acreditacion;
    const d = a.dotacion;
    salida.push({
      clave: "dotacion",
      icono: "dotacion",
      etiqueta: "Dotación",
      valor: d.meta === null ? String(a.personas) : `${d.contratadas}/${d.meta}`,
      ayuda:
        d.meta === null
          ? `${a.personas === 1 ? "persona" : "personas"} en la nómina`
          : (d.faltan > 0
              ? `contratadas · faltan ${d.faltan}`
              : d.sobran > 0
                ? `contratadas · ${d.sobran} sobre la meta`
                : "contratadas · meta cumplida") +
            // Siete en la nómina y una con contrato no es «1 persona»: se dice sin agrandar el número.
            (d.sinContrato > 0 ? ` · ${d.registradas} registradas` : ""),
      avance: d.meta === null ? undefined : d.porcentaje,
      tono: d.meta === null ? "neutro" : d.porcentaje >= 100 ? "ok" : "curso",
      href: "/contratos/acreditacion",
    });
    salida.push({
      clave: "acreditadas",
      icono: "acreditadas",
      etiqueta: "Acreditadas",
      valor: String(a.etapas.acreditada),
      ayuda:
        a.personas === 0
          ? "sin personas todavía"
          : `de ${a.personas} · documentos al ${a.avance.porcentaje}%`,
      avance: a.personas === 0 ? undefined : Math.round((a.etapas.acreditada / a.personas) * 100),
      tono: a.personas > 0 && a.etapas.acreditada === a.personas ? "ok" : a.personas === 0 ? "neutro" : "curso",
      href: "/contratos/acreditacion",
    });
  }

  if (datos.vehiculos) {
    const f = datos.vehiculos;
    const d = f.dotacion;
    const acreditados = f.etapas.acreditado;
    salida.push({
      clave: "flota",
      icono: "flota",
      etiqueta: "Flota",
      valor: d.meta === null ? String(f.vehiculos) : `${d.contratadas}/${d.meta}`,
      ayuda:
        f.vehiculos === 0 && d.meta === null
          ? "sin vehículos todavía"
          : `${d.meta === null ? (f.vehiculos === 1 ? "vehículo" : "vehículos") : d.contratadas === 1 ? "contratado" : "contratados"} · ${acreditados} ${acreditados === 1 ? "acreditado" : "acreditados"}`,
      avance: d.meta === null ? undefined : d.porcentaje,
      tono: d.meta === null ? "neutro" : d.porcentaje >= 100 ? "ok" : "curso",
      href: "/contratos/acreditacion-vehiculos",
    });
  }

  if (datos.logistica) {
    const r = datos.logistica.resumen;
    salida.push({
      clave: "logistica",
      icono: "logistica",
      etiqueta: "Logística",
      valor: r.avance.total === 0 ? "—" : `${r.avance.subidos}/${r.avance.total}`,
      ayuda:
        r.avance.total === 0
          ? "sin requerimientos"
          : `${MODULOS.logistica.unidad}${r.alertas > 0 ? ` · ${r.alertas} ${r.alertas === 1 ? "atrasado" : "atrasados"}` : ""}`,
      avance: r.avance.total === 0 ? undefined : r.avance.porcentaje,
      tono: r.alertas > 0 ? "aviso" : tonoDeAvance(r.avance),
      href: MODULOS.logistica.ruta,
    });
  }

  if (datos.gastos?.presupuesto && datos.gastos.presupuesto.total !== null && datos.gastos.presupuesto.total > 0) {
    // Con el presupuesto total definido, lo que cuenta es cuánto se comprometió de él.
    const p = datos.gastos.presupuesto;
    const total = p.total as number;
    const comprometido = Math.round((p.comprometido / total) * 100);
    salida.push({
      clave: "gastos",
      icono: "gastos",
      etiqueta: "Comprometido",
      valor: pesosCompactos(p.comprometido),
      ayuda: `de ${pesosCompactos(total)} de presupuesto · ${comprometido}%`,
      avance: Math.min(comprometido, 100),
      tono: p.enRiesgo || p.comprometido > total ? "critico" : comprometido >= 85 ? "aviso" : "curso",
      href: MODULOS.gastos.ruta,
    });
  } else if (datos.gastos) {
    const r = datos.gastos.resumen;
    const ejecucion = r.presupuestado === 0 ? 0 : Math.round((r.real / r.presupuestado) * 100);
    salida.push({
      clave: "gastos",
      icono: "gastos",
      etiqueta: "Gasto real",
      valor: pesosCompactos(r.real),
      ayuda:
        r.presupuestado === 0
          ? "sin presupuesto cargado"
          : `de ${pesosCompactos(r.presupuestado)} presupuestado · ${ejecucion}%`,
      avance: r.presupuestado === 0 ? undefined : Math.min(ejecucion, 100),
      tono: r.presupuestado === 0 ? "neutro" : r.real > r.presupuestado ? "critico" : ejecucion >= 85 ? "aviso" : "curso",
      href: MODULOS.gastos.ruta,
    });
  }

  if (salida.length > 0) {
    salida.push({
      clave: "atencion",
      icono: "alertas",
      etiqueta: "Requieren atención",
      valor: String(totalDeAtenciones),
      ayuda: totalDeAtenciones === 0 ? "sin pendientes urgentes" : "vencimientos, atrasos y desvíos",
      tono: totalDeAtenciones === 0 ? "ok" : "aviso",
      href: "#atencion",
    });
  }

  return salida;
}

export interface FilaDeCronograma {
  clave: ClaveDeModulo;
  nombre: string;
  href: string;
  avance: Avance;
  plazo: LecturaDePlazo | null;
  ritmo: RitmoNecesario | null;
}

/** Una fila por módulo: su fecha límite y el ritmo que hace falta. Lo que vence antes, primero. */
export function armarCronograma(modulos: ModuloDelTablero[]): FilaDeCronograma[] {
  return modulos
    .map((m) => ({
      clave: m.clave,
      nombre: m.nombre,
      href: m.href,
      avance: m.avance,
      plazo: m.plazo,
      ritmo: ritmoNecesario(m.avance, m.plazo),
    }))
    .sort((a, b) => (a.plazo?.dias ?? Infinity) - (b.plazo?.dias ?? Infinity) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Una marca sobre la línea de tiempo: hoy, la fecha límite de un módulo, o el inicio del contrato. */
export interface MarcaDeTiempo {
  clave: string;
  tipo: "plazo" | "inicio";
  /** Más de una si varios módulos comparten fecha: se dibujan juntos, en una sola marca. */
  etiquetas: string[];
  fecha: string;
  dias: number;
  tono: Tono;
  /** 0–100, la posición sobre el eje. */
  posicion: number;
  /** Hacia dónde se extiende su etiqueta: en los bordes no puede ir centrada o se saldría. */
  alineacion: "izquierda" | "centro" | "derecha";
  /** En qué fila se dibuja: marcas muy juntas no pueden compartir renglón o se pisan. */
  carril: number;
}

/** Cuánto mide una etiqueta, en puntos del eje (0–100), y desde dónde se alinea a un borde. */
const ANCHO_DE_ETIQUETA = 30;
const BORDE_IZQUIERDO = 15;
const BORDE_DERECHO = 85;

/**
 * La línea de tiempo de HOY hasta el último hito: las fechas límite de los módulos y el inicio
 * del contrato, en su posición real.
 *
 * El eje empieza hoy. Un plazo que ya venció se pega al principio (no hay espacio «antes de
 * hoy» que mostrar) con el tono crítico. Las marcas que caen muy cerca una de otra se reparten
 * en carriles para que sus etiquetas no se encimen, que es lo normal: dos módulos suelen
 * compartir fecha.
 */
export function armarLineaDeTiempo(
  modulos: ModuloDelTablero[],
  inicioDelContrato: string | null,
  hoy: string,
): { marcas: MarcaDeTiempo[]; carriles: number; totalDias: number } | null {
  const crudas: Omit<MarcaDeTiempo, "posicion" | "carril" | "alineacion">[] = [];

  for (const m of modulos) {
    if (!m.plazo) continue;
    crudas.push({
      clave: `plazo-${m.clave}`,
      tipo: "plazo",
      etiquetas: [NOMBRE_CORTO[m.clave]],
      fecha: m.plazo.fecha,
      dias: m.plazo.dias,
      tono: m.avance.total > 0 && m.avance.porcentaje >= 100 ? "ok" : tonoDePlazoSimple(m.plazo),
    });
  }

  const faltaParaInicio = diasHasta(inicioDelContrato, hoy);
  if (inicioDelContrato && faltaParaInicio !== null) {
    crudas.push({
      clave: "inicio",
      tipo: "inicio",
      etiquetas: ["Inicio del contrato"],
      fecha: inicioDelContrato,
      dias: faltaParaInicio,
      // «curso», y no «marca»: el tono de marca es para gráficos SOBRE el azul de arriba, y su texto
      // claro no se leería sobre la tarjeta blanca.
      tono: "curso",
    });
  }

  if (crudas.length === 0) return null;

  // Los módulos que comparten fecha límite van en UNA marca: dos puntos en el mismo lugar no
  // dicen nada más que uno, y sus etiquetas se pisarían. Gana el tono más urgente.
  const GRAVEDAD: Record<Tono, number> = { critico: 4, aviso: 3, curso: 2, ok: 1, marca: 0, neutro: 0 };
  const porFecha = new Map<string, Omit<MarcaDeTiempo, "posicion" | "carril" | "alineacion">>();
  for (const c of crudas) {
    const clave = `${c.tipo}|${c.fecha}`;
    const previa = porFecha.get(clave);
    if (!previa) {
      porFecha.set(clave, { ...c });
    } else {
      previa.etiquetas.push(...c.etiquetas);
      if (GRAVEDAD[c.tono] > GRAVEDAD[previa.tono]) previa.tono = c.tono;
    }
  }
  const agrupadas = [...porFecha.values()];

  // El eje llega hasta el último hito, con un colchón para que no quede pegado al borde.
  const ultimo = Math.max(1, ...agrupadas.map((c) => c.dias));
  const totalDias = Math.ceil(ultimo * 1.06);

  const conPosicion = agrupadas
    .map((c) => ({ ...c, posicion: Math.max(0, Math.min(100, (c.dias / totalDias) * 100)) }))
    .sort((x, y) => x.posicion - y.posicion);

  // Asignación de carriles: cada marca va en el primer renglón donde su etiqueta no pise a la
  // anterior. Se mide la EXTENSIÓN de cada etiqueta (no solo su punto), porque una pegada al
  // borde derecho crece hacia la izquierda y una del medio hacia los dos lados.
  const ultimoFinPorCarril: number[] = [];
  const marcas: MarcaDeTiempo[] = conPosicion.map((m) => {
    const alineacion = m.posicion < BORDE_IZQUIERDO ? "izquierda" : m.posicion > BORDE_DERECHO ? "derecha" : "centro";
    const inicio =
      alineacion === "izquierda" ? m.posicion : alineacion === "derecha" ? m.posicion - ANCHO_DE_ETIQUETA : m.posicion - ANCHO_DE_ETIQUETA / 2;
    const fin = inicio + ANCHO_DE_ETIQUETA;

    let carril = ultimoFinPorCarril.findIndex((x) => inicio >= x);
    if (carril === -1) carril = ultimoFinPorCarril.length;
    ultimoFinPorCarril[carril] = fin + 1;
    return { ...m, alineacion, carril };
  });

  return { marcas, carriles: ultimoFinPorCarril.length, totalDias };
}

function tonoDePlazoSimple(plazo: LecturaDePlazo): Tono {
  return plazo.estado === "vencido" ? "critico" : plazo.estado === "al_dia" ? "curso" : "aviso";
}

/** «Inicia en 27 días», «Día 12 del contrato»: dónde está el contrato respecto de su inicio. */
export function textoDeInicio(inicio: string | null, hoy: string): string | null {
  const faltan = diasHasta(inicio, hoy);
  if (faltan === null) return null;
  if (faltan > 0) return `Inicia en ${faltan} ${faltan === 1 ? "día" : "días"}`;
  if (faltan === 0) return "Inicia hoy";
  return `Día ${-faltan + 1} del contrato`;
}

/** El tono de una pastilla de plazo: vencido es crítico, por vencer es aviso, lo demás va bien. */
export function tonoDePlazo(plazo: LecturaDePlazo | null): Tono {
  if (!plazo) return "neutro";
  return plazo.estado === "vencido" ? "critico" : plazo.estado === "al_dia" ? "curso" : "aviso";
}

/**
 * «hace 5 min», «hace 3 h», «ayer», «hace 4 d»: cuánto pasó desde algo, para la actividad.
 * Pasada una semana, la fecha.
 */
export function haceCuanto(iso: string, ahora: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const minutos = Math.max(0, Math.round((ahora - t) / 60_000));
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} d`;
  const f = new Date(t);
  return `${String(f.getDate()).padStart(2, "0")}-${String(f.getMonth() + 1).padStart(2, "0")}-${f.getFullYear()}`;
}
