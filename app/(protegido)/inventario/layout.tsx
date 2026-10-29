import { IconBuildingWarehouse } from "@tabler/icons-react";
import NavInventario from "@/components/inventario/NavInventario";
import { exigirAccesoApp } from "@/lib/autorizacion";
import FiltroDeEmpresa from "@/components/FiltroDeEmpresa";

export const dynamic = "force-dynamic";

export default async function LayoutInventario({ children }: { children: React.ReactNode }) {
  await exigirAccesoApp("inventario");

  return (
    <div className="animar-entrada">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-azul/10 text-azul">
          <IconBuildingWarehouse size={22} stroke={1.75} />
        </span>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-tinta">Inventario</h1>
          <p className="text-sm text-gris">Control de stock de doble entrada</p>
        </div>
      </header>
      <FiltroDeEmpresa>
        <NavInventario />
        {children}
      </FiltroDeEmpresa>
    </div>
  );
}
