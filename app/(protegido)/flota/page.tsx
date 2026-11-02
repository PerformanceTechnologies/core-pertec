import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChartBar,
  IconCircleCheck,
  IconClockHour4,
  IconLayoutKanban,
  IconSteeringWheel,
  IconTool,
} from "@tabler/icons-react";
import FormularioVehiculo from "@/components/flota/FormularioVehiculo";
import FormularioServicio from "@/components/flota/FormularioServicio";
import FormularioContrato from "@/components/flota/FormularioContrato";
import { ChipEstado, IconoVehiculo, Patente } from "@/components/flota/Visual";
import { listarContratos, listarMarcas, listarModelos, listarServicios, listarVehiculos } from "@/lib/flota";
import {
  ESTADOS_TABLERO,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO_SERVICIO,
  alertasDeFlota,
  formatearMonto,
  formatearNumero,
  type Alerta,
} from "@/lib/flota-modelo";
import { SOMBRA_CALIDA, TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const COLOR_ESTADO = { disponible: "#10b981", asignado: "#0ea5e9", en_taller: "#f59e0b", fuera_servicio: "#f43f5e" } as const;
const fechaCorta = (f: string) => new Date(f + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" });

export default async function TableroFlotaPage() {
  const [vehiculos, servicios, contratos, marcas, modelos] = await Promise.all([
    listarVehiculos(false),
    listarServicios(),
    listarContratos(),
    listarMarcas(),
    listarModelos(),
  ]);
  const hoy = new Date();
  const mesActual = hoy.toISOString().slice(0, 7);
  const costoMes = servicios.filter((s) => s.estado === "hecho" && s.fecha.startsWith(mesActual)).reduce((t, s) => t + s.costo, 0);
  const alertas = alertasDeFlota(vehiculos, contratos, hoy);
  const programados = servicios.filter((s) => s.estado === "programado" || s.estado === "en_curso");
  const recientes = servicios.filter((s) => s.estado === "hecho").slice(0, 6);
  const vehiculo = new Map(vehiculos.map((v) => [v.id, v]));
  const minimos = vehiculos.map((v) => ({ id: v.id, patente: v.patente, nombre: modeloDe(v) ?? v.patente }));
  const enUso = vehiculos.filter((v) => v.estado === "asignado").length;

  // Las alertas, juntas por vehículo: tres documentos sin fecha de un auto son un solo aviso.
  const porVehiculo = new Map<string, Alerta[]>();
  for (const a of alertas) porVehiculo.set(a.vehiculoId, [...(porVehiculo.get(a.vehiculoId) ?? []), a]);
  const urgentes = [...porVehiculo.values()].filter((as) => as.some((a) => a.estado !== "sin_fecha"));
  const sinFecha = [...porVehiculo.values()].filter((as) => as.every((a) => a.estado === "sin_fecha"));

  return (
    <div className="space-y-7">
      {/* ── Banda principal ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Flota hoy
            </span>
            <p className="texto-banda mt-3 font-condensed text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">
              {vehiculos.length === 0 ? "0" : `${Math.round((enUso / vehiculos.length) * 100)}%`}
              <span className="texto-banda-65 ml-3 text-2xl font-semibold sm:text-3xl">en uso</span>
            </p>
            <p className="texto-banda-65 mt-3 text-sm">
              {enUso} de {vehiculos.length} {vehiculos.length === 1 ? "vehículo asignado" : "vehículos asignados"} a un conductor. Este mes van{" "}
              {formatearMonto(costoMes)} en servicios.
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-5 rounded-xl border px-5 py-4 sm:grid-cols-4 lg:min-w-[34rem]">
            <Cifra etiqueta="Vehículos" valor={String(vehiculos.length)} href="/flota/vehiculos" />
            <Cifra etiqueta="Gasto del mes" valor={formatearMonto(costoMes)} href="/flota/costos?periodo=mes" />
            <Cifra etiqueta="Pendientes" valor={String(programados.length)} href="/flota/servicios" />
            <Cifra etiqueta="Alertas" valor={String(urgentes.length)} alerta={urgentes.length > 0} href="#alertas" />
          </dl>
        </div>
      </header>

      {/* ── Acciones rápidas ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <FormularioVehiculo marcas={marcas} modelos={modelos} comoTarjeta />
        {vehiculos.length > 0 && (
          <>
            <FormularioServicio vehiculos={minimos} comoTarjeta />
            <FormularioServicio vehiculos={minimos} tipoInicial="combustible" comoTarjeta />
            <FormularioContrato vehiculos={minimos} comoTarjeta />
          </>
        )}
        <Link
          href="/flota/costos"
          className={`group flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 transition hover:-translate-y-0.5 hover:border-naranjo/40 ${SOMBRA_CALIDA}`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <IconChartBar size={20} stroke={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-tinta">Costos</span>
            <span className="block truncate text-[11px] text-gris">Por vehículo y mes</span>
          </span>
        </Link>
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-7">
          {/* ── Estado de la flota ── */}
          <Seccion titulo="Estado de la flota" icono={<IconLayoutKanban size={15} />} enlace={{ href: "/flota/vehiculos", texto: "Ver vehículos" }}>
            {vehiculos.length === 0 ? (
              <Vacio>Sin vehículos todavía. Agrega el primero con «Nuevo vehículo».</Vacio>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ESTADOS_TABLERO.map((e) => {
                  const n = vehiculos.filter((v) => v.estado === e).length;
                  const color = COLOR_ESTADO[e as keyof typeof COLOR_ESTADO];
                  return (
                    <Link
                      key={e}
                      href={`/flota/vehiculos?estado=${e}`}
                      className={`${TARJETA} relative block overflow-hidden p-4 transition hover:-translate-y-0.5 hover:border-naranjo/40`}
                    >
                      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
                      <p className="truncate text-sm font-bold text-tinta">{ETIQUETA_ESTADO[e]}</p>
                      <p className="mt-2 font-condensed text-3xl font-bold tabular-nums text-tinta">{n}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
                        <div className="h-full rounded-full" style={{ width: `${(n / vehiculos.length) * 100}%`, background: color }} />
                      </div>
                      <p className="mt-2 text-[11px] text-gris">{Math.round((n / vehiculos.length) * 100)}% de la flota</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </Seccion>

          {/* ── Vehículos ── */}
          {vehiculos.length > 0 && (
            <Seccion titulo="Vehículos" icono={<IconSteeringWheel size={15} />} enlace={{ href: "/flota/vehiculos", texto: "Ver todos" }}>
              <ul className={`${TARJETA} divide-y divide-borde overflow-hidden`}>
                {vehiculos.slice(0, 8).map((v) => (
                  <li key={v.id}>
                    <Link href={`/flota/vehiculos/${v.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-tinta/[0.02]">
                      <IconoVehiculo categoria={v.categoria} estado={v.estado} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm">
                          <Patente patente={v.patente} chica />
                          <span className="truncate font-semibold text-tinta">{modeloDe(v) ?? <span className="font-normal text-gris">Sin modelo</span>}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gris">
                          {[v.conductor ?? "Sin conductor", v.faena, v.odometro !== null ? `${formatearNumero(v.odometro)} ${v.unidadOdometro}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <ChipEstado estado={v.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {/* ── Últimos servicios ── */}
          <Seccion titulo="Últimos servicios" icono={<IconClockHour4 size={15} />} enlace={{ href: "/flota/servicios", texto: "Ver todos" }}>
            {recientes.length === 0 ? (
              <Vacio>Todavía no hay servicios. Registra una mantención o una carga de combustible con los accesos de arriba.</Vacio>
            ) : (
              <ul className={`${TARJETA} divide-y divide-borde overflow-hidden`}>
                {recientes.map((s) => {
                  const v = vehiculo.get(s.vehiculoId);
                  return (
                    <li key={s.id}>
                      <Link href={`/flota/vehiculos/${s.vehiculoId}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-tinta/[0.02]">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600"><IconTool size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-semibold text-tinta">{ETIQUETA_TIPO_SERVICIO[s.tipo]}</span>
                            {v && <span className="ml-2 font-mono text-xs text-gris">{v.patente}</span>}
                          </p>
                          <p className="truncate text-xs text-gris">{[s.descripcion, s.proveedor, fechaCorta(s.fecha)].filter(Boolean).join(" · ")}</p>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-tinta">{formatearMonto(s.costo)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>
        </div>

        {/* ── Requiere atención ── */}
        <div id="alertas" className="scroll-mt-6">
          <Seccion titulo="Requiere atención" icono={<IconAlertTriangle size={15} />}>
            {urgentes.length === 0 && sinFecha.length === 0 && programados.length === 0 ? (
              <div className={`${TARJETA} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
                <IconCircleCheck size={34} stroke={1.5} className="text-emerald-500" />
                <p className="text-sm font-semibold text-tinta">Todo en orden</p>
                <p className="text-xs text-gris">Documentos al día y sin mantenciones pendientes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {urgentes.length > 0 && (
                  <Grupo titulo="Documentos por vencer" cuenta={urgentes.length} tono="text-rose-600">
                    {urgentes.map((as) => {
                      const peor = as.find((a) => a.estado !== "sin_fecha")!;
                      return (
                        <FilaAlerta
                          key={peor.vehiculoId}
                          href={`/flota/vehiculos/${peor.vehiculoId}`}
                          patente={peor.patente}
                          detalle={as.filter((a) => a.estado !== "sin_fecha").map((a) => a.que).join(", ")}
                          etiqueta={peor.estado === "vencido" ? "Vencido" : peor.dias === 0 ? "Vence hoy" : `En ${peor.dias} d`}
                          tono={peor.estado === "vencido" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-700"}
                        />
                      );
                    })}
                  </Grupo>
                )}
                {programados.length > 0 && (
                  <Grupo titulo="Servicios pendientes" cuenta={programados.length} tono="text-sky-600" href="/flota/servicios">
                    {programados.slice(0, 5).map((s) => (
                      <FilaAlerta
                        key={s.id}
                        href={`/flota/vehiculos/${s.vehiculoId}`}
                        patente={vehiculo.get(s.vehiculoId)?.patente ?? "—"}
                        detalle={`${ETIQUETA_TIPO_SERVICIO[s.tipo]}${s.descripcion ? ` · ${s.descripcion}` : ""}`}
                        etiqueta={fechaCorta(s.fecha)}
                        tono="bg-sky-500/10 text-sky-700"
                      />
                    ))}
                  </Grupo>
                )}
                {sinFecha.length > 0 && (
                  <Grupo titulo="Faltan fechas de documentos" cuenta={sinFecha.length} tono="text-gris">
                    {sinFecha.map((as) => (
                      <FilaAlerta
                        key={as[0].vehiculoId}
                        href={`/flota/vehiculos/${as[0].vehiculoId}`}
                        patente={as[0].patente}
                        detalle={as.map((a) => a.que).join(", ")}
                        etiqueta="Completar"
                        tono="bg-borde/70 text-gris"
                      />
                    ))}
                  </Grupo>
                )}
              </div>
            )}
          </Seccion>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── piezas ─────────────────────────────

function modeloDe(v: { marca: string | null; modelo: string | null }): string | null {
  return [v.marca, v.modelo].filter(Boolean).join(" ") || null;
}

function Cifra({ etiqueta, valor, href, alerta = false }: { etiqueta: string; valor: string; href: string; alerta?: boolean }) {
  return (
    <Link href={href} className="group">
      <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className={`mt-1 font-condensed text-3xl font-bold tabular-nums transition group-hover:text-naranjo ${alerta ? "text-naranjo" : "texto-banda"}`}>{valor}</dd>
    </Link>
  );
}

function Seccion({ titulo, icono, enlace, children }: { titulo: string; icono: React.ReactNode; enlace?: { href: string; texto: string }; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/60">
          {icono} {titulo}
        </h2>
        <span className="h-px flex-1 bg-borde" />
        {enlace && (
          <Link href={enlace.href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gris transition hover:text-naranjo">
            {enlace.texto} <IconArrowRight size={13} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-borde px-4 py-8 text-center text-sm text-gris">{children}</p>;
}

function Grupo({ titulo, cuenta, tono, href, children }: { titulo: string; cuenta: number; tono: string; href?: string; children: React.ReactNode }) {
  return (
    <div className={`${TARJETA} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-borde px-4 py-2.5">
        <p className={`text-xs font-bold uppercase tracking-wide ${tono}`}>
          {titulo} · {cuenta}
        </p>
        {href && (
          <Link href={href} className="text-[11px] font-semibold text-gris hover:text-naranjo">
            Ver todo
          </Link>
        )}
      </div>
      <ul className="divide-y divide-borde">{children}</ul>
    </div>
  );
}

function FilaAlerta({ href, patente, detalle, etiqueta, tono }: { href: string; patente: string; detalle: string; etiqueta: string; tono: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-tinta/[0.02]">
        <Patente patente={patente} chica />
        <p className="min-w-0 flex-1 truncate text-xs text-gris">{detalle}</p>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tono}`}>{etiqueta}</span>
      </Link>
    </li>
  );
}
