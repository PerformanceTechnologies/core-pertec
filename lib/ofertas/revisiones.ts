import type { Inconsistencia } from "./tipos";

/**
 * Marcar como revisado lo que hay por revisar.
 *
 * Los controles del módulo señalan lo que hay que mirar antes de emitir: una suma que
 * no da, un valor unitario en 0, una validez que se contradice con las condiciones.
 * Varios de esos avisos se revisan y quedan así a propósito —el borrador dice "$ 0.-"
 * porque el ítem de verdad va en cero— y sin poder marcarlos, la lista pedía revisar
 * nueve cosas para siempre, que es la forma más rápida de que nadie la mire.
 *
 * ── Por qué la marca es una CLAVE y no una posición ────────────────────────
 *
 * Las inconsistencias no se guardan y se leen: se RECALCULAN en cada guardado y, en
 * el editor, en cada tecla. Guardar "revisé la número 3" no significaría nada al día
 * siguiente. La clave incluye el detalle, que es donde están los números, así que:
 *
 *  - Si el dato sigue igual, la clave calza y el aviso queda revisado.
 *  - Si el dato cambió —la suma ahora difiere en otro monto— el detalle cambia, la
 *    clave deja de calzar y el aviso vuelve a aparecer SIN revisar. Es lo correcto:
 *    lo que se revisó fue el problema anterior, no este.
 *  - Si el problema se arregló, el aviso no existe y la clave se limpia al guardar.
 *
 * Sin "server-only": la usa la pantalla para pintar la lista y el servidor para
 * contar cuántas quedan pendientes en el listado.
 */

/** Lo que identifica a un aviso. El separador no aparece en ningún tipo. */
export function claveDeRevision(inconsistencia: Inconsistencia): string {
  return `${inconsistencia.tipo}|${inconsistencia.detalle.trim()}`;
}

export interface InconsistenciaConRevision extends Inconsistencia {
  clave: string;
  revisada: boolean;
}

/**
 * Los avisos con su estado, los pendientes primero.
 *
 * Los revisados NO se esconden: quedan al final, apagados. Esconderlos haría dudar de
 * si el aviso se revisó o si el sistema dejó de verlo, y son dos cosas muy distintas
 * cuando lo que está en juego es un precio.
 */
export function conRevision(
  inconsistencias: Inconsistencia[],
  revisadas: string[],
): InconsistenciaConRevision[] {
  const marcadas = new Set(revisadas);
  return inconsistencias
    .map((inconsistencia) => {
      const clave = claveDeRevision(inconsistencia);
      return { ...inconsistencia, clave, revisada: marcadas.has(clave) };
    })
    .sort((a, b) => Number(a.revisada) - Number(b.revisada));
}

/** Cuántas quedan sin revisar: es el número que importa en el listado. */
export function cuantasPendientes(inconsistencias: Inconsistencia[], revisadas: string[]): number {
  const marcadas = new Set(revisadas);
  return inconsistencias.filter((i) => !marcadas.has(claveDeRevision(i))).length;
}

/** La marca puesta o sacada, sin repetir y sin perder las otras. */
export function conLaMarca(revisadas: string[], clave: string, revisada: boolean): string[] {
  const sinEsta = revisadas.filter((c) => c !== clave);
  return revisada ? [...sinEsta, clave] : sinEsta;
}

/**
 * Las marcas que todavía corresponden a un aviso existente.
 *
 * Se llama al guardar: sin esto, la lista de claves crece con cada corrección y se
 * queda para siempre con avisos que ya no existen. Y hay una consecuencia que importa:
 * si un problema se arregla y después vuelve a aparecer igual, vuelve SIN revisar.
 */
export function revisadasVigentes(revisadas: string[], inconsistencias: Inconsistencia[]): string[] {
  const vigentes = new Set(inconsistencias.map(claveDeRevision));
  return revisadas.filter((clave) => vigentes.has(clave));
}
