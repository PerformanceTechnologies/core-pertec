// Sin "server-only": los componentes que pintan el dashboard usan estos tipos
// igual que la capa de datos del servidor.

import type { ConteosCorreo, Dirigido } from "@/lib/graph-correo";

/**
 * Versión del formato del resumen guardado.
 *
 * SUBIR ESTE NÚMERO cada vez que cambie la forma de ResumenDiario o algo del
 * prompt que altere el contenido. Un resumen guardado con otra versión se trata
 * como si no existiera y se regenera.
 *
 * Existe porque sin esto cada cambio de forma dejaba filas viejas en la caché que
 * la página nueva no sabía leer, y había que ir a borrarlas a mano en la base. Y
 * peor: si alguien cargaba la página durante el despliegue, quedaba con un
 * resumen del código anterior cacheado por el resto del día, sin manera de
 * refrescarlo. Pasó de verdad, dos veces.
 *
 * 1 — primera versión
 * 2 — conteos, temas, enCopia, ventana de 72 h
 * 3 — enlaces a Outlook y registro sin voseo
 * 4 — datos reales por fila para los popovers de detalle
 */
export const VERSION_RESUMEN = 4;

export type Urgencia = "alta" | "media" | "baja";

/**
 * Lo que el modelo devuelve por cada correo destacado.
 *
 * Trae `indice`, no la URL. Pedirle el enlace al modelo sería pedirle que copie
 * una cadena larga sin equivocarse, y un enlace mal copiado lleva al correo
 * equivocado o a ninguna parte. El índice es un número chico que además el modelo
 * ve impreso al lado de cada mensaje; el servidor lo resuelve contra la lista
 * real.
 */
export interface CorreoDestacadoModelo {
  asunto: string;
  de: string;
  /** Qué espera esa persona, en una línea. Es el valor real del resumen. */
  queEsperan: string;
  urgencia: Urgencia;
  /** Dirigido a ti o en copia: cambia por completo cuánto exige. */
  dirigido: Dirigido;
  /** "hoy", "ayer", "el viernes"... Con 72 horas de ventana hace falta ubicarlo. */
  cuando: string;
  /** El [N] con el que el correo aparece numerado en el prompt. */
  indice: number;
}

/**
 * El correo destacado, ya con los datos reales del mensaje pegados.
 *
 * Todo lo de acá abajo sale del mensaje que Graph devolvió, ubicado por el índice
 * que dio el modelo. No se le piden al modelo por la misma razón que el enlace:
 * son datos exactos, y un extracto "recordado" por un modelo es un extracto
 * inventado.
 *
 * Alimentan el popover de detalle de cada fila. Quedan en null cuando el índice no
 * se pudo resolver, y en ese caso la fila simplemente no muestra popover.
 */
export interface CorreoDestacado extends Omit<CorreoDestacadoModelo, "indice"> {
  enlace: string | null;
  /** La dirección, no el nombre para mostrar: es lo que permite reconocer a alguien. */
  correoDe: string | null;
  /** Las primeras líneas del cuerpo, tal como las entregó Graph. */
  extracto: string | null;
  leido: boolean | null;
  marcado: boolean | null;
  tieneAdjuntos: boolean | null;
  /** Cuántas personas lo recibieron en total. */
  destinatarios: number | null;
}

/**
 * Un correo donde la persona solo está en copia pero que igual conviene saber.
 *
 * Separado de correosDestacados a propósito: mezclarlos hacía que una lista de
 * "cosas que requieren respuesta" se llenara de cosas que no requieren nada.
 */
export interface CorreoInformativo {
  asunto: string;
  de: string;
  porQueImporta: string;
}

/**
 * Un tema con varios correos alrededor.
 *
 * Es lo que convierte una lista de mensajes en información: seis correos sobre la
 * misma licitación son UN asunto que avanzó, no seis cosas por leer.
 */
export interface TemaDelPeriodo {
  tema: string;
  /** Cuántos correos lo tocan. */
  correos: number;
  /** En qué quedó, no de qué se trata. */
  estado: string;
}

export interface ReunionResumidaModelo {
  asunto: string;
  /** ISO local de Chile, tal como lo devuelve Graph con el header Prefer. */
  inicio: string;
  /** El día se decide en el servidor con la fecha de Chile, no en el modelo. */
  dia: "hoy" | "manana" | "despues";
  con: string;
  /** Null cuando no hay nada que preparar; el dashboard no muestra la fila. */
  preparacion: string | null;
  /** false = la agendaron el mismo día: suele ser lo que descoloca la jornada. */
  agendadaAntes: boolean;
  /** El [N] con el que la reunión aparece numerada en el prompt. */
  indice: number;
}

/** Ídem: los campos de abajo salen del evento real, no del modelo. */
export interface ReunionResumida extends Omit<ReunionResumidaModelo, "indice"> {
  enlace: string | null;
  /** Hora de término, para poder mostrar la duración. */
  fin: string | null;
  lugar: string | null;
  esTeams: boolean;
  organizador: string | null;
  asistentes: string[];
}

export interface CompromisoAbierto {
  compromiso: string;
  aQuien: string;
  /** Desde cuándo está abierto, si el correo lo deja ver. */
  desde: string | null;
}

/**
 * Lo que devuelve el modelo.
 *
 * Ni los conteos ni los enlaces están acá: los dos los pone el servidor, porque
 * los dos son datos exactos y eso es justo lo que un modelo hace mal.
 */
export interface ResumenModelo {
  /** Tres o cuatro líneas de contexto. Lo primero que se lee. */
  panorama: string;
  reuniones: ReunionResumidaModelo[];
  correosDestacados: CorreoDestacadoModelo[];
  enCopia: CorreoInformativo[];
  temas: TemaDelPeriodo[];
  compromisos: CompromisoAbierto[];
  /** Tres, en orden. */
  prioridades: string[];
}

/**
 * El resumen del día, tal como se guarda en jsonb.
 *
 * Es un objeto tipado y no HTML a propósito: el HTML lo arma el core con sus
 * propios componentes, así el dashboard se ve como el resto del sistema y el
 * mismo resumen sirve para la página y para el correo sin generarlo dos veces.
 *
 * `conteos` va aparte de lo que devuelve el modelo porque son cuentas exactas:
 * pedírselas al modelo es pedirle que cuente 150 correos de memoria, y ahí es
 * donde inventa.
 */
export interface ResumenDiario extends Omit<ResumenModelo, "reuniones" | "correosDestacados"> {
  /** Con qué VERSION_RESUMEN se generó. Ver el comentario de esa constante. */
  version: number;
  reuniones: ReunionResumida[];
  correosDestacados: CorreoDestacado[];
  conteos: ConteosCorreo;
  /** Cuántas reuniones había en la ventana consultada, contadas por el servidor. */
  reunionesTotales: number;
}

export interface ResumenGuardado {
  fecha: string;
  resumen: ResumenDiario;
  generadoEn: string;
  enviadoEn: string | null;
  /**
   * false si se generó con otra versión del formato.
   *
   * La fila se devuelve igual —el cron necesita `enviadoEn` para no mandar dos
   * veces el mismo correo, sin importar la versión— pero la página la descarta y
   * regenera.
   */
  vigente: boolean;
}

/** Lo que la página necesita saber para decidir qué pintar. */
export type EstadoResumen =
  | { estado: "ok"; datos: ResumenGuardado }
  /** Falta consentimiento de Mail.Read, o la persona no volvió a loguearse. */
  | { estado: "sin_permiso" }
  | { estado: "error"; motivo: string };
