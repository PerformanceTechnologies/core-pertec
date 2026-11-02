import TableroTareas from "@/components/tareas/TableroTareas";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarResponsables, listarTareas } from "@/lib/tareas";
import { SLUG_APP_TAREAS } from "@/lib/tareas-modelo";

export const dynamic = "force-dynamic";

export default async function TareasPage({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  const { abrir } = await searchParams;
  const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
  const [tareas, responsables] = await Promise.all([listarTareas(usuario.correo), listarResponsables()]);
  return <TableroTareas tareas={tareas} responsables={responsables} yo={usuario.correo} abrir={abrir ?? null} />;
}
