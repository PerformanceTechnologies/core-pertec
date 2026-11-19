import { IconScale } from "@tabler/icons-react";
import NavRepositorio from "@/components/repositorio-legal/NavRepositorio";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { SLUG_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

export const dynamic = "force-dynamic";

export default async function LayoutRepositorioLegal({ children }: { children: React.ReactNode }) {
  await exigirAccesoApp(SLUG_REPOSITORIO_LEGAL);
  return (
    <div className="animar-entrada">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconScale size={23} stroke={1.75} />
        </span>
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Repositorio Legal</h1>
          <p className="text-sm text-gris">Antecedentes legales de las sociedades del grupo, directo desde SharePoint</p>
        </div>
      </header>
      <NavRepositorio />
      {children}
    </div>
  );
}
