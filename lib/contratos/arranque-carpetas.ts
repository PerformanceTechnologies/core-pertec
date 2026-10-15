import "server-only";
import { guardarCarpetaDePartida } from "./arranque";
import type { ModuloArranque, Partida } from "./arranque-modelo";
import {
  asegurarCarpeta,
  buscarSeccion,
  carpetaDeGastos,
  carpetaDeLogistica,
} from "./sharepoint";
import { nombreParaSharePoint } from "./validar-form";

// La carpeta de cada partida en SharePoint, y la subcarpeta de cada cotización:
//
//   CARPETA DE ARRANQUE / GASTOS ARRANQUE / 0007 - Bicicletas spinning / COT - Ironside - a1b2 / cotización.pdf
//
// Vive acá y no en las acciones porque un archivo «use server» solo puede exportar acciones: lo
// que se exporte de ahí queda expuesto como un endpoint que cualquiera puede llamar.

export function carpetaDelModulo(m: ModuloArranque): string {
  return m === "logistica" ? carpetaDeLogistica() : carpetaDeGastos();
}

/** «0007 - Buses de acercamiento»: el número primero, para que ordene como la lista. */
export function nombreDeCarpeta(p: { numero: number; descripcion: string }): string {
  // «sin título» por si la descripción tuviera solo caracteres que SharePoint prohíbe:
  // el nombre quedaría terminado en espacio, que tampoco admite.
  return `${String(p.numero).padStart(4, "0")} - ${nombreParaSharePoint(p.descripcion, 90) || "sin título"}`;
}

/** La carpeta de la partida: la que ya tiene, o la crea (y la del módulo, si falta) y la anota. */
export async function asegurarCarpetaDePartida(partida: Partida): Promise<string> {
  if (partida.carpetaItemId) return partida.carpetaItemId;

  // Cuelga de la sección «arranque»: la misma carpeta de arranque que recorre
  // Contratos, y los permisos son los suyos.
  const seccion = await buscarSeccion("arranque");
  if (!seccion) throw new Error("La sección «arranque» no está configurada.");

  // Primero la del módulo —LOGISTICA o GASTOS ARRANQUE—, que se usa si ya existe en el
  // sitio y se crea si no; después la de la partida dentro de ella.
  const nombreModulo = carpetaDelModulo(partida.modulo);
  await asegurarCarpeta(seccion, "", nombreModulo);
  const carpeta = await asegurarCarpeta(seccion, nombreModulo, nombreDeCarpeta(partida));

  await guardarCarpetaDePartida(partida.id, carpeta);
  return carpeta.id;
}

/**
 * El nombre de la subcarpeta de una cotización: el proveedor, y las primeras letras de su id para
 * que dos cotizaciones del mismo proveedor (una nueva versión del precio) no compartan carpeta.
 */
export function nombreDeCarpetaDeCotizacion(c: { id: string; proveedor: string }): string {
  return `COT - ${nombreParaSharePoint(c.proveedor, 60) || "proveedor"} - ${c.id.slice(0, 4)}`;
}

/** La subcarpeta de la cotización dentro de la de su partida: la que ya tiene, o la crea. */
export async function asegurarCarpetaDeCotizacion(
  partida: Partida,
  cotizacion: { id: string; proveedor: string; carpetaItemId: string | null },
  anotar: (carpeta: { id: string; webUrl: string }) => Promise<void>,
): Promise<string> {
  if (cotizacion.carpetaItemId) return cotizacion.carpetaItemId;

  await asegurarCarpetaDePartida(partida);
  const seccion = await buscarSeccion("arranque");
  if (!seccion) throw new Error("La sección «arranque» no está configurada.");

  const rutaDePartida = `${carpetaDelModulo(partida.modulo)}/${nombreDeCarpeta(partida)}`;
  const carpeta = await asegurarCarpeta(seccion, rutaDePartida, nombreDeCarpetaDeCotizacion(cotizacion));

  await anotar(carpeta);
  return carpeta.id;
}
