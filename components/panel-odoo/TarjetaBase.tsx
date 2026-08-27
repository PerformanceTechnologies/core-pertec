"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { IconMaximize } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import { haceCuanto } from "@/lib/panel-odoo/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import ModalExpandirTarjeta from "./ModalExpandirTarjeta";

// Un acento de color por modulo (de la paleta de marca existente, ninguno
// nuevo) para que las tarjetas se distingan de un vistazo: la superficie del
// tema con un lavado de ese color encima + titulo en ese mismo color.
//
// El fondo y el borde salen de `.tarjeta-modulo` + `.acento-*` (globals.css) y
// no de utilidades de Tailwind. El primer intento era `bg-naranjo/[0.06]`, un
// tinte SIN superficie propia: en claro pasaba, y en oscuro la tarjeta era una
// mancha marron directamente sobre el fondo de la pagina -- dejaba de leerse
// como una tarjeta. Con color-mix contra la superficie, el mismo lavado
// funciona en los dos temas.
//
// "boton" es el estilo del botón de expandir: fondo tintado SIEMPRE visible
// (no solo al hover) + resplandor de color al pasar el mouse, para que se
// note que es clickeable de entrada -- un ícono que solo cambia al hover no
// avisa que hay algo ahí (feedback de un usuario real tras probarlo).
const ACENTOS = {
  naranjo: {
    bg: "tarjeta-modulo acento-naranjo",
    titulo: "text-naranjo",
    boton: "text-naranjo bg-naranjo/10 ring-1 ring-naranjo/25 hover:bg-naranjo/20 hover:ring-naranjo/50 hover:shadow-[0_0_12px_2px_rgba(200,82,23,0.35)]",
  },
  teal: {
    bg: "tarjeta-modulo acento-teal",
    titulo: "text-teal",
    boton: "text-teal bg-teal/10 ring-1 ring-teal/25 hover:bg-teal/20 hover:ring-teal/50 hover:shadow-[0_0_12px_2px_rgba(0,160,128,0.35)]",
  },
  naranjoSuave: {
    bg: "tarjeta-modulo acento-naranjo-suave",
    titulo: "text-naranjo-suave",
    boton: "text-naranjo-suave bg-naranjo-suave/10 ring-1 ring-naranjo-suave/25 hover:bg-naranjo-suave/20 hover:ring-naranjo-suave/50 hover:shadow-[0_0_12px_2px_rgba(224,122,61,0.35)]",
  },
  tealSuave: {
    bg: "tarjeta-modulo acento-teal-suave",
    titulo: "text-teal-suave",
    boton: "text-teal-suave bg-teal-suave/10 ring-1 ring-teal-suave/25 hover:bg-teal-suave/20 hover:ring-teal-suave/50 hover:shadow-[0_0_12px_2px_rgba(53,184,155,0.35)]",
  },
  gris: {
    bg: "tarjeta-modulo acento-gris",
    titulo: "text-gris",
    boton: "text-gris bg-gris/10 ring-1 ring-gris/25 hover:bg-gris/20 hover:ring-gris/50 hover:shadow-[0_0_12px_2px_rgba(140,133,120,0.35)]",
  },
  grisSuave: {
    bg: "tarjeta-modulo acento-gris-suave",
    titulo: "text-gris",
    boton: "text-gris bg-gris/10 ring-1 ring-gris/25 hover:bg-gris/20 hover:ring-gris/50 hover:shadow-[0_0_12px_2px_rgba(140,133,120,0.35)]",
  },
} as const;

export type AcentoTarjeta = keyof typeof ACENTOS;

export default function TarjetaBase({
  titulo,
  acento,
  icono,
  ejecucion,
  contenidoExpandido,
  children,
}: {
  titulo: string;
  acento: AcentoTarjeta;
  icono: string; // clave de lib/iconos.tsx
  ejecucion?: EjecucionOdoo | null;
  // Server Component ya renderizado (fetch propio, tabla completa, etc.) que
  // se muestra en el modal al expandir. Si no se pasa, no aparece el botón
  // -- no toda tarjeta necesita vista expandida.
  contenidoExpandido?: ReactNode;
  children: ReactNode;
}) {
  const [expandido, setExpandido] = useState(false);
  const clases = ACENTOS[acento];
  const Icono = obtenerIcono(icono);

  return (
    <div className={`rounded-xl border ${clases.bg} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`flex min-w-0 items-center gap-1.5 truncate font-condensed text-base font-bold uppercase tracking-wide ${clases.titulo}`}>
          {/* eslint-disable-next-line react-hooks/static-components --
              obtenerIcono() busca en un Map de lib/iconos.tsx definido a
              nivel de módulo: para la misma clave siempre devuelve la MISMA
              referencia de componente, no hay remount real pese al aviso. */}
          <Icono size={17} stroke={1.75} className="shrink-0" aria-hidden />
          <span className="truncate">{titulo}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {ejecucion && (
            <span
              className={`text-[10px] ${ejecucion.exito ? "text-tinta/40" : "text-red-600"}`}
              title={ejecucion.exito ? "Última sincronización" : "Última sincronización falló"}
            >
              {ejecucion.exito ? haceCuanto(ejecucion.ejecutado_en) : `error ${haceCuanto(ejecucion.ejecutado_en)}`}
            </span>
          )}
          {contenidoExpandido && (
            // type="button" + esta siendo el UNICO elemento clickeable de su
            // fila (la tarjeta en si no tiene onClick) asegura que abrir el
            // detalle sea SOLO por acá, nunca por clic en la tarjeta.
            <button
              type="button"
              onClick={() => setExpandido(true)}
              title={`Ver más detalle de ${titulo}`}
              aria-label={`Ver más detalle de ${titulo}`}
              className={`rounded-full p-1.5 transition-all duration-200 hover:scale-110 ${clases.boton}`}
            >
              <IconMaximize size={15} stroke={1.75} />
            </button>
          )}
        </div>
      </div>

      {children}

      {expandido && contenidoExpandido && (
        <ModalExpandirTarjeta titulo={titulo} icono={icono} onCerrar={() => setExpandido(false)}>
          {contenidoExpandido}
        </ModalExpandirTarjeta>
      )}
    </div>
  );
}
