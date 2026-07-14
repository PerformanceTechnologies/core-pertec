import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarFacturasVenta, obtenerUltimaEjecucionHistoricoExitosa } from "@/lib/facturas-historicas";
import PanelFacturasHistoricas from "@/components/finanzas/facturas-historicas/PanelFacturasHistoricas";

const SLUG_APP = "finanzas";

export default async function FacturasHistoricasPage() {
  await exigirAccesoApp(SLUG_APP);
  const [ventas, ultimaEjecucionExitosa] = await Promise.all([
    listarFacturasVenta({}, 1000),
    obtenerUltimaEjecucionHistoricoExitosa(),
  ]);

  return <PanelFacturasHistoricas ventas={ventas} ultimaEjecucionExitosa={ultimaEjecucionExitosa} />;
}
