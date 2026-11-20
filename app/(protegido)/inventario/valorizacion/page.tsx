import Link from "next/link";
import {
  IconAlertTriangle,
  IconBuildingWarehouse,
  IconCategory,
  IconChartPie,
  IconDownload,
  IconPackage,
  IconStack2,
  IconCurrencyDollar,
  IconTrophy,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { lineasDeValor } from "@/lib/inventario";
import {
  formatearCantidad,
  formatearMonto,
  resumirValorizacion,
  type GrupoValor,
  type ProductoValor,
} from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";
import { HOJA, IconoTile, type TonoIcono } from "@/components/contactos/Visual";

export const dynamic = "force-dynamic";

// Un color fijo por bodega (en el orden en que aparecen por valor) y otro juego para categorías.
// 12 tonos: con 8 se repetían (la 9.ª categoría salía del mismo color que la 1.ª).
const COLORES = ["#c85217", "#0f766e", "#b08419", "#4f46e5", "#0284c7", "#be185d", "#475569", "#65a30d", "#9333ea", "#0891b2", "#e11d48", "#a16207"];
const COLOR_ABC = { A: "#c85217", B: "#b08419", C: "#94a3b8" } as const;

const pct = (x: number) => `${(x * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;

/** $12,4 M / $830 mil / $9.500: los montos grandes se leen mejor abreviados en las tarjetas. */
function montoCorto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 10_000) return `$${Math.round(n / 1000).toLocaleString("es-CL")} mil`;
  return formatearMonto(n);
}

export default async function ValorizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ bodega?: string; categoria?: string }>;
}) {
  const { bodega, categoria } = await searchParams;
  const todas = await lineasDeValor();

  // Los filtros se arman con TODO el inventario, así siempre se puede volver a cualquier bodega o categoría.
  const general = resumirValorizacion(todas);
  const colorBodega = new Map(general.porBodega.map((b, i) => [b.id, COLORES[i % COLORES.length]]));
  const colorCategoria = new Map(general.porCategoria.map((c, i) => [c.id, COLORES[(i + 3) % COLORES.length]]));

  const lineas = todas.filter((l) => (!bodega || l.bodegaId === bodega) && (!categoria || l.categoria === categoria));
  const r = resumirValorizacion(lineas);
  const bodegasVisibles = bodega ? general.porBodega.filter((b) => b.id === bodega) : general.porBodega;

  const enlace = (cambios: { bodega?: string | null; categoria?: string | null }) => {
    const q = new URLSearchParams();
    const b = cambios.bodega === undefined ? bodega : cambios.bodega;
    const c = cambios.categoria === undefined ? categoria : cambios.categoria;
    if (b) q.set("bodega", b);
    if (c) q.set("categoria", c);
    const s = q.toString();
    return `/inventario/valorizacion${s ? `?${s}` : ""}`;
  };

  if (general.total === 0 && general.productos.length === 0) {
    return (
      <div className={`${TARJETA} grid place-items-center gap-3 p-14 text-center`}>
        <IconChartPie size={40} stroke={1.4} className="text-gris-suave" />
        <p className="text-sm font-semibold text-tinta">Todavía no hay stock que valorizar</p>
        <p className="max-w-md text-xs text-gris">
          Cuando cargues productos almacenables con cantidad (a mano, con una recepción o con la carga masiva), aquí vas a ver el valor por bodega, por categoría y los productos que concentran el inventario.
        </p>
        <Link href="/inventario/importar" className="mt-2 rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-naranjo-suave">
          Ir a carga masiva
        </Link>
      </div>
    );
  }

  const top = r.productos.slice(0, 5);
  const conValor = r.porCategoria.filter((c) => c.valor > 0);
  const nombreCategoria = categoria ? general.porCategoria.find((c) => c.id === categoria)?.nombre ?? categoria : null;

  return (
    <div className="space-y-4">
      {/* ── Filtro: la bodega. La categoría se elige tocándola en «Por categoría». ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filtros
          icono={<IconBuildingWarehouse size={15} />}
          etiqueta="Bodega"
          opciones={general.porBodega.map((b) => ({ id: b.id, nombre: b.nombre, color: colorBodega.get(b.id)! }))}
          activa={bodega}
          enlace={(id) => enlace({ bodega: id })}
        />
        {nombreCategoria && (
          <Link
            href={enlace({ categoria: null })}
            className="inline-flex items-center gap-1.5 rounded-full bg-tinta px-3 py-1.5 text-xs font-semibold text-superficie transition hover:opacity-90"
            title="Quitar el filtro de categoría"
          >
            {nombreCategoria} <IconX size={13} />
          </Link>
        )}
      </div>

      {/* ── Resumen, como en Contactos: tres cifras ── */}
      <section className={`${HOJA} grid grid-cols-1 gap-1.5 p-1.5 sm:grid-cols-3`} aria-label="Resumen de la valorización">
        <Cifra Icono={IconCurrencyDollar} tono="marca" valor={formatearMonto(r.total)} etiqueta={bodega || categoria ? "Valor filtrado" : "Valor del inventario"} />
        <Cifra Icono={IconPackage} tono="azul" valor={r.productos.length.toLocaleString("es-CL")} etiqueta="Productos con stock" />
        <Cifra Icono={IconStack2} tono="verde" valor={formatearCantidad(r.unidades)} etiqueta="Unidades" />
      </section>

      {r.sinCosto > 0 && (
        <p className="flex items-center gap-2 rounded-xl border-l-[3px] border-amber-500 bg-amber-500/[0.07] px-4 py-2 text-[13px] text-amber-800 dark:text-amber-300">
          <IconAlertTriangle size={16} className="shrink-0" />
          <span>
            <strong>{r.sinCosto} {r.sinCosto === 1 ? "producto tiene" : "productos tienen"} stock con costo $0</strong> y no suman al valor.
          </span>
        </p>
      )}

      {/* ── Por bodega: solo si hay más de una a la vista ── */}
      {r.porBodega.length > 1 && (
        <Seccion titulo="Por bodega" icono={<IconBuildingWarehouse size={15} />}>
          <div className={`grid gap-4 ${r.porBodega.length >= 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>
            {r.porBodega.map((b) => (
              <TarjetaBodega key={b.id} bodega={b} color={colorBodega.get(b.id)!} href={enlace({ bodega: b.id })} />
            ))}
          </div>
        </Seccion>
      )}

      {/* ── Por categoría | Los que más valen y ABC ── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Seccion titulo="Por categoría" icono={<IconCategory size={15} />}>
          <div className={`${HOJA} grid items-center gap-4 p-4 sm:grid-cols-[120px_minmax(0,1fr)]`}>
            <Dona grupos={r.porCategoria} colores={colorCategoria} total={r.total} />
            <ul className="divide-y divide-borde/60">
              {conValor.map((c) => (
                <li key={c.id}>
                  <Link
                    href={enlace({ categoria: categoria === c.id ? null : c.id })}
                    className="group flex items-center gap-2.5 py-1.5 text-[13px]"
                    title={categoria === c.id ? "Quitar el filtro" : `Ver solo ${c.nombre}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorCategoria.get(c.id) }} />
                    <span className="min-w-0 flex-1 truncate font-medium text-tinta group-hover:text-naranjo">{c.nombre}</span>
                    <span className="tabular-nums text-tinta">{montoCorto(c.valor)}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(c.participacion)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Seccion>

        <div className="space-y-4">
          <Seccion titulo="Los que más valen" icono={<IconTrophy size={15} />}>
            <ol className={`${HOJA} divide-y divide-borde/60 px-4 py-0.5`}>
              {top.map((p, i) => (
                <li key={p.productoId} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className="w-4 text-right font-condensed font-bold tabular-nums text-gris-suave">{i + 1}</span>
                  <Link href={`/inventario/productos/${p.productoId}`} className="min-w-0 flex-1 truncate font-medium text-tinta hover:text-naranjo" title={p.nombre}>
                    {p.nombre}
                  </Link>
                  <span className="font-semibold tabular-nums text-tinta">{montoCorto(p.valor)}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(p.participacion)}</span>
                </li>
              ))}
            </ol>
          </Seccion>

          <Seccion titulo="Concentración ABC" icono={<IconStack2 size={15} />}>
            <div className={`${HOJA} p-4`}>
              <p className="text-[13px] text-gris">
                Los <strong className="text-tinta">A</strong> juntan el 80% del valor: conviene contarlos más seguido.
              </p>
              <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-tinta/[0.06]">
                {(["A", "B", "C"] as const).map((k) =>
                  r.abc[k].valor > 0 ? <div key={k} style={{ width: `${(r.abc[k].valor / (r.total || 1)) * 100}%`, background: COLOR_ABC[k] }} /> : null,
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-3 text-[13px]">
                {(["A", "B", "C"] as const).map((k) => (
                  <div key={k}>
                    <p className="flex items-center gap-1.5 font-semibold text-tinta">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_ABC[k] }} /> {k}
                    </p>
                    <p className="text-[11px] text-gris">
                      {r.abc[k].productos} {r.abc[k].productos === 1 ? "producto" : "productos"} · {montoCorto(r.abc[k].valor)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Seccion>
        </div>
      </div>

      {/* ── Detalle ── */}
      <Seccion
        titulo="Detalle por producto y bodega"
        icono={<IconPackage size={15} />}
        accion={
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv(r.productos, bodegasVisibles))}`}
            download="valorizacion-inventario.csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
          >
            <IconDownload size={14} /> Exportar CSV
          </a>
        }
      >
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-superficie">
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-center">ABC</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2 text-right">A mano</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  {bodegasVisibles.map((b) => (
                    <th key={b.id} className="whitespace-nowrap px-3 py-2 text-right">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorBodega.get(b.id) }} />
                      {b.nombre.replace(/^Bodega\s+/i, "")}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {r.productos.map((p) => (
                  <tr key={p.productoId} className="transition hover:bg-tinta/[0.02]">
                    <td className="px-3 py-1.5">
                      <Link href={`/inventario/productos/${p.productoId}`} className="font-semibold text-tinta hover:text-naranjo">{p.nombre}</Link>
                      {p.sku && <span className="ml-1.5 font-mono text-[11px] text-gris">{p.sku}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="inline-grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white" style={{ background: COLOR_ABC[p.clase] }}>{p.clase}</span>
                    </td>
                    <td className="px-3 py-1.5 text-gris">{p.categoria}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gris">{formatearCantidad(p.cantidad)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${p.costo <= 0 ? "font-semibold text-amber-600" : "text-gris"}`}>{formatearMonto(p.costo)}</td>
                    {bodegasVisibles.map((b) => (
                      <td key={b.id} className="px-3 py-1.5 text-right tabular-nums text-gris">
                        {p.porBodega[b.id] ? formatearMonto(p.porBodega[b.id]) : <span className="text-gris-suave">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-tinta">{formatearMonto(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-superficie">
                <tr className="border-t-2 border-borde text-sm font-bold text-tinta">
                  <td className="px-3 py-1.5" colSpan={3}>Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatearCantidad(r.unidades)}</td>
                  <td />
                  {bodegasVisibles.map((b) => (
                    <td key={b.id} className="px-3 py-3 text-right tabular-nums">{formatearMonto(r.porBodega.find((x) => x.id === b.id)?.valor ?? 0)}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatearMonto(r.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gris-suave">Valor = cantidad a mano × costo del producto (promedio o estándar, según el producto).</p>
      </Seccion>
    </div>
  );
}

// ───────────────────────────── piezas ─────────────────────────────

function Filtros({
  icono,
  etiqueta,
  opciones,
  activa,
  enlace,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  opciones: { id: string; nombre: string; color: string }[];
  activa?: string;
  enlace: (id: string | null) => string;
}) {
  const chip = (on: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
      on ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"
    }`;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
      <span className="inline-flex shrink-0 items-center gap-1.5 pr-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gris">
        {icono} {etiqueta}
      </span>
      <Link href={enlace(null)} className={chip(!activa)}>Todas</Link>
      {opciones.map((o) => (
        <Link key={o.id} href={enlace(activa === o.id ? null : o.id)} className={chip(activa === o.id)}>
          <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
          {o.nombre}
        </Link>
      ))}
    </div>
  );
}

function Cifra({ Icono, tono, valor, etiqueta }: { Icono: Icon; tono: TonoIcono; valor: string; etiqueta: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[18px] px-3.5 py-2.5">
      <IconoTile Icono={Icono} tono={tono} />
      <div className="min-w-0">
        <p className="truncate font-condensed text-2xl font-bold leading-none tabular-nums text-tinta">{valor}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-gris">{etiqueta}</p>
      </div>
    </div>
  );
}

function Seccion({ titulo, icono, accion, children }: { titulo: string; icono: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/60">
          {icono} {titulo}
        </h2>
        <span className="h-px flex-1 bg-borde" />
        {accion}
      </div>
      {children}
    </section>
  );
}

function TarjetaBodega({ bodega: b, color, href }: { bodega: GrupoValor; color: string; href: string }) {
  return (
    <Link href={href} className={`${HOJA} group block p-4 transition hover:border-naranjo/40`} title="Ver solo esta bodega">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-tinta group-hover:text-naranjo">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{b.nombre}</span>
        </span>
        <span className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" style={{ background: `${color}1a`, color }}>
          {pct(b.participacion)}
        </span>
      </div>
      <p className="mt-1.5 font-condensed text-2xl font-bold tabular-nums tracking-tight text-tinta">{formatearMonto(b.valor)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${b.participacion * 100}%`, background: color }} />
      </div>
      <p className="mt-1.5 text-[11px] text-gris">
        {b.productos} {b.productos === 1 ? "producto" : "productos"} · {formatearCantidad(b.unidades)} un.
      </p>
    </Link>
  );
}

/** Dona en SVG puro: un arco por categoría y el total en el centro. */
function Dona({ grupos, colores, total }: { grupos: GrupoValor[]; colores: Map<string, string>; total: number }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  // Dónde empieza cada arco: la suma de los anteriores.
  const inicios = grupos.map((_, i) => grupos.slice(0, i).reduce((t, g) => t + g.participacion * C, 0));
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[120px]">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" stroke="currentColor" strokeWidth="26" className="text-tinta/[0.05]" />
        {grupos.map((g, i) => {
          const largo = g.participacion * C;
          return (
            <circle
              key={g.id}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={colores.get(g.id)}
              strokeWidth="26"
              strokeDasharray={`${Math.max(largo - 1.5, 0)} ${C}`}
              strokeDashoffset={-inicios[i]}
            >
              <title>{`${g.nombre}: ${formatearMonto(g.valor)} (${pct(g.participacion)})`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-condensed text-lg font-bold tabular-nums text-tinta">{montoCorto(total)}</p>
          <p className="text-[10px] uppercase tracking-wide text-gris">{grupos.filter((g) => g.valor > 0).length} categorías</p>
        </div>
      </div>
    </div>
  );
}

function csv(productos: ProductoValor[], bodegas: GrupoValor[]): string {
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const enc = ["Producto", "SKU", "Clase ABC", "Categoría", "Cantidad", "Costo", ...bodegas.map((b) => b.nombre), "Total"];
  const filas = productos.map((p) => [
    p.nombre, p.sku ?? "", p.clase, p.categoria, p.cantidad, p.costo, ...bodegas.map((b) => p.porBodega[b.id] ?? 0), p.valor,
  ]);
  return "﻿" + [enc, ...filas].map((f) => f.map(celda).join(";")).join("\n");
}
