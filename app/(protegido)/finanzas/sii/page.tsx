import { redirect } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { listarFacturasSii, obtenerUltimaEjecucionExitosa } from "@/lib/finanzas";
import PanelFinanzas from "@/components/finanzas/PanelFinanzas";

const SLUG_APP = "finanzas";

// El scraper del SII abre un navegador, se loguea y baja un CSV por sub-pestaña: un
// período son minutos, no segundos. Este tope es el que gobierna la Server Action de
// releer un período (lib/sii-rcv.ts), no el de la ruta del cron.
export const maxDuration = 300;

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
