import "server-only";
import { borrarArchivos, enlaceTemporal, leerArchivo } from "@/lib/archivos/almacen";
import type { EmpresaIdentidad } from "@/lib/cotizador/empresas";
import { logoSeguro, type LogosDocumento } from "./logo";

// Bajar los logos de un documento: lo único del manejo de logos que NO necesita sharp.
//
// Separado de ./logos-archivo.ts por peso del bundle, igual que ./imagenes-subir.ts de
// ./imagenes.ts: sharp arrastra su binario de libvips (16 MB) a toda función que importe
// el archivo, y las que imprimen un PDF solo bajan un PNG del bucket y lo pasan a data
// URI. Normalizar y subir —lo que sí usa sharp— vive en logos-archivo.ts y lo importa
// únicamente quien sube un logo.

const BUCKET = "ofertas-logos";

/**
 * Borra el archivo de un logo.
 *
 * Acepta null para poder llamarla siempre con el valor anterior sin preguntar: al
 * reemplazar un logo, el archivo viejo tiene que irse o el bucket se llena de
 * huérfanos que nada nombra.
 */
export async function borrarLogo(ruta: string | null | undefined): Promise<void> {
  if (!ruta) return;
  // No se propaga: si el archivo ya no está, la fila igual quedó limpia y eso es
  // lo que importa. Queda anotado en el log para poder revisarlo.
  await borrarArchivos(BUCKET, [ruta]);
}

/** Una URL firmada y corta, para mirarlo en pantalla. */
export async function urlFirmadaLogo(ruta: string | null, segundos = 600): Promise<string | null> {
  if (!ruta) return null;
  return enlaceTemporal(BUCKET, ruta, { segundos });
}

/** El PNG como data URI, que es la única forma de meterlo en el PDF. */
async function comoDataUri(ruta: string | null): Promise<string | null> {
  if (!ruta) return null;

  // Un logo que no se pudo bajar deja el encabezado en texto. Falta un logo, no
  // falla la oferta: emitir es lo que la persona vino a hacer.
  const contenido = await leerArchivo(BUCKET, ruta);
  if (!contenido) return null;

  const base64 = contenido.toString("base64");
  const uri = logoSeguro(`data:image/png;base64,${base64}`);
  if (!uri) console.warn(`[ofertas] el logo ${ruta} quedó fuera del control de tamaño y no se imprimió.`);
  return uri;
}

/**
 * Los dos logos de un documento, listos para la plantilla.
 *
 * El de la casa sale de la identidad de la empresa emisora —se sube una vez y
 * sirve para todas sus ofertas— y el del cliente sale de la oferta, porque ese sí
 * cambia en cada una.
 */
export async function logosParaDocumento(
  empresa: EmpresaIdentidad,
  logoClienteRuta: string | null,
): Promise<LogosDocumento> {
  const [casa, cliente] = await Promise.all([comoDataUri(empresa.logoRuta), comoDataUri(logoClienteRuta)]);
  return { casa, cliente };
}
