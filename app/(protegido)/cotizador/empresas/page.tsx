import { exigirAccesoCotizador } from "@/lib/cotizador";
import { listarEmpresas } from "@/lib/cotizador/empresas-datos";
import { puedeEnCotizador } from "@/lib/permisos-cotizador";
import PanelEmpresas from "@/components/cotizador/PanelEmpresas";

export default async function EmpresasPage() {
  const { rol } = await exigirAccesoCotizador();
  const empresas = await listarEmpresas();
  const puedeEditar = puedeEnCotizador(rol, "administrar_empresas");

  return <PanelEmpresas empresasIniciales={empresas} puedeEditar={puedeEditar} />;
}
