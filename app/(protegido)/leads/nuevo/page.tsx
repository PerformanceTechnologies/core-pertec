import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { RUTA_LEADS, cargarVistaLeads, contextoLeads } from "@/lib/fin/datos";
import { TARJETA } from "@/lib/estilos";
import { FormLead } from "@/components/leads/FormLead";

export const dynamic = "force-dynamic";

/** Nuevo lead en su propia página; al crearlo se abre la página del lead. */
export default async function NuevoLeadPage({ searchParams }: { searchParams: Promise<{ etapa?: string }> }) {
  const { etapa } = await searchParams;
  const [ctx, v] = await Promise.all([contextoLeads(), cargarVistaLeads()]);
  const clientes = v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  return (
    <div className="space-y-5">
      <Link href={RUTA_LEADS} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Leads</Link>
      <header className={`${TARJETA} p-5`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">Leads</p>
        <h2 className="text-lg font-extrabold text-tinta">Nuevo lead</h2>
      </header>
      <section className={`${TARJETA} max-w-3xl p-5`}>
        <FormLead clientes={clientes} etapaInicial={etapa} responsableInicial={ctx.usuario.correo} abrirAlCrear />
      </section>
    </div>
  );
}
