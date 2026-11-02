import Link from "next/link";
import { IconChartBar } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import { Patente } from "@/components/flota/Visual";
import { listarContratos, listarServicios, listarVehiculos } from "@/lib/flota";
import { ETIQUETA_TIPO_SERVICIO, formatearMonto, nombreVehiculo, resumirCostos } from "@/lib/flota-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { k: "mes", t: "Este mes" },
  { k: "trimestre", t: "Últimos 3 meses" },
  { k: "anio", t: "Este año" },
  { k: "12m", t: "Últimos 12 meses" },
] as const;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rango(k: string): [string, string] {
  const hoy = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const a = hoy.getFullYear(), m = hoy.getMonth();
  if (k === "mes") return [iso(new Date(Date.UTC(a, m, 1))), iso(hoy)];
  if (k === "trimestre") return [iso(new Date(Date.UTC(a, m - 2, 1))), iso(hoy)];
  if (k === "12m") return [iso(new Date(Date.UTC(a, m - 11, 1))), iso(hoy)];
  return [`${a}-01-01`, iso(hoy)];
}

export default async function CostosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo } = await searchParams;
  const k = PERIODOS.some((p) => p.k === periodo) ? periodo! : "anio";
  const [desde, hasta] = rango(k);
  const [vehiculos, servicios, contratos] = await Promise.all([listarVehiculos(), listarServicios(), listarContratos()]);
  const r = resumirCostos(vehiculos, servicios, contratos, desde, hasta);
  const vehiculo = new Map(vehiculos.map((v) => [v.id, v]));
  const maxMes = Math.max(1, ...r.porMes.map((m) => m.servicios + m.contratos));
  const maxVeh = Math.max(1, ...r.porVehiculo.map((f) => f.total));
  const conCosto = r.porVehiculo.length;

  return (
    <div className="space-y-5">
      <IntroSeccion
        Icono={IconChartBar}
        tono="bg-emerald-500/10 text-emerald-600"
        titulo="Costos de la flota"
        bajada="Servicios hechos más cuotas de contratos, por mes, por vehículo y por tipo de gasto."
      />

      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((p) => (
          <Link
            key={p.k}
            href={`/flota/costos?periodo=${p.k}`}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${k === p.k ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"}`}
          >
            {p.t}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi etiqueta="Total" valor={formatearMonto(r.total)} fuerte />
        <Kpi etiqueta="Servicios" valor={formatearMonto(r.servicios)} />
        <Kpi etiqueta="Contratos" valor={formatearMonto(r.contratos)} />
        <Kpi etiqueta="Promedio por vehículo" valor={formatearMonto(conCosto ? r.total / conCosto : 0)} />
      </div>

      {r.total === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>Sin costos en este período.</div>
      ) : (
        <>
          {/* ── Por mes ── */}
          <section className={`${TARJETA} p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gris">Por mes</h2>
              <div className="flex gap-4 text-[11px] text-gris">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-naranjo" /> Servicios</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" /> Contratos</span>
              </div>
            </div>
            <div className="flex h-48 items-end gap-2">
              {r.porMes.map((m) => {
                const total = m.servicios + m.contratos;
                return (
                  <div key={m.mes} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${formatearMonto(total)}`}>
                    <span className="text-[10px] font-semibold tabular-nums text-gris opacity-0 transition group-hover:opacity-100">{formatearMonto(total)}</span>
                    <div className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(total / maxMes) * 100}%` }}>
                      <div className="bg-naranjo" style={{ height: `${total ? (m.servicios / total) * 100 : 0}%` }} />
                      <div className="bg-indigo-400" style={{ height: `${total ? (m.contratos / total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-[11px] text-gris">{MESES[Number(m.mes.slice(5)) - 1]}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {/* ── Por vehículo ── */}
            <section className={`${TARJETA} p-5`}>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-gris">Por vehículo</h2>
              <ul className="space-y-3">
                {r.porVehiculo.map((f) => {
                  const v = vehiculo.get(f.vehiculoId);
                  return (
                    <li key={f.vehiculoId}>
                      <Link href={`/flota/vehiculos/${f.vehiculoId}`} className="group block">
                        <div className="mb-1 flex items-center gap-2">
                          <Patente patente={f.patente} chica />
                          <span className="min-w-0 flex-1 truncate text-xs text-gris group-hover:text-naranjo">{v ? nombreVehiculo(v) : ""}</span>
                          <span className="text-sm font-bold tabular-nums text-tinta">{formatearMonto(f.total)}</span>
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full bg-borde/50" style={{ width: `${(f.total / maxVeh) * 100}%` }}>
                          <div className="bg-naranjo" style={{ width: `${(f.servicios / f.total) * 100}%` }} />
                          <div className="bg-indigo-400" style={{ width: `${(f.contratos / f.total) * 100}%` }} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ── Por tipo ── */}
            <section className={`${TARJETA} p-5`}>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-gris">Servicios por tipo</h2>
              {r.porTipo.length === 0 ? (
                <p className="text-sm text-gris">Sin servicios en el período.</p>
              ) : (
                <ul className="space-y-3">
                  {r.porTipo.map((t) => (
                    <li key={t.tipo}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-tinta">{ETIQUETA_TIPO_SERVICIO[t.tipo]}</span>
                        <span className="tabular-nums text-gris">
                          {formatearMonto(t.total)} · {Math.round((t.total / r.servicios) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-borde/50">
                        <div className="h-2 rounded-full bg-naranjo" style={{ width: `${(t.total / r.servicios) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={fuerte ? "banda-contraste rounded-xl p-4" : `${TARJETA} p-4`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${fuerte ? "texto-banda-45" : "text-gris"}`}>{etiqueta}</p>
      <p className={`mt-1 font-condensed text-2xl font-bold tabular-nums ${fuerte ? "texto-banda" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}
