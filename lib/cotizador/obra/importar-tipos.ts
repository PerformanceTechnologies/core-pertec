/**
 * La forma de lo que el modelo transcribe de una propuesta.
 *
 * En su propio archivo porque lo usan los dos lados: el que llama al modelo
 * (./importar.ts, server-only) y el que construye la obra a partir de eso
 * (./importar-construir.ts, puro y testeable).
 */
import type { ItemObra } from "./tipos";

/** Lo que el modelo transcribe del documento. Ni un número calculado. */
export interface PropuestaLeida {
  numeroOferta: string | null;
  fecha: string | null;
  cliente: string | null;
  faena: string | null;
  descripcionServicio: string;
  turnos: { cantidad: number | null; horas: number | null };
  dotacion: { cargo: string; personasPorTurno: number | null; personasTotales: number | null }[];
  trabajosPrevios: string[];
  lineasPrecio: {
    descripcion: string;
    unidad: ItemObra["unidad"];
    cantidad: number;
    precioUnitario: number;
    categoria: ItemObra["categoria"];
    /** true en la línea que cubre la cuadrilla y su trabajo, no un equipo ni un flete. */
    esManoDeObra: boolean;
  }[];
  totalNetoDeclarado: number | null;
  ilegibles: string[];
}
