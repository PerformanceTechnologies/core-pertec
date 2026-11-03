import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBook2,
  IconCategory,
  IconChartDonut,
  IconChecklist,
  IconChevronDown,
  IconCircleCheck,
  IconCopy,
  IconInfoCircle,
  type Icon,
} from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, fechaCorta, monto, montoCorto, pct, type FilaUniverso } from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import { COLORES, Seccion, SinRegistro } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("es-CL");

/** Cómo se lee cada observación de la hoja de control: qué está bien y qué pide mirar. */
function tonoObservacion(concepto: string, valor: number): "ok" | "aviso" | "alerta" | "neutro" {
  const c = concepto.toLowerCase();
  if (c.includes("no cuadran")) return valor > 0 ? "alerta" : "ok";
  if (c.includes("revisar")) return valor > 0 ? "aviso" : "ok";
  if (c.includes("cuadran al peso")) return "ok";
  return "neutro";
}

const TONO: Record<ReturnType<typeof tonoObservacion>, { caja: string; cifra: string; Icono: Icon | null }> = {
  ok: { caja: "border-emerald-500/30", cifra: "text-emerald-600 dark:text-emerald-400", Icono: IconCircleCheck },
  aviso: { caja: "border-amber-500/40", cifra: "text-amber-600 dark:text-amber-400", Icono: IconAlertTriangle },
  alerta: { caja: "border-rose-500/40", cifra: "text-rose-600 dark:text-rose-400", Icono: IconAlertTriangle },
  neutro: { caja: "border-borde", cifra: "text-tinta", Icono: null },
};

export default async function ControlPage() {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const vista = await cargarVista();
  const imp = vista.datos.importacion;
  if (!imp) return <SinRegistro esAdmin={usuario.rol === "admin"} />;
  const { control, categorias, lineas } = vista.datos;
  const total = vista.resumen.total;

  // ── Categorías: montos por subcategoría, agrupados en el orden del resumen (de mayor a menor) ──
  const porSub = new Map<string, { lineas: number; monto: number }>();
  for (const l of lineas) {
    const k = `${l.categoria}|${l.subcategoria}`;
    const x = porSub.get(k) ?? { lineas: 0, monto: 0 };
    x.lineas++;
    x.monto += l.valorAjustado;
    porSub.set(k, x);
  }
  const colorCat = new Map(vista.resumen.porCategoria.map((c, i) => [c.nombre, COLORES[i % COLORES.length]]));
  const grupos = vista.resumen.porCategoria.map((c) => {
    const definidas = categorias.filter((x) => x.categoria === c.nombre);
    const subs = definidas
      .map((s) => ({ ...s, ...(porSub.get(`${c.nombre}|${s.subcategoria}`) ?? { lineas: 0, monto: 0 }) }))
      .sort((a, b) => b.monto - a.monto);
    const criterio = [...new Set(definidas.map((s) => s.criterio).filter(Boolean))].join(" ");
    return { ...c, subs, criterio };
  });

  // ── Universo: el embudo de la hoja de control ──
  // La última fila («Monto en alcance según hoja Detalle») es una comprobación, no un paso.
  const pasos = control.universo.filter((u) => u.documentos !== null);
  const comprobacion = control.universo.find((u) => u.documentos === null && u.monto !== null);
  const enAlcanceDoc = pasos[pasos.length - 1];
  const cuadra = comprobacion?.monto != null && enAlcanceDoc?.monto != null ? Math.abs(comprobacion.monto - enAlcanceDoc.monto) <= 2 : null;

  // ── Destinos del gasto del período ──
  const totalDestinos = control.destinos.reduce((s, d) => s + d.monto, 0);
  const enAlcance = control.destinos.filter((d) => d.enAlcance).reduce((s, d) => s + d.monto, 0);
  const fuera = control.destinos.filter((d) => !d.enAlcance).sort((a, b) => b.monto - a.monto);
  const maxFuera = fuera[0]?.monto ?? 1;

  // ── Duplicados por tipo ──
  const dupPorTipo = new Map<string, number>();
  for (const d of control.duplicados) dupPorTipo.set(d.tipo || "Otro", (dupPorTipo.get(d.tipo || "Otro") ?? 0) + 1);

  return (
    <div className="space-y-7">
      {/* ── Banda: cómo se armó el registro ── */}
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Cómo se armó el registro
            </span>
            <p className="texto-banda mt-3 font-condensed text-3xl font-bold leading-tight sm:text-4xl">
              {pasos[0]?.documentos ? `${n(pasos[0].documentos)} PDF revisados` : "Registro de compras"}
              {enAlcanceDoc?.documentos != null && <span className="texto-banda-65"> → {n(enAlcanceDoc.documentos)} con materiales, herramientas o EPP</span>}
            </p>
          </div>
          {cuadra !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${cuadra ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
              title="El monto de los documentos en alcance contra la suma de todas las líneas del detalle"
            >
              {cuadra ? <IconCircleCheck size={15} /> : <IconAlertTriangle size={15} />}
              {cuadra ? "Documentos y detalle cuadran" : "Documentos y detalle no cuadran"}
            </span>
          )}
        </div>

        {pasos.length > 0 && (
          <ol className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(var(--pasos),minmax(0,1fr))]" style={{ ["--pasos" as string]: pasos.length }}>
            {pasos.map((u, i) => (
              <PasoEmbudo key={i} fila={u} ultimo={i === pasos.length - 1} />
            ))}
          </ol>
        )}
        {control.porTipo.length > 0 && (
          <p className="texto-banda-45 mt-4 text-xs">
            Documentos de cobro por tipo:{" "}
            {control.porTipo.map((t, i) => (
              <span key={t.concepto}>
                {i > 0 && " · "}
                <strong className="texto-banda-65">{t.concepto.trim()}</strong> {n(t.documentos ?? 0)}
              </span>
            ))}
          </p>
        )}
      </section>

      {/* ── Calidad de los datos ── */}
      {control.observaciones.length > 0 && (
        <Seccion titulo="Calidad de los datos" icono={<IconChecklist size={15} />}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {control.observaciones.map((o) => {
              const tono = TONO[tonoObservacion(o.concepto, o.valor)];
              const revisar = /revisar/i.test(o.concepto) && !/pdf/i.test(o.concepto);
              const contenido = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-condensed text-3xl font-bold tabular-nums ${tono.cifra}`}>{n(o.valor)}</p>
                    {tono.Icono && <tono.Icono size={18} className={tono.cifra} />}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-gris">{o.concepto}</p>
                </>
              );
              return (
                <li key={o.concepto}>
                  {revisar ? (
                    <Link href={`${RUTA_VH}/buscador?revisar=1`} className={`block h-full rounded-xl border bg-superficie px-4 py-3 transition hover:-translate-y-0.5 ${tono.caja}`}>
                      {contenido}
                    </Link>
                  ) : (
                    <div className={`h-full rounded-xl border bg-superficie px-4 py-3 ${tono.caja}`}>{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {control.noCuadran.length > 0 && (
            <div className="mt-3 rounded-xl border-l-[3px] border-rose-500 bg-rose-500/[0.05] px-4 py-3">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {control.noCuadran.length === 1 ? "Documento que no cuadra" : "Documentos que no cuadran"}: la suma de sus líneas no da el neto. Conviene revisar el PDF.
              </p>
              <ul className="mt-1.5 space-y-1">
                {control.noCuadran.map((d, i) => {
                  const doc = vista.documentos.find((x) => x.folio === d.folio && x.tipo === d.tipo && (!d.proveedor || x.proveedor === d.proveedor));
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-tinta">
                      <span className="tabular-nums text-gris">{fechaCorta(d.fecha)}</span>
                      {doc ? (
                        <Link href={`${RUTA_VH}/documentos/${doc.n}`} className="font-semibold hover:text-naranjo">
                          {d.tipo} {d.folio} · {d.proveedor}
                        </Link>
                      ) : (
                        <span className="font-semibold">{d.tipo} {d.folio} · {d.proveedor}</span>
                      )}
                      {d.neto !== null && <span className="tabular-nums text-gris">neto {monto(d.neto)}{doc && ` · líneas ${monto(doc.montoAlcance)}`}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Seccion>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ── Categorías ── */}
        <Seccion titulo={`Clasificación: ${grupos.length} categorías y ${categorias.length} subcategorías`} icono={<IconCategory size={15} />}>
          <div className={`${TARJETA} overflow-hidden`}>
            {/* Reparto en una sola barra */}
            <div className="border-b border-borde px-4 py-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-tinta/[0.05]">
                {grupos.map((g) => (
                  <div key={g.nombre} style={{ width: `${Math.max(g.participacion * 100, 0.4)}%`, background: colorCat.get(g.nombre) }} title={`${g.nombre}: ${monto(g.monto)} (${pct(g.participacion)})`} />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gris">Toca una categoría para ver sus subcategorías y el criterio con que se clasificó.</p>
            </div>
            <ul className="divide-y divide-borde">
              {grupos.map((g) => (
                <li key={g.nombre}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-tinta/[0.02] [&::-webkit-details-marker]:hidden">
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: colorCat.get(g.nombre) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-tinta">{g.nombre}</span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-tinta/[0.05]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max((g.monto / (grupos[0]?.monto || 1)) * 100, 1)}%`, background: colorCat.get(g.nombre) }} />
                        </span>
                      </span>
                      <span className="hidden w-20 text-right text-[11px] tabular-nums text-gris sm:block">{g.subs.length} subcat.</span>
                      <span className="w-16 text-right text-[11px] tabular-nums text-gris">{n(g.lineas)} lín.</span>
                      <span className="w-20 text-right text-sm font-bold tabular-nums text-tinta">{montoCorto(g.monto)}</span>
                      <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(g.participacion)}</span>
                      <IconChevronDown size={16} className="shrink-0 text-gris transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-borde bg-tinta/[0.015] px-4 pb-3 pt-2">
                      {g.criterio && <p className="mb-2 text-[11px] leading-relaxed text-gris">{g.criterio}</p>}
                      <ul className="space-y-1">
                        {g.subs.map((s) => (
                          <li key={s.orden}>
                            <Link
                              href={`${RUTA_VH}/buscador?categoria=${encodeURIComponent(g.nombre)}&q=${encodeURIComponent(s.subcategoria)}`}
                              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-superficie"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-tinta">{s.subcategoria}</span>
                                <span className="block text-[10px] text-gris">{s.tipoItem}</span>
                              </span>
                              <span className="text-right text-[11px] tabular-nums text-gris">{n(s.lineas)} lín.</span>
                              <span className="w-24 text-right">
                                <span className="block text-xs font-semibold tabular-nums text-tinta">{montoCorto(s.monto)}</span>
                                <span className="block text-[10px] tabular-nums text-gris">{pct(g.monto ? s.monto / g.monto : 0, 0)} de la categoría</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            <p className="flex items-center justify-between border-t border-borde px-4 py-3 text-sm font-bold text-tinta">
              <span>Total</span>
              <span className="tabular-nums">{monto(total)}</span>
            </p>
          </div>
        </Seccion>

        {/* ── Destinos del gasto ── */}
        {control.destinos.length > 0 && (
          <Seccion titulo="Todo lo comprado en el período" icono={<IconChartDonut size={15} />}>
            <div className={`${TARJETA} p-5`}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gris">Compras totales</p>
                  <p className="font-condensed text-3xl font-bold tabular-nums text-tinta">{montoCorto(totalDestinos)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-naranjo">En este registro</p>
                  <p className="font-condensed text-3xl font-bold tabular-nums text-naranjo">{pct(totalDestinos ? enAlcance / totalDestinos : 0, 0)}</p>
                </div>
              </div>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-tinta/[0.08]">
                <div className="h-full bg-naranjo" style={{ width: `${totalDestinos ? (enAlcance / totalDestinos) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-gris">
                <span className="font-semibold text-naranjo">{montoCorto(enAlcance)}</span> en materiales, herramientas y EPP. El resto son servicios, arriendos, hotelería, alimentación,
                combustible… y queda fuera del registro (se informa solo como control).
              </p>

              <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gris">Lo que quedó fuera</p>
              <ul className="space-y-2">
                {fuera.slice(0, 10).map((d) => (
                  <li key={d.destino} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                    <span className="truncate text-xs text-tinta" title={d.destino}>{d.destino}</span>
                    <span className="text-right text-xs font-semibold tabular-nums text-tinta">{montoCorto(d.monto)}</span>
                    <span className="col-span-2 mt-1 block h-1 overflow-hidden rounded-full bg-tinta/[0.05]">
                      <span className="block h-full rounded-full bg-slate-400" style={{ width: `${Math.max((d.monto / maxFuera) * 100, 1)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
              {fuera.length > 10 && (
                <p className="mt-2 text-[11px] text-gris">
                  Y {fuera.length - 10} destinos más por {montoCorto(fuera.slice(10).reduce((s, d) => s + d.monto, 0))}.
                </p>
              )}
            </div>
          </Seccion>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ── Metodología ── */}
        {control.metodologia.length > 0 && (
          <Seccion titulo="Metodología y supuestos" icono={<IconBook2 size={15} />}>
            <ol className={`${TARJETA} divide-y divide-borde`}>
              {[
                ...control.metodologia.filter((m) => !/hiperv[ií]nculos/i.test(m)),
                "En el Core, los PDF se abren directo desde la carpeta DTE_SII de SharePoint con el botón «PDF».",
              ].map((m, i) => (
                <li key={i} className="flex gap-3 px-4 py-2.5 text-[13px] leading-relaxed text-tinta">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-naranjo/12 text-[10px] font-bold text-naranjo">{i + 1}</span>
                  {m}
                </li>
              ))}
            </ol>
          </Seccion>
        )}

        {/* ── Duplicados y carga ── */}
        <div className="space-y-6">
          {control.duplicados.length > 0 && (
            <Seccion titulo="Documentos duplicados excluidos" icono={<IconCopy size={15} />}>
              <div className={`${TARJETA} overflow-hidden`}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
                  <p>
                    <span className="font-condensed text-3xl font-bold tabular-nums text-tinta">{n(control.duplicados.length)}</span>
                    <span className="ml-1.5 text-xs text-gris">archivos guardados dos veces</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...dupPorTipo.entries()].sort((a, b) => b[1] - a[1]).map(([tipo, c]) => (
                      <span key={tipo} className="rounded-lg bg-tinta/[0.04] px-2.5 py-1 text-[11px] text-gris">
                        <strong className="text-tinta">{n(c)}</strong> {tipo}
                      </span>
                    ))}
                  </div>
                </div>
                <details className="group border-t border-borde">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-tinta hover:text-naranjo [&::-webkit-details-marker]:hidden">
                    <IconChevronDown size={14} className="transition group-open:rotate-180" /> Ver el listado (se conservó una sola copia de cada uno)
                  </summary>
                  <div className="max-h-[22rem] overflow-auto border-t border-borde">
                    <table className="w-full min-w-[40rem] text-xs">
                      <thead className="sticky top-0 bg-superficie">
                        <tr className="border-b border-borde text-left text-[10px] font-semibold uppercase tracking-wide text-gris">
                          <th className="px-4 py-2">Fecha</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2 text-right">Folio</th>
                          <th className="px-3 py-2">Proveedor</th>
                          <th className="px-4 py-2">Archivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borde">
                        {control.duplicados.map((d, i) => (
                          <tr key={i}>
                            <td className="whitespace-nowrap px-4 py-1.5 tabular-nums text-gris">{fechaCorta(d.fecha)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-gris">{d.tipo}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-tinta">{d.folio ?? "—"}</td>
                            <td className="max-w-[14rem] truncate px-3 py-1.5 text-tinta" title={d.proveedor ?? undefined}>{d.proveedor}</td>
                            <td className="whitespace-nowrap px-4 py-1.5 font-mono text-[10px] text-gris">{d.archivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </Seccion>
          )}

          <Seccion titulo="De dónde salen estos datos" icono={<IconInfoCircle size={15} />}>
            <div className={`${TARJETA} space-y-1 px-4 py-3.5 text-xs text-gris`}>
              <p>
                Archivo <strong className="text-tinta">{imp.archivo}</strong>
              </p>
              <p>
                Cargado el {fechaCorta(imp.creadoEn.slice(0, 10))}
                {imp.creadoPor && <> por {imp.creadoPor}</>}
              </p>
              <p>
                Período {fechaCorta(imp.desde)} al {fechaCorta(imp.hasta)} · {n(imp.lineas)} líneas · {n(imp.documentos)} documentos
              </p>
            </div>
          </Seccion>
        </div>
      </div>
    </div>
  );
}

/** Un paso del embudo: lo que había, lo que se sacó y con qué se quedó el registro. */
function PasoEmbudo({ fila: u, ultimo }: { fila: FilaUniverso; ultimo: boolean }) {
  const texto = u.concepto.trim();
  const resta = /^\((–|-)\)/.test(texto);
  const igual = texto.startsWith("=");
  const titulo = texto.replace(/^\((–|-)\)\s*|^=\s*/, "");
  return (
    <li
      className={`relative flex min-w-0 flex-col rounded-xl border px-4 py-3 ${
        ultimo ? "border-naranjo/50 bg-naranjo/[0.14]" : igual ? "borde-banda bg-white/[0.06]" : "borde-banda bg-white/[0.02]"
      }`}
    >
      <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${ultimo ? "text-naranjo" : resta ? "text-rose-300" : "texto-banda-45"}`}>
        {ultimo ? "En el registro" : resta ? "Se sacan" : igual ? "Quedan" : "Revisados"}
      </span>
      <span className={`mt-1 font-condensed text-2xl font-bold tabular-nums ${resta ? "text-rose-300" : "texto-banda"}`}>
        {resta ? "−" : ""}
        {n(u.documentos ?? 0)}
      </span>
      <span className="texto-banda-65 mt-0.5 line-clamp-2 text-[11px] leading-snug" title={titulo}>{titulo}</span>
      {u.monto !== null && !resta && <span className="texto-banda-45 mt-1 text-[11px] tabular-nums">{montoCorto(u.monto)}</span>}
      {!ultimo && <IconArrowRight size={14} className="texto-banda-30 absolute -right-2.5 top-1/2 hidden -translate-y-1/2 lg:block" />}
    </li>
  );
}
