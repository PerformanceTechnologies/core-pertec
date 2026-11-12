import FiltroDeEmpresa from "@/components/FiltroDeEmpresa";

// Datos solo de PERTEC: en otra empresa se muestra el aviso.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FiltroDeEmpresa>{children}</FiltroDeEmpresa>;
}
