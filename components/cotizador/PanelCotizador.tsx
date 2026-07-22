import Link from "next/link";
import type { CotizacionResumen } from "@/lib/cotizador";
import { money, pct, fechaCl } from "@/lib/cotizador/formato";
import BotonEliminar from "@/components/BotonEliminar";
import FormularioCotizacion from "./FormularioCotizacion";
import { crearCotizacionAction, eliminarCotizacionAction } from "@/app/(protegido)/cotizador/acciones";

const ESTADO_CLASES: Record<string, string> = {
  borrador: "bg-gris/10 text-gris",
  emitida: "bg-teal/10 text-teal",
  adjudicada: "bg-teal/10 text-teal",
  perdida: "bg-red-600/10 text-red-600",
};

function etiquetaEstado(estado: string): string {
  const mapa: Record<string, string> = {
    borrador: "Borrador",
    emitida: "Emitida",
    adjudicada: "Adjudicada",
    perdida: "Perdida",
  };
  return mapa[estado] ?? estado;
}

export default function PanelCotizador({
  cotizaciones,
  esAdmin,
}: {
  cotizaciones: CotizacionResumen[];
  esAdmin: boolean;
}) {
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
          {esAdmin && (
            <Link href="/cotizador/parametros" className="text-tinta/60 hover:text-naranjo">
              Parámetros legales →
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Monto cotizado · neto/mes</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-tinta">{money(totalNeto)}</div>
          <div className="mt-1 text-xs text-tinta/50">{cotizaciones.length} cotizaciones</div>
        </div>
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Tasa de adjudicación</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-naranjo">
            {cotizaciones.length ? pct(adjudicadas / cotizaciones.length, 0) : "—"}
          </div>
          <div className="mt-1 text-xs text-tinta/50">{adjudicadas} de {cotizaciones.length} adjudicadas o emitidas</div>
        </div>
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Margen efectivo promedio</div>
          <div className="mt-1 font-condensed text-2xl font-bold text-teal">{pct(margenProm)}</div>
          <div className="mt-1 text-xs text-tinta/50">sobre costo mensual total</div>
        </div>
      </div>

      <details className="mt-6 rounded-xl border border-borde bg-white p-4">
        <summary className="cursor-pointer font-condensed text-sm font-bold uppercase text-tinta">
          + Nueva cotización
        </summary>
        <div className="mt-4">
          <FormularioCotizacion accion={crearCotizacionAction} textoBoton="Crear cotización" />
        </div>
      </details>

      <div className="mt-6 overflow-x-auto rounded-xl border border-borde bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Faena</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Rev.</th>
              <th className="px-4 py-3 text-right">Monto neto/mes</th>
              <th className="px-4 py-3 text-right">Margen</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Actualizado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {cotizaciones.map((c) => (
              <tr key={c.id} className="border-b border-borde last:border-0 hover:bg-crema/40">
                <td className="px-4 py-3 font-medium text-tinta">
                  <Link href={`/cotizador/${c.id}`} className="hover:text-naranjo">
                    {c.nombre}
                  </Link>
                </td>
                <td className="px-4 py-3 text-tinta/60">{c.cliente ?? "—"}</td>
                <td className="px-4 py-3 text-tinta/60">{c.faena ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gris/10 px-2 py-0.5 text-[11px] font-semibold text-gris">
                    {c.tipoServicio === "spot" ? "SPOT" : "Permanente"}
                  </span>
                </td>
                <td className="px-4 py-3 text-tinta/50">{c.rev}</td>
                <td className="px-4 py-3 text-right font-semibold text-tinta">{money(c.summary?.ecoTotalNeto ?? 0)}</td>
                <td className="px-4 py-3 text-right text-teal">{pct(c.summary?.margenEfectivoTotal ?? 0)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_CLASES[c.estado] ?? ESTADO_CLASES.borrador}`}
                  >
                    {etiquetaEstado(c.estado)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-tinta/50">{fechaCl(c.actualizadoEn)}</td>
                <td className="px-4 py-3 text-right">
                  <BotonEliminar
                    accion={eliminarCotizacionAction}
                    id={c.id}
                    mensajeConfirmacion={`¿Eliminar "${c.nombre}"?`}
                  />
                </td>
              </tr>
            ))}
            {cotizaciones.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-tinta/50">
                  Aún no hay cotizaciones. Cree la primera con &ldquo;+ Nueva cotización&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
