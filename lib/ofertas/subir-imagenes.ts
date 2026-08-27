import { avisoDeTamano, leerRespuesta } from "@/lib/subidas";

/**
 * Subir imágenes a una oferta, con las reglas en un solo lugar.
 *
 * Hay dos pantallas que suben fotos —el panel "Imágenes del documento" y el cajón
 * al costado del documento— y las reglas no son obvias: van de UNA por request,
 * porque el servidor corta el cuerpo alrededor de los 4 MB y tres fotos de teléfono
 * lo pasan sin esfuerzo; el tope se avisa antes de mandar, para no hacer subir 12 MB
 * por una conexión de faena y recién ahí fallar; y si una falla, las anteriores ya
 * están guardadas, así que igual hay que refrescar.
 *
 * Duplicar eso en dos componentes es la forma segura de que un día uno mande las
 * fotos todas juntas y falle en faena. Acá está una vez; cada pantalla pone su
 * propia cara.
 *
 * Sin "server-only": corre en el navegador.
 */

export interface ResultadoSubida {
  /** Los números que les tocaron a las imágenes que sí entraron. */
  agregadas: number[];
  /** Cuántas se subieron antes de que algo fallara, si algo falló. */
  subidas: number;
}

/**
 * Sube los archivos en orden y devuelve los índices que quedaron.
 *
 * Lanza al primer problema —con el mensaje que corresponde mostrar— pero lo que ya
 * subió, subió: quien llama tiene que refrescar igual si `subidas` es mayor que 0.
 * Por eso el error lleva el resultado parcial adosado.
 */
export async function subirImagenesDeOferta(
  ofertaId: string,
  archivos: File[],
  alProgreso?: (texto: string) => void,
): Promise<ResultadoSubida> {
  const agregadas: number[] = [];

  for (const [posicion, archivo] of archivos.entries()) {
    const grande = avisoDeTamano(archivo);
    if (grande) throw Object.assign(new Error(grande), { parcial: { agregadas, subidas: agregadas.length } });

    alProgreso?.(archivos.length > 1 ? `${posicion + 1} de ${archivos.length}` : "");
    const cuerpo = new FormData();
    cuerpo.set("archivo", archivo);

    try {
      const respuesta = await fetch(`/api/ofertas/${ofertaId}/imagenes`, { method: "POST", body: cuerpo });
      const datos = await leerRespuesta<{ agregadas: number[] }>(respuesta);
      agregadas.push(...(datos.agregadas ?? []));
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error("No se pudo subir la imagen."), {
        parcial: { agregadas, subidas: agregadas.length },
      });
    }
  }

  return { agregadas, subidas: agregadas.length };
}

/** Lo que alcanzó a subirse antes de que un error cortara, si lo hubo. */
export function subidaParcial(error: unknown): ResultadoSubida | null {
  const parcial = (error as { parcial?: ResultadoSubida } | null)?.parcial;
  return parcial ?? null;
}

/**
 * Saca una imagen de la oferta: del inventario, del documento y del bucket.
 *
 * Vale para cualquiera, venga del borrador o subida a mano. Lo que la protege es la
 * confirmación de quien llama, que es el que sabe de cuál se trata — ver el cajón de
 * fotos y el panel: los dos avisan que una del borrador solo se recupera volviendo a
 * subir el archivo original.
 */
export async function quitarImagenDeOferta(ofertaId: string, indice: number): Promise<void> {
  const respuesta = await fetch(`/api/ofertas/${ofertaId}/imagenes?indice=${indice}`, { method: "DELETE" });
  await leerRespuesta(respuesta);
}
