"use client";

import { useCallback, useRef, useState } from "react";
import { avisoDeTamano, leerRespuesta } from "@/lib/subidas";
import { descartarSubidasAction } from "@/app/(protegido)/pagina-web/acciones";
import type { BucketWeb } from "@/lib/pagina-web-modelo";

/**
 * Subir imágenes al storage del sitio desde un formulario.
 *
 * Recuerda lo que subió en esta sesión del formulario: si se cierra sin guardar,
 * `descartar` borra esas imágenes y no quedan huérfanas en el bucket. Lo que ya
 * estaba guardado no pasa por acá.
 */
export function useSubidas(bucket: BucketWeb) {
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const deEstaSesion = useRef<string[]>([]);

  const subir = useCallback(
    async (archivos: File[]): Promise<string[]> => {
      setError(null);
      const urls: string[] = [];
      for (const archivo of archivos) {
        const aviso = avisoDeTamano(archivo);
        if (aviso) {
          setError(aviso);
          continue;
        }
        setSubiendo((n) => n + 1);
        try {
          const fd = new FormData();
          fd.set("bucket", bucket);
          fd.set("archivo", archivo);
          const { url } = await leerRespuesta<{ url: string }>(
            await fetch("/api/pagina-web/imagen", { method: "POST", body: fd }),
          );
          deEstaSesion.current.push(url);
          urls.push(url);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
        } finally {
          setSubiendo((n) => n - 1);
        }
      }
      return urls;
    },
    [bucket],
  );

  /** Al cerrar sin guardar: borra lo que se subió en esta sesión. */
  const descartar = useCallback(() => {
    const urls = deEstaSesion.current;
    deEstaSesion.current = [];
    if (urls.length) void descartarSubidasAction(bucket, urls);
  }, [bucket]);

  /**
   * Al guardar: lo subido en esta sesión que quedó en el formulario ya está en uso; lo
   * que se subió y se volvió a quitar antes de guardar nunca llegó a la base, así que se
   * borra acá (el servidor solo limpia lo que la fila tenía antes).
   */
  const confirmar = useCallback(
    (enUso: string[]) => {
      const quedan = new Set(enUso);
      const sobran = deEstaSesion.current.filter((u) => !quedan.has(u));
      deEstaSesion.current = [];
      if (sobran.length) void descartarSubidasAction(bucket, sobran);
    },
    [bucket],
  );

  return { subir, subiendo: subiendo > 0, error, descartar, confirmar };
}
