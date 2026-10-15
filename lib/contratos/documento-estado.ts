// El estado de revisión de un archivo de Documentos generales: Borrador → En revisión →
// Validado.
//
// Sin "server-only" y separado de quien lee la base, por lo mismo que contratos-estado.ts:
// el selector es un componente cliente y necesita las etiquetas.
//
// No es el estado del REQUISITO (pendiente / subido / no aplica, en contratos-estado.ts):
// es el de cada ARCHIVO. Un requisito puede tener tres archivos en tres etapas distintas.

import type { EstadoRequisito } from "./contratos-estado";

export type EstadoDeArchivo = "borrador" | "en_revision" | "validado";

export const ESTADOS_DE_ARCHIVO: EstadoDeArchivo[] = ["borrador", "en_revision", "validado"];

export const ETIQUETAS_DE_ARCHIVO: Record<EstadoDeArchivo, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  validado: "Validado",
};

/** Lo que es todo archivo recién subido, y por eso lo que significa no tener fila. */
export const ESTADO_INICIAL_DE_ARCHIVO: EstadoDeArchivo = "borrador";

export function esEstadoDeArchivo(valor: unknown): valor is EstadoDeArchivo {
  return typeof valor === "string" && (ESTADOS_DE_ARCHIVO as string[]).includes(valor);
}

export function contarPorEstado(estados: EstadoDeArchivo[]): Record<EstadoDeArchivo, number> {
  const cuenta: Record<EstadoDeArchivo, number> = { borrador: 0, en_revision: 0, validado: 0 };
  for (const e of estados) cuenta[e]++;
  return cuenta;
}

// -----------------------------------------------------------------------------
//  De los archivos al requisito
//
//  Una fila de la lista es un REQUISITO, que puede tener varios archivos cada uno en una
//  etapa. Para decir en qué etapa va el requisito se usa la regla del eslabón más débil:
//  está tan avanzado como su archivo MENOS avanzado. Un requisito con el contrato
//  validado y el anexo en borrador no está validado, y mostrarlo verde sería mentir.
// -----------------------------------------------------------------------------

/** Dónde va un requisito. «Pendiente»: todavía no hay nada entregado. */
export type EtapaDeRequisito = "pendiente" | EstadoDeArchivo;

/** Cuántos requisitos hay en cada etapa. «No aplica» queda fuera, igual que en el avance. */
export type EtapasDeRequisitos = Record<EtapaDeRequisito, number>;

export const ETAPAS_DE_REQUISITO: EtapaDeRequisito[] = ["validado", "en_revision", "borrador", "pendiente"];

export const ETIQUETAS_DE_ETAPA: Record<EtapaDeRequisito, string> = {
  ...ETIQUETAS_DE_ARCHIVO,
  pendiente: "Pendiente",
};

export function etapasVacias(): EtapasDeRequisitos {
  return { pendiente: 0, borrador: 0, en_revision: 0, validado: 0 };
}

export function sumarEtapas(a: EtapasDeRequisitos, b: EtapasDeRequisitos): EtapasDeRequisitos {
  return {
    pendiente: a.pendiente + b.pendiente,
    borrador: a.borrador + b.borrador,
    en_revision: a.en_revision + b.en_revision,
    validado: a.validado + b.validado,
  };
}

/**
 * La etapa de UN requisito, o `null` si no aplica (sale de la cuenta).
 *
 * Parte del estado que ya se muestra (ver estadoEfectivo) para que las etapas y el avance
 * cuenten lo mismo por construcción: «subidos» es exactamente lo que no es pendiente.
 *  · pendiente → pendiente, tenga lo que tenga;
 *  · subido con archivos → el eslabón más débil de sus archivos;
 *  · subido SIN archivos a la vista (se marcó a mano, o se borraron) → borrador: está
 *    entregado, y de su revisión no se sabe nada, que es lo que dice «borrador».
 */
export function etapaDeRequisito(
  estado: EstadoRequisito,
  archivos: Record<EstadoDeArchivo, number>,
): EtapaDeRequisito | null {
  if (estado === "no_aplica") return null;
  if (estado === "pendiente") return "pendiente";
  if (archivos.borrador > 0) return "borrador";
  if (archivos.en_revision > 0) return "en_revision";
  if (archivos.validado > 0) return "validado";
  return "borrador";
}

/** Los archivos por etapa, dados sus ids y lo guardado. Sin fila, borrador. */
export function contarArchivos(
  ids: string[],
  guardados: Map<string, { estado: EstadoDeArchivo }>,
): Record<EstadoDeArchivo, number> {
  return contarPorEstado(ids.map((id) => guardados.get(id)?.estado ?? ESTADO_INICIAL_DE_ARCHIVO));
}

/** Lo que una fila de la lista sabe de la revisión de lo que hay dentro de su carpeta. */
export interface RevisionDeCarpeta {
  /** Los requisitos de la carpeta por etapa (uno solo, si la fila es un requisito). */
  etapas: EtapasDeRequisitos;
  /** Los archivos por etapa, sumados de todos los requisitos. */
  archivos: Record<EstadoDeArchivo, number>;
}

/** La etapa de una fila que ES un requisito: la única que tiene algo. Null si no aplica. */
export function etapaUnica(etapas: EtapasDeRequisitos): EtapaDeRequisito | null {
  return ETAPAS_DE_REQUISITO.find((e) => etapas[e] > 0) ?? null;
}

export function totalDeEtapas(etapas: EtapasDeRequisitos): number {
  return etapas.pendiente + etapas.borrador + etapas.en_revision + etapas.validado;
}
