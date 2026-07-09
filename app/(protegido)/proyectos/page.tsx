import { exigirAccesoApp } from "@/lib/autorizacion";
import { resolverRolPanel } from "@/lib/proyectos";
import PanelProyectos from "@/components/proyectos/PanelProyectos";

const SLUG_APP = "proyectos";

// El encabezado (hero) vive dentro de PanelProyectos porque cambia según el
// estado: el selector de proyectos tiene uno, y dentro de un proyecto hay
// otro con el anillo de progreso — igual que en el panel original.
export default async function ProyectosPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const rolPanel = await resolverRolPanel(usuario);

  return <PanelProyectos rolPanel={rolPanel} />;
}
