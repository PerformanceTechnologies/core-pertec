import { redirect } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { listarFacturasVenta, obtenerUltimaEjecucionHistoricoExitosa } from "@/lib/facturas-historicas";
import PanelFacturasHistoricas from "@/components/finanzas/facturas-historicas/PanelFacturasHistoricas";

const SLUG_APP = "finanzas";

export default async function FacturasHistoricasPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);
  if (usuario.rol !== "admin" && !(await usuarioPuedeVerSubpanelFinanzas(usuario.id, "facturas-historicas"))) {
    redirect("/finanzas");
  }
  const [ventas, ultimaEjecucionExitosa] = await Promise.all([
    listarFacturasVenta({}, 1000),
    obtenerUltimaEjecucionHistoricoExitosa(),
  ]);

  return <PanelFacturasHistoricas ventas={ventas} ultimaEjecucionExitosa={ultimaEjecucionExitosa} />;
}
