"use server";

import { refrescarContrato } from "@/lib/contratos/refrescar";
import { exigirAccesoApp, exigirCapacidad } from "@/lib/contratos/autorizacion";
import { CARPETA_DEL_REPOSITORIO } from "@/lib/contratos/repositorio-modelo";
import {
  ErrorDeGraph,
  asegurarCarpeta,
  buscarSeccion,
  segmentosDeRuta,
  sesionDeSubida,
} from "@/lib/contratos/sharepoint";

// Las acciones del repositorio de apoyo: lo que se sube a la carpeta REPOSITORIO DE APOYO del
// contrato. Verlo es para todos los que tienen Contratos (lo hace la página y enlaceDeArchivoAction);
// subir es solo para quien puede configurar el módulo (Administrador y Usuario Especial).
//
// Archivo aparte de acciones.ts a propósito: esas acciones marcan el requisito como «subido». Acá
// no hay requisito: un archivo del repositorio no mueve el avance de nada, y la carpeta de destino
// solo puede ser el repositorio o algo que cuelgue de él.

const APP = "contratos";

/**
 * Abre la sesión de subida en la carpeta del repositorio donde está quien sube: la raíz o una de
 * sus subcarpetas. La raíz se crea si todavía no existe.
 *
 * La ruta viene del navegador, así que no se le cree: se valida (sin `..` ni caracteres que
 * SharePoint no admite) y tiene que empezar por la carpeta del repositorio. Una ruta que apunte a
 * cualquier otra parte del sitio se rechaza. Sin esto, esta acción serviría para subir un archivo
 * a CUALQUIER carpeta del contrato —también a las de los requisitos—, saltándose lo que hacen las
 * demás acciones (marcar el requisito, no escribir en Acreditación).
 */
export async function prepararSubidaAlRepositorioAction(slug: string, rutaCarpeta: string, nombre: string) {
  await exigirCapacidad(APP, "configurar");
  const seccion = await buscarSeccion(slug);
  if (!seccion) throw new ErrorDeGraph(`Sección desconocida: ${slug}`, 400);

  const partes = segmentosDeRuta(rutaCarpeta);
  if (partes[0]?.toLowerCase() !== CARPETA_DEL_REPOSITORIO.toLowerCase()) {
    throw new ErrorDeGraph("Esa carpeta no es del repositorio de apoyo.", 400);
  }

  // En la raíz se asegura que exista (la primera subida la crea). Una subcarpeta ya existe: quien
  // sube llegó a ella navegando, y subir a una inventada solo la crearía dentro del repositorio.
  if (partes.length === 1) await asegurarCarpeta(seccion, "", CARPETA_DEL_REPOSITORIO);

  return await sesionDeSubida(seccion, partes.join("/"), nombre);
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
