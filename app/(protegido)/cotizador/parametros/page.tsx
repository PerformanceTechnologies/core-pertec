import { exigirAdmin } from "@/lib/autorizacion";
import { listarSetsParametros, obtenerSetVigente } from "@/lib/parametros-legales";
import PanelParametrosLegales from "@/components/cotizador/PanelParametrosLegales";

export default async function ParametrosLegalesCotizadorPage() {
  await exigirAdmin();
  const [sets, vigente] = await Promise.all([listarSetsParametros(), obtenerSetVigente()]);

  return <PanelParametrosLegales sets={sets} plantilla={vigente} />;
}
