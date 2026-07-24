import type { ReactNode } from "react";
import { obtenerIcono } from "@/lib/iconos";
import { haceCuanto } from "@/lib/panel-odoo/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";

// Un acento de color por modulo (de la paleta de marca existente, ninguno
// nuevo) para que las 4 tarjetas se distingan de un vistazo -- fondo
// tintado clarito (no blanco puro) + titulo en ese mismo color.
const ACENTOS = {
  naranjo: { bg: "bg-naranjo/[0.06]", border: "border-naranjo/20", titulo: "text-naranjo" },
  teal: { bg: "bg-teal/[0.06]", border: "border-teal/20", titulo: "text-teal" },
  naranjoSuave: { bg: "bg-naranjo-suave/[0.08]", border: "border-naranjo-suave/25", titulo: "text-naranjo-suave" },
  tealSuave: { bg: "bg-teal-suave/[0.08]", border: "border-teal-suave/25", titulo: "text-teal-suave" },
} as const;

export type AcentoTarjeta = keyof typeof ACENTOS;

export default function TarjetaBase({
  titulo,
  acento,
  icono,
  ejecucion,
  children,
}: {
  titulo: string;
  acento: AcentoTarjeta;
  icono: string; // clave de lib/iconos.tsx
  ejecucion?: EjecucionOdoo | null;
  children: ReactNode;
}) {
  const clases = ACENTOS[acento];
  const Icono = obtenerIcono(icono);

  return (
    <div className={`rounded-xl border ${clases.border} ${clases.bg} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 font-condensed text-base font-bold uppercase tracking-wide ${clases.titulo}`}>
          <Icono size={17} stroke={1.75} aria-hidden />
          {titulo}
        </p>
        {ejecucion && (
          <span
            className={`shrink-0 text-[10px] ${ejecucion.exito ? "text-tinta/40" : "text-red-600"}`}
            title={ejecucion.exito ? "Última sincronización" : "Última sincronización falló"}
          >
            {ejecucion.exito ? haceCuanto(ejecucion.ejecutado_en) : `error ${haceCuanto(ejecucion.ejecutado_en)}`}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
