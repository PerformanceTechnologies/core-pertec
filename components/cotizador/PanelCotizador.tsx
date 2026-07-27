import Link from "next/link";
import type { CotizacionResumen } from "@/lib/cotizador";
import { money, pct } from "@/lib/cotizador/formato";
import { puedeEnCotizador, type RolCotizador } from "@/lib/permisos-cotizador";
import FormularioCotizacion from "./FormularioCotizacion";
import TablaCotizaciones from "./TablaCotizaciones";
import { crearCotizacionAction } from "@/app/(protegido)/cotizador/acciones";

export default function PanelCotizador({
  cotizaciones,
  rol,
}: {
  cotizaciones: CotizacionResumen[];
  rol: RolCotizador;
}) {
  const puedeCrear = puedeEnCotizador(rol, "crear_cotizacion");
  const puedeEliminar = puedeEnCotizador(rol, "eliminar_cotizacion");
  const puedeAdministrarParametros = puedeEnCotizador(rol, "administrar_parametros_legales");

  const totalNeto = cotizaciones.reduce((acc, c) => acc + (c.summary?.ecoTotalNeto ?? 0), 0);
  const adjudicadas = cotizaciones.filter((c) => c.estado === "adjudicada" || c.estado === "emitida").length;
  const margenProm = cotizaciones.length
    ? cotizaciones.reduce((acc, c) => acc + (c.summary?.margenEfectivoTotal ?? 0), 0) / cotizaciones.length
    : 0;

  return (
    <div>
      <Link href="/" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Volver al inicio
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <span className="etiqueta-seccion">Cotizador</span>
          <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
            Cotizaciones — servicios de vulcanización
          </h1>
        </div>
        <div className="mt-1 flex flex-col items-end gap-1 whitespace-nowrap text-xs font-medium">
          <Link href="/cotizador/catalogos" className="text-tinta/60 hover:text-naranjo">
            Catálogos →
          </Link>
          {puedeAdministrarParametros && (
            <Link href="/cotizador/parametros" className="text-tinta/60 hover:text-naranjo">
              Parámetros legales →
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-naranjo/20 bg-naranjo/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Monto cotizado · neto/mes</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-tinta">{money(totalNeto)}</div>
          <div className="mt-1 text-xs text-tinta/50">{cotizaciones.length} cotizaciones</div>
        </div>
        <div className="rounded-xl border border-gris/25 bg-gris/[0.08] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Tasa de adjudicación</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-naranjo">
            {cotizaciones.length ? pct(adjudicadas / cotizaciones.length, 0) : "—"}
          </div>
          <div className="mt-1 text-xs text-tinta/50">{adjudicadas} de {cotizaciones.length} adjudicadas o emitidas</div>
        </div>
        <div className="rounded-xl border border-teal/20 bg-teal/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Margen efectivo promedio</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-teal">{pct(margenProm)}</div>
          <div className="mt-1 text-xs text-tinta/50">sobre costo mensual total</div>
        </div>
      </div>

      {puedeCrear && (
        <details className="group mt-6 rounded-xl border-2 border-naranjo bg-naranjo/5 open:bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-condensed text-base font-bold uppercase tracking-wide text-naranjo transition hover:bg-naranjo/10 group-open:hover:bg-transparent">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-naranjo text-sm font-black text-white">
              +
            </span>
            Nueva cotización
          </summary>
          <div className="px-5 pb-5">
            <FormularioCotizacion accion={crearCotizacionAction} textoBoton="Crear cotización" />
          </div>
        </details>
      )}

      <TablaCotizaciones cotizaciones={cotizaciones} puedeEliminar={puedeEliminar} />
    </div>
  );
}
