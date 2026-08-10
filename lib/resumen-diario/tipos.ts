// Sin "server-only": los componentes cliente que pintan el dashboard usan estos
// tipos igual que la capa de datos del servidor.

export type Urgencia = "alta" | "media" | "baja";

export interface CorreoDestacado {
  asunto: string;
  de: string;
  /** Qué espera esa persona de vos, en una línea. Es el valor real del resumen. */
  queEsperan: string;
  urgencia: Urgencia;
}

export interface ReunionResumida {
  asunto: string;
  /** ISO local de Chile, tal como lo devuelve Graph con el header Prefer. */
  inicio: string;
  /** "hoy" o "manana": se decide en el servidor con la fecha de Chile, no en el modelo. */
  dia: "hoy" | "manana";
  con: string;
  /** Null cuando no hay nada que preparar; el dashboard no muestra la fila. */
  preparacion: string | null;
}

export interface CompromisoAbierto {
  compromiso: string;
  aQuien: string;
}

/**
 * El resumen del día, tal como lo devuelve el modelo y como se guarda en jsonb.
 *
 * Es un objeto tipado y no HTML a propósito: el HTML lo arma el core con sus
 * propios componentes, así el dashboard se ve como el resto del sistema y el
 * mismo resumen sirve para la página y para el correo sin generarlo dos veces.
 */
export interface ResumenDiario {
  /** Dos o tres líneas de contexto. Lo primero que se lee. */
  panorama: string;
  reuniones: ReunionResumida[];
  correosDestacados: CorreoDestacado[];
  compromisos: CompromisoAbierto[];
  /** Tres, en orden. Las sugiere el modelo a partir de todo lo anterior. */
  prioridades: string[];
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
