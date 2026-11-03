import Link from "next/link";
import { IconBook2, IconCategory, IconChecklist, IconCopy, IconFilter, IconInfoCircle } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, fechaCorta, monto, montoCorto, pct } from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import { Barra, COLORES, Seccion, SinRegistro } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("es-CL");

export default async function ControlPage() {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const vista = await cargarVista();
  const imp = vista.datos.importacion;
  if (!imp) return <SinRegistro esAdmin={usuario.rol === "admin"} />;
  const { control, categorias, lineas } = vista.datos;
  const total = vista.resumen.total;

  // Montos por subcategoría, en el orden de la hoja «Categorías».
  const porSub = new Map<string, { lineas: number; monto: number }>();
  for (const l of lineas) {
    const k = `${l.categoria}|${l.subcategoria}`;
    const x = porSub.get(k) ?? { lineas: 0, monto: 0 };
    x.lineas++;
    x.monto += l.valorAjustado;
    porSub.set(k, x);
  }
  const grupos = new Map<string, typeof categorias>();
  for (const c of categorias) grupos.set(c.categoria, [...(grupos.get(c.categoria) ?? []), c]);
  const colorCat = new Map(vista.resumen.porCategoria.map((c, i) => [c.nombre, COLORES[i % COLORES.length]]));
  const maxDestino = Math.max(...control.destinos.map((d) => d.monto), 1);
  const totalDestinos = control.destinos.reduce((s, d) => s + d.monto, 0);

  return (
    <div className="space-y-7">
      <p className={`${TARJETA} flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-xs text-gris`}>
        <IconInfoCircle size={15} className="text-naranjo" />
        Datos cargados desde <strong className="text-tinta">{imp.archivo}</strong> el {fechaCorta(imp.creadoEn.slice(0, 10))}
        {imp.creadoPor && <> por {imp.creadoPor}</>} · período {fechaCorta(imp.desde)} al {fechaCorta(imp.hasta)}.
      </p>

      {/* ── Categorías ── */}
      <Seccion titulo="Clasificación de productos" icono={<IconCategory size={15} />}>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...grupos.entries()].map(([categoria, subs]) => {
            const montoCat = subs.reduce((s, c) => s + (porSub.get(`${categoria}|${c.subcategoria}`)?.monto ?? 0), 0);
            const criterios = [...new Set(subs.map((s) => s.criterio).filter(Boolean))];
            return (
              <article key={categoria} className={`${TARJETA} overflow-hidden`}>
                <header className="flex items-center gap-2.5 border-b border-borde px-4 py-3">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: colorCat.get(categoria) ?? "#94a3b8" }} />
                  <Link href={`${RUTA_VH}/catalogo?categoria=${encodeURIComponent(categoria)}`} className="min-w-0 flex-1 truncate font-bold text-tinta hover:text-naranjo">{categoria}</Link>
                  <span className="text-sm font-bold tabular-nums text-tinta">{montoCorto(montoCat)}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(total ? montoCat / total : 0)}</span>
                </header>
                {criterios.length > 0 && <p className="border-b border-borde bg-tinta/[0.015] px-4 py-2 text-[11px] leading-relaxed text-gris">{criterios.join(" ")}</p>}
                <ul className="divide-y divide-borde">
                  {subs.map((s) => {
                    const x = porSub.get(`${categoria}|${s.subcategoria}`) ?? { lineas: 0, monto: 0 };
                    return (
                      <li key={s.orden}>
                        <Link href={`${RUTA_VH}/buscador?categoria=${encodeURIComponent(categoria)}&q=${encodeURIComponent(s.subcategoria)}`} className="flex items-center gap-3 px-4 py-2 text-sm transition hover:bg-tinta/[0.02]">
                          <span className="min-w-0 flex-1 truncate text-tinta">{s.subcategoria}</span>
                          <span className="hidden text-[11px] text-gris sm:inline">{s.tipoItem}</span>
                          <span className="w-14 text-right text-xs tabular-nums text-gris">{n(x.lineas)} lín.</span>
                          <span className="w-20 text-right text-xs font-semibold tabular-nums text-tinta">{montoCorto(x.monto)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </Seccion>

      {/* ── Universo ── */}
      {control.universo.length > 0 && (
        <Seccion titulo="Universo revisado" icono={<IconFilter size={15} />}>
          <div className={`${TARJETA} overflow-hidden`}>
            <ol className="divide-y divide-borde">
              {control.universo.map((u, i) => {
                const resta = u.concepto.trim().startsWith("(–)") || u.concepto.trim().startsWith("(-)");
                const igual = u.concepto.trim().startsWith("=");
                const sub = u.concepto.startsWith("   ");
                return (
                  <li key={i} className={`grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem] sm:items-center ${igual ? "bg-naranjo/[0.05]" : ""} ${sub ? "sm:pl-10" : ""}`}>
                    <div className="min-w-0">
                      <p className={`text-sm ${igual || sub ? "font-bold text-tinta" : resta ? "text-gris" : "font-semibold text-tinta"}`}>{u.concepto.trim()}</p>
                      {u.tratamiento && <p className="text-[11px] text-gris">{u.tratamiento}</p>}
                    </div>
                    <p className={`text-sm tabular-nums sm:text-right ${resta ? "text-rose-600" : "text-tinta"}`}>{u.documentos === null ? "" : `${n(u.documentos)} doc.`}</p>
                    <p className="text-sm font-semibold tabular-nums text-tinta sm:text-right">{u.monto === null ? "" : monto(u.monto)}</p>
                  </li>
                );
              })}
            </ol>
            {control.porTipo.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-borde px-4 py-3">
                {control.porTipo.map((t) => (
                  <span key={t.concepto} className="rounded-lg bg-tinta/[0.04] px-2.5 py-1.5 text-[11px] text-gris">
                    <strong className="text-tinta">{t.concepto.trim()}</strong> · {n(t.documentos ?? 0)} · {montoCorto(t.monto ?? 0)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Seccion>
      )}

      {/* ── Destinos ── */}
      {control.destinos.length > 0 && (
        <Seccion titulo="Compras totales del período por destino (referencial)" icono={<IconChecklist size={15} />}>
          <div className={`${TARJETA} p-5`}>
            <p className="mb-4 text-xs text-gris">
              De {monto(totalDestinos)} comprados en el período, el registro toma solo materiales, herramientas y EPP. El resto se informa para control y no está en el registro.
            </p>
            <div className="grid gap-x-10 gap-y-3 lg:grid-cols-2">
              {control.destinos.map((d) => (
                <Barra
                  key={d.destino}
                  etiqueta={d.enAlcance ? `En el registro: ${d.destino}` : d.destino}
                  valor={d.monto}
                  maximo={maxDestino}
                  color={d.enAlcance ? "#c85217" : "#94a3b8"}
                  derecha={
                    <>
                      <span className={`tabular-nums ${d.enAlcance ? "font-bold text-naranjo" : "text-tinta"}`}>{montoCorto(d.monto)}</span>
                      <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(totalDestinos ? d.monto / totalDestinos : 0)}</span>
                    </>
                  }
                />
              ))}
            </div>
          </div>
        </Seccion>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* ── Observaciones ── */}
        {control.observaciones.length > 0 && (
          <Seccion titulo="Calidad de los datos" icono={<IconChecklist size={15} />}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {control.observaciones.map((o) => (
                <li key={o.concepto} className={`${TARJETA} px-4 py-3`}>
                  <p className="font-condensed text-2xl font-bold tabular-nums text-tinta">{n(o.valor)}</p>
                  <p className="text-[11px] leading-snug text-gris">{o.concepto}</p>
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        {/* ── Metodología ── */}
        {control.metodologia.length > 0 && (
          <Seccion titulo="Metodología y supuestos" icono={<IconBook2 size={15} />}>
            <ul className={`${TARJETA} space-y-2.5 p-5`}>
              {control.metodologia
                .filter((m) => !/hiperv[ií]nculos/i.test(m))
                .map((m) => (
                  <li key={m} className="flex gap-2.5 text-sm leading-relaxed text-tinta">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-naranjo" />
                    {m}
                  </li>
                ))}
              <li className="flex gap-2.5 text-sm leading-relaxed text-tinta">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-naranjo" />
                En el Core, los PDF se abren directo desde la carpeta DTE_SII de SharePoint con el botón «PDF».
              </li>
            </ul>
          </Seccion>
        )}
      </div>

      {/* ── Duplicados ── */}
      {control.duplicados.length > 0 && (
        <Seccion titulo={`Documentos duplicados excluidos (${n(control.duplicados.length)})`} icono={<IconCopy size={15} />}>
          <details className={`${TARJETA} overflow-hidden`}>
            <summary className="cursor-pointer select-none px-5 py-3 text-xs font-semibold text-tinta hover:text-naranjo">
              Ver el listado: mismo RUT, tipo y folio guardado dos veces; se conservó una sola copia
            </summary>
            <div className="max-h-[28rem] overflow-auto border-t border-borde">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5 text-right">Folio</th>
                    <th className="px-3 py-2.5">Proveedor</th>
                    <th className="px-4 py-2.5">Archivo excluido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {control.duplicados.map((d, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gris">{fechaCorta(d.fecha)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gris">{d.tipo}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-tinta">{d.folio ?? "—"}</td>
                      <td className="max-w-[18rem] truncate px-3 py-2 text-tinta" title={d.proveedor ?? undefined}>{d.proveedor}{d.rut && <span className="ml-1 text-[11px] text-gris">{d.rut}</span>}</td>
                      <td className="px-4 py-2 font-mono text-[11px] text-gris">{d.archivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Seccion>
      )}
    </div>
  );
}
