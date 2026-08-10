"use client";

import { useEffect, useState } from "react";
import RuedaCarga from "@/components/RuedaCarga";

/**
 * Lo que se ve mientras se arma el resumen del día.
 *
 * La primera visita de la jornada lee el buzón completo y lo pasa por el modelo,
 * y eso tarda entre veinte segundos y más de un minuto según cuánto correo haya.
 * Un esqueleto gris quieto durante todo ese rato parece una página colgada.
 *
 * Los mensajes son los pasos REALES del pipeline, en el orden en que ocurren
 * (ver lib/resumen-diario/datos.ts). Lo que no es real es el momento en que cambia
 * cada uno: el servidor no reporta avance, así que van por tiempo. Por eso
 * tampoco hay barra de progreso ni porcentaje — eso sí sería inventar un dato.
 * El último mensaje se queda fijo en vez de volver al principio: reiniciar el
 * ciclo daría la impresión de que algo se reintentó.
 */

const PASOS = [
  "Conectando con tu buzón",
  "Leyendo los correos de los últimos días",
  "Revisando tu calendario",
  "Separando lo que requiere una respuesta",
  "Agrupando los correos por tema",
  "Recapitulando la información",
  "Ordenando las prioridades del día",
  "Dando los últimos ajustes",
];

const MS_POR_PASO = 4500;
// A partir de acá se avisa que va lento. No es un error: un buzón con mucho
// correo tarda esto, y decirlo evita que alguien recargue y empiece de nuevo.
const MS_PARA_AVISAR = 45_000;

export default function ResumenCargando() {
  const [paso, setPaso] = useState(0);
  const [lento, setLento] = useState(false);

  useEffect(() => {
    const avance = setInterval(() => {
      // Se detiene en el último en vez de dar la vuelta.
      setPaso((p) => (p < PASOS.length - 1 ? p + 1 : p));
    }, MS_POR_PASO);
    const aviso = setTimeout(() => setLento(true), MS_PARA_AVISAR);

    return () => {
      clearInterval(avance);
      clearTimeout(aviso);
    };
  }, []);

  return (
    <div
      className="mt-8 rounded-2xl border border-borde bg-superficie px-6 py-10"
      // aria-live para que un lector de pantalla anuncie los cambios de paso, y
      // "polite" para que espere a que termine de leer lo anterior.
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-auto max-w-md">
        <p className="flex items-center gap-2.5 font-condensed text-lg font-bold tracking-tight text-tinta">
          <span className="text-naranjo">
            <RuedaCarga />
          </span>
          Armando tu resumen
        </p>

        <ol className="mt-5 flex flex-col gap-2.5">
          {PASOS.map((texto, i) => {
            const hecho = i < paso;
            const actual = i === paso;
            return (
              <li
                key={texto}
                className={`flex items-baseline gap-3 text-sm transition-colors duration-500 ${
                  actual ? "text-tinta" : hecho ? "text-tinta/45" : "text-tinta/20"
                }`}
              >
                {/* Un punto que crece en el paso actual. Los ya pasados quedan
                    tenues, los que faltan casi invisibles: así la lista misma
                    muestra dónde va sin necesidad de un número. */}
                <span
                  className={`mt-1.5 shrink-0 rounded-full transition-all duration-500 ${
                    actual ? "h-2 w-2 bg-naranjo" : hecho ? "h-1.5 w-1.5 bg-teal" : "h-1.5 w-1.5 bg-tinta/15"
                  }`}
                />
                <span className={actual ? "font-medium" : ""}>{texto}</span>
              </li>
            );
          })}
        </ol>

        <p className="mt-6 border-t border-borde pt-4 text-xs text-pretty text-tinta/45">
          {lento
            ? "Está tardando más de lo habitual, pero sigue trabajando. No recargues la página: se perdería el avance y habría que empezar de nuevo."
            : "Solo la primera visita del día tarda. Después queda guardado y abre al instante."}
        </p>
      </div>
    </div>
  );
}
