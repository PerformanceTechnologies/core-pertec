import { IconEye, IconReportSearch } from "@tabler/icons-react";
import NavHistorica from "@/components/valorizacion-historica/NavHistorica";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { SLUG_APP_VH } from "@/lib/valorizacion-historica-modelo";

export const dynamic = "force-dynamic";

export default async function LayoutValorizacionHistorica({ children }: { children: React.ReactNode }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);

  return (
    <div className="animar-entrada">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconReportSearch size={23} stroke={1.75} />
        </span>
        <div className="min-w-[13rem] flex-1">
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Valorización histórica</h1>
          <p className="text-sm text-gris">Todo lo comprado en materiales, herramientas y EPP según los DTE del SII</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-superficie px-3 py-1.5 text-[11px] font-semibold text-gris" title="Estos datos vienen del Registro Maestro de Compras y no se editan en el Core">
          <IconEye size={14} /> Solo consulta
        </span>
      </header>
      <NavHistorica esAdmin={usuario.rol === "admin"} />
      {children}
    </div>
  );
}
