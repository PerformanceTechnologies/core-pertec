"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
// La capa de texto necesita su CSS o los caracteres quedan dibujados ENCIMA del canvas,
// desalineados y visibles: el documento se ve con el texto duplicado y corrido.
import "react-pdf/dist/Page/TextLayer.css";
import { IconChevronLeft, IconChevronRight, IconRotateClockwise, IconZoomIn, IconZoomOut } from "@tabler/icons-react";

// El PDF dibujado por nosotros con pdf.js, en vez del <iframe> con el visor del navegador.
//
// Por qué se cambió: el visor nativo trae su propia barra —"Automatic Zoom", "of 1", los
// iconos de Chrome— en inglés, con su propio gris y su propio alto, y dentro de un modal
// del core se veía como una ventana de otra aplicación pegada adentro. Con pdf.js el
// documento es un <canvas> nuestro y la barra es la del core: mismos botones, misma
// tipografía, mismos colores, y en español.
//
// El worker se sirve de /public y lo copia el build (ver scripts/copiar-worker-pdf.mjs).
// Tiene que ser la MISMA versión que pdfjs-dist o pdf.js falla con "The API version does
// not match the Worker version" y el visor queda en blanco sin decir nada.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

const ESCALA_MIN = 0.5;
const ESCALA_MAX = 4;
const PASO = 0.25;

/** Ancho de la página en px cuando la escala es 1: entra un A4 completo sin scroll lateral. */
const ANCHO_BASE = 820;

export default function VisorPdf({ url, nombre }: { url: string; nombre: string }) {
  const [paginas, setPaginas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [escala, setEscala] = useState(1);
  const [giro, setGiro] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // Teclas: flechas para las páginas, + − 0 para el zoom. Las mismas que ya tenía el
  // visor de imágenes, así que el visor se maneja igual sea lo que sea que haya adentro.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") setPagina((p) => Math.min(paginas || 1, p + 1));
      if (e.key === "ArrowLeft" || e.key === "PageUp") setPagina((p) => Math.max(1, p - 1));
      if (e.key === "+" || e.key === "=") setEscala((s) => Math.min(ESCALA_MAX, s + PASO));
      if (e.key === "-") setEscala((s) => Math.max(ESCALA_MIN, s - PASO));
      if (e.key === "0") setEscala(1);
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [paginas]);

  // Al cambiar de página el scroll vuelve arriba: si no, se entra a la página nueva por
  // la mitad, donde había quedado la anterior.
  useEffect(() => {
    caja.current?.scrollTo({ top: 0 });
  }, [pagina]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-borde bg-crema/40 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <BotonBarra
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            rotulo="Página anterior"
          >
            <IconChevronLeft size={15} stroke={2} />
          </BotonBarra>
          <span className="min-w-[4.5rem] text-center text-[11px] tabular-nums text-tinta/60">
            {paginas > 0 ? `${pagina} de ${paginas}` : "…"}
          </span>
          <BotonBarra
            onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
            disabled={paginas === 0 || pagina >= paginas}
            rotulo="Página siguiente"
          >
            <IconChevronRight size={15} stroke={2} />
          </BotonBarra>
        </div>

        <div className="flex items-center gap-1">
          <BotonBarra
            onClick={() => setEscala((s) => Math.max(ESCALA_MIN, s - PASO))}
            disabled={escala <= ESCALA_MIN}
            rotulo="Alejar"
          >
            <IconZoomOut size={15} stroke={2} />
          </BotonBarra>
          <button
            type="button"
            onClick={() => setEscala(1)}
            title="Volver al tamaño original (tecla 0)"
            className="min-w-[3.25rem] rounded-md px-1.5 py-1 text-[11px] font-semibold tabular-nums text-tinta/60 transition hover:bg-crema hover:text-tinta"
          >
            {Math.round(escala * 100)}%
          </button>
          <BotonBarra
            onClick={() => setEscala((s) => Math.min(ESCALA_MAX, s + PASO))}
            disabled={escala >= ESCALA_MAX}
            rotulo="Acercar"
          >
            <IconZoomIn size={15} stroke={2} />
          </BotonBarra>
          <span className="mx-0.5 h-4 w-px bg-borde" />
          <BotonBarra onClick={() => setGiro((g) => (g + 90) % 360)} rotulo="Girar">
            <IconRotateClockwise size={15} stroke={2} />
          </BotonBarra>
        </div>
      </div>

      <div ref={caja} className="min-h-0 flex-1 overflow-auto bg-crema/60 p-4">
        {error ? (
          // Un PDF que pdf.js no puede abrir no deja el visor en blanco: se dice, y queda
          // el "Abrir aparte" de la barra de arriba como salida.
          <p className="mx-auto max-w-sm rounded-lg border border-borde bg-superficie px-4 py-3 text-center text-xs text-tinta/60">
            No se pudo mostrar este PDF acá ({error}). Probá con «Abrir aparte».
          </p>
        ) : (
          <Document
            file={url}
            onLoadSuccess={({ numPages }) => setPaginas(numPages)}
            onLoadError={(e) => setError(e.message)}
            loading={<Esqueleto />}
            error={<Esqueleto />}
            className="flex justify-center"
          >
            <Page
              pageNumber={pagina}
              width={ANCHO_BASE * escala}
              rotate={giro}
              // El texto seleccionable sí (sirve para copiar un RUT del comprobante); las
              // anotaciones no, que en una boleta no hay y su capa solo agrega peso.
              renderTextLayer
              renderAnnotationLayer={false}
              loading={<Esqueleto />}
              className="shadow-[0_1px_2px_rgba(23,20,17,0.06),0_12px_32px_-12px_rgba(23,20,17,0.18)]"
            />
          </Document>
        )}
      </div>
    </>
  );
}

/** El hueco de una hoja mientras se dibuja, para que la caja no salte de alto. */
function Esqueleto() {
  return <div className="mx-auto h-[1060px] w-[820px] max-w-full animate-pulse rounded-sm bg-superficie/70" />;
}

function BotonBarra({
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
      className="flex h-7 w-7 items-center justify-center rounded-md text-tinta/55 transition hover:bg-crema hover:text-tinta disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
