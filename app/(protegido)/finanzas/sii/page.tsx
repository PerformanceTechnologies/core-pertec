import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarFacturasSii, obtenerUltimaEjecucionExitosa } from "@/lib/finanzas";
import PanelFinanzas from "@/components/finanzas/PanelFinanzas";

const SLUG_APP = "finanzas";

export default async function FacturasSiiPage() {
  await exigirAccesoApp(SLUG_APP);
  const [facturas, ultimaEjecucionExitosa] = await Promise.all([
    listarFacturasSii(),
    obtenerUltimaEjecucionExitosa(),
  ]);

  return <PanelFinanzas facturas={facturas} ultimaEjecucionExitosa={ultimaEjecucionExitosa} />;
}
