"use client";

import { TIPO_ARRASTRE } from "@/lib/ofertas/edicion-dom";
import { NOMBRE_DE_SECCION, type SeccionConImagenes } from "@/lib/ofertas/tipos";
import type { ImagenGuardada } from "@/lib/ofertas/imagenes";
import { TARJETA } from "@/lib/estilos";

/**
 * Las fotos de la oferta, al costado del documento y listas para arrastrar.
 *
 * Va en la columna de la derecha y no en una tira sobre el documento, que es donde
 * estaba: una tira horizontal de once miniaturas es ancha por definición, y en una
 * columna de 340 px las fotos se apilan sin empujar nada. Además la columna es
 * sticky, así que las fotos siguen a la vista mientras se recorre el documento —que
 * es justo cuando hacen falta— en vez de quedar arriba, fuera de la pantalla.
 *
 * No sabe nada del documento: solo pone el número de la foto en el arrastre. Quien
 * lo recibe es el documento del iframe (ver lib/ofertas/edicion-dom.ts), así que
 * este componente y aquel se pueden mover de lugar sin tocarse.
 */
export default function CajonDeFotos({
  imagenes,
  urls,
  porSeccion,
}: {
  imagenes: ImagenGuardada[];
  /** Índice → URL firmada y corta, para la miniatura. */
  urls: Record<number, string>;
  /** Dónde está puesta cada una, según lo guardado. */
  porSeccion: Partial<Record<SeccionConImagenes, number[]>>;
}) {
  if (imagenes.length === 0) return null;

  const seccionDe = (indice: number) =>
    (Object.keys(porSeccion) as SeccionConImagenes[]).find((clave) =>
      (porSeccion[clave] ?? []).includes(indice),
    );
  const sinUbicar = imagenes.filter((imagen) => !seccionDe(imagen.indice)).length;

  return (
    <section className={`${TARJETA} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">Fotos</h2>
        <span className={`text-[11px] ${sinUbicar > 0 ? "text-naranjo" : "text-tinta/45"}`}>
          {sinUbicar > 0 ? `${sinUbicar} sin ubicar` : "todas ubicadas"}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-pretty text-tinta/45">
        Arrastrá una hasta la sección del documento donde va. También podés soltar archivos del escritorio
        sobre el documento, y sacarlas con la × de cada foto.
      </p>
      {/* Arrastrar es de mouse: en una pantalla táctil no hay gesto equivalente en la
          web sin reescribir el arrastre a mano. En vez de dejar un cajón que no
          responde, se dice dónde está el camino que sí funciona. */}
      <p className="mt-1.5 text-[11px] text-pretty text-tinta/45 sm:hidden">
        Desde un teléfono el arrastre no funciona: ubicalas con el desplegable de cada foto, en{" "}
        <span className="font-medium text-tinta/65">Imágenes del documento</span>.
      </p>

      {/* Con tope de alto y su propio scroll: con veinte fotos, la columna crecería
          más que la pantalla y el botón de guardar quedaría abajo, inalcanzable. El
          alto de fila se fija en 82px y el tope en tres filas justas (82×3 + 8×2), así
          que el corte cae SIEMPRE entre filas: una fila cortada al medio se lee como
          algo roto, no como algo que sigue más abajo. Sin fijar la fila, el alto
          depende de cuánto mida la etiqueta y el corte se desalinea solo. */}
      <div className="mt-3 grid max-h-[262px] grid-cols-4 gap-2 overflow-y-auto [grid-auto-rows:82px] sm:grid-cols-3">
        {imagenes.map((imagen) => {
          const puesta = seccionDe(imagen.indice);
          return (
            <div
              key={imagen.indice}
              draggable
              onDragStart={(evento) => {
                evento.dataTransfer.setData(TIPO_ARRASTRE, String(imagen.indice));
                evento.dataTransfer.effectAllowed = "move";
              }}
              title={
                puesta
                  ? `En ${NOMBRE_DE_SECCION[puesta]} · arrastrala para moverla`
                  : "Todavía no está en el documento"
              }
              className={`cursor-grab rounded-lg border bg-superficie p-1 transition active:cursor-grabbing ${
                puesta ? "border-naranjo/50" : "border-borde hover:border-naranjo/50"
              }`}
            >
              <div className="flex h-14 items-center justify-center overflow-hidden rounded bg-white">
                {urls[imagen.indice] ? (
                  // Sin next/image: bucket privado con URL firmada y corta.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[imagen.indice]}
                    alt=""
                    draggable={false}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-tinta/30">
                    nº {imagen.indice}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[9px] leading-tight text-tinta/45">
                {puesta ? NOMBRE_DE_SECCION[puesta] : "Sin ubicar"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
