"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TIPO_ARRASTRE } from "@/lib/ofertas/edicion-dom";
import { FORMATOS_LOGO } from "@/lib/ofertas/logo";
import { quitarImagenDeOferta, subidaParcial, subirImagenesDeOferta } from "@/lib/ofertas/subir-imagenes";
import { avisoDeQuitar } from "@/components/ofertas/QuitarImagen";
import RuedaCarga from "@/components/RuedaCarga";
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
 *
 * Y de acá también se agregan: el cajón es donde uno está mirando cuando se da
 * cuenta de que falta una foto, así que mandarlo a otro panel a buscar el botón es
 * hacerlo ir y volver. Las reglas de la subida son las mismas del panel y viven en
 * un solo lugar (lib/ofertas/subir-imagenes.ts).
 */
export default function CajonDeFotos({
  ofertaId,
  imagenes,
  urls,
  porSeccion,
}: {
  ofertaId: string;
  imagenes: ImagenGuardada[];
  /** Índice → URL firmada y corta, para la miniatura. */
  urls: Record<number, string>;
  /** Dónde está puesta cada una, según lo guardado. */
  porSeccion: Partial<Record<SeccionConImagenes, number[]>>;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);

  const subir = async (archivos: File[]) => {
    if (archivos.length === 0) return;
    setSubiendo("Subiendo…");
    setError(null);
    let subidas = 0;
    try {
      subidas = (
        await subirImagenesDeOferta(ofertaId, archivos, (texto) => setSubiendo(`Subiendo ${texto}`.trim()))
      ).subidas;
    } catch (e) {
      subidas = subidaParcial(e)?.subidas ?? 0;
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(null);
      if (entrada.current) entrada.current.value = "";
      // Lo que alcanzó a subir tiene que aparecer, aunque después una haya fallado.
      if (subidas > 0) router.refresh();
    }
  };

  /** Saca una foto de la oferta entera: del cajón, del documento y del bucket. */
  const quitar = async (indice: number, delBorrador: boolean) => {
    if (!window.confirm(avisoDeQuitar(delBorrador))) return;
    setSubiendo("Quitando…");
    setError(null);
    try {
      await quitarImagenDeOferta(ofertaId, indice);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar la foto.");
    } finally {
      setSubiendo(null);
    }
  };

  const seccionDe = (indice: number) =>
    (Object.keys(porSeccion) as SeccionConImagenes[]).find((clave) =>
      (porSeccion[clave] ?? []).includes(indice),
    );
  const sinUbicar = imagenes.filter((imagen) => !seccionDe(imagen.indice)).length;

  return (
    // Soltar archivos sobre la tarjeta entera y no solo sobre el "+": cuando alguien
    // arrastra una foto desde el escritorio apunta al cajón, no a un botón de 80px.
    <section
      onDragOver={(evento) => {
        if (!evento.dataTransfer.types.includes("Files")) return;
        evento.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(evento) => {
        if (!evento.dataTransfer.types.includes("Files")) return;
        evento.preventDefault();
        setEncima(false);
        void subir([...evento.dataTransfer.files]);
      }}
      className={`${TARJETA} p-4 transition ${encima ? "ring-2 ring-naranjo/60" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">Fotos</h2>
        <span className={`text-[11px] ${sinUbicar > 0 ? "text-naranjo" : "text-tinta/45"}`}>
          {subiendo ??
            (imagenes.length === 0
              ? "ninguna todavía"
              : sinUbicar > 0
                ? `${sinUbicar} sin ubicar`
                : "todas ubicadas")}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-pretty text-tinta/45">
        {imagenes.length === 0
          ? "Agregá las fotos del trabajo y después arrastrá cada una hasta la sección del documento donde va."
          : "Arrastrá una hasta la sección del documento donde va —o hasta la línea de firma, si es la rúbrica— y sacala con la × de cada foto. Podés soltar archivos acá o sobre el documento."}
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
              className={`group/foto relative cursor-grab rounded-lg border bg-superficie p-1 transition active:cursor-grabbing ${
                puesta ? "border-naranjo/50" : "border-borde hover:border-naranjo/50"
              }`}
            >
              {/* La × aparece al pasar por encima y no siempre: son celdas de 80px y
                  nueve × permanentes convierten el cajón en un campo minado. En
                  pantalla táctil no hay hover, así que ahí queda visible. */}
              <button
                type="button"
                onClick={() => void quitar(imagen.indice, imagen.origen !== "subida")}
                disabled={subiendo !== null}
                title="Quitar esta foto de la oferta"
                aria-label="Quitar esta foto de la oferta"
                className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-borde bg-superficie/95 text-[10px] font-bold leading-none text-tinta/50 opacity-100 transition hover:border-red-500/60 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 sm:opacity-0 sm:group-hover/foto:opacity-100 sm:focus-visible:opacity-100"
              >
                ×
              </button>
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

      {/* El botón va FUERA de la rejilla y no como una celda más: la rejilla corta a
          las tres filas y sigue con scroll, así que con nueve fotos el "+" quedaba
          abajo, dentro del área que hay que desplazar — o sea, escondido justo lo que
          hay que encontrar. Acá está siempre a la vista y es un blanco más grande. */}
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={subiendo !== null}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-borde bg-crema/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-tinta/55 transition hover:border-naranjo/60 hover:bg-naranjo/[0.04] hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo disabled:opacity-40"
      >
        {subiendo ? (
          <RuedaCarga />
        ) : (
          <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
          </svg>
        )}
        {subiendo ?? "Agregar fotos"}
      </button>

      <input
        ref={entrada}
        type="file"
        accept={FORMATOS_LOGO}
        multiple
        className="hidden"
        onChange={(evento) => void subir([...(evento.target.files ?? [])])}
      />

      {error && <p className="mt-2 text-[11px] font-medium text-pretty text-red-600">{error}</p>}
    </section>
  );
}
