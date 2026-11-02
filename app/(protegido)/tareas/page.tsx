import TableroTareas from "@/components/tareas/TableroTareas";
import { listarTareas } from "@/lib/tareas";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
  const tareas = await listarTareas();
  return <TableroTareas tareas={tareas} />;
}
