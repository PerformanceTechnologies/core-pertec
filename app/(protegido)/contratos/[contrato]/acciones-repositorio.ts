"use server";

import { refrescarContrato } from "@/lib/contratos/refrescar";
import { exigirAccesoApp, exigirCapacidad } from "@/lib/contratos/autorizacion";
import { CARPETA_DEL_REPOSITORIO } from "@/lib/contratos/repositorio-modelo";
import {
  ErrorDeGraph,
  asegurarCarpeta,
  buscarSeccion,
  sesionDeSubidaEnCarpeta,
} from "@/lib/contratos/sharepoint";

// Las acciones del repositorio de apoyo: lo que se sube a la carpeta REPOSITORIO DE APOYO del
// contrato. Verlo es para todos los que tienen Contratos (lo hace la página y enlaceDeArchivoAction);
// subir es solo para quien puede configurar el módulo (Administrador y Usuario Especial).
//
// Archivo aparte de acciones.ts a propósito: esas acciones suben a una carpeta que manda el navegador
// y marcan el requisito como «subido». Acá la carpeta es SIEMPRE la misma y no hay requisito: un
// archivo del repositorio no mueve el avance de nada.

const APP = "contratos";

/**
 * Abre la sesión de subida en la carpeta del repositorio, creándola si todavía no existe.
 *
 * La carpeta NO viene del navegador: la ruta que llega se ignora (existe solo porque el subidor la
 * manda siempre) y se sube por el id de la carpeta que resuelve el servidor. Así esta acción no
 * puede apuntarse a ninguna otra carpeta del sitio.
 */
export async function prepararSubidaAlRepositorioAction(slug: string, _rutaCarpeta: string, nombre: string) {
  await exigirCapacidad(APP, "configurar");
  const seccion = await buscarSeccion(slug);
  if (!seccion) throw new ErrorDeGraph(`Sección desconocida: ${slug}`, 400);

  const carpeta = await asegurarCarpeta(seccion, "", CARPETA_DEL_REPOSITORIO);
  return await sesionDeSubidaEnCarpeta(carpeta.id, nombre);
}

/**
 * Lo que pasa cuando un archivo termina de subir: nada que anotar. No hay estado de requisito que
 * mover ni comentario que guardar; solo se vuelve a pedir la página para que lo muestre.
 */
export async function registrarSubidaAlRepositorioAction() {
  await exigirCapacidad(APP, "configurar");
  refrescarContrato();
}

export async function refrescarRepositorioAction() {
  await exigirAccesoApp(APP);
  refrescarContrato();
}
