import { exigirAccesoFinanzasIh } from "@/lib/finanzas-ih/autorizacion";
import { listarDocumentosIh, obtenerUltimaEjecucionExitosaIh } from "@/lib/finanzas-ih/finanzas-ih";
import PanelFacturasIh from "@/components/finanzas-ih/PanelFacturasIh";

export default async function FacturasIhPage() {
  await exigirAccesoFinanzasIh();
  const [documentos, ultimaEjecucionExitosa] = await Promise.all([
    listarDocumentosIh(),
    obtenerUltimaEjecucionExitosaIh(),
  ]);

  return <PanelFacturasIh documentos={documentos} ultimaEjecucionExitosa={ultimaEjecucionExitosa} />;
}
