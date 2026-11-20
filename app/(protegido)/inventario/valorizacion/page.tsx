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

  const top = r.productos.slice(0, 10);
  const maxTop = top[0]?.valor || 1;

  return (
    <div className="space-y-3">
      {/* ── Filtros ── */}
      <div className="space-y-1.5">
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

      {/* ── Banda principal: valor, cifras y reparto por bodega en una franja baja ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              Valor del inventario
              {(bodega || categoria) && <span className="texto-banda-45 normal-case tracking-normal"> · filtrado</span>}
            </span>
            <p className="texto-banda mt-0.5 font-condensed text-3xl font-bold leading-none tracking-tight tabular-nums">{formatearMonto(r.total)}</p>
          </div>
          <p className="texto-banda-65 pb-0.5 text-xs">
            {bodega ? bodegasVisibles[0]?.nombre : "Todas las bodegas"}
            {categoria ? ` · ${categoria}` : ""}
            {!bodega && !categoria ? " · a costo de cada producto" : ` · ${pct(general.total ? r.total / general.total : 0)} del total`}
          </p>
          <dl className="ml-auto flex gap-5">
            <Cifra etiqueta="Productos" valor={r.productos.length.toLocaleString("es-CL")} />
            <Cifra etiqueta="Unidades" valor={formatearCantidad(r.unidades)} />
            <Cifra etiqueta="Bodegas" valor={String(r.porBodega.length)} />
          </dl>
        </div>

        {/* Reparto entre bodegas: la barra y su leyenda en la misma línea */}
        {r.porBodega.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <div className="flex h-1.5 min-w-[10rem] flex-1 overflow-hidden rounded-full bg-white/10">
              {r.porBodega.map((b) => (
                <div
                  key={b.id}
                  className="h-full"
                  style={{ width: `${Math.max(b.participacion * 100, 0.5)}%`, background: colorBodega.get(b.id) }}
                  title={`${b.nombre}: ${formatearMonto(b.valor)} (${pct(b.participacion)})`}
                />
              ))}
            </div>
            {r.porBodega.map((b) => (
              <span key={b.id} className="texto-banda-65 inline-flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ background: colorBodega.get(b.id) }} />
                {b.nombre} <strong className="texto-banda tabular-nums">{pct(b.participacion)}</strong>
              </span>
            ))}
          </div>
        )}
      </header>

      {r.sinCosto > 0 && (
        <p className="flex items-center gap-2 rounded-lg border-l-[3px] border-amber-500 bg-amber-500/[0.07] px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <IconAlertTriangle size={15} className="shrink-0" />
          <span>
            <strong>{r.sinCosto} {r.sinCosto === 1 ? "producto tiene" : "productos tienen"} stock con costo $0</strong> y no suman al valor. Revisa su costo en Productos.
          </span>
        </p>
      )}

      {/* ── Por bodega ── */}
      <Seccion titulo="Por bodega" icono={<IconBuildingWarehouse size={14} />}>
        <div className={`grid gap-2.5 ${r.porBodega.length >= 3 ? "sm:grid-cols-2 xl:grid-cols-3" : r.porBodega.length === 2 ? "sm:grid-cols-2" : ""}`}>
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

      {/* ── Categorías | ABC y los que más valen ── */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Seccion titulo="Por categoría" icono={<IconCategory size={14} />}>
          <div className={`${TARJETA} grid items-start gap-3 p-3 sm:grid-cols-[110px_minmax(0,1fr)]`}>
            <Dona grupos={r.porCategoria} colores={colorCategoria} total={r.total} />
            <div className="min-w-0">
              {/* Una fila por categoría, en una sola línea: color, nombre, barra, monto y %. */}
              <ul>
                {r.porCategoria.filter((c) => c.valor > 0).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={enlace({ categoria: categoria === c.id ? null : c.id })}
                      className="group grid grid-cols-[8px_minmax(0,10rem)_minmax(0,1fr)_3.75rem_2.75rem] items-center gap-2 rounded-md px-1 py-[3px] text-xs hover:bg-tinta/[0.03]"
                    >
                      <span className="h-2 w-2 rounded-sm" style={{ background: colorCategoria.get(c.id) }} />
                      <span className="truncate font-semibold text-tinta group-hover:text-naranjo" title={c.nombre}>{c.nombre}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
                        <span className="block h-full rounded-full" style={{ width: `${c.participacion * 100}%`, background: colorCategoria.get(c.id) }} />
                      </span>
                      <span className="text-right tabular-nums text-tinta">{montoCorto(c.valor)}</span>
                      <span className="text-right tabular-nums text-gris">{pct(c.participacion)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {/* Las que valen $0 van juntas en una línea; se puede filtrar por ellas igual. */}
              {r.porCategoria.some((c) => c.valor <= 0) && (
                <p className="mt-1.5 border-t border-borde px-1 pt-1.5 text-[11px] leading-snug text-gris">
                  <span className="font-semibold text-tinta">Sin valor ($0):</span>{" "}
                  {r.porCategoria
                    .filter((c) => c.valor <= 0)
                    .map((c, i, l) => (
                      <span key={c.id}>
                        <Link href={enlace({ categoria: categoria === c.id ? null : c.id })} className="hover:text-naranjo hover:underline">{c.nombre}</Link>
                        {i < l.length - 1 ? " · " : ""}
                      </span>
                    ))}
                </p>
              )}
            </div>
          </div>
        </Seccion>

        <div className="space-y-3">
          <Seccion titulo="Concentración ABC" icono={<IconStack2 size={14} />}>
            <div className={`${TARJETA} p-3`}>
              <p className="mb-2 text-[11px] leading-snug text-gris">
                Pocos productos suelen concentrar casi todo el valor. Los <strong className="text-tinta">A</strong> son los que juntan el primer 80%: los que
                conviene contar más seguido y cuidar más.
              </p>
              <div className="flex h-5 overflow-hidden rounded-md">
                {(["A", "B", "C"] as const).map((k) =>
                  r.abc[k].valor > 0 ? (
                    <div
                      key={k}
                      className="grid place-items-center text-[10px] font-bold text-white"
                      style={{ width: `${(r.abc[k].valor / (r.total || 1)) * 100}%`, background: COLOR_ABC[k], minWidth: 22 }}
                    >
                      {k}
                    </div>
                  ) : null,
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["A", "B", "C"] as const).map((k) => (
                  <div key={k} className="rounded-lg border border-borde px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="grid h-4 w-4 place-items-center rounded text-[10px] font-bold text-white" style={{ background: COLOR_ABC[k] }}>{k}</span>
                      <span className="truncate text-[11px] text-gris">{k === "A" ? "80% del valor" : k === "B" ? "siguiente 15%" : "último 5%"}</span>
                      <span className="ml-auto text-xs font-semibold tabular-nums text-tinta">{montoCorto(r.abc[k].valor)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gris">
                      <b className="font-condensed text-base font-bold text-tinta">{r.abc[k].productos}</b>{" "}
                      {r.abc[k].productos === 1 ? "producto" : "productos"} · {pct(r.productos.length ? r.abc[k].productos / r.productos.length : 0)} del catálogo
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Seccion>

          <Seccion titulo="Productos que más valen" icono={<IconTrophy size={14} />}>
            <div className={`${TARJETA} p-3`}>
              {/* Una línea por producto. La barra se parte por bodega, con su color. */}
              <ol>
                {top.map((p, i) => (
                  <li key={p.productoId} className="grid grid-cols-[16px_minmax(0,1fr)_minmax(3rem,7rem)_auto] items-center gap-2 py-[3px] text-xs">
                    <span className="text-right font-condensed font-bold tabular-nums text-gris-suave">{i + 1}</span>
                    <span className="min-w-0 truncate">
                      <Link href={`/inventario/productos/${p.productoId}`} className="font-semibold text-tinta hover:text-naranjo" title={p.nombre}>{p.nombre}</Link>
                      <span className="ml-1.5 text-[10px] text-gris">{formatearCantidad(p.cantidad)} × {formatearMonto(p.costo)}</span>
                    </span>
                    <span className="flex h-1.5 overflow-hidden rounded-full bg-tinta/[0.05]">
                      <span className="flex h-full" style={{ width: `${Math.max((p.valor / maxTop) * 100, 3)}%` }}>
                        {Object.entries(p.porBodega).map(([id, v]) => (
                          <span key={id} className="h-full" style={{ width: `${(v / (p.valor || 1)) * 100}%`, background: colorBodega.get(id) }} />
                        ))}
                      </span>
                    </span>
                    <span className="text-right font-bold tabular-nums text-tinta">
                      {montoCorto(p.valor)} <span className="font-normal text-gris">{pct(p.participacion)}</span>
                    </span>
                  </li>
                ))}
              </ol>
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
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      on ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"
    }`;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
      <span className="inline-flex w-[5.5rem] shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gris">
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
      <dt className="texto-banda-45 text-[9px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className="texto-banda font-condensed text-xl font-bold leading-tight tabular-nums">{valor}</dd>
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
      className={`group block rounded-xl border border-l-[3px] bg-superficie px-3.5 py-2.5 transition ${SOMBRA_CALIDA} ${activa ? "border-tinta" : "border-borde hover:border-naranjo/40"}`}
      style={{ borderLeftColor: color }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="truncate text-sm font-bold text-tinta">{b.nombre}</p>
        <span className="text-[11px] text-gris">
          {b.productos} {b.productos === 1 ? "producto" : "productos"} · {formatearCantidad(b.unidades)} un.
        </span>
        <span className="ml-auto font-condensed text-xl font-bold tabular-nums tracking-tight text-tinta">{formatearMonto(b.valor)}</span>
        <span className="rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums" style={{ background: `${color}1a`, color }}>
          {pct(b.participacion)}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-tinta/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${b.participacion * 100}%`, background: color }} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
        {top.map((p) => (
          <span key={p.productoId} className="text-gris">
            {p.nombre} <strong className="font-semibold tabular-nums text-tinta">{montoCorto(p.porBodega[b.id] ?? 0)}</strong>
          </span>
        ))}
        <span className="ml-auto font-semibold text-gris-suave group-hover:text-naranjo">{activa ? "Quitar filtro" : "Ver solo esta bodega →"}</span>
      </div>
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
    <div className="relative mx-auto aspect-square w-full max-w-[110px]">
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
          <p className="font-condensed text-base font-bold tabular-nums text-tinta">{montoCorto(total)}</p>
          <p className="text-[9px] uppercase tracking-wide text-gris">{grupos.length} categorías</p>
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
