import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { RUTA_LEADS, adjuntosDe, cargarComercial, cargarVistaLeads, contextoLeads } from "@/lib/fin/datos";
import { clp } from "@/lib/fin/reglas";
import { ETAPAS_OPORTUNIDAD } from "@/lib/fin/modelo";
import { TARJETA } from "@/lib/estilos";
import { Chip } from "@/components/fin/piezas";
import { FormLead } from "@/components/leads/FormLead";
import { ListaDocumentacion } from "@/components/leads/Documentacion";
import SubirDocumentacion from "@/components/leads/SubirDocumentacion";

export const dynamic = "force-dynamic";

/** Un lead en su propia página (como la cotización): datos editables y su documentación. */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ctx, v, com] = await Promise.all([contextoLeads(), cargarVistaLeads(), cargarComercial()]);
  const o = com.oportunidades.find((x) => x.id === id);
  if (!o) notFound();
  const adjuntos = await adjuntosDe("oportunidad", id);
  const clientes = v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  const cliente = o.clienteId ? v.nombreDe.get(o.clienteId) : null;
  const etapa = (ETAPAS_OPORTUNIDAD as readonly { clave: string; etiqueta: string }[]).find((e) => e.clave === o.etapa)?.etiqueta ?? o.etapa;

  return (
    <div className="space-y-5">
      <Link href={`${RUTA_LEADS}?ver=tabla`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Leads</Link>
      <header className={`${TARJETA} flex flex-wrap items-start gap-4 p-5`}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{o.codigo}</p>
          <h2 className="text-lg font-extrabold text-tinta [overflow-wrap:break-word]">{o.nombre}</h2>
          <p className="text-sm text-gris">{cliente ?? "Sin cliente"}</p>
          <div className="mt-2"><Chip texto={etapa} tono="bg-slate-500/10 text-gris" /></div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="font-condensed text-3xl font-bold tabular-nums text-tinta">{clp(o.montoEstimado)}</p>
          <SubirDocumentacion entidadTipo="oportunidad" entidadId={id} destino={`Gestión financiera / ${ctx.empresa.nombre} / Ventas / ${cliente ?? "Sin cliente"}`} />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={`${TARJETA} p-5`}>
          <FormLead o={o} clientes={clientes} esAdmin={ctx.usuario.rol === "admin"} />
        </section>
        <ListaDocumentacion adjuntos={adjuntos} />
      </div>
    </div>
  );
}
