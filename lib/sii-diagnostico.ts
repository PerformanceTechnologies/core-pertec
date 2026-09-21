// Traduce un fallo del scraper del SII a algo que se pueda leer en pantalla.
//
// Sin "server-only", sin Playwright y sin Supabase: es lógica pura, así que
// scripts/probar-sii-diagnostico.mts la importa directo (mismo criterio que
// parsearCsvRcv en lib/sii-rcv.ts).
//
// ── Por qué existe ──────────────────────────────────────────────────────────
//
// Cuando el SII no respondía, la pantalla mostraba el error de Playwright tal
// cual venía:
//
//   page.waitForSelector: Timeout 30000ms exceeded.
//   Call log:
//     - waiting for locator('select[name=\'rut\']') to be visible
//
// Eso es exacto y no sirve para nada del otro lado: no dice si hay que hacer
// algo, si se arregla solo, ni si las credenciales están mal. En los hechos es
// un fallo intermitente que la corrida siguiente resuelve —4 veces en ~145
// corridas durante 21 días, y la de después siempre funcionó—, pero en pantalla
// se lee como si el sistema estuviera roto.
//
// Lo que se traduce es SOLO el mensaje de pantalla. El texto crudo se sigue
// guardando íntegro en finanzas_sii_ejecuciones.mensaje_error y viaja aparte
// hasta la UI, que lo muestra plegado: nadie pierde el detalle, deja de ser lo
// primero que se lee.

/** Qué clase de fallo fue, mirando el mensaje que dejó Playwright o el SII. */
export type ClaseFalloSii =
  | "credenciales_faltantes"
  | "login_rechazado"
  | "sii_no_respondio"
  | "navegador_muerto"
  | "sii_cambio"
  | "desconocido";

export interface FalloSii {
  clase: ClaseFalloSii;
  /**
   * Qué decir en pantalla. En español, sin jerga de Playwright, y diciendo si
   * hay que hacer algo o no: esa es la pregunta que tiene quien lo lee.
   */
  mensajeUsuario: string;
  /** El texto original, íntegro. Nunca se recorta ni se reescribe. */
  mensajeTecnico: string;
  /**
   * Si esto se arregla solo en la próxima corrida automática.
   *
   * Lo usa la pantalla para decidir si el aviso es "esperá" o "andá a mirar".
   * Un fallo transitorio anunciado como si fuera grave hace que después nadie
   * crea el que sí lo es.
   */
  seResuelveSolo: boolean;
}

/**
 * Los marcadores con los que se reconoce cada clase, en el orden en que se
 * prueban. El orden IMPORTA y por eso es una lista y no un objeto:
 *
 * - Las credenciales faltantes y el login rechazado van primero porque son las
 *   únicas que piden una acción concreta de una persona. Si quedaran después,
 *   un "Timeout" cualquiera en el login las taparía.
 * - El navegador muerto va antes que el timeout genérico porque su mensaje
 *   ("Target page, context or browser has been closed") aparece también dentro
 *   de un goto que venció, y la causa real es la instancia sin recursos, no el
 *   SII.
 * - El timeout del selector va al final de los reconocidos: es el caso más
 *   frecuente y el más inespecífico.
 */
const REGLAS: { clase: ClaseFalloSii; marcadores: string[] }[] = [
  {
    clase: "credenciales_faltantes",
    marcadores: ["faltan las credenciales del sii"],
  },
  {
    // El texto exacto que lanza login() en lib/sii-rcv.ts cuando el SII
    // contesta "clave incorrecta" / "rut incorrecto" / "acceso no autorizado".
    clase: "login_rechazado",
    marcadores: ["login sii fallido"],
  },
  {
    clase: "navegador_muerto",
    marcadores: [
      "target page, context or browser has been closed",
      "err_insufficient_resources",
      "browser has been closed",
      "cannot find module",
    ],
  },
  {
    clase: "sii_no_respondio",
    marcadores: [
      "timeout",
      "err_connection",
      "err_timed_out",
      "net::err",
      "navigation",
    ],
  },
];

const MENSAJES: Record<ClaseFalloSii, { texto: string; seResuelveSolo: boolean }> = {
  credenciales_faltantes: {
    texto:
      "Faltan las credenciales del SII en el servidor. Esto no se arregla reintentando: " +
      "hay que cargar las variables de entorno.",
    seResuelveSolo: false,
  },
  login_rechazado: {
    texto:
      "El SII rechazó el RUT o la clave tributaria. Revisá las credenciales: puede que la " +
      "clave haya cambiado o esté vencida.",
    seResuelveSolo: false,
  },
  sii_no_respondio: {
    texto:
      "El SII no respondió a tiempo. Es intermitente y no es un problema de credenciales: " +
      "suele resolverse solo en la próxima corrida automática.",
    seResuelveSolo: true,
  },
  navegador_muerto: {
    texto:
      "El navegador interno se quedó sin recursos antes de terminar. Suele pasar al pedir " +
      "varios meses seguidos; probá de nuevo en unos minutos o de a un mes.",
    seResuelveSolo: true,
  },
  sii_cambio: {
    texto:
      "La página del SII no tiene los campos que el lector espera. Si se repite, el SII " +
      "cambió su pantalla y hay que ajustar el lector.",
    seResuelveSolo: false,
  },
  desconocido: {
    texto:
      "No se pudo leer el SII. El detalle técnico está más abajo; si se repite, conviene " +
      "mirarlo.",
    seResuelveSolo: false,
  },
};

/**
 * De qué se trata un fallo del scraper, a partir de su mensaje.
 *
 * Es deliberadamente conservadora: lo que no reconoce cae en "desconocido" y se
 * anuncia como algo que conviene mirar, no como un hipo pasajero. Prometer que
 * algo se arregla solo cuando no se sabe es peor que no decir nada.
 */
export function clasificarFalloSii(mensajeCrudo: string): FalloSii {
  const mensajeTecnico = (mensajeCrudo ?? "").trim() || "Error desconocido";
  const aguja = mensajeTecnico.toLowerCase();

  const regla = REGLAS.find((r) => r.marcadores.some((m) => aguja.includes(m)));
  const clase = regla?.clase ?? "desconocido";
  const { texto, seResuelveSolo } = MENSAJES[clase];

  return { clase, mensajeUsuario: texto, mensajeTecnico, seResuelveSolo };
}

/**
 * El mensaje de pantalla, con lo que sí se alcanzó a guardar.
 *
 * El "se alcanzó a guardar" va DESPUÉS del motivo y no antes: lo primero que
 * necesita saber quien mira es si tiene que hacer algo. Que dos de cuatro meses
 * entraron es la letra chica, no el titular.
 */
export function mensajeDeFallo(fallo: FalloSii, guardado?: string): string {
  return guardado ? `${fallo.mensajeUsuario} Se alcanzó a guardar ${guardado}.` : fallo.mensajeUsuario;
}
