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
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconBuildingWarehouse size={23} stroke={1.75} />
        </span>
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Inventario</h1>
          <p className="text-sm text-gris">Stock, bodegas y movimientos de doble entrada</p>
        </div>
      </header>
      <FiltroDeEmpresa>
        <NavInventario />
        {children}
      </FiltroDeEmpresa>
    </div>
  );
}
