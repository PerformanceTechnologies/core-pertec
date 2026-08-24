"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OfertaCanonica } from "@/lib/ofertas/tipos";
import { asignarEnRuta } from "@/lib/ofertas/rutas";
import { prepararDocumento } from "@/lib/ofertas/edicion-dom";
import RuedaCarga from "@/components/RuedaCarga";

/**
 * Editar sobre el documento, no sobre un formulario.
 *
 * Se escribe encima de la misma maqueta que después se imprime —el HTML lo arma
 * `plantilla.ts`, igual que para el PDF— así que lo que se ve mientras se corrige
 * es el resultado, no una aproximación. Es lo más parecido a Word que puede ser
 * esto sin dejar de ser lo que es.
 *
 * ── Lo que NO cambia ───────────────────────────────────────────────────────
 *
 * Lo que se guarda siguen siendo datos. Cada texto del documento lleva su
 * `data-campo` con la ruta del dato que lo produjo, así que editarlo escribe en ese
 * campo y no en un pedazo de HTML suelto. Eso es lo que mantiene en pie todo lo
 * demás: el servidor puede seguir sumando el total, numerando las secciones,
 * levantando los controles y volviendo a imprimir el documento en otro formato. Si
 * lo guardado fuera el HTML tipeado, nada de eso podría existir.
 *
 * Por eso hay cosas que acá no se tocan: las celdas con `data-calculado` —el total
 * neto, la dotación, las horas— no son editables y se recalculan solas mientras se
 * escribe. Un total escrito a mano es exactamente el error que este módulo existe
 * para detectar.
 *
 * Y las que cambian la estructura —agregar una fila, crear una sección— siguen en
 * el formulario: mover una fila cambia la numeración, los cortes de página y el
 * índice, y eso lo arma el servidor. "Actualizar vista" lo vuelve a pedir.
 *
 * ── Por qué un iframe ──────────────────────────────────────────────────────
 *
 * El documento trae su propia hoja de estilos, con medidas en milímetros y las
 * tipografías del maestro. Metido en la página heredaría los estilos de la
 * aplicación y dejaría de ser el documento; adentro del iframe es exactamente el
 * archivo que imprime Chromium.
 *
 * Lo que lo mantiene inerte es el `sandbox` sin `allow-scripts`: adentro no se
 * ejecuta nada, y el contenido salió de un borrador que escribió otra persona. El
 * `allow-same-origin` es lo que permite editarlo desde acá. Y ojo con esto, que no
 * se ve: el documento entra por `srcDoc`, así que hereda el origen y la política de
 * ESTA página — la CSP que manda la ruta no lo alcanza, y es por eso que el
 * atributo `sandbox` no es un cinturón de más sino el control principal.
 */
export default function DocumentoEditable({
  id,
  oferta,
  editable,
  onCambio,
}: {
  id: string;
  oferta: OfertaCanonica;
  editable: boolean;
  /** La misma función con la que edita el formulario: hay un solo estado. */
  onCambio: (aplicar: (borrador: OfertaCanonica) => void) => void;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cambiarla vuelve a pedir la maqueta: es lo que renumera las secciones y saca las
  // filas que quedaron vacías, que son cambios de estructura y los hace el servidor.
  const [revision, setRevision] = useState(0);

  // La copia con la que trabaja el documento. Las ediciones se aplican acá al
  // instante —para poder recalcular los totales en la misma tecla— y además viajan
  // al estado de la página, que es lo que se guarda.
  const modelo = useRef<OfertaCanonica>(oferta);
  const ultima = useRef<OfertaCanonica>(oferta);
  // Los manejadores quedan enganchados al documento desde que carga, así que ven el
  // `onCambio` de ese momento. Por la ref siempre llaman al vigente.
  const avisar = useRef(onCambio);
  // Sin arreglo de dependencias: después de cada dibujo, las refs quedan al día. Va
  // en un efecto y no en el cuerpo porque escribir una ref durante el render deja al
  // compilador de React sin saber cuándo cambió.
  useEffect(() => {
    ultima.current = oferta;
    avisar.current = onCambio;
  });

  const soltar = useRef<(() => void) | null>(null);
  useEffect(() => () => soltar.current?.(), []);

  useEffect(() => {
    const control = new AbortController();
    // El "cargando" lo prende quien dispara la recarga —el montaje con su valor
    // inicial, el botón al pedir otra vista—: prenderlo acá dentro obliga a un
    // dibujo de más por cada uno.
    modelo.current = structuredClone(ultima.current);

    fetch(`/api/ofertas/${id}/vista`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contenido: modelo.current }),
      signal: control.signal,
    })
      .then(async (respuesta) => {
        const texto = await respuesta.text();
        if (!respuesta.ok) throw new Error(texto || "No se pudo armar el documento.");
        return texto;
      })
      .then((texto) => setHtml(texto))
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        setError(e instanceof Error ? e.message : "No se pudo armar el documento.");
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });

    return () => control.abort();
  }, [id, revision]);

  const preparar = useCallback(() => {
    const doc = marco.current?.contentDocument;
    // El `about:blank` con el que nace un iframe también dispara load.
    if (!doc || !doc.querySelector(".portada")) return;

    soltar.current?.();
    soltar.current = prepararDocumento(doc, {
      editable,
      oferta: () => modelo.current,
      alEditar: (ruta, texto, tipo) => {
        avisar.current((borrador) => {
          asignarEnRuta(borrador, ruta, texto, tipo);
        });
      },
      // El alto lo pone la página: así el documento se lee de corrido, sin una
      // barra de desplazamiento adentro de otra.
      alMedir: (alto) => {
        if (marco.current) marco.current.style.height = `${alto}px`;
      },
    });
  }, [editable]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-pretty text-tinta/50">
          {editable
            ? "Escribí directamente sobre el documento. Los totales, la numeración y el índice los pone el servidor; para agregar o quitar filas, usá el formulario."
            : "La oferta está emitida: el documento es de solo lectura."}
        </p>
        <button
          type="button"
          onClick={() => {
            setCargando(true);
            setError(null);
            setRevision((n) => n + 1);
          }}
          disabled={cargando}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/70 transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo disabled:opacity-40"
        >
          {cargando && <RuedaCarga />}
          {cargando ? "Armando…" : "Actualizar vista"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-600/30 bg-red-600/[0.06] px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-borde bg-white">
        {html ? (
          <iframe
            ref={marco}
            title="Documento de la oferta"
            srcDoc={html}
            onLoad={preparar}
            sandbox="allow-same-origin"
            className="block w-full"
          />
        ) : (
          <div className="flex h-64 items-center justify-center gap-2 text-xs text-tinta/45">
            {cargando && <RuedaCarga />}
            {cargando ? "Armando el documento…" : "El documento no se pudo mostrar."}
          </div>
        )}
      </div>
    </div>
  );
}
