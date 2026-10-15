// Lo que necesita el checklist de documentos para funcionar con lo que se acredite: personas o
// vehículos.
//
// Sin "use server" ni "server-only": solo tipos y textos. Las acciones de cada submódulo viven en
// su propio archivo "use server" (no pueden compartirse, porque cada una escribe en SUS tablas) y
// la página las pasa hacia abajo. Así la fila del documento y el checklist son una sola pieza
// para los dos submódulos, y no dos copias que un día dejan de parecerse.

import type { EstadoDocumento, EstadoForm } from "./acreditacion-modelo";

/**
 * Las seis cosas que se hacen con un documento. El primer parámetro de cada una es el id de lo que
 * se acredita —la persona o el vehículo—, y la acción sabe a qué tabla le corresponde.
 */
export interface AccionesDeDocumento {
  prepararSubida: (
    sujetoId: string,
    tipoId: string,
    nombreOriginal: string,
  ) => Promise<{ url: string; error?: undefined } | { url?: undefined; error: string }>;
  registrarSubida: (sujetoId: string, tipoId: string, itemId: string) => Promise<EstadoForm>;
  eliminarArchivo: (sujetoId: string, archivoId: string) => Promise<EstadoForm>;
  cambiarEstado: (sujetoId: string, tipoId: string, estado: EstadoDocumento) => Promise<void>;
  cambiarRequeridoExtra: (sujetoId: string, tipoId: string, requerido: boolean) => Promise<void>;
  guardarDetalle: (
    sujetoId: string,
    tipoId: string,
    detalle: { fechaEmision: string; fechaVencimiento: string; nota: string },
  ) => Promise<void>;
}

/** Cómo se llama lo que se acredita, en los textos del checklist. */
export interface TerminosDeDocumento {
  /** Cuando el cargo / tipo de vehículo no pide ningún documento. */
  sinRequeridos: string;
  /** El título del desplegable de los documentos que no pide. */
  otrosQueNoPide: string;
  /** La etiqueta de un documento que no pide el cargo / tipo, pero se pidió aparte. */
  noLoPide: string;
  /** «“No aplica” saca este documento del avance de…». */
  avanceDe: string;
  /** La casilla de pedirlo aparte. */
  pedirTambien: string;
}

export const TERMINOS_DE_PERSONA: TerminosDeDocumento = {
  sinRequeridos: "Este cargo no pide ningún documento. Se configura en Configuración.",
  otrosQueNoPide: "Otros documentos que no pide este cargo",
  noLoPide: "No lo pide el cargo",
  avanceDe: "del avance de la persona",
  pedirTambien: "Pedírselo también a esta persona",
};

export const TERMINOS_DE_VEHICULO: TerminosDeDocumento = {
  sinRequeridos: "Este tipo de vehículo no pide ningún documento. Se configura en Configuración.",
  otrosQueNoPide: "Otros documentos que no pide este tipo de vehículo",
  noLoPide: "No lo pide el tipo de vehículo",
  avanceDe: "del avance del vehículo",
  pedirTambien: "Pedírselo también a este vehículo",
};
