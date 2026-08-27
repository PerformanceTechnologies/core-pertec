"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OfertaCanonica } from "@/lib/ofertas/tipos";
import { asignarEnRuta } from "@/lib/ofertas/rutas";
import { prepararDocumento } from "@/lib/ofertas/edicion-dom";
import { avisoDeTamano, leerRespuesta } from "@/lib/subidas";
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
  const router = useRouter();
  const marco = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cambiarla vuelve a pedir la maqueta: es lo que renumera las secciones y saca las
  // filas que quedaron vacías, que son cambios de estructura y los hace el servidor.
  const [revision, setRevision] = useState(0);
  const [moviendo, setMoviendo] = useState<string | null>(null);

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

  /**
   * Pone una foto en una sección, o la saca. Guarda al instante.
   *
   * La ubicación no espera a "Guardar cambios" y es a propósito: soltar una foto en
   * un lugar ES la decisión. Además así no se mezcla con el texto que alguien esté
   * escribiendo sin guardar — son dos caminos distintos hacia la misma oferta.
   */
  const ubicar = useCallback(
    async (indice: number, seccion: string | null) => {
      setMoviendo(seccion ? "Poniendo la foto…" : "Sacando la foto…");
      setError(null);
      try {
        const respuesta = await fetch(`/api/ofertas/${id}/ubicar-imagen`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ indice, seccion }),
        });
        await leerRespuesta(respuesta);
        // Volver a pedir la maqueta es lo que la dibuja en su lugar, con su número de
        // pie y su epígrafe: esa estructura la arma el servidor, no esta pantalla.
        setRevision((r) => r + 1);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo mover la foto.");
      } finally {
        setMoviendo(null);
      }
    },
    [id, router],
  );

  /** Archivos soltados desde el escritorio: se suben y caen donde los soltaron. */
  const subirYUbicar = useCallback(
    async (archivos: File[], seccion: string) => {
      setError(null);
      try {
        for (const [posicion, archivo] of archivos.entries()) {
          const aviso = avisoDeTamano(archivo);
          if (aviso) throw new Error(aviso);
          setMoviendo(
            archivos.length > 1 ? `Subiendo ${posicion + 1} de ${archivos.length}…` : "Subiendo la foto…",
          );
          const cuerpo = new FormData();
          cuerpo.set("archivo", archivo);
          const respuesta = await fetch(`/api/ofertas/${id}/imagenes`, { method: "POST", body: cuerpo });
          const { agregadas } = await leerRespuesta<{ agregadas: number[] }>(respuesta);
          // Subir y ubicar son dos pasos porque son dos decisiones distintas en todo
          // el resto del módulo; acá el gesto es uno solo y los encadena.
          for (const indice of agregadas) {
            await fetch(`/api/ofertas/${id}/ubicar-imagen`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ indice, seccion }),
            });
          }
        }
        setRevision((r) => r + 1);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
      } finally {
        setMoviendo(null);
      }
    },
    [id, router],
  );

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
      alSoltarImagen: (indice, seccion) => void ubicar(indice, seccion),
      alSoltarArchivos: (archivos, seccion) => void subirYUbicar(archivos, seccion),
      alQuitarImagen: (indice) => void ubicar(indice, null),
    });
  }, [editable, ubicar, subirYUbicar]);

  return (
    <div className="flex flex-col gap-3">
      {/* Una sola fila: el aviso y el botón compartían el ancho pero el texto era
          tan largo que envolvía y el botón terminaba solo en su propia línea, con lo
          que la pantalla sumaba dos filas de chrome antes del papel. Acortado, entran
          los dos juntos. Lo que se sacó —que la numeración y los totales los pone el
          servidor— ya lo dice el encabezado de la pantalla. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[11px] text-pretty text-tinta/50">
          {editable
            ? "Escribí sobre el documento. Para agregar o quitar filas, usá el formulario."
            : "La oferta está emitida: el documento es de solo lectura."}
          {/* El aviso va acá y no junto a las fotos: al soltar una, la vista está en
              el documento, que es donde se espera ver que algo pasó. */}
          {moviendo && <span className="ml-2 font-medium text-naranjo">{moviendo}</span>}
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

      {/* En un teléfono el documento NO se reflowa: es una hoja A4 con medidas en
          milímetros, y apretarla a 375px la deja ilegible y distinta del PDF. Se
          conserva su ancho y se recorre de lado, como cualquier PDF en un teléfono.
          El aire lateral se saca en chico: con 375px de pantalla, 24 de padding a
          cada lado es una décima parte del documento. */}
      <div className="overflow-x-auto rounded-xl border border-borde bg-white p-2 sm:p-6">
        {html ? (
          <iframe
            ref={marco}
            title="Documento de la oferta"
            srcDoc={html}
            onLoad={preparar}
            sandbox="allow-same-origin"
            className="block w-full min-w-[680px]"
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
