import Link from "next/link";
import {
  IconAlertTriangle,
  IconBuildingWarehouse,
  IconCategory,
  IconChartPie,
  IconDownload,
  IconPackage,
  IconStack2,
  IconTrophy,
} from "@tabler/icons-react";
import { lineasDeValor } from "@/lib/inventario";
import {
  formatearCantidad,
  formatearMonto,
  resumirValorizacion,
  type GrupoValor,
  type ProductoValor,
} from "@/lib/inventario-modelo";
import { SOMBRA_CALIDA, TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

// Un color fijo por bodega (en el orden en que aparecen por valor) y otro juego para categorías.
const COLORES = ["#c85217", "#0f766e", "#b08419", "#4f46e5", "#0284c7", "#be185d", "#475569", "#65a30d"];
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

  const top = r.productos.slice(0, 10);
  const maxTop = top[0]?.valor || 1;

  return (
    <div className="space-y-6">
      {/* ── Filtros ── */}
      <div className="space-y-2.5">
        <Filtros
          icono={<IconBuildingWarehouse size={15} />}
          etiqueta="Bodega"
          opciones={general.porBodega.map((b) => ({ id: b.id, nombre: b.nombre, color: colorBodega.get(b.id)! }))}
          activa={bodega}
          enlace={(id) => enlace({ bodega: id })}
        />
        <Filtros
          icono={<IconCategory size={15} />}
          etiqueta="Categoría"
          opciones={general.porCategoria.map((c) => ({ id: c.id, nombre: c.nombre, color: colorCategoria.get(c.id)! }))}
          activa={categoria}
          enlace={(id) => enlace({ categoria: id })}
        />
      </div>

      {/* ── Banda principal ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" />
              Valor del inventario
              {(bodega || categoria) && <span className="texto-banda-45 normal-case tracking-normal">· filtrado</span>}
            </span>
            <p className="texto-banda mt-3 font-condensed text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">
              {formatearMonto(r.total)}
            </p>
            <p className="texto-banda-65 mt-3 text-sm">
              {bodega ? bodegasVisibles[0]?.nombre : "Todas las bodegas"}
              {categoria ? ` · ${categoria}` : ""}
              {!bodega && !categoria ? " · a costo de cada producto" : ` · ${pct(general.total ? r.total / general.total : 0)} del total`}
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-3 gap-6 rounded-xl border px-5 py-4 lg:min-w-[26rem]">
            <Cifra etiqueta="Productos" valor={r.productos.length.toLocaleString("es-CL")} />
            <Cifra etiqueta="Unidades" valor={formatearCantidad(r.unidades)} />
            <Cifra etiqueta="Bodegas" valor={String(r.porBodega.length)} />
          </dl>
        </div>

        {/* Reparto entre bodegas en una sola barra */}
        {r.porBodega.length > 0 && (
          <div className="mt-8">
            <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
              {r.porBodega.map((b) => (
                <div
                  key={b.id}
                  className="h-full transition-all first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${Math.max(b.participacion * 100, 0.5)}%`, background: colorBodega.get(b.id) }}
                  title={`${b.nombre}: ${formatearMonto(b.valor)} (${pct(b.participacion)})`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {r.porBodega.map((b) => (
                <span key={b.id} className="texto-banda-65 inline-flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: colorBodega.get(b.id) }} />
                  {b.nombre} <strong className="texto-banda tabular-nums">{pct(b.participacion)}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      {r.sinCosto > 0 && (
        <p className="flex items-center gap-2 rounded-xl border-l-[3px] border-amber-500 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <IconAlertTriangle size={17} className="shrink-0" />
          <span>
            <strong>{r.sinCosto} {r.sinCosto === 1 ? "producto tiene" : "productos tienen"} stock con costo $0</strong> y no suman al valor. Revisa su costo en Productos.
          </span>
        </p>
      )}

      {/* ── Por bodega ── */}
      <Seccion titulo="Por bodega" icono={<IconBuildingWarehouse size={15} />}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {r.porBodega.map((b) => (
            <TarjetaBodega
              key={b.id}
              bodega={b}
              color={colorBodega.get(b.id)!}
              top={r.productos.filter((p) => (p.porBodega[b.id] ?? 0) > 0).sort((x, y) => (y.porBodega[b.id] ?? 0) - (x.porBodega[b.id] ?? 0)).slice(0, 3)}
              href={enlace({ bodega: bodega === b.id ? null : b.id })}
              activa={bodega === b.id}
            />
          ))}
        </div>
      </Seccion>

      {/* ── Categorías y ABC ── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Seccion titulo="Por categoría" icono={<IconCategory size={15} />}>
          <div className={`${TARJETA} grid items-center gap-6 p-5 sm:grid-cols-[200px_minmax(0,1fr)]`}>
            <Dona grupos={r.porCategoria} colores={colorCategoria} total={r.total} />
            <ul className="space-y-2.5">
              {r.porCategoria.map((c) => (
                <li key={c.id}>
                  <Link href={enlace({ categoria: categoria === c.id ? null : c.id })} className="group block">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorCategoria.get(c.id) }} />
                      <span className="min-w-0 flex-1 truncate font-semibold text-tinta group-hover:text-naranjo">{c.nombre}</span>
                      <span className="tabular-nums text-tinta">{montoCorto(c.valor)}</span>
                      <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(c.participacion)}</span>
                    </div>
                    <div className="ml-[18px] mt-1 h-1 overflow-hidden rounded-full bg-tinta/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${c.participacion * 100}%`, background: colorCategoria.get(c.id) }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Seccion>

        <Seccion titulo="Concentración ABC" icono={<IconStack2 size={15} />}>
          <div className={`${TARJETA} p-5`}>
            <p className="mb-4 text-xs leading-relaxed text-gris">
              Pocos productos suelen concentrar casi todo el valor. Los <strong className="text-tinta">A</strong> son los que juntan el primer 80%: los que
              conviene contar más seguido y cuidar más.
            </p>
            <div className="flex h-9 overflow-hidden rounded-lg">
              {(["A", "B", "C"] as const).map((k) =>
                r.abc[k].valor > 0 ? (
                  <div
                    key={k}
                    className="grid place-items-center text-xs font-bold text-white"
                    style={{ width: `${(r.abc[k].valor / (r.total || 1)) * 100}%`, background: COLOR_ABC[k], minWidth: 28 }}
                  >
                    {k}
                  </div>
                ) : null,
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(["A", "B", "C"] as const).map((k) => (
                <div key={k} className="rounded-xl border border-borde p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md text-xs font-bold text-white" style={{ background: COLOR_ABC[k] }}>{k}</span>
                    <span className="text-xs text-gris">{k === "A" ? "80% del valor" : k === "B" ? "siguiente 15%" : "último 5%"}</span>
                  </div>
                  <p className="mt-2 font-condensed text-2xl font-bold tabular-nums text-tinta">{r.abc[k].productos}</p>
                  <p className="text-[11px] text-gris">
                    {r.abc[k].productos === 1 ? "producto" : "productos"} · {pct(r.productos.length ? r.abc[k].productos / r.productos.length : 0)} del catálogo
                  </p>
                  <p className="mt-1 text-xs font-semibold tabular-nums text-tinta">{montoCorto(r.abc[k].valor)}</p>
                </div>
              ))}
            </div>
          </div>
        </Seccion>
      </div>

      {/* ── Top 10 ── */}
      <Seccion titulo="Productos que más valen" icono={<IconTrophy size={15} />}>
        <div className={`${TARJETA} p-5`}>
          <ol className="space-y-3">
            {top.map((p, i) => (
              <li key={p.productoId} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3">
                <span className="text-right font-condensed text-lg font-bold tabular-nums text-gris-suave">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <Link href={`/inventario/productos/${p.productoId}`} className="truncate text-sm font-semibold text-tinta hover:text-naranjo">{p.nombre}</Link>
                    <span className="shrink-0 text-[11px] text-gris">{formatearCantidad(p.cantidad)} × {formatearMonto(p.costo)}</span>
                  </div>
                  {/* La barra se parte por bodega, con su color. */}
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-tinta/[0.05]" style={{ width: `${Math.max((p.valor / maxTop) * 100, 2)}%` }}>
                    {Object.entries(p.porBodega).map(([id, v]) => (
                      <div key={id} style={{ width: `${(v / (p.valor || 1)) * 100}%`, background: colorBodega.get(id) }} />
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-tinta">{formatearMonto(p.valor)}</p>
                  <p className="text-[11px] tabular-nums text-gris">{pct(p.participacion)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Seccion>

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
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-3 py-3 text-center">ABC</th>
                  <th className="px-3 py-3">Categoría</th>
                  <th className="px-3 py-3 text-right">A mano</th>
                  <th className="px-3 py-3 text-right">Costo</th>
                  {bodegasVisibles.map((b) => (
                    <th key={b.id} className="whitespace-nowrap px-3 py-3 text-right">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorBodega.get(b.id) }} />
                      {b.nombre.replace(/^Bodega\s+/i, "")}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {r.productos.map((p) => (
                  <tr key={p.productoId} className="transition hover:bg-tinta/[0.02]">
                    <td className="px-4 py-2.5">
                      <Link href={`/inventario/productos/${p.productoId}`} className="font-semibold text-tinta hover:text-naranjo">{p.nombre}</Link>
                      {p.sku && <span className="ml-1.5 font-mono text-[11px] text-gris">{p.sku}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white" style={{ background: COLOR_ABC[p.clase] }}>{p.clase}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gris">{p.categoria}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gris">{formatearCantidad(p.cantidad)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${p.costo <= 0 ? "font-semibold text-amber-600" : "text-gris"}`}>{formatearMonto(p.costo)}</td>
                    {bodegasVisibles.map((b) => (
                      <td key={b.id} className="px-3 py-2.5 text-right tabular-nums text-gris">
                        {p.porBodega[b.id] ? formatearMonto(p.porBodega[b.id]) : <span className="text-gris-suave">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-tinta">{formatearMonto(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-superficie">
                <tr className="border-t-2 border-borde text-sm font-bold text-tinta">
                  <td className="px-4 py-3" colSpan={3}>Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatearCantidad(r.unidades)}</td>
                  <td />
                  {bodegasVisibles.map((b) => (
                    <td key={b.id} className="px-3 py-3 text-right tabular-nums">{formatearMonto(r.porBodega.find((x) => x.id === b.id)?.valor ?? 0)}</td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums">{formatearMonto(r.total)}</td>
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
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
      on ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"
    }`;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
      <span className="inline-flex w-24 shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gris">
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

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className="texto-banda mt-1 font-condensed text-2xl font-bold tabular-nums">{valor}</dd>
    </div>
  );
}

function Seccion({ titulo, icono, accion, children }: { titulo: string; icono: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
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

function TarjetaBodega({
  bodega: b,
  color,
  top,
  href,
  activa,
}: {
  bodega: GrupoValor;
  color: string;
  top: ProductoValor[];
  href: string;
  activa: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-2xl border bg-superficie p-5 transition hover:-translate-y-0.5 ${SOMBRA_CALIDA} ${
        activa ? "border-tinta" : "border-borde hover:border-naranjo/40"
      }`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-tinta">{b.nombre}</p>
          <p className="text-xs text-gris">
            {b.productos} {b.productos === 1 ? "producto" : "productos"} · {formatearCantidad(b.unidades)} un.
          </p>
        </div>
        <span className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" style={{ background: `${color}1a`, color }}>
          {pct(b.participacion)}
        </span>
      </div>
      <p className="mt-4 font-condensed text-3xl font-bold tabular-nums tracking-tight text-tinta">{formatearMonto(b.valor)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${b.participacion * 100}%`, background: color }} />
      </div>
      {top.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-borde pt-3">
          {top.map((p) => (
            <li key={p.productoId} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gris">{p.nombre}</span>
              <span className="shrink-0 font-semibold tabular-nums text-tinta">{montoCorto(p.porBodega[b.id] ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] font-semibold text-gris-suave group-hover:text-naranjo">{activa ? "Quitar filtro" : "Ver solo esta bodega →"}</p>
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
    <div className="relative mx-auto h-[200px] w-[200px]">
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
          <p className="font-condensed text-xl font-bold tabular-nums text-tinta">{montoCorto(total)}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-gris">{grupos.length} categorías</p>
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
