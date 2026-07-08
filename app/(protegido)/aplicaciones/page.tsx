import Link from "next/link";
import { exigirAdmin } from "@/lib/autorizacion";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import { obtenerIcono } from "@/lib/iconos";
import FormularioAplicacion from "@/components/FormularioAplicacion";
import BotonEliminar from "@/components/BotonEliminar";
import { crearAplicacionAction, eliminarAplicacionAction } from "./acciones";

export default async function AplicacionesPage() {
  await exigirAdmin();
  const apps = await listarAplicaciones();

  return (
    <div>
      <span className="etiqueta-seccion">Administración</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Aplicaciones
      </h1>

      <details className="mt-6 rounded-xl border border-borde bg-white p-4">
        <summary className="cursor-pointer font-condensed text-sm font-bold uppercase text-tinta">
          + Nueva aplicación
        </summary>
        <div className="mt-4">
          <FormularioAplicacion accion={crearAplicacionAction} textoBoton="Crear aplicación" />
        </div>
      </details>

      <div className="mt-6 overflow-hidden rounded-xl border border-borde bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              <th className="px-4 py-3">Aplicación</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => {
              const Icono = obtenerIcono(app.icono);
              return (
                <tr key={app.id} className="border-b border-borde last:border-0">
                  <td className="flex items-center gap-2 px-4 py-3 font-medium text-tinta">
                    <Icono size={16} stroke={1.75} aria-hidden />
                    {app.nombre}
                  </td>
                  <td className="px-4 py-3 text-tinta/60">{app.url}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${clasesInsigniaEstado(app.estado)}`}
                    >
                      {etiquetaEstado(app.estado)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/aplicaciones/${app.id}`}
                        className="text-xs font-medium text-tinta/70 hover:text-naranjo"
                      >
                        Editar
                      </Link>
                      <BotonEliminar
                        accion={eliminarAplicacionAction}
                        id={app.id}
                        mensajeConfirmacion={`¿Eliminar "${app.nombre}" del catálogo?`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {apps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-tinta/50">
                  Todavía no hay aplicaciones registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
