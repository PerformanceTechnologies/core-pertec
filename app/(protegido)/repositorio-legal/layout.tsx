import { IconBrandOnedrive, IconScale } from "@tabler/icons-react";
import NavRepositorio from "@/components/repositorio-legal/NavRepositorio";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { permisosDe } from "@/lib/repositorio-legal/datos";
import { SLUG_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

export const dynamic = "force-dynamic";

export default async function LayoutRepositorioLegal({ children }: { children: React.ReactNode }) {
  const usuario = await exigirAccesoApp(SLUG_REPOSITORIO_LEGAL);
  const { confidencial: esAdmin } = await permisosDe(usuario);
  return (
    <div className="animar-entrada">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconScale size={23} stroke={1.75} />
        </span>
        <div className="min-w-[13rem] flex-1">
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Repositorio Legal</h1>
          <p className="text-sm text-gris">Los antecedentes legales de cada sociedad del grupo, con su emisión y su vigencia</p>
        </div>
        {/* Siempre a la vista: lo que se cambia aquí, se cambia en SharePoint. */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-naranjo/40 bg-naranjo/[0.08] px-3 py-1.5 text-xs font-bold text-naranjo" title="Se lee y se guarda directo en SharePoint: ARCHIVOS CORE / ANTECEDENTES LEGALES">
          <IconBrandOnedrive size={14} /> SharePoint · Antecedentes legales
        </span>
      </header>
      <NavRepositorio esAdmin={esAdmin} />
      <div className="escalonar">{children}</div>
    </div>
  );
}
