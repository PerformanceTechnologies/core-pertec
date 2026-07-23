import { exigirAccesoCotizador, listarCotizaciones } from "@/lib/cotizador";
import PanelCotizador from "@/components/cotizador/PanelCotizador";

export default async function CotizadorPage() {
  const { rol } = await exigirAccesoCotizador();
  const cotizaciones = await listarCotizaciones();

  return <PanelCotizador cotizaciones={cotizaciones} rol={rol} />;
}
