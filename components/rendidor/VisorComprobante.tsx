"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Visor del comprobante, dentro de la misma página.
 *
 * Antes la miniatura abría el archivo en otra pestaña, y eso rompe justo lo que
 * uno está haciendo: mirar el documento para cotejar un RUT o un total contra el
 * campo de al lado. Había que cambiar de pestaña, mirar, volver, y buscar de nuevo
 * dónde se estaba.
 *
 * Los PDF van en un <iframe> con el visor nativo del navegador, que ya trae su
 * propio zoom, búsqueda y paginación: reimplementar eso sería peor en todas las
 * dimensiones. Las imágenes sí llevan zoom y arrastre propios, porque un <img> no
 * trae ninguno.
 */

const ESCALA_MIN = 1;
const ESCALA_MAX = 6;
const PASO = 0.5;

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Comprobante: ${comprobante.nombre}`}
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex flex-col bg-tinta/80 p-4 backdrop-blur-sm sm:p-8"
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
              href={comprobante.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-tinta/50 transition hover:bg-crema hover:text-naranjo"
            >
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
          // El visor nativo del navegador ya trae zoom, búsqueda y paginación.
          <iframe src={comprobante.url} title={comprobante.nombre} className="min-h-0 flex-1 bg-crema" />
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
            ? "Escape para cerrar."
            : "Doble clic para acercar · arrastra para mover · teclas + − 0 · Escape para cerrar."}
        </p>
      </div>
    </div>
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
