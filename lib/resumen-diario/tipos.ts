// Sin "server-only": los componentes que pintan el dashboard usan estos tipos
// igual que la capa de datos del servidor.

import type { ConteosCorreo, Dirigido } from "@/lib/graph-correo";

export type Urgencia = "alta" | "media" | "baja";

export interface CorreoDestacado {
  asunto: string;
  de: string;
  /** Qué espera esa persona de vos, en una línea. Es el valor real del resumen. */
  queEsperan: string;
  urgencia: Urgencia;
  /** Dirigido a vos o en copia: cambia por completo cuánto exige. */
  dirigido: Dirigido;
  /** "hoy", "ayer", "el viernes"... Con 72 horas de ventana hace falta ubicarlo. */
  cuando: string;
}

/**
 * Un correo donde la persona solo está en copia pero que igual conviene saber.
 *
 * Separado de correosDestacados a propósito: mezclarlos hacía que una lista de
 * "cosas que esperan algo de vos" se llenara de cosas que no esperan nada.
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

export interface ReunionResumida {
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
}

export interface CompromisoAbierto {
  compromiso: string;
  aQuien: string;
  /** Desde cuándo está abierto, si el correo lo deja ver. */
  desde: string | null;
}

/** Lo que devuelve el modelo. Los conteos NO están acá: los pone el servidor. */
export interface ResumenModelo {
  /** Tres o cuatro líneas de contexto. Lo primero que se lee. */
  panorama: string;
  reuniones: ReunionResumida[];
  correosDestacados: CorreoDestacado[];
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
export interface ResumenDiario extends ResumenModelo {
  conteos: ConteosCorreo;
  /** Cuántas reuniones había en la ventana consultada, contadas por el servidor. */
  reunionesTotales: number;
}

export interface ResumenGuardado {
  fecha: string;
  resumen: ResumenDiario;
  generadoEn: string;
  enviadoEn: string | null;
}

/** Lo que la página necesita saber para decidir qué pintar. */
export type EstadoResumen =
  | { estado: "ok"; datos: ResumenGuardado }
  /** Falta consentimiento de Mail.Read, o la persona no volvió a loguearse. */
  | { estado: "sin_permiso" }
  | { estado: "error"; motivo: string };
