"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconDownload, IconExternalLink, IconFileUnknown, IconX } from "@tabler/icons-react";
import CargaPertec from "@/components/CargaPertec";

/**
 * Hasta cuándo se espera el aviso de «terminó de cargar» antes de quitar la
 * animación igual. Algunos navegadores móviles no dibujan un PDF en un iframe y
 * tampoco avisan; sin este tope, la animación se quedaría para siempre tapando el
 * mensaje del navegador.
 */
const TOPE_DE_ESPERA_MS = 15_000;

export interface DocumentoVisible {
  nombre: string;
  url: string;
  urlDescarga: string;
  /** La página del archivo en SharePoint, para abrirlo allá. */
  webUrl: string;
  sePuedeVer: boolean;
  esImagen: boolean;
}

/**
 * El visor de un documento, en una capa sobre la página.
 *
 * Los PDF y las imágenes los dibuja el propio navegador: un `<iframe>` con el
 * enlace de descarga de Graph alcanza, y evita cargar una librería de
 * renderizado de varios cientos de kilobytes para hacer lo que Chrome, Safari y
 * Firefox ya hacen igual de bien.
 *
 * Word, Excel y PowerPoint no los dibuja nadie: para esos la URL viene de la
 * acción `preview` de Graph y la pinta Office Online, en lectura. Editar sigue
 * siendo cosa de SharePoint, por el enlace de la cabecera.
 *
 * El precio es que no hay control sobre la barra del visor nativo, y que en
 * algunos navegadores móviles un PDF en iframe no se muestra. Por eso el botón
 * de descarga y el enlace a SharePoint están siempre a la vista: son la salida
 * cuando el visor no puede.
 */
export default function VisorDeDocumento({
  documento,
  alCerrar,
}: {
  documento: DocumentoVisible | null;
  alCerrar: () => void;
}) {
  const cerrarRef = useRef<HTMLButtonElement>(null);

  // La URL que ya terminó de cargar, y no un sí/no: al abrir otro documento la
  // URL cambia y la animación vuelve sola, sin tener que acordarse de reiniciarla.
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const urlActual = documento?.sePuedeVer ? documento.url : null;
  const cargando = urlActual !== null && cargadoPara !== urlActual;

  useEffect(() => {
    if (!urlActual) return;
    const tope = setTimeout(() => setCargadoPara(urlActual), TOPE_DE_ESPERA_MS);
    return () => clearTimeout(tope);
  }, [urlActual]);

  // Escape cierra, y mientras está abierto la página de atrás no scrollea. Sin
  // lo segundo, la rueda del mouse mueve el documento de abajo y al cerrar uno
  // ya no está donde estaba.
  useEffect(() => {
    if (!documento) return;

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
    };
    document.addEventListener("keydown", alTeclear);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // El foco entra al diálogo: si se queda en el botón de la fila, tabular
    // sigue recorriendo la tabla de atrás, que está tapada.
    cerrarRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [documento, alCerrar]);

  if (!documento) return null;

  // El diálogo se monta en <body> y no donde está escrito, con un portal.
  //
  // No es un capricho: el contenedor de cada página lleva `.animar-entrada`, y
  // un elemento con una animación de opacidad rellenando —con `both`, para
  // siempre— crea un contexto de apilamiento. Dentro de él, el z-50 de este
  // diálogo deja de competir con el z-30 de la barra lateral y pasa a competir
  // con el z-index 0 del propio contenedor: la barra quedaba ENCIMA del visor,
  // tapándole el título.
  //
  // No hay riesgo en servidor: `documento` arranca en null, así que durante el
  // renderizado del servidor esta función ya salió por el return de arriba y
  // nunca toca `document`.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/60 p-4 sm:p-8"
      // Cierra al tocar el fondo, pero no al soltar el clic dentro del panel:
      // sin la comprobación, seleccionar texto adentro y soltar afuera cerraba.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={documento.nombre}
    >
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-superficie shadow-2xl">
        <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-tinta">
            {documento.nombre}
          </h2>

          {/* En el teléfono quedan solo los iconos: con las dos etiquetas, los
              tres controles y el nombre del archivo no caben en 375 px, y lo
              primero que se pierde es justamente saber qué archivo se abrió. */}
          <a
            href={documento.webUrl}
            target="_blank"
            rel="noreferrer"
            title="Editar en SharePoint"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:bg-cian-lavado hover:text-azul sm:px-3"
          >
            <span className="hidden sm:inline">Editar en SharePoint</span>
            <IconExternalLink size={14} />
          </a>

          {documento.urlDescarga && (
            <a
              href={documento.urlDescarga}
              download={documento.nombre}
              title="Descargar"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-azul transition hover:bg-cian-lavado sm:px-3"
            >
              <IconDownload size={15} />
              <span className="hidden sm:inline">Descargar</span>
            </a>
          )}

          <button
            ref={cerrarRef}
            onClick={alCerrar}
            className="shrink-0 rounded-lg p-1.5 text-gris transition hover:bg-borde/60 hover:text-tinta"
            aria-label="Cerrar"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-fondo">
          {/* Office Online y los PDF grandes tardan segundos en aparecer, y hasta
              entonces el área queda en blanco: se lee como un visor roto. El
              documento se sigue cargando debajo; esto solo lo tapa mientras. */}
          {cargando && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-fondo">
              <CargaPertec modulo="el documento" compacto />
            </div>
          )}
          {documento.sePuedeVer ? (
            documento.esImagen ? (
              <div className="flex h-full items-center justify-center overflow-auto p-4">
                {/* next/image no aplica acá: la fuente es un enlace de vida
                    corta que cambia en cada apertura, así que no hay nada que
                    optimizar ni cachear. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={documento.url}
                  alt={documento.nombre}
                  className="max-h-full max-w-full object-contain"
                  onLoad={() => setCargadoPara(documento.url)}
                  onError={() => setCargadoPara(documento.url)}
                />
              </div>
            ) : (
              <iframe
                src={documento.url}
                title={documento.nombre}
                className="h-full w-full"
                onLoad={() => setCargadoPara(documento.url)}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <IconFileUnknown size={36} className="text-gris-suave" />
              <p className="text-sm font-semibold text-tinta">
                Este archivo no se puede ver acá
              </p>
              <p className="max-w-sm text-xs leading-relaxed text-gris">
                Se puede ver acá PDF, imágenes, texto y documentos de Office. Con este formato —o
                si la vista previa no se pudo preparar— hay que abrirlo en SharePoint, que además
                permite editarlo.
              </p>
              <a
                href={documento.webUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave"
              >
                Abrir en SharePoint
                <IconExternalLink size={15} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
