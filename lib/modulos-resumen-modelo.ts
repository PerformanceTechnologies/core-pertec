// El vocabulario del resumen de un módulo: lo que cada submódulo cuenta de sí mismo.
//
// Sin "server-only": lo dibuja VistaDeModulo (servidor) y lo usan las pruebas. De dónde salen los
// números está en lib/modulos-resumen.ts.

import type { ItemDelMenu } from "./menu-modelo";

/**
 * Cómo se lee un número.
 *
 *   - neutro: un dato, sin juicio.
 *   - ok:     está como debe (todo sobre el mínimo, nada vencido).
 *   - aviso:  conviene mirarlo pronto, pero no es urgente.
 *   - alerta: pide atención ahora.
 *
 * El tono SIEMPRE va acompañado de un ícono y de texto en pantalla, no solo de color (un daltónico
 * no distingue el rojo del verde): ver Metrica en VistaDeModulo.
 */
export type Tono = "neutro" | "ok" | "aviso" | "alerta";

export interface Metrica {
  etiqueta: string;
  /** Ya formateado: «$12.400.000», «37», «82 %». */
  valor: string;
  /** Una línea chica debajo: de cuánto es el total, desde cuándo, qué significa. */
  detalle?: string;
  tono?: Tono;
  /** A dónde lleva tocar la cifra. Sin esto, la cifra no es un enlace. */
  href?: string;
}

/** Algo que pide atención, para la franja «Requiere atención» del módulo. */
export interface Aviso {
  texto: string;
  tono: "aviso" | "alerta";
  href: string;
}

export interface ResumenDeSubmodulo {
  /** De dos a cuatro, las que mejor cuentan cómo va. */
  metricas: Metrica[];
  avisos: Aviso[];
  /** Una línea de cierre: la fecha de lo último que se leyó, un monto del mes… */
  pie?: string;
}

/**
 * Lo que un cargador devuelve cuando no puede decir nada del submódulo (sin datos, un servicio que
 * no contesta, una pantalla sin cifras que mostrar): la cartilla se dibuja igual, sin números.
 */
export type ResumenOpcional = ResumenDeSubmodulo | null;

const TONOS_QUE_AVISAN: Tono[] = ["aviso", "alerta"];

/** Si alguna de las cifras pide mirar (aviso o alerta). Para ordenar y para marcar la cartilla. */
export function pideAtencion(resumen: ResumenOpcional): boolean {
  return Boolean(resumen && (resumen.avisos.length > 0 || resumen.metricas.some((m) => TONOS_QUE_AVISAN.includes(m.tono ?? "neutro"))));
}

/** «hace 3 h», «hace 2 días», «ayer»: para el pie de una cartilla. */
export function haceCuanto(fechaIso: string, ahora: Date = new Date()): string {
  const t = new Date(fechaIso).getTime();
  if (!Number.isFinite(t)) return "—";
  const minutos = Math.max(0, Math.round((ahora.getTime() - t) / 60_000));
  if (minutos < 2) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
}

/** «1 producto» / «3 productos». */
export function cuenta(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString("es-CL")} ${n === 1 ? singular : plural}`;
}

/**
 * La ruta con la que se reconoce a un submódulo en el registro de cargadores
 * (lib/modulos-resumen.ts); null si es externo o un «próximamente»: no tienen cifras.
 */
export function claveDeResumen(item: ItemDelMenu): string | null {
  if (item.tipo === "enlace") return item.href;
  if (item.tipo === "app" && item.app.tipo === "interna") return item.app.url;
  return null;
}
