import { exigirAccesoCotizador } from "@/lib/cotizador";
import { listarSetsParametros, obtenerSetVigente } from "@/lib/parametros-legales";
import PanelParametrosLegales from "@/components/cotizador/PanelParametrosLegales";

export default async function ParametrosLegalesCotizadorPage() {
  await exigirAccesoCotizador("administrar_parametros_legales");
  const [sets, vigente] = await Promise.all([listarSetsParametros(), obtenerSetVigente()]);

  return <PanelParametrosLegales sets={sets} plantilla={vigente} />;
}
