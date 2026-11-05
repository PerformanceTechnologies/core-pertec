import Link from "next/link";
import { IconFilePlus, IconPlus } from "@tabler/icons-react";
import { RUTA_FIN, cargarComercial, cargarVista } from "@/lib/fin/datos";
import { clp, clpCorto, fechaCl } from "@/lib/fin/reglas";
import { ETIQUETA_ESTADO_COTIZACION, ETIQUETA_TIPO_VENTA } from "@/lib/fin/modelo";
import { Banda, Chip, Monto, Pestanas, TD, TH, Vacio } from "@/components/fin/piezas";
import { BOTON, ConVentana } from "@/components/fin/ui";
import KanbanOportunidades, { FormOportunidad } from "@/components/fin/KanbanOportunidades";

export const dynamic = "force-dynamic";

const TONO_COT: Record<string, string> = {
  borrador: "bg-slate-500/10 text-gris", enviada: "bg-sky-500/10 text-info", aceptada: "bg-emerald-500/12 text-ok",
  rechazada: "bg-rose-500/12 text-alerta", vencida: "bg-amber-500/12 text-aviso", anulada: "bg-slate-500/10 text-slate-500", reemplazada: "bg-slate-500/10 text-slate-500",
};

export default async function ComercialPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const [v, com] = await Promise.all([cargarVista(), cargarComercial()]);
  const ver = sp.ver ?? "oportunidades";
  const clientes = v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  const abiertas = com.oportunidades.filter((o) => !["ganada", "perdida"].includes(o.etapa));
  const ponderado = abiertas.reduce((s, o) => s + (o.montoEstimado * o.probabilidad) / 100, 0);
  // Forecast mensual: lo ponderado por mes de cierre estimado.
  const porMes = new Map<string, number>();
  for (const o of abiertas) if (o.fechaCierre) porMes.set(o.fechaCierre.slice(0, 7), (porMes.get(o.fechaCierre.slice(0, 7)) ?? 0) + (o.montoEstimado * o.probabilidad) / 100);
  const enviadas = com.cotizaciones.filter((c) => c.estado === "enviada");
  const vence = (c: { fecha: string; validezDias: number }) => new Date(Date.parse(`${c.fecha}T12:00:00Z`) + c.validezDias * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <Banda
        etiqueta="Comercial"
        valor={clpCorto(abiertas.reduce((s, o) => s + o.montoEstimado, 0))}
        bajada="Pipeline abierto (monto estimado). Al aceptar una cotización, la oportunidad pasa a Ganada y nacen los hitos a facturar."
        cifras={[
          { etiqueta: "Forecast ponderado", valor: clpCorto(ponderado) },
          { etiqueta: "Oportunidades abiertas", valor: String(abiertas.length) },
          { etiqueta: "Cotizaciones enviadas", valor: String(enviadas.length), detalle: clpCorto(enviadas.reduce((s, c) => s + c.total, 0)) },
          { etiqueta: "Próximo mes", valor: clpCorto([...porMes.entries()].sort()[0]?.[1] ?? 0), detalle: [...porMes.keys()].sort()[0] ?? "sin cierres" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Pestanas base={`${RUTA_FIN}/comercial`} actual={ver} opciones={[{ clave: "oportunidades", etiqueta: "Oportunidades", n: com.oportunidades.length }, { clave: "cotizaciones", etiqueta: "Cotizaciones", n: com.cotizaciones.length }]} />
        <span className="flex-1" />
        <Link href={`${RUTA_FIN}/comercial/cotizaciones/nueva`} className={BOTON}><IconFilePlus size={15} /> Nueva cotización</Link>
        <ConVentana boton={<><IconPlus size={15} /> Nueva oportunidad</>} titulo="Nueva oportunidad">
          {<FormOportunidad clientes={clientes} />}
        </ConVentana>
      </div>

      {ver === "oportunidades" ? (
        com.oportunidades.length === 0 ? (
          <Vacio titulo="Todavía no hay oportunidades" texto="Crea la primera y arrástrala entre etapas a medida que avanza." />
        ) : (
          <KanbanOportunidades oportunidades={com.oportunidades} clientes={clientes} hoy={v.hoy} />
        )
      ) : com.cotizaciones.length === 0 ? (
        <Vacio titulo="Todavía no hay cotizaciones" texto="Crea una con «Nueva cotización». Al aceptarla se generan los hitos facturables." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[56rem] text-sm">
            <thead><tr className="border-b border-borde"><th className={TH}>Cotización</th><th className={TH}>Cliente</th><th className={TH}>Tipo</th><th className={TH}>Fecha / validez</th><th className={TH}>Estado</th><th className={`${TH} text-right`}>Total</th></tr></thead>
            <tbody className="divide-y divide-borde">
              {com.cotizaciones.map((c) => (
                <tr key={c.id} className="hover:bg-tinta/[0.02]">
                  <td className={TD}><Link href={`${RUTA_FIN}/comercial/cotizaciones/${c.id}`} className="font-semibold text-tinta hover:text-naranjo">{c.numero}{c.version > 1 ? ` V${c.version}` : ""}</Link><span className="block max-w-[18rem] truncate text-[11px] text-gris">{c.titulo}</span></td>
                  <td className={`${TD} max-w-[14rem] truncate`}>{c.clienteId ? v.nombreDe.get(c.clienteId) : "—"}</td>
                  <td className={`${TD} text-xs`}>{ETIQUETA_TIPO_VENTA[c.tipo]}</td>
                  <td className={`${TD} text-xs text-gris`}>{fechaCl(c.fecha)}<span className="block">vence {fechaCl(vence(c))}</span></td>
                  <td className={TD}><Chip texto={c.estado === "enviada" && vence(c) < v.hoy ? "Vencida" : ETIQUETA_ESTADO_COTIZACION[c.estado]} tono={c.estado === "enviada" && vence(c) < v.hoy ? TONO_COT.vencida : TONO_COT[c.estado]} /></td>
                  <td className={`${TD} text-right font-semibold`}><Monto valor={c.total} /><span className="block text-[10px] font-normal text-gris">neto {clp(c.neto)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
