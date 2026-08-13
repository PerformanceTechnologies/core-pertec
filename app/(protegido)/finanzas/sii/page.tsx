import { redirect } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { listarFacturasSii, obtenerUltimaEjecucionExitosa } from "@/lib/finanzas";
import PanelFinanzas from "@/components/finanzas/PanelFinanzas";

const SLUG_APP = "finanzas";

export default async function FacturasSiiPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);
  if (usuario.rol !== "admin" && !(await usuarioPuedeVerSubpanelFinanzas(usuario.id, "sii"))) {
    redirect("/finanzas");
  }
  const [facturas, ultimaEjecucionExitosa] = await Promise.all([
    listarFacturasSii(),
    obtenerUltimaEjecucionExitosa(),
  ]);

  return <PanelFinanzas facturas={facturas} ultimaEjecucionExitosa={ultimaEjecucionExitosa} />;
}
