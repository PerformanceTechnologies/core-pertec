import { IconTruck } from "@tabler/icons-react";
import NavFlota from "@/components/flota/NavFlota";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { SLUG_APP_FLOTA } from "@/lib/flota-modelo";

export const dynamic = "force-dynamic";

export default async function LayoutFlota({ children }: { children: React.ReactNode }) {
  await exigirAccesoApp(SLUG_APP_FLOTA);

  return (
    <div className="animar-entrada">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconTruck size={23} stroke={1.75} />
        </span>
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Flota</h1>
          <p className="text-sm text-gris">Vehículos, conductores, mantenciones y costos</p>
        </div>
      </header>
      <>
        <NavFlota />
        {children}
      </>
    </div>
  );
}
