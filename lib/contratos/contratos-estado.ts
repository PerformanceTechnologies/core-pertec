// El vocabulario del seguimiento: los estados, cómo se llaman en pantalla y cómo
// se calcula el avance.
//
// Sin "server-only" a propósito, y separado de quien lee la base: SelectorDeEstado
// es un componente cliente y necesita las etiquetas. Cuando todo vivía en un solo
// archivo, importarlas arrastraba el cliente de Supabase al navegador — el build
// falló por eso, que es exactamente para lo que está "server-only".

export type EstadoRequisito = "pendiente" | "subido" | "no_aplica";

export const ETIQUETAS: Record<EstadoRequisito, string> = {
  pendiente: "Pendiente",
  subido: "Subido",
  no_aplica: "No aplica",
};

export interface Avance {
  /** Requisitos que cuentan: el total menos los marcados como "no aplica". */
  total: number;
  subidos: number;
  pendientes: number;
  noAplican: number;
  /** 0–100. Sin requisitos que contar, es 0: no hay nada hecho ni nada que hacer. */
  porcentaje: number;
}

/**
 * El avance de un conjunto de requisitos.
 *
 * "No aplica" sale del denominador, que es lo único que hace que el 100% sea
 * alcanzable: una carpeta con seis requisitos de los que dos no corresponden a
 * este contrato se completa con cuatro. Dejándolos dentro, el máximo real sería
 * 67% y la barra nunca llegaría al final — que es la forma más rápida de que la
 * gente deje de mirarla.
 */
export function calcularAvance(estados: (EstadoRequisito | undefined)[]): Avance {
  // Una carpeta sin estado guardado está pendiente: el requisito existe igual,
  // solo que nadie lo ha tocado todavía.
  const normalizados = estados.map((e) => e ?? "pendiente");

  const noAplican = normalizados.filter((e) => e === "no_aplica").length;
  const subidos = normalizados.filter((e) => e === "subido").length;
  const total = normalizados.length - noAplican;

  return {
    total,
    subidos,
    pendientes: total - subidos,
    noAplican,
    porcentaje: total === 0 ? 0 : Math.round((subidos / total) * 100),
  };
}

/**
 * El estado de un requisito tal como se MUESTRA, mirando lo que hay en la carpeta.
 *
 * El estado guardado solo cambia cuando alguien sube por el core o lo cambia a mano:
 * no mira SharePoint. Un archivo que ya estaba en la carpeta, o que se subió directo
 * desde SharePoint, dejaba el requisito en «Pendiente» con el documento a la vista.
 * SharePoint es la fuente de verdad de los archivos, así que si la carpeta tiene
 * documentos y el estado sigue en «pendiente», el requisito está subido.
 *
 * Solo sube de «pendiente»: «No aplica» es una decisión deliberada que un archivo suelto
 * no revierte (mismo criterio que registrarSubidaAction), y «subido» ya lo es. Y no se
 * escribe nada: es lo que se ve, calculado al leer, así que si se elimina el archivo
 * el requisito vuelve a «Pendiente» solo.
 *
 * Es consecuencia de tener ahora Borrador / En revisión / Validado por archivo: «hay un
 * documento pero no está bien» ya se dice ahí, y no hace falta dejar el requisito
 * pendiente para expresarlo.
 */
export function estadoEfectivo(
  guardado: EstadoRequisito | undefined,
  tieneDocumentos: boolean,
): EstadoRequisito {
  const estado = guardado ?? "pendiente";
  return estado === "pendiente" && tieneDocumentos ? "subido" : estado;
}

/**
 * El estado de un requisito cuyo cumplimiento lo mide OTRO módulo, dado su avance.
 *
 * Es el caso de la carpeta de Acreditación (la 1.3): se entrega cuando TODOS los documentos
 * que se exigen a las personas están cargados y vigentes, y mientras falte uno no está. Sin
 * nada que medir —ninguna persona en la nómina, o ninguna con documentos exigidos— no hay
 * entrega que dar por hecha: queda pendiente, igual que una carpeta vacía.
 */
export function estadoDeRequisitoDesdeAvance(avance: Avance): EstadoRequisito {
  return avance.total > 0 && avance.subidos === avance.total ? "subido" : "pendiente";
}
