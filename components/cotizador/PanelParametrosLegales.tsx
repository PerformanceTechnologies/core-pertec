import Link from "next/link";
import type { ParametrosLegalesSet } from "@/lib/parametros-legales";
import { fechaCl } from "@/lib/cotizador/formato";
import BotonEliminar from "@/components/BotonEliminar";
import BotonActualizarIndicadores from "./BotonActualizarIndicadores";
import FormularioParametrosLegales from "./FormularioParametrosLegales";
import { crearSetParametrosAction, eliminarSetParametrosAction } from "@/app/(protegido)/cotizador/parametros/acciones";

export default function PanelParametrosLegales({
  sets,
  plantilla,
}: {
  sets: ParametrosLegalesSet[];
  plantilla: ParametrosLegalesSet | null;
}) {
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <Link href="/cotizador" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Cotizaciones
      </Link>

      <div className="mt-2">
        <span className="etiqueta-seccion">Cotizador · Administración</span>
      </div>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Parámetros legales y tributarios</h1>
      <p className="mt-1 max-w-2xl text-sm text-tinta/60">
        UF, UTM, tasas AFP/salud/cesantía y tramos de impuesto único que usa el motor de cálculo del Cotizador.
        Editables libremente y se pueden crear otros sets — cada cotización congela su propia copia al crearse, así
        una edición nunca cambia retroactivamente una cotización ya calculada.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-crema/40 p-4">
        <div className="text-xs text-tinta/60">
          UF y UTM del set vigente se actualizan solas todos los días a las 6:00 AM (Chile) desde mindicador.cl.
        </div>
        <div className="flex-1" />
        <BotonActualizarIndicadores />
      </div>

      <details className="mt-4 rounded-xl border border-borde bg-white p-4">
        <summary className="cursor-pointer font-condensed text-sm font-bold uppercase text-tinta">
          + Nuevo set
        </summary>
        <div className="mt-4">
          {plantilla && (
            <p className="mb-4 text-xs text-tinta/50">
              Prellenado con los valores del set vigente («{plantilla.nombre}») — ajuste lo que cambió.
            </p>
          )}
          <FormularioParametrosLegales
            accion={crearSetParametrosAction}
            valoresPorDefecto={plantilla ?? undefined}
            textoBoton="Crear set"
          />
        </div>
      </details>

      <div className="mt-6 overflow-x-auto rounded-xl border border-borde bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Vigente desde</th>
              <th className="px-4 py-3 text-right">UF</th>
              <th className="px-4 py-3 text-right">UTM</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Actualizado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sets.map((s) => {
              const esVigente = s.vigenteDesde <= hoy && (!plantilla || plantilla.id === s.id);
              return (
                <tr key={s.id} className="border-b border-borde last:border-0">
                  <td className="px-4 py-3 font-medium text-tinta">{s.nombre}</td>
                  <td className="px-4 py-3 text-tinta/60">{fechaCl(s.vigenteDesde)}</td>
                  <td className="px-4 py-3 text-right text-tinta/70">{s.valores.uf.toLocaleString("es-CL")}</td>
                  <td className="px-4 py-3 text-right text-tinta/70">{s.valores.utm.toLocaleString("es-CL")}</td>
                  <td className="px-4 py-3">
                    {esVigente && (
                      <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
                        Vigente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-tinta/50">{fechaCl(s.actualizadoEn)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/cotizador/parametros/${s.id}`}
                        className="text-xs font-medium text-tinta/70 hover:text-naranjo"
                      >
                        Editar
                      </Link>
                      <BotonEliminar
                        accion={eliminarSetParametrosAction}
                        id={s.id}
                        mensajeConfirmacion={`¿Eliminar el set "${s.nombre}"? Las cotizaciones que ya lo usaron no se ven afectadas.`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {sets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-tinta/50">
                  No hay sets de parámetros configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
