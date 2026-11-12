import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_VENTAS, cargarVista, contextoFin, RUTA_COMPRAS } from "@/lib/fin/datos";
import { listarSolicitudesCotizacion } from "@/lib/fin/solicitud-cotizacion";
import SolicitarCotizacion from "@/components/fin/SolicitarCotizacion";

export const dynamic = "force-dynamic";

export default async function SolicitarCotizacionPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const sp = await searchParams;
  const [ctx, v] = await Promise.all([contextoFin(), cargarVista()]);
  const leadId = sp.lead && /^[0-9a-f-]{36}$/.test(sp.lead) ? sp.lead : null;
  const [solicitudes, lead, correos] = await Promise.all([
    listarSolicitudesCotizacion(ctx),
    leadId ? supabaseAdmin.from("fin_oportunidades").select("id, codigo, nombre, descripcion").eq("id", leadId).eq("empresa_id", ctx.empresa.id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    supabaseAdmin.from("finanzas_contactos").select("id, correo").not("correo", "is", null).then((r) => Object.fromEntries(((r.data ?? []) as { id: string; correo: string }[]).map((c) => [c.id, c.correo]))),
  ]);
  const contactos = v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <Link href={lead ? "/leads" : RUTA_VENTAS} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> {lead ? "Leads" : "Ventas y cobranza"}</Link>
      <header>
        <h2 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Solicitar cotización</h2>
        <p className="text-sm text-gris">Pídele a un contacto que te cotice. El correo sale desde tu Outlook y queda registrado; cuando llegue la cotización, la conviertes en solicitud de compra.</p>
      </header>
      <SolicitarCotizacion
        contactos={contactos}
        correos={correos}
        empresa={ctx.empresa.nombre}
        yo={ctx.usuario.nombre ?? ctx.usuario.correo}
        lead={lead ? { id: lead.id, codigo: lead.codigo, nombre: lead.nombre } : null}
        solicitudes={solicitudes}
        rutaCompras={RUTA_COMPRAS}
      />
    </div>
  );
}
