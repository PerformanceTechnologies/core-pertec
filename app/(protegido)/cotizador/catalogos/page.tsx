import { exigirAccesoCotizador } from "@/lib/cotizador";
import PanelCatalogos from "@/components/cotizador/PanelCatalogos";

export default async function CatalogosPage() {
  await exigirAccesoCotizador();
  return <PanelCatalogos />;
}
