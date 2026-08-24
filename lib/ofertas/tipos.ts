/**
 * La estructura canónica de una oferta técnica de PERTEC.
 *
 * Es la que define el maestro aprobado, sección por sección. Todo el módulo gira
 * alrededor de este tipo: el modelo transcribe un borrador a esta forma, el
 * servidor la verifica, y la plantilla la maqueta. Nadie más decide qué lleva una
 * oferta.
 *
 * CADA SECCIÓN ES OPCIONAL a propósito. Un traslado de rollos no tiene
 * especificaciones de equipo vulcanizador y un cambio de correa sí; el maestro
 * trae todas y cada oferta usa las que le corresponden. Lo que NO puede pasar es
 * que una sección quede vacía o con texto de relleno: si no aplica, se omite, y
 * la numeración de las que quedan se corrige sola porque la genera la plantilla
 * a partir de las secciones presentes. Es la única forma de que "renumerar y
 * actualizar el índice" no pueda salir mal.
 *
 * Ninguna cifra de acá la calcula el modelo. Los totales los pone
 * ./verificar.ts, que además comprueba que cuadren con lo impreso en el
 * borrador.
 */

/** 1 · IDENTIFICACIÓN DE LA OFERTA */
export interface Identificacion {
  numeroOferta: string | null;
  /** Tal como se escribe en el documento: "11 de agosto de 2026". */
  fecha: string | null;
  validez: string | null;
  cliente: string | null;
  /** A quién va dirigida. */
  atencion: string | null;
  /** Quiénes van en copia, como una sola línea. */
  copia: string | null;
  /** El párrafo de referencia: qué servicio se está ofertando. */
  referencia: string | null;
  faena: string | null;
}

/** Una fila de dotación: el cargo y cuántas personas. */
export interface FilaDotacion {
  cargo: string;
  dotacion: number;
  /** Solo en la sección 5, donde el maestro trae la columna Régimen. */
  regimen?: string | null;
}

/** 2 · ALCANCE DEL SERVICIO */
export interface Alcance {
  /** Párrafo introductorio, si el documento lo trae. */
  introduccion: string | null;
  /** 2.1 — numeradas por la plantilla, no acá. */
  actividades: string[];
  /** 2.2 */
  trabajosPrevios: string[];
  /** 2.3 */
  personalEspecialista: FilaDotacion[];
}

/** 3 · METODOLOGÍA Y SECUENCIA DE TRABAJO */
export interface Metodologia {
  /** Hitos previos a la parada de planta. */
  antesDeLaDetencion: string[];
  /** Hitos con la planta detenida. */
  duranteLaDetencion: string[];
}

/** 4 · ESPECIFICACIONES TÉCNICAS Y EQUIPO */
export interface Especificacion {
  parametro: string;
  especificacion: string;
}

/** 5 · DOTACIÓN Y ORGANIZACIÓN DEL SERVICIO */
export interface Organizacion {
  cuadroPersonal: FilaDotacion[];
  /** Una tarjeta por cargo, con lo que hace. */
  responsabilidades: { cargo: string; descripcion: string }[];
  /** La frase que describe el régimen de turnos, si la hay. */
  nota: string | null;
}

/** 6 · PROGRAMA Y PLAZOS */
export interface Turno {
  /** "T1" */
  turno: string;
  /** "Día 1 — día" */
  jornada: string;
  horas: number;
}

export interface Programa {
  introduccion: string | null;
  turnos: Turno[];
  /** Solo texto: el total en horas lo suma ./verificar.ts. */
  nota: string | null;
}

/** 7 · PRECIO DEL SERVICIO */
export interface LineaPrecio {
  cantidad: number;
  /** La descripción larga de la línea, tal como está impresa. */
  cargo: string;
  unidad: string;
  valorUnitario: number;
  /**
   * El total impreso de la línea, cuando el documento lo trae.
   *
   * Se transcribe en vez de calcularse para poder comprobar que cantidad ×
   * unitario dé eso mismo. Si el borrador no lo trae, queda en null y el total lo
   * pone el servidor.
   */
  valorTotalImpreso: number | null;
}

export interface Precio {
  lineas: LineaPrecio[];
  /** El TOTAL NETO impreso al pie. Sirve de control, no de dato de salida. */
  totalNetoImpreso: number | null;
  nota: string | null;
}

/** 9 · APORTES DE LAS PARTES */
export interface Aportes {
  pertec: string[];
  cliente: string[];
}

/** 10 · CIERRE Y FIRMA */
export interface Cierre {
  texto: string | null;
  firmantes: { nombre: string; cargo: string; empresa: string | null }[];
  /** "CC: Gcia. Gral. / Archivo." */
  cc: string | null;
  /**
   * La firma escaneada que traía el borrador, por número de imagen.
   *
   * Es un ÍNDICE y no una ruta a propósito: el modelo dice cuál de las imágenes
   * del borrador es la firma —lo sabe por el contexto donde estaba— y el servidor
   * sabe dónde la guardó. Ver lib/ofertas/imagenes.ts.
   */
  firmaImagen: number | null;
}

/** A · ANEXO */
export interface Anexo {
  respaldoInstitucional: string[];
  mandantes: string[];
  notaEquipo: string | null;
}

/**
 * Una oferta completa, tal como la transcribe el modelo.
 *
 * `ilegibles` y `porConfirmar` son la contraparte de la regla de no inventar: si
 * un dato no está o es ambiguo, se nombra acá y se ve en pantalla, en vez de
 * aparecer completado con algo verosímil.
 */
/**
 * Las secciones donde puede ir una imagen del borrador.
 *
 * Un borrador no pone todas sus imágenes juntas: el diagrama de disposición de
 * equipos está en medio de la metodología, las fotos de faena en el anexo y la
 * firma escaneada junto al nombre del firmante. Que salgan DONDE ESTABAN es la
 * diferencia entre reproducir el documento y hacer un collage al final.
 */
export type SeccionConImagenes =
  | "alcance"
  | "metodologia"
  | "especificaciones"
  | "organizacion"
  | "programa"
  | "precio"
  | "condiciones"
  | "aportes"
  | "cierre"
  | "anexo";

export const SECCIONES_CON_IMAGENES: SeccionConImagenes[] = [
  "alcance",
  "metodologia",
  "especificaciones",
  "organizacion",
  "programa",
  "precio",
  "condiciones",
  "aportes",
  "cierre",
  "anexo",
];

/** Cómo se llama cada sección en pantalla, para poder elegir a mano. */
export const NOMBRE_DE_SECCION: Record<SeccionConImagenes, string> = {
  alcance: "Alcance del servicio",
  metodologia: "Metodología",
  especificaciones: "Especificaciones técnicas",
  organizacion: "Dotación y organización",
  programa: "Programa y plazos",
  precio: "Precio del servicio",
  condiciones: "Condiciones comerciales",
  aportes: "Aportes de las partes",
  cierre: "Cierre y firma",
  anexo: "Anexo",
};

export interface OfertaCanonica {
  identificacion: Identificacion;
  /** Título del servicio, tal como lo titula el documento. */
  titulo: string;
  alcance: Alcance | null;
  metodologia: Metodologia | null;
  especificaciones: Especificacion[] | null;
  organizacion: Organizacion | null;
  programa: Programa | null;
  precio: Precio | null;
  condicionesComerciales: string[] | null;
  aportes: Aportes | null;
  cierre: Cierre | null;
  anexo: Anexo | null;
  /** Datos que el borrador no traía o que no se pudieron leer con certeza. */
  porConfirmar: string[];
  /** Secciones omitidas y por qué, tal como las reporta el modelo. */
  omitidas: { seccion: string; motivo: string }[];
  /**
   * Qué imágenes del borrador van en cada sección, por número y en orden.
   *
   * Son ÍNDICES del inventario de la oferta, no rutas: el modelo dice dónde estaba
   * cada imagen y el servidor sabe dónde la guardó (ver lib/ofertas/imagenes.ts).
   * Una sección que no aparece en el mapa no lleva imágenes.
   */
  imagenesPorSeccion: Partial<Record<SeccionConImagenes, number[]>>;
}

/**
 * Una inconsistencia detectada en el borrador.
 *
 * No se corrige: se reporta. Un borrador con el número de oferta cambiado a
 * medias o con encabezados heredados de otro servicio necesita que una persona
 * decida cuál es el correcto — arreglarlo por cuenta propia es elegir por ella y
 * ocultar que había un problema.
 */
export interface Inconsistencia {
  /** Qué se comprobó: sirve para agrupar en pantalla. */
  tipo:
    | "numero_oferta"
    | "suma_precios"
    | "linea_precio"
    | "dotacion"
    | "programa"
    | "contenido_ajeno"
    | "falta_dato";
  detalle: string;
  /** `aritmetica` la detectó el servidor con números; `lectura`, el modelo. */
  origen: "aritmetica" | "lectura";
}

/** Los totales que calcula el servidor, nunca el modelo. */
export interface TotalesOferta {
  /** Suma de la columna Dotación de la sección 5 (o de la 2.3 si no hay 5). */
  dotacionTotal: number;
  /** Horas del programa: la suma de las horas de cada turno. */
  horasPrograma: number;
  cantidadTurnos: number;
  /** Σ (cantidad × valor unitario) de la tabla de precios. */
  totalNetoCalculado: number;
}
