import "./contratos.css";
import FiltroDeEmpresa from "@/components/FiltroDeEmpresa";

/**
 * Todo lo de Contratos —la lista y cada contrato— carga su hoja de estilos: las tarjetas de estado,
 * los anillos y los gráficos que trae el módulo desde core-ih (ver contratos.css).
 */
export default function LayoutDeContratos({ children }: { children: React.ReactNode }) {
  return <FiltroDeEmpresa>{children}</FiltroDeEmpresa>;
}
