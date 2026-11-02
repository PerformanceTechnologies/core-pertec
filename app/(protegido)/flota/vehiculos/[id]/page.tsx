import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconFileText, IconFiles, IconLayoutDashboard, IconGauge, IconHistory, IconSteeringWheel, IconTool } from "@tabler/icons-react";
import FormularioVehiculo from "@/components/flota/FormularioVehiculo";
import FormularioServicio from "@/components/flota/FormularioServicio";
import FormularioContrato from "@/components/flota/FormularioContrato";
import { AsignarConductor, DarDeBaja, RegistrarLectura, SelectorEstado } from "@/components/flota/AccionesVehiculo";
import { AccionesContrato, AccionesServicio } from "@/components/flota/AccionesFila";
import { ChipEstado, ChipVencimiento, IconoVehiculo, Patente } from "@/components/flota/Visual";
import Documentacion from "@/components/flota/Documentacion";
import {
  listarAsignaciones,
  listarContratos,
  listarDocumentos,
  listarLecturas,
  listarMarcas,
  listarModelos,
  listarServicios,
  listarTiposDocumento,
  obtenerVehiculo,
} from "@/lib/flota";
import {
  armarDocumentos,
  avanceDocumentos,
  ETIQUETA_CATEGORIA,
  ETIQUETA_COMBUSTIBLE,
  ETIQUETA_ESTADO_SERVICIO,
  ETIQUETA_FRECUENCIA,
  ETIQUETA_PROPIEDAD,
  ETIQUETA_TIPO_CONTRATO,
  ETIQUETA_TIPO_SERVICIO,
  formatearMonto,
  formatearNumero,
  nombreVehiculo,
  resumirCostos,
} from "@/lib/flota-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const fechaCl = (f: string) => new Date(f + "T00:00:00").toLocaleDateString("es-CL");

export default async function FichaVehiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const enDocumentos = (await searchParams).tab === "documentos";
  const v = await obtenerVehiculo(id);
  if (!v) notFound();
  const [lecturas, servicios, contratos, asignaciones, marcas, modelos, tipos, documentos] = await Promise.all([
    listarLecturas(id),
    listarServicios({ vehiculoId: id }),
    listarContratos({ vehiculoId: id }),
    listarAsignaciones(id),
    listarMarcas(),
    listarModelos(),
    listarTiposDocumento(),
    listarDocumentos(id),
  ]);
  const documentacion = armarDocumentos(tipos, documentos);
  const filasDoc = [...documentacion.base, ...documentacion.acreditacion];
  const avanceDoc = avanceDocumentos(filasDoc);
  const alertasDoc = filasDoc.filter((f) => f.estado === "vencido" || f.estado === "por_vencer").length;
  const minimo = { id: v.id, patente: v.patente, nombre: nombreVehiculo(v) };
  const anio = new Date().getFullYear();
  const costoAnio = resumirCostos([v], servicios, contratos, `${anio}-01-01`, `${anio}-12-31`);
  const costoTotal = resumirCostos([v], servicios, contratos, "1950-01-01", new Date().toISOString().slice(0, 10));
  const baja = v.estado === "baja";

  return (
    <div className="space-y-5">
      <Link href="/flota/vehiculos" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a vehículos
      </Link>

      {/* ── Cabecera ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-start gap-5">
          <IconoVehiculo categoria={v.categoria} estado={v.estado} grande />
          <div className="min-w-0 flex-1">
            <Patente patente={v.patente} />
            <h2 className="texto-banda mt-2 font-condensed text-3xl font-bold uppercase leading-tight tracking-tight">{nombreVehiculo(v)}</h2>
            <p className="texto-banda-65 mt-1 text-sm">
              {[v.categoria ? ETIQUETA_CATEGORIA[v.categoria] : null, v.anio, v.color, ETIQUETA_COMBUSTIBLE[v.combustible], ETIQUETA_PROPIEDAD[v.propiedad]]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChipEstado estado={v.estado} />
            {!baja && <FormularioVehiculo marcas={marcas} modelos={modelos} vehiculo={v} />}
          </div>
        </div>
        <dl className="borde-banda mt-6 grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 sm:grid-cols-4">
          <Dato etiqueta="Odómetro" valor={v.odometro !== null ? `${formatearNumero(v.odometro)} ${v.unidadOdometro}` : "—"} />
          <Dato etiqueta="Conductor" valor={v.conductor ?? "Sin asignar"} />
          <Dato etiqueta={`Costo ${anio}`} valor={formatearMonto(costoAnio.total)} />
          <Dato etiqueta="Costo total" valor={formatearMonto(costoTotal.total)} />
        </dl>
      </header>

      {/* ── Pestañas de la ficha ── */}
      <nav className="flex gap-1 border-b border-borde">
        {[
          { href: `/flota/vehiculos/${v.id}`, texto: "Resumen", on: !enDocumentos, Icono: IconLayoutDashboard, extra: null },
          {
            href: `/flota/vehiculos/${v.id}?tab=documentos`, texto: "Documentos", on: enDocumentos, Icono: IconFiles,
            extra: alertasDoc > 0 ? { t: String(alertasDoc), tono: "bg-rose-500 text-white" } : { t: `${avanceDoc.listos}/${avanceDoc.total}`, tono: "bg-tinta/[0.06] text-gris" },
          },
        ].map((t) => (
          <Link
            key={t.texto}
            href={t.href}
            scroll={false}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              t.on ? "border-naranjo text-tinta" : "border-transparent text-gris hover:text-tinta"
            }`}
          >
            <t.Icono size={16} stroke={1.75} /> {t.texto}
            {t.extra && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${t.extra.tono}`}>{t.extra.t}</span>}
          </Link>
        ))}
      </nav>

      {enDocumentos ? (
        <Documentacion vehiculoId={v.id} secciones={documentacion} editable={!baja} />
      ) : (
      <>
      {!baja && (
        <div className="flex flex-wrap items-center gap-3">
          <SelectorEstado id={v.id} estado={v.estado} />
          <div className="ml-auto flex flex-wrap gap-2">
            <FormularioServicio vehiculo={minimo} />
            <FormularioContrato vehiculo={minimo} />
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* ── Documentos, en corto: el detalle va en su pestaña ── */}
          <Link href={`/flota/vehiculos/${v.id}?tab=documentos`} scroll={false} className={`${TARJETA} group flex flex-wrap items-center gap-4 p-4 transition hover:border-naranjo/40`}>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-naranjo/10 text-naranjo"><IconFiles size={22} stroke={1.75} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-tinta">Documentos</p>
              <p className="text-xs text-gris">
                {avanceDoc.listos} de {avanceDoc.total} al día{alertasDoc > 0 ? ` · ${alertasDoc} vencido${alertasDoc > 1 ? "s" : ""} o por vencer` : ""}
              </p>
            </div>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-tinta/[0.06]">
              <div className={`h-full rounded-full ${avanceDoc.listos === avanceDoc.total ? "bg-emerald-500" : "bg-naranjo"}`} style={{ width: `${avanceDoc.total ? (avanceDoc.listos / avanceDoc.total) * 100 : 0}%` }} />
            </div>
            <span className="text-xs font-semibold text-gris group-hover:text-naranjo">Ver documentos →</span>
          </Link>

          {/* ── Servicios ── */}
          <Bloque titulo={`Servicios · ${servicios.length}`} Icono={IconTool}>
            {servicios.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gris">Sin servicios registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-borde">
                    {servicios.map((s) => (
                      <tr key={s.id} className={s.estado === "cancelado" ? "opacity-50" : ""}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gris">{fechaCl(s.fecha)}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-tinta">{ETIQUETA_TIPO_SERVICIO[s.tipo]}</span>
                          {s.estado !== "hecho" && <span className="ml-2 rounded bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">{ETIQUETA_ESTADO_SERVICIO[s.estado]}</span>}
                          <span className="block text-xs text-gris">{[s.descripcion, s.proveedor, s.odometro !== null ? `${formatearNumero(s.odometro)} ${v.unidadOdometro}` : null].filter(Boolean).join(" · ")}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-tinta">{formatearMonto(s.costo)}</td>
                        <td className="px-2 py-2.5 text-right"><AccionesServicio id={s.id} vehiculoId={v.id} estado={s.estado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloque>

          {/* ── Contratos ── */}
          <Bloque titulo={`Contratos · ${contratos.length}`} Icono={IconFileText}>
            {contratos.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gris">Sin contratos. Agrega el seguro o el leasing para que avise antes de vencer.</p>
            ) : (
              <ul className="divide-y divide-borde">
                {contratos.map((c) => (
                  <li key={c.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${c.cerrado ? "opacity-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-tinta">
                        {ETIQUETA_TIPO_CONTRATO[c.tipo]}{c.proveedor ? ` · ${c.proveedor}` : ""}
                        {c.referencia && <span className="ml-2 font-mono text-xs text-gris">{c.referencia}</span>}
                      </p>
                      <p className="text-xs text-gris">
                        {fechaCl(c.inicio)} → {c.fin ? fechaCl(c.fin) : "indefinido"} · {formatearMonto(c.costoRecurrente)} {ETIQUETA_FRECUENCIA[c.frecuencia].toLowerCase()}
                      </p>
                    </div>
                    {c.cerrado ? <span className="text-[11px] font-bold uppercase text-gris">Cerrado</span> : <ChipVencimiento fecha={c.fin} corto />}
                    <AccionesContrato id={c.id} vehiculoId={v.id} cerrado={c.cerrado} />
                  </li>
                ))}
              </ul>
            )}
          </Bloque>
        </div>

        <div className="space-y-5">
          {/* ── Conductor ── */}
          <Bloque titulo="Conductor" Icono={IconSteeringWheel}>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-tinta">{v.conductor ?? "Sin conductor"}</p>
                  {v.faena && <p className="text-xs text-gris">{v.faena}</p>}
                </div>
                {!baja && <AsignarConductor id={v.id} conductor={v.conductor} faena={v.faena} />}
              </div>
              {asignaciones.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gris"><IconHistory size={13} /> Historial</p>
                  <ul className="space-y-1 text-xs">
                    {asignaciones.slice(0, 6).map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span className="truncate text-tinta">{a.conductor}{a.faena ? ` · ${a.faena}` : ""}</span>
                        <span className="shrink-0 text-gris">{fechaCl(a.desde)} – {a.hasta ? fechaCl(a.hasta) : "hoy"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Bloque>

          {/* ── Odómetro ── */}
          <Bloque titulo="Odómetro" Icono={IconGauge}>
            <div className="space-y-4 p-4">
              {!baja && <RegistrarLectura id={v.id} unidad={v.unidadOdometro} ultima={v.odometro} />}
              {lecturas.length === 0 ? (
                <p className="text-center text-sm text-gris">Sin lecturas todavía.</p>
              ) : (
                <ul className="divide-y divide-borde rounded-lg border border-borde text-sm">
                  {lecturas.slice(0, 8).map((l, i) => {
                    const anterior = lecturas[i + 1]?.valor;
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-xs text-gris">{fechaCl(l.fecha)}</span>
                        <span className="font-semibold tabular-nums text-tinta">
                          {formatearNumero(l.valor)} {v.unidadOdometro}
                          {anterior !== undefined && <span className="ml-2 text-xs font-normal text-emerald-600">+{formatearNumero(l.valor - anterior)}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Bloque>

          {(v.numeroChasis || v.numeroMotor || v.fechaAdquisicion || v.valorCompra > 0 || v.notas) && (
            <Bloque titulo="Datos de compra" Icono={IconFileText}>
              <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
                {v.numeroChasis && <Fila e="Chasis" v={v.numeroChasis} mono />}
                {v.numeroMotor && <Fila e="Motor" v={v.numeroMotor} mono />}
                {v.fechaAdquisicion && <Fila e="Adquirido" v={fechaCl(v.fechaAdquisicion)} />}
                {v.valorCompra > 0 && <Fila e="Valor de compra" v={formatearMonto(v.valorCompra)} />}
                {v.notas && <div className="col-span-2"><dt className="text-xs text-gris">Notas</dt><dd className="whitespace-pre-line text-tinta">{v.notas}</dd></div>}
              </dl>
            </Bloque>
          )}

          {!baja && (
            <div className="flex justify-end">
              <DarDeBaja id={v.id} />
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function Bloque({ titulo, Icono, children }: { titulo: string; Icono: typeof IconTool; children: React.ReactNode }) {
  return (
    <section className={`${TARJETA} overflow-hidden`}>
      <h3 className="flex items-center gap-2 border-b border-borde px-4 py-3 text-xs font-bold uppercase tracking-wide text-gris">
        <Icono size={15} /> {titulo}
      </h3>
      {children}
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="texto-banda-45 text-[11px] font-semibold uppercase tracking-wide">{etiqueta}</dt>
      <dd className="texto-banda mt-1 truncate font-condensed text-xl font-bold tabular-nums">{valor}</dd>
    </div>
  );
}

function Fila({ e, v, mono }: { e: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gris">{e}</dt>
      <dd className={`text-tinta ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
