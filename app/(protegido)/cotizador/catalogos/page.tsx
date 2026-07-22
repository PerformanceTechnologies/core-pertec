import { exigirAccesoApp } from "@/lib/autorizacion";
import PanelCatalogos from "@/components/cotizador/PanelCatalogos";

const SLUG_APP = "cotizador";

export default async function CatalogosPage() {
  await exigirAccesoApp(SLUG_APP);
  return <PanelCatalogos />;
}
