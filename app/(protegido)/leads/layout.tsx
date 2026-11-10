import { IconBuilding, IconTargetArrow } from "@tabler/icons-react";
import { contextoLeads } from "@/lib/fin/datos";
import { DialogosFin } from "@/components/fin/dialogos";

export const dynamic = "force-dynamic";

export default async function LayoutLeads({ children }: { children: React.ReactNode }) {
  const { empresa } = await contextoLeads();
  return (
    <div className="animar-entrada">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-naranjo text-white shadow-sm">
          <IconTargetArrow size={21} stroke={1.75} />
        </span>
        <div className="min-w-[13rem] flex-1">
          <h1 className="font-condensed text-xl font-bold uppercase leading-tight tracking-tight text-tinta">Leads</h1>
          <p className="text-sm text-gris">Del primer contacto a la cotización aceptada: cada paso queda en Gestión financiera</p>
        </div>
        {/* Siempre a la vista: evita registrar algo en la empresa equivocada. */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-naranjo/40 bg-naranjo/[0.08] px-3 py-1.5 text-xs font-bold text-naranjo" title="Todo lo que ves y registras aquí es de esta empresa">
          <IconBuilding size={14} /> {empresa.nombre}
        </span>
      </header>
      {/* Los avisos y diálogos de confirmación (motivo de pérdida, errores) los dibuja este componente. */}
      <DialogosFin />
      <div className="escalonar">{children}</div>
    </div>
  );
}
