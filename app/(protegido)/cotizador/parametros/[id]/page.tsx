import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirAdmin } from "@/lib/autorizacion";
import { obtenerSetPorId } from "@/lib/parametros-legales";
import FormularioParametrosLegales from "@/components/cotizador/FormularioParametrosLegales";
import { actualizarSetParametrosAction } from "../acciones";

export default async function EditarSetParametrosPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  const set = await obtenerSetPorId(id);
  if (!set) notFound();

  const accionConId = actualizarSetParametrosAction.bind(null, id);

  return (
    <div>
      <Link href="/cotizador/parametros" className="text-xs font-medium text-tinta/60 hover:text-naranjo">
        ← Volver a parámetros legales
      </Link>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Editar «{set.nombre}»</h1>
      <p className="mt-1 max-w-2xl text-sm text-tinta/60">
        Los cambios NO afectan cotizaciones ya creadas: cada una guarda su propia copia congelada de los parámetros
        vigentes al momento de crearse.
      </p>

      <div className="mt-6 max-w-4xl rounded-xl border border-borde bg-white p-6">
        <FormularioParametrosLegales accion={accionConId} valoresPorDefecto={set} textoBoton="Guardar cambios" />
      </div>
    </div>
  );
}
