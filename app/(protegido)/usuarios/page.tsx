import Link from "next/link";
import { exigirAdmin } from "@/lib/autorizacion";
import { listarUsuarios } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import FormularioUsuario from "@/components/FormularioUsuario";
import BotonEliminar from "@/components/BotonEliminar";
import { crearUsuarioAction, eliminarUsuarioAction } from "./acciones";

export default async function UsuariosPage() {
  const admin = await exigirAdmin();
  const [usuarios, apps] = await Promise.all([listarUsuarios(), listarAplicaciones()]);

  return (
    <div>
      <span className="etiqueta-seccion">Administración</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Usuarios</h1>

      <details className="mt-6 rounded-xl border border-borde bg-white p-4">
        <summary className="cursor-pointer font-condensed text-sm font-bold uppercase text-tinta">
          + Nuevo usuario
        </summary>
        <div className="mt-4">
          <FormularioUsuario
            accion={crearUsuarioAction}
            todasLasApps={apps}
            textoBoton="Crear usuario"
          />
        </div>
      </details>

      <div className="mt-6 overflow-hidden rounded-xl border border-borde bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Apps asignadas</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className="border-b border-borde last:border-0">
                <td className="px-4 py-3 font-medium text-tinta">
                  {usuario.correo}
                  {usuario.nombre && (
                    <span className="block text-xs font-normal text-tinta/50">
                      {usuario.nombre}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                      usuario.rol === "admin" ? "bg-naranjo/10 text-naranjo" : "bg-teal/10 text-teal"
                    }`}
                  >
                    {usuario.rol === "admin" ? "Administrador" : "Usuario"}
                  </span>
                </td>
                <td className="px-4 py-3 text-tinta/60">
                  {usuario.rol === "admin" ? "Todas" : usuario.aplicacionIds.length}
                </td>
                <td className="px-4 py-3">
                  {usuario.activo ? (
                    <span className="text-xs font-medium text-teal">Activo</span>
                  ) : (
                    <span className="text-xs font-medium text-tinta/40">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/usuarios/${usuario.id}`}
                      className="text-xs font-medium text-tinta/70 hover:text-naranjo"
                    >
                      Editar
                    </Link>
                    {usuario.id !== admin.id && (
                      <BotonEliminar
                        accion={eliminarUsuarioAction}
                        id={usuario.id}
                        mensajeConfirmacion={`¿Eliminar a "${usuario.correo}"? Perderá el acceso de inmediato.`}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
