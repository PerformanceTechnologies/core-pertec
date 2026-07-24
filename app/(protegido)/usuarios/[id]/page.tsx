import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirAdmin } from "@/lib/autorizacion";
import { obtenerUsuarioPorId } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { obtenerModulosGuardados } from "@/lib/panel-odoo/modulos-usuario";
import FormularioUsuario from "@/components/FormularioUsuario";
import { actualizarUsuarioAction } from "../acciones";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirAdmin();
  const { id } = await params;
  const [usuario, apps, modulosOdooAsignados] = await Promise.all([
    obtenerUsuarioPorId(id),
    listarAplicaciones(),
    obtenerModulosGuardados(id),
  ]);
  if (!usuario) notFound();

  const accionConId = actualizarUsuarioAction.bind(null, id);

  return (
    <div>
      <Link href="/usuarios" className="text-xs font-medium text-tinta/60 hover:text-naranjo">
        ← Volver a usuarios
      </Link>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Editar {usuario.correo}
      </h1>

      <div className="mt-6 max-w-2xl rounded-xl border border-borde bg-white p-6">
        <FormularioUsuario
          accion={accionConId}
          todasLasApps={apps}
          valoresPorDefecto={usuario}
          modulosOdooAsignados={modulosOdooAsignados}
          textoBoton="Guardar cambios"
          correoBloqueado
        />
      </div>
    </div>
  );
}
