"use client";

/**
 * Los avisos de la rendición, abajo a la derecha y con su × para cerrarlos.
 *
 * Antes eran dos tiras de doce píxeles debajo del título: una para el error y otra para
 * el aviso. Tres problemas, los tres reales:
 *
 *  - Se veían solo ARRIBA. Quien está corrigiendo el gasto once, o eligiendo proveedores
 *    al final del paso 3, está a tres pantallas de ahí: apretaba "cargar a Odoo", no
 *    pasaba nada visible y volvía a apretar.
 *  - Se pisaban entre sí. Un solo hueco para el error significaba que el segundo problema
 *    borraba al primero, y de dos comprobantes que fallaron se veía uno.
 *  - Se iban solos con el siguiente evento, así que no había nada que leer con calma:
 *    el aviso de "se cargó pero revisá esto" desaparecía al mover cualquier cosa.
 *
 * Acá quedan fijos sobre la página, apilados, y NO se cierran solos: cada uno se cierra
 * con su ×. Un aviso que se va a los cinco segundos es un aviso que alguien no leyó.
 */

import { useEffect, useRef } from "react";

/** Qué tan grave es. Define el color y si se anuncia con urgencia al lector de pantalla. */
export type TonoDeAviso = "error" | "atencion" | "ok";

export interface Aviso {
  id: string;
  tono: TonoDeAviso;
  /** Una línea, en grande: es lo que se lee de reojo desde el otro extremo de la página. */
  titulo: string;
  /** El detalle, si hace falta. Admite saltos de línea. */
  detalle?: string;
  /**
   * Lleva a DÓNDE está el problema.
   *
   * Es la mitad del arreglo: decir "faltan 3 proveedores" sin llevar hasta ellos deja a
   * la persona buscando cuál de dieciséis tarjetas es. Ver `irA` en PanelRendicion.
   */
  accion?: { texto: string; alPulsar: () => void };
}

const ESTILO: Record<TonoDeAviso, { caja: string; punto: string; titulo: string }> = {
  error: {
    caja: "border-red-600/30 bg-red-50",
    punto: "bg-red-600",
    titulo: "text-red-700",
  },
  atencion: {
    caja: "border-naranjo/35 bg-naranjo/[0.07]",
    punto: "bg-naranjo",
    titulo: "text-naranjo",
  },
  ok: { caja: "border-teal/30 bg-teal/[0.07]", punto: "bg-teal", titulo: "text-teal" },
};

export default function Avisos({
  avisos,
  alCerrar,
}: {
  avisos: Aviso[];
  alCerrar: (id: string) => void;
}) {
  // El más nuevo va arriba de la pila y se lleva el foco del lector de pantalla. Sin
  // esto, un error que aparece con la página scrolleada abajo no se anuncia.
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    ultimo.current = avisos[0]?.id ?? null;
  }, [avisos]);

  if (avisos.length === 0) return null;

  return (
    // pointer-events-none en el contenedor y auto en cada tarjeta: la columna ocupa la
    // esquina entera y sin esto tapaba los clics de lo que hay debajo, incluido el botón
    // de cargar a Odoo, que está justo ahí.
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {avisos.map((a) => {
        const estilo = ESTILO[a.tono];
        return (
          <div
            key={a.id}
            role={a.tono === "error" ? "alert" : "status"}
            className={`animar-entrada pointer-events-auto rounded-xl border px-4 py-3 shadow-lg shadow-tinta/10 ${estilo.caja}`}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${estilo.punto}`} />
              <div className="min-w-0 flex-1">
                <p className={`font-condensed text-[15px] font-bold leading-tight ${estilo.titulo}`}>
                  {a.titulo}
                </p>
                {a.detalle && (
                  <p className="mt-1 whitespace-pre-line text-xs text-pretty text-tinta/70">
                    {a.detalle}
                  </p>
                )}
                {a.accion && (
                  <button
                    type="button"
                    onClick={a.accion.alPulsar}
                    className="mt-2 rounded-md border border-tinta/15 bg-superficie px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo"
                  >
                    {a.accion.texto}
                  </button>
                )}
              </div>
              {/* La × y no un temporizador: el aviso lo cierra quien lo leyó. */}
              <button
                type="button"
                onClick={() => alCerrar(a.id)}
                aria-label="Cerrar aviso"
                className="-mr-1 -mt-1 shrink-0 rounded-md px-1.5 py-0.5 text-base leading-none text-tinta/35 transition hover:bg-tinta/[0.06] hover:text-tinta"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
