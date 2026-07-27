import { exigirAccesoCotizador } from "@/lib/cotizador";
import { listarCatalogoCargos } from "@/lib/cotizador/catalogo-cargos";
import { puedeEnCotizador } from "@/lib/permisos-cotizador";
import PanelCatalogos from "@/components/cotizador/PanelCatalogos";

export default async function CatalogosPage() {
  const { rol } = await exigirAccesoCotizador();
  const cargos = await listarCatalogoCargos();
  const puedeEditar = puedeEnCotizador(rol, "administrar_catalogo_cargos");

  return <PanelCatalogos cargosIniciales={cargos} puedeEditar={puedeEditar} />;
}
