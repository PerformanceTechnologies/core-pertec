import Link from "next/link";
import { IconFilePlus, IconPlus, IconTargetArrow } from "@tabler/icons-react";
import { RUTA_LEADS, cargarComercial, cargarVistaLeads, contextoLeads } from "@/lib/fin/datos";
import { clp, clpCorto, fechaCl } from "@/lib/fin/reglas";
import { ETIQUETA_ESTADO_COTIZACION, ETIQUETA_TIPO_VENTA } from "@/lib/fin/modelo";
import { Banda, Chip, Monto, Pestanas, TD, TH, Vacio } from "@/components/fin/piezas";
import { ConVentana } from "@/components/fin/ui";
import { BOTON } from "@/components/fin/estilos";
import TableroLeads from "@/components/leads/TableroLeads";
import { FormLead } from "@/components/leads/FormLead";

export const dynamic = "force-dynamic";

const TONO_COT: Record<string, string> = {
  borrador: "bg-slate-500/10 text-gris", enviada: "bg-sky-500/10 text-info", aceptada: "bg-emerald-500/12 text-ok",
  rechazada: "bg-rose-500/12 text-alerta", vencida: "bg-amber-500/12 text-aviso", anulada: "bg-slate-500/10 text-slate-500", reemplazada: "bg-slate-500/10 text-slate-500",
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const [ctx, v, com] = await Promise.all([contextoLeads(), cargarVistaLeads(), cargarComercial()]);
  const ver = ["tablero", "tabla", "cotizaciones"].includes(sp.ver ?? "") ? (sp.ver as "tablero" | "tabla" | "cotizaciones") : "tablero";
  const clientes = v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  const abiertas = com.oportunidades.filter((o) => !["ganada", "perdida"].includes(o.etapa));
  const ponderado = abiertas.reduce((s, o) => s + (o.montoEstimado * o.probabilidad) / 100, 0);
  const cerradas = com.oportunidades.filter((o) => ["ganada", "perdida"].includes(o.etapa));
  const ganadas = cerradas.filter((o) => o.etapa === "ganada").length;
  const conversion = cerradas.length ? Math.round((ganadas / cerradas.length) * 100) : null;
  const enviadas = com.cotizaciones.filter((c) => c.estado === "enviada");
  const vence = (c: { fecha: string; validezDias: number }) => new Date(Date.parse(`${c.fecha}T12:00:00Z`) + c.validezDias * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <Banda
        compacta
        etiqueta="Leads y oportunidades"
        valor={clpCorto(abiertas.reduce((s, o) => s + o.montoEstimado, 0))}
        bajada="Negocios abiertos, por su monto estimado."
        pasos={[
          { titulo: "Lead", ayuda: "Un cliente interesado", n: abiertas.length, href: `${RUTA_LEADS}` },
          { titulo: "Cotización", ayuda: "PDF y envío por correo", n: enviadas.length, href: `${RUTA_LEADS}?ver=cotizaciones` },
          { titulo: "Aceptación", ayuda: "Nacen el proyecto y los hitos" },
          { titulo: "Ventas y cobranza", ayuda: "Se factura y se cobra", href: "/finanzas/ventas" },
        ]}
        cifras={[
          { etiqueta: "Forecast ponderado", valor: clpCorto(ponderado) },
          { etiqueta: "Leads abiertos", valor: String(abiertas.length) },
          { etiqueta: "Cotizaciones enviadas", valor: String(enviadas.length), detalle: clpCorto(enviadas.reduce((s, c) => s + c.total, 0)) },
          { etiqueta: "Conversión", valor: conversion === null ? "—" : `${conversion}%`, detalle: cerradas.length ? `${ganadas} ganadas de ${cerradas.length} cerradas` : "sin cierres aún" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Pestanas base={RUTA_LEADS} actual={ver} opciones={[{ clave: "tablero", etiqueta: "Tablero", n: com.oportunidades.length }, { clave: "tabla", etiqueta: "Tabla" }, { clave: "cotizaciones", etiqueta: "Cotizaciones", n: com.cotizaciones.length }]} />
        <span className="flex-1" />
        <Link href={`${RUTA_LEADS}/cotizaciones/nueva`} className={BOTON}><IconFilePlus size={15} /> Nueva cotización</Link>
        <ConVentana boton={<><IconPlus size={15} /> Nuevo lead</>} titulo="Nuevo lead">
          {/* Elemento y no función: una página de servidor no puede pasar funciones a un componente de cliente. El formulario cierra la ventana solo. */}
          <FormLead clientes={clientes} responsableInicial={ctx.usuario.correo} />
        </ConVentana>
      </div>

      {ver !== "cotizaciones" ? (
        com.oportunidades.length === 0 ? (
          <Vacio titulo="Todavía no hay leads" texto="Un lead es un cliente interesado. Créalo con «Nuevo lead» y arrástralo entre etapas a medida que avanza." icono={<IconTargetArrow size={24} stroke={1.6} />} />
        ) : (
          <TableroLeads oportunidades={com.oportunidades} clientes={clientes} hoy={v.hoy} vista={ver} yo={ctx.usuario.correo} esAdmin={ctx.usuario.rol === "admin"} />
        )
      ) : com.cotizaciones.length === 0 ? (
        <Vacio titulo="Todavía no hay cotizaciones" texto="Crea una con «Nueva cotización». Al aceptarla nacen el proyecto y los hitos que se facturan." icono={<IconFilePlus size={24} stroke={1.6} />} />
      ) : (
        <>
          {/* Celular: una tarjeta por cotización. */}
          <ul className="grid gap-2 md:hidden">
            {com.cotizaciones.map((c) => {
              const vencida = c.estado === "enviada" && vence(c) < v.hoy;
              return (
                <li key={c.id}>
                  <Link href={`${RUTA_LEADS}/cotizaciones/${c.id}`} className="block rounded-xl border border-borde bg-superficie p-3 shadow-sm">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-tinta">{c.numero}{c.version > 1 ? ` V${c.version}` : ""}</span>
                      <Chip texto={vencida ? "Vencida" : ETIQUETA_ESTADO_COTIZACION[c.estado]} tono={vencida ? TONO_COT.vencida : TONO_COT[c.estado]} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gris">{c.titulo}</span>
                    <span className="mt-0.5 block truncate text-xs text-gris">{c.clienteId ? v.nombreDe.get(c.clienteId) : "Sin cliente"}</span>
                    <span className="mt-2 flex items-end justify-between"><span className="text-[11px] text-gris">{fechaCl(c.fecha)} · vence {fechaCl(vence(c))}</span><span className="font-bold tabular-nums text-tinta">{clp(c.total)}</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-borde bg-superficie md:block">
            <table className="w-full min-w-[56rem] text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>Cotización</th><th className={TH}>Cliente</th><th className={TH}>Tipo</th><th className={TH}>Fecha / validez</th><th className={TH}>Estado</th><th className={`${TH} text-right`}>Total</th></tr></thead>
              <tbody className="divide-y divide-borde">
                {com.cotizaciones.map((c) => (
                  <tr key={c.id} className="hover:bg-tinta/[0.02]">
                    <td className={TD}><Link href={`${RUTA_LEADS}/cotizaciones/${c.id}`} className="font-semibold text-tinta hover:text-naranjo">{c.numero}{c.version > 1 ? ` V${c.version}` : ""}</Link><span className="block max-w-[18rem] truncate text-[11px] text-gris">{c.titulo}</span></td>
                    <td className={`${TD} max-w-[14rem] truncate`}>{c.clienteId ? v.nombreDe.get(c.clienteId) : "—"}</td>
                    <td className={`${TD} text-xs`}>{ETIQUETA_TIPO_VENTA[c.tipo]}</td>
                    <td className={`${TD} text-xs text-gris`}>{fechaCl(c.fecha)}<span className="block">vence {fechaCl(vence(c))}</span></td>
                    <td className={TD}><Chip texto={c.estado === "enviada" && vence(c) < v.hoy ? "Vencida" : ETIQUETA_ESTADO_COTIZACION[c.estado]} tono={c.estado === "enviada" && vence(c) < v.hoy ? TONO_COT.vencida : TONO_COT[c.estado]} />{c.enviadaEn && <span className="mt-0.5 block text-[10px] text-gris">enviada {fechaCl(c.enviadaEn.slice(0, 10))}</span>}</td>
                    <td className={`${TD} text-right font-semibold`}><Monto valor={c.total} /><span className="block text-[10px] font-normal text-gris">neto {clp(c.neto)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
