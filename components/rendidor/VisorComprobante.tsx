"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { IconDownload, IconExternalLink } from "@tabler/icons-react";

/**
 * Visor del comprobante, dentro de la misma página.
 *
 * Antes la miniatura abría el archivo en otra pestaña, y eso rompe justo lo que
 * uno está haciendo: mirar el documento para cotejar un RUT o un total contra el
 * campo de al lado. Había que cambiar de pestaña, mirar, volver, y buscar de nuevo
 * dónde se estaba.
 *
 * Los PDF los dibuja pdf.js en un canvas nuestro (ver ./VisorPdf.tsx). Antes iban en un
 * <iframe> con el visor del navegador: funcionaba, pero metía adentro del modal una barra
 * en inglés con los iconos y los grises de Chrome, y se veía como otra aplicación pegada.
 * Las imágenes llevan zoom y arrastre propios, porque un <img> no trae ninguno.
 *
 * Se dibuja en un PORTAL a document.body, y eso NO es un detalle: el visor vivía dentro
 * del árbol de la página, y como algún contenedor del layout crea su propio contexto de
 * apilamiento, su z-50 se resolvía DENTRO de ese contenedor. Resultado: la barra lateral
 * quedaba pintada encima del visor, tapándole el nombre del archivo, el borde izquierdo
 * del documento y el pie con las teclas. Desde el body no hay ancestro que lo pueda
 * atrapar, y el z-index de acá se compara con el de la barra de verdad.
 */

/**
 * Encima de la barra lateral, que es z-50 (ver BARRA_FIJA en lib/estilos.ts).
 *
 * El visor tapa la pantalla entera A PROPÓSITO: se abre para cotejar un dato del
 * comprobante contra el formulario, y con la barra lateral asomando por la izquierda el
 * documento quedaba corrido y recortado.
 */
const Z_SOBRE_LA_BARRA = "z-[100]";

// pdf.js pesa ~350 KB y mide el DOM para dibujar: no tiene nada que hacer en el servidor
// ni en el JavaScript inicial de la página. Su chunk se pide al abrir el primer PDF.
const PdfDiferido = dynamic(() => import("./VisorPdf"), { ssr: false, loading: () => null });

const ESCALA_MIN = 1;
const ESCALA_MAX = 6;
const PASO = 0.5;

/**
 * La misma URL, pero que baje el archivo en vez de abrirlo, y con su nombre.
 *
 * El atributo `download` de un <a> no sirve acá: la URL firmada apunta al dominio de
 * Supabase, y en un enlace a otro origen los navegadores IGNORAN `download` — el archivo
 * se abre en una pestaña y encima con el nombre ilegible del bucket. Supabase resuelve
 * esto del lado del servidor con el parámetro `download`, que le hace devolver
 * Content-Disposition: attachment con el nombre que se le pase.
 *
 * Se agrega acá y no en `createSignedUrl` para no firmar dos URLs por comprobante: el
 * parámetro no entra en la firma, así que la misma URL sirve para ver y para descargar.
 */
function urlParaDescargar(url: string, nombre: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(nombre)}`;
}

export interface Comprobante {
  url: string;
  nombre: string;
  esPdf: boolean;
}

export default function VisorComprobante({
  comprobante,
  onCerrar,
}: {
  comprobante: Comprobante;
  onCerrar: () => void;
}) {
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number } | null>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);

  const ajustar = useCallback(() => {
    setEscala(1);
    setPos({ x: 0, y: 0 });
  }, []);

  const cambiarZoom = useCallback((delta: number) => {
    setEscala((e) => {
      const nueva = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Number((e + delta).toFixed(2))));
      // Al volver al tamaño original se recentra: si no, la imagen queda corrida
      // fuera de la vista y parece que desapareció.
      if (nueva === 1) setPos({ x: 0, y: 0 });
      return nueva;
    });
  }, []);

  // Escape para cerrar y +/- para el zoom. El visor tapa la página entera, así que
  // el teclado tiene que alcanzar para manejarlo sin tocar el mouse.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "+" || e.key === "=") cambiarZoom(PASO);
      if (e.key === "-") cambiarZoom(-PASO);
      if (e.key === "0") ajustar();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar, cambiarZoom, ajustar]);

  // Sin esto, la rueda del mouse sobre el visor mueve la página de atrás, y al
  // cerrar uno aparece en otro lugar del formulario.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  // El foco entra al visor al abrirlo: si se quedara en la miniatura de atrás, un
  // Tab llevaría a recorrer el formulario que está tapado.
  useEffect(() => {
    botonCerrar.current?.focus();
  }, []);

  const conZoom = escala > 1;

  // En el primer render del cliente document existe; el guard es por si alguna vez se
  // renderiza en el servidor, donde createPortal no puede correr.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Comprobante: ${comprobante.nombre}`}
      onClick={onCerrar}
      className={`fixed inset-0 ${Z_SOBRE_LA_BARRA} flex flex-col bg-tinta/80 p-4 backdrop-blur-sm sm:p-8`}
    >
      <div
        // El clic dentro del visor no cierra; solo el del fondo.
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-crema/15 bg-superficie"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-borde px-4 py-2.5">
          <p className="min-w-0 truncate text-xs font-medium text-tinta" title={comprobante.nombre}>
            {comprobante.nombre}
          </p>

          <div className="flex shrink-0 items-center gap-1">
            {!comprobante.esPdf && (
              <>
                <BotonVisor
                  onClick={() => cambiarZoom(-PASO)}
                  disabled={escala <= ESCALA_MIN}
                  rotulo="Alejar"
                >
                  −
                </BotonVisor>
                <button
                  type="button"
                  onClick={ajustar}
                  className="min-w-[3.5rem] rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums text-tinta/60 transition hover:bg-crema hover:text-tinta"
                  title="Volver al tamaño original (tecla 0)"
                >
                  {Math.round(escala * 100)}%
                </button>
                <BotonVisor
                  onClick={() => cambiarZoom(PASO)}
                  disabled={escala >= ESCALA_MAX}
                  rotulo="Acercar"
                >
                  +
                </BotonVisor>
                <span className="mx-1 h-4 w-px bg-borde" />
              </>
            )}
            <a
              href={urlParaDescargar(comprobante.url, comprobante.nombre)}
              // download igual, por si algún día el archivo se sirve desde el mismo
              // origen: ahí sí lo respeta el navegador y el parámetro sobra sin molestar.
              download={comprobante.nombre}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-tinta/50 transition hover:bg-crema hover:text-naranjo"
              title={`Descargar ${comprobante.nombre}`}
            >
              <IconDownload size={14} stroke={2} />
              Descargar
            </a>
            <a
              href={comprobante.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-tinta/50 transition hover:bg-crema hover:text-naranjo"
              title="Abrir en otra pestaña"
            >
              <IconExternalLink size={14} stroke={2} />
              Abrir aparte
            </a>
            <button
              ref={botonCerrar}
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar el visor"
              className="rounded-md px-2 py-1 text-lg leading-none text-tinta/50 transition hover:bg-crema hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
            >
              ×
            </button>
          </div>
        </div>

        {comprobante.esPdf ? (
          <PdfDiferido url={comprobante.url} nombre={comprobante.nombre} />
        ) : (
          <div
            className={`min-h-0 flex-1 overflow-hidden bg-crema/60 ${
              conZoom ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            onDoubleClick={() => (conZoom ? ajustar() : cambiarZoom(1.5))}
            onPointerDown={(e) => {
              if (!conZoom) return;
              arrastre.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!arrastre.current) return;
              setPos({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y });
            }}
            onPointerUp={() => {
              arrastre.current = null;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado: no debe pasar por el optimizador, que la cachearía en la CDN */}
            <img
              src={comprobante.url}
              alt={`Comprobante: ${comprobante.nombre}`}
              draggable={false}
              style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})` }}
              className="h-full w-full origin-center object-contain transition-transform duration-100 will-change-transform"
            />
          </div>
        )}

        <p className="shrink-0 border-t border-borde px-4 py-2 text-[10px] text-tinta/35">
          {comprobante.esPdf
            ? "Flechas ← → para las páginas · teclas + − 0 para el zoom · Escape para cerrar."
            : "Doble clic para acercar · arrastra para mover · teclas + − 0 · Escape para cerrar."}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function BotonVisor({
  children,
  onClick,
  disabled,
  rotulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rotulo}
      title={rotulo}
      className="h-7 w-7 rounded-md text-sm font-bold text-tinta/60 transition hover:bg-crema hover:text-tinta disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
