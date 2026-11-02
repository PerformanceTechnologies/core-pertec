import TableroTareas from "@/components/tareas/TableroTareas";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarResponsables, listarTareas } from "@/lib/tareas";
import { SLUG_APP_TAREAS } from "@/lib/tareas-modelo";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
  const [usuario, tareas, responsables] = await Promise.all([
    exigirAccesoApp(SLUG_APP_TAREAS),
    listarTareas(),
    listarResponsables(),
  ]);
  return <TableroTareas tareas={tareas} responsables={responsables} yo={usuario.correo} />;
}
