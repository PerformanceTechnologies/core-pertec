import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirAdmin } from "@/lib/autorizacion";
import { obtenerAplicacionPorId } from "@/lib/aplicaciones";
import FormularioAplicacion from "@/components/FormularioAplicacion";
import { actualizarAplicacionAction } from "../acciones";

export default async function EditarAplicacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirAdmin();
  const { id } = await params;
  const app = await obtenerAplicacionPorId(id);
  if (!app) notFound();

  const accionConId = actualizarAplicacionAction.bind(null, id);

  return (
    <div>
      <Link href="/aplicaciones" className="text-xs font-medium text-tinta/60 hover:text-naranjo">
        ← Volver a aplicaciones
      </Link>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Editar {app.nombre}
      </h1>

      <div className="mt-6 max-w-2xl rounded-xl border border-borde bg-white p-6">
        <FormularioAplicacion
          accion={accionConId}
          valoresPorDefecto={app}
          textoBoton="Guardar cambios"
        />
      </div>
    </div>
  );
}
