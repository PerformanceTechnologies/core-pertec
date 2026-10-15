"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconCalendarDue, IconChevronDown, IconCircleCheck } from "@tabler/icons-react";
import { nombreDeModulo, type Atencion, type SaludDelContrato } from "@/lib/contratos/dashboard-modelo";

/** Cuántos puntos se listan en el cuadro; el resto está a un clic, en «Requiere atención». */
const MAXIMO_EN_EL_CUADRO = 6;

/**
 * El semáforo del contrato («Con atención», «Requiere acción»…) como un botón: al hacer clic abre
 * un cuadro chico con QUÉ es lo que está pidiendo atención.
 *
 * El cuadro lleva un mini resumen —cuántos puntos hay, cuántos ya se pasaron y de qué módulos— y
 * los primeros de la lista, cada uno con su enlace a donde se arregla. No repite la lista completa
 * (para eso está «Requiere atención» más abajo): es la respuesta rápida a «¿qué es eso?».
 *
 * Se cierra con Escape, con un clic afuera o al elegir un enlace. Es un botón de verdad: se alcanza
 * con el teclado y avisa si está abierto (aria-expanded).
 */
export default function InsigniaDeSalud({
  salud,
  atenciones,
  clases,
  icono,
}: {
  salud: SaludDelContrato;
  atenciones: Atencion[];
  /** Los colores del semáforo según su tono (los decide el bloque de arriba). */
  clases: string;
  icono: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const cuadro = useRef<HTMLDivElement>(null);
  const id = useId();

  // El cuadro va en un portal sobre <body> y no dentro del bloque azul: ese bloque recorta lo que
  // se sale de él (overflow: hidden, por el dibujo del fondo), y el cuadro es más alto que el
  // espacio que queda debajo del semáforo. Se coloca con las coordenadas del botón.
  useLayoutEffect(() => {
    if (!abierto) return;
    function colocar() {
      const caja = boton.current?.getBoundingClientRect();
      if (!caja) return;
      const ancho = Math.min(352, window.innerWidth - 32);
      const izquierda = Math.min(Math.max(16, caja.left), window.innerWidth - ancho - 16);
      setPosicion({ top: caja.bottom + 8, left: izquierda });
    }
    colocar();
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => {
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, true);
    };
  }, [abierto]);

  // Escape y clic afuera: solo mientras está abierto, para no escuchar el documento entero siempre.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    const alHacerClic = (e: MouseEvent) => {
      const destino = e.target as Node;
      if (!boton.current?.contains(destino) && !cuadro.current?.contains(destino)) setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("mousedown", alHacerClic);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("mousedown", alHacerClic);
    };
  }, [abierto]);

  const criticas = atenciones.filter((a) => a.tono === "critico").length;
  const porVencer = atenciones.length - criticas;

  // De qué módulos viene, del que más aporta al que menos.
  const porModulo = new Map<string, number>();
  for (const a of atenciones) {
    const nombre = nombreDeModulo(a.modulo);
    porModulo.set(nombre, (porModulo.get(nombre) ?? 0) + 1);
  }
  const modulos = [...porModulo.entries()].sort((a, b) => b[1] - a[1]);
  const visibles = atenciones.slice(0, MAXIMO_EN_EL_CUADRO);

  return (
    <div className="inline-block">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={id}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${clases}`}
      >
        {icono}
        {salud.titulo}
        <IconChevronDown size={13} aria-hidden className={`transition ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && posicion && createPortal(
        <div
          ref={cuadro}
          id={id}
          role="dialog"
          aria-label="Qué requiere atención"
          style={{ top: posicion.top, left: posicion.left, width: Math.min(352, window.innerWidth - 32) }}
          className="fixed z-[60] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-borde bg-superficie p-3.5 text-left text-tinta shadow-[0_18px_40px_-14px_rgba(15,28,51,0.45)]"
        >
          {atenciones.length === 0 ? (
            <p className="flex items-start gap-2 text-sm">
              <IconCircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
              <span>
                <b className="block">Sin pendientes urgentes</b>
                <span className="text-xs text-gris">No hay vencimientos, atrasos ni desvíos a la vista.</span>
              </span>
            </p>
          ) : (
            <>
              <p className="text-sm font-bold">
                {atenciones.length} {atenciones.length === 1 ? "punto" : "puntos"} para mirar
              </p>
              <p className="mt-0.5 text-xs text-gris">
                {criticas > 0 && <span className="font-bold text-red-600">{criticas} ya {criticas === 1 ? "se pasó" : "se pasaron"}</span>}
                {criticas > 0 && porVencer > 0 && " · "}
                {porVencer > 0 && <span className="font-bold text-amber-600">{porVencer} por vencer o fuera de lo previsto</span>}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {modulos.map(([nombre, n]) => (
                  <span key={nombre} className="rounded-md bg-fondo px-2 py-0.5 text-[11px] font-semibold text-gris">
                    {nombre} <b className="text-tinta">{n}</b>
                  </span>
                ))}
              </div>

              <ul className="-mx-1.5 mt-2.5 space-y-0.5 border-t border-borde pt-2">
                {visibles.map((a) => (
                  <li key={a.clave}>
                    <Link
                      href={a.href}
                      onClick={() => setAbierto(false)}
                      className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-cian-lavado/60"
                    >
                      <span
                        className={`mt-0.5 shrink-0 ${a.tono === "critico" ? "text-red-600" : "text-amber-600"}`}
                        aria-hidden
                      >
                        {a.tono === "critico" ? <IconAlertTriangle size={15} /> : <IconCalendarDue size={15} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold leading-tight">{a.titulo}</span>
                        <span className="block truncate text-[11px] text-gris">{a.detalle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <a
                href="#atencion"
                onClick={() => setAbierto(false)}
                className="mt-2 block rounded-lg bg-fondo px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-azul transition hover:bg-cian-lavado"
              >
                {atenciones.length > MAXIMO_EN_EL_CUADRO
                  ? `Ver los ${atenciones.length} en «Requiere atención»`
                  : "Ir a «Requiere atención»"}
              </a>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
