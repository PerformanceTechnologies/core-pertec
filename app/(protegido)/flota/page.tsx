import Link from "next/link";
import { IconAlertTriangle, IconCircleCheck, IconSteeringWheel } from "@tabler/icons-react";
import FormularioVehiculo from "@/components/flota/FormularioVehiculo";
import FormularioServicio from "@/components/flota/FormularioServicio";
import { ChipVencimiento, ESTILO_ESTADO, IconoVehiculo, Patente } from "@/components/flota/Visual";
import { listarContratos, listarMarcas, listarModelos, listarServicios, listarVehiculos } from "@/lib/flota";
import {
  ESTADOS_TABLERO,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO_SERVICIO,
  alertasDeFlota,
  formatearMonto,
  formatearNumero,
  nombreVehiculo,
  resumirCostos,
} from "@/lib/flota-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function TableroFlotaPage() {
  const [vehiculos, servicios, contratos, marcas, modelos] = await Promise.all([
    listarVehiculos(false),
    listarServicios(),
    listarContratos(),
    listarMarcas(),
    listarModelos(),
  ]);
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const hoyIso = hoy.toISOString().slice(0, 10);
  const mes = resumirCostos(vehiculos, servicios, contratos, inicioMes, hoyIso);
  const alertas = alertasDeFlota(vehiculos, contratos, hoy);
  const programados = servicios.filter((s) => s.estado === "programado" || s.estado === "en_curso");
  const patente = new Map(vehiculos.map((v) => [v.id, v]));
  const minimos = vehiculos.map((v) => ({ id: v.id, patente: v.patente, nombre: nombreVehiculo(v) }));
  const cuenta = (e: string) => vehiculos.filter((v) => v.estado === e).length;

  return (
    <div className="space-y-7">
      {/* ── Banda ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Flota hoy
            </span>
            <p className="texto-banda mt-3 font-condensed text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">
              {vehiculos.length} <span className="text-3xl sm:text-4xl">{vehiculos.length === 1 ? "vehículo" : "vehículos"}</span>
            </p>
            <p className="texto-banda-65 mt-3 text-sm">
              {cuenta("disponible")} disponibles · {cuenta("asignado")} asignados · {cuenta("en_taller")} en taller. Este mes van{" "}
              {formatearMonto(mes.total)} en costos.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <FormularioVehiculo marcas={marcas} modelos={modelos} />
              {vehiculos.length > 0 && <FormularioServicio vehiculos={minimos} />}
            </div>
          </div>
          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-5 rounded-xl border px-5 py-4 sm:grid-cols-4 lg:min-w-[34rem]">
            <Cifra etiqueta="Costo del mes" valor={formatearMonto(mes.total)} href="/flota/costos" />
            <Cifra etiqueta="Servicios pendientes" valor={String(programados.length)} href="/flota/servicios" />
            <Cifra etiqueta="Contratos activos" valor={String(contratos.filter((c) => !c.cerrado).length)} href="/flota/contratos" />
            <Cifra etiqueta="Alertas" valor={String(alertas.length)} alerta={alertas.length > 0} href="#alertas" />
          </dl>
        </div>
      </header>

      {vehiculos.length === 0 ? (
        <div className={`${TARJETA} flex flex-col items-center gap-3 p-12 text-center`}>
          <IconSteeringWheel size={36} className="text-naranjo" stroke={1.5} />
          <p className="text-base font-bold text-tinta">Todavía no hay vehículos</p>
          <p className="max-w-md text-sm text-gris">Agrega el primero con su patente. Si quieres elegir marca y modelo, créalos antes en Configuración.</p>
          <FormularioVehiculo marcas={marcas} modelos={modelos} />
        </div>
      ) : (
        <>
          {/* ── Tablero por estado (el kanban de Odoo) ── */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {ESTADOS_TABLERO.map((e) => {
              const deEste = vehiculos.filter((v) => v.estado === e);
              return (
                <section key={e} className="rounded-2xl border border-borde bg-tinta/[0.02] p-3">
                  <h2 className="mb-3 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wide text-gris">
                    <span className={`h-2 w-2 rounded-full ${ESTILO_ESTADO[e].punto}`} />
                    {ETIQUETA_ESTADO[e]}
                    <span className="ml-auto rounded-full bg-superficie px-2 py-0.5 text-[11px] text-tinta">{deEste.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {deEste.length === 0 && <p className="px-1 py-4 text-center text-xs text-gris-suave">Ninguno</p>}
                    {deEste.map((v) => (
                      <Link
                        key={v.id}
                        href={`/flota/vehiculos/${v.id}`}
                        className={`${TARJETA} block p-3 transition hover:-translate-y-0.5 hover:border-naranjo/50`}
                      >
                        <div className="flex items-start gap-3">
                          <IconoVehiculo categoria={v.categoria} estado={v.estado} />
                          <div className="min-w-0 flex-1">
                            <Patente patente={v.patente} chica />
                            <p className="mt-1 truncate text-sm font-semibold text-tinta">{nombreVehiculo(v)}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gris">
                          {v.conductor && <span className="inline-flex items-center gap-1"><IconSteeringWheel size={12} /> {v.conductor}</span>}
                          {v.faena && <span>{v.faena}</span>}
                          {v.odometro !== null && <span className="tabular-nums">{formatearNumero(v.odometro)} {v.unidadOdometro}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* ── Alertas y próximos servicios ── */}
          <div id="alertas" className="grid scroll-mt-6 gap-5 lg:grid-cols-2">
            <section className={`${TARJETA} overflow-hidden`}>
              <h2 className="flex items-center gap-2 border-b border-borde px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-600">
                <IconAlertTriangle size={15} /> Vencimientos · {alertas.length}
              </h2>
              {alertas.length === 0 ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gris">
                  <IconCircleCheck size={18} className="text-emerald-500" /> Todos los documentos al día.
                </p>
              ) : (
                <ul className="max-h-96 divide-y divide-borde overflow-y-auto">
                  {alertas.map((a, i) => (
                    <li key={i}>
                      <Link href={`/flota/vehiculos/${a.vehiculoId}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-tinta/[0.02]">
                        <Patente patente={a.patente} chica />
                        <span className="min-w-0 flex-1 truncate text-sm text-tinta">{a.que}</span>
                        <ChipVencimiento fecha={a.fecha} corto />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${TARJETA} overflow-hidden`}>
              <h2 className="flex items-center justify-between border-b border-borde px-4 py-3 text-xs font-bold uppercase tracking-wide text-gris">
                Servicios pendientes · {programados.length}
                <Link href="/flota/servicios" className="text-[11px] font-semibold normal-case tracking-normal hover:text-naranjo">Ver todos</Link>
              </h2>
              {programados.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gris">No hay mantenciones programadas.</p>
              ) : (
                <ul className="divide-y divide-borde">
                  {programados.slice(0, 8).map((s) => {
                    const v = patente.get(s.vehiculoId);
                    return (
                      <li key={s.id}>
                        <Link href={`/flota/vehiculos/${s.vehiculoId}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-tinta/[0.02]">
                          {v && <Patente patente={v.patente} chica />}
                          <span className="min-w-0 flex-1 truncate text-sm text-tinta">{ETIQUETA_TIPO_SERVICIO[s.tipo]}{s.descripcion ? ` · ${s.descripcion}` : ""}</span>
                          <span className="text-xs text-gris">{new Date(s.fecha + "T00:00:00").toLocaleDateString("es-CL")}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, href, alerta }: { etiqueta: string; valor: string; href: string; alerta?: boolean }) {
  return (
    <Link href={href} className="group block">
      <dt className="texto-banda-45 text-[11px] font-semibold uppercase tracking-wide">{etiqueta}</dt>
      <dd className={`mt-1 font-condensed text-2xl font-bold tabular-nums ${alerta ? "text-amber-400" : "texto-banda"} group-hover:text-naranjo`}>{valor}</dd>
    </Link>
  );
}
