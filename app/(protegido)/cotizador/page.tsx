import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarCotizaciones } from "@/lib/cotizador";
import PanelCotizador from "@/components/cotizador/PanelCotizador";

const SLUG_APP = "cotizador";

export default async function CotizadorPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const cotizaciones = await listarCotizaciones();

  return <PanelCotizador cotizaciones={cotizaciones} esAdmin={usuario.rol === "admin"} />;
}
