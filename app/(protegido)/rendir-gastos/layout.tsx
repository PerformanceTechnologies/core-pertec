import FiltroDeEmpresa from "@/components/FiltroDeEmpresa";

// Los datos de este módulo son de PERTEC: en otra empresa no se muestran.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FiltroDeEmpresa>{children}</FiltroDeEmpresa>;
}
