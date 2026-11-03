import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuildingStore,
  IconCalculator,
  IconCalendarStats,
  IconCategory,
  IconFileInvoice,
  IconListSearch,
  IconPackages,
  IconSearch,
  IconStack2,
  type Icon,
} from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, fechaCorta, monto, montoCorto, pct } from "@/lib/valorizacion-historica-modelo";
import { SOMBRA_CALIDA, TARJETA } from "@/lib/estilos";
import { Barra, COLORES, CifraBanda, Seccion, SinRegistro } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const n = (x: number) => x.toLocaleString("es-CL");

export default async function ResumenHistoricoPage() {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;

  const r = vista.resumen;
  const colorCat = new Map(r.porCategoria.map((c, i) => [c.nombre, COLORES[i % COLORES.length]]));
  const maxAnio = Math.max(...r.porAnio.map((a) => a.monto), 1);
  const maxCat = r.porCategoria[0]?.monto ?? 1;
  const top = vista.proveedores.slice(0, 15);
  const maxProv = top[0]?.monto ?? 1;

  // Los productos que más veces se compraron: atajos para el buscador (por plata salían equipos
  // que se compraron una vez, como una vulcanizadora).
  const productos = new Map<string, number>();
  for (const i of vista.catalogo) if (i.producto) productos.set(i.producto, (productos.get(i.producto) ?? 0) + i.compras);
  const sugerencias = [...productos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p]) => p);

  // Un año incompleto se marca con sus meses: 2022 parte en septiembre, el último puede ir a medias.
  const rango = (desde: string, hasta: string) => {
    const m1 = Number(desde.slice(5, 7)), m2 = Number(hasta.slice(5, 7));
    return m1 === 1 && m2 === 12 ? null : `${MESES[m1 - 1]}–${MESES[m2 - 1]}`;
  };
  const maxHeat = Math.max(...r.porCategoria.flatMap((c) => Object.values(c.porAnio)), 1);

  return (
    <div className="space-y-7">
      {/* ── Banda principal ── */}
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Total comprado
            </span>
            <p className="texto-banda mt-3 font-condensed text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">{monto(r.total)}</p>
            <p className="texto-banda-65 mt-3 max-w-xl text-sm">
              Materiales, herramientas y EPP del {fechaCorta(r.desde)} al {fechaCorta(r.hasta)} · valores netos sin IVA, con notas de crédito descontadas.
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-5 rounded-xl border px-5 py-4 sm:grid-cols-4 lg:min-w-[34rem]">
            <CifraBanda etiqueta="Documentos" valor={n(r.documentos)} detalle="Facturas, NC y ND" />
            <CifraBanda etiqueta="Proveedores" valor={n(r.proveedores)} />
            <CifraBanda etiqueta="Líneas" valor={n(r.lineas)} detalle="De detalle" />
            <CifraBanda etiqueta="Ítems" valor={n(r.items)} detalle="Distintos" />
          </dl>
        </div>
        {/* Reparto por categoría en una sola barra */}
        <div className="mt-8">
          <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
            {r.porCategoria.map((c) => (
              <div key={c.nombre} className="h-full" style={{ width: `${Math.max(c.participacion * 100, 0.4)}%`, background: colorCat.get(c.nombre) }} title={`${c.nombre}: ${monto(c.monto)} (${pct(c.participacion)})`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {r.porCategoria.slice(0, 6).map((c) => (
              <span key={c.nombre} className="texto-banda-65 inline-flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: colorCat.get(c.nombre) }} />
                {c.nombre} <strong className="texto-banda tabular-nums">{pct(c.participacion)}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Buscar de una ── */}
      <form action={`${RUTA_VH}/buscador`} className={`${TARJETA} p-4 sm:p-5`}>
        <label className="relative block">
          <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gris" />
          <input
            name="q"
            type="search"
            placeholder="¿Qué quieres saber cuánto costó? Escribe un producto, marca o proveedor: taladro, guante, makita…"
            className="w-full rounded-xl border border-borde bg-fondo py-3.5 pl-12 pr-28 text-base text-tinta outline-none transition placeholder:text-gris-suave focus:border-naranjo/60 focus:ring-4 focus:ring-naranjo/10"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-naranjo px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-naranjo-suave">Buscar</button>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gris">Lo que más se compra</span>
          {sugerencias.map((s) => (
            <Link key={s} href={`${RUTA_VH}/buscador?q=${encodeURIComponent(s)}`} className="rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-semibold text-tinta transition hover:border-naranjo/50 hover:text-naranjo">
              {s}
            </Link>
          ))}
        </div>
      </form>

      {r.porRevisar.lineas > 0 && (
        <Link
          href={`${RUTA_VH}/buscador?revisar=1`}
          className="flex items-center gap-2 rounded-xl border-l-[3px] border-amber-500 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-500/[0.11] dark:text-amber-300"
        >
          <IconAlertTriangle size={17} className="shrink-0" />
          <span className="flex-1">
            <strong>{n(r.porRevisar.lineas)} líneas quedaron marcadas «Revisar»</strong> ({montoCorto(r.porRevisar.monto)}): sin clasificar, sin cantidad o de un documento que no cuadra. Sus costos son referenciales.
          </span>
          <IconArrowRight size={16} className="shrink-0" />
        </Link>
      )}

      {/* ── Años y tipo de ítem ── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Seccion titulo="Gasto por año" icono={<IconCalendarStats size={15} />}>
          <div className={`${TARJETA} p-5`}>
            <div className="flex h-56 items-end gap-3 sm:gap-5">
              {r.porAnio.map((a) => {
                const parcial = rango(a.desde, a.hasta);
                return (
                  <Link key={a.anio} href={`${RUTA_VH}/buscador?anio=${a.anio}`} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${a.anio}: ${monto(a.monto)}`}>
                    <span className="text-center text-xs font-bold tabular-nums text-tinta">{montoCorto(a.monto)}</span>
                    <div className="w-full max-w-[4.5rem] rounded-t-lg bg-naranjo/80 transition group-hover:bg-naranjo" style={{ height: `${Math.max((a.monto / maxAnio) * 70, 2)}%` }} />
                    <span className="text-center leading-tight">
                      <span className="block font-condensed text-lg font-bold text-tinta">{a.anio}</span>
                      <span className="block text-[10px] text-gris">{parcial ?? `${pct(a.participacion, 0)} del total`}</span>
                      <span className="block text-[10px] text-gris">{n(a.documentos)} doc.</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Por tipo de ítem" icono={<IconStack2 size={15} />}>
          <div className={`${TARJETA} space-y-3.5 p-5`}>
            <p className="text-xs text-gris">Qué tipo de cosa se compró: lo durable (herramientas y equipos) se cuenta en bodega; lo consumible se gasta.</p>
            {r.porTipoItem.map((t, i) => (
              <Barra
                key={t.nombre}
                etiqueta={t.nombre}
                valor={t.monto}
                maximo={r.porTipoItem[0].monto}
                color={["#c85217", "#0f766e", "#4f46e5", "#b08419", "#94a3b8"][i % 5]}
                href={`${RUTA_VH}/buscador?tipo=${encodeURIComponent(t.nombre)}`}
                derecha={
                  <>
                    <span className="tabular-nums text-tinta">{montoCorto(t.monto)}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(t.participacion)}</span>
                  </>
                }
              />
            ))}
          </div>
        </Seccion>
      </div>

      {/* ── Categorías ── */}
      <Seccion titulo="Gasto por categoría" icono={<IconCategory size={15} />}>
        <div className={`${TARJETA} grid gap-x-10 gap-y-3.5 p-5 lg:grid-cols-2`}>
          {r.porCategoria.map((c) => (
            <Barra
              key={c.nombre}
              etiqueta={c.nombre}
              valor={c.monto}
              maximo={maxCat}
              color={colorCat.get(c.nombre)!}
              href={`${RUTA_VH}/catalogo?categoria=${encodeURIComponent(c.nombre)}`}
              derecha={
                <>
                  <span className="tabular-nums text-tinta">{montoCorto(c.monto)}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(c.participacion)}</span>
                </>
              }
            />
          ))}
        </div>
        {/* La misma tabla del Excel (categoría × año), con el color como mapa de calor. */}
        <details className={`${TARJETA} mt-3 overflow-hidden`}>
          <summary className="cursor-pointer select-none px-5 py-3 text-xs font-semibold text-tinta hover:text-naranjo">Ver por categoría y año</summary>
          <div className="overflow-x-auto border-t border-borde">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-2.5">Categoría</th>
                  {r.anios.map((a) => (
                    <th key={a} className="px-3 py-2.5 text-right">{a}</th>
                  ))}
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-right">Líneas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {r.porCategoria.map((c) => (
                  <tr key={c.nombre}>
                    <td className="px-4 py-2 font-semibold text-tinta">{c.nombre}</td>
                    {r.anios.map((a) => {
                      const v = c.porAnio[a] ?? 0;
                      return (
                        <td key={a} className="px-3 py-2 text-right tabular-nums text-tinta" style={{ background: v > 0 ? `rgba(200,82,23,${0.04 + (v / maxHeat) * 0.4})` : undefined }}>
                          {v ? montoCorto(v) : <span className="text-gris-suave">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-tinta">{montoCorto(c.monto)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gris">{n(c.lineas)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borde font-bold text-tinta">
                  <td className="px-4 py-2.5">Total</td>
                  {r.porAnio.map((a) => (
                    <td key={a.anio} className="px-3 py-2.5 text-right tabular-nums">{montoCorto(a.monto)}</td>
                  ))}
                  <td className="px-4 py-2.5 text-right tabular-nums">{montoCorto(r.total)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n(r.lineas)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
      </Seccion>

      {/* ── Proveedores ── */}
      <Seccion
        titulo="Principales 15 proveedores"
        icono={<IconBuildingStore size={15} />}
        accion={
          <Link href={`${RUTA_VH}/proveedores`} className="text-xs font-semibold text-naranjo hover:underline">
            Ver los {n(vista.proveedores.length)}
          </Link>
        }
      >
        <div className={`${TARJETA} p-5`}>
          <ol className="grid gap-x-10 gap-y-3 lg:grid-cols-2">
            {top.map((p, i) => (
              <li key={p.rut} className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2">
                <span className="text-right font-condensed text-base font-bold tabular-nums text-gris-suave">{i + 1}</span>
                <Barra
                  etiqueta={p.razonSocial}
                  valor={p.monto}
                  maximo={maxProv}
                  color={colorCat.get(p.categoriaPrincipal ?? "") ?? "#94a3b8"}
                  href={`${RUTA_VH}/proveedores/${encodeURIComponent(p.rut)}`}
                  derecha={
                    <>
                      <span className="tabular-nums text-tinta">{montoCorto(p.monto)}</span>
                      <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(p.participacion)}</span>
                    </>
                  }
                />
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-borde pt-3 text-xs text-gris">
            Los 15 suman <strong className="text-tinta">{monto(top.reduce((s, p) => s + p.monto, 0))}</strong> ({pct(top.reduce((s, p) => s + p.participacion, 0))} del total). El color es su categoría principal.
          </p>
        </div>
      </Seccion>

      {/* ── Cómo usar ── */}
      <Seccion titulo="Qué puedes hacer aquí" icono={<IconArrowRight size={15} />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Acceso href={`${RUTA_VH}/buscador`} Icono={IconListSearch} titulo="Buscador" detalle="Escribe un producto y ve cuánto se compró, a qué precio y a quién." />
          <Acceso href={`${RUTA_VH}/catalogo`} Icono={IconPackages} titulo="Catálogo y costos" detalle="Cada ítem con su costo promedio, mínimo, máximo y último." />
          <Acceso href={`${RUTA_VH}/conteo`} Icono={IconCalculator} titulo="Valorizar conteo" detalle="Anota lo contado en bodega y obtén su valor y la diferencia." />
          <Acceso href={`${RUTA_VH}/documentos`} Icono={IconFileInvoice} titulo="Documentos" detalle="Facturas, notas de crédito y débito, con su PDF." />
          <Acceso href={`${RUTA_VH}/proveedores`} Icono={IconBuildingStore} titulo="Proveedores" detalle="RUT, giro, dirección y todo lo que se le compró a cada uno." />
          <Acceso href={`${RUTA_VH}/control`} Icono={IconCategory} titulo="Categorías y control" detalle="Cómo se clasificó, qué se revisó y qué quedó fuera." />
        </div>
      </Seccion>
    </div>
  );
}

function Acceso({ href, Icono, titulo, detalle }: { href: string; Icono: Icon; titulo: string; detalle: string }) {
  return (
    <Link href={href} className={`group flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 transition hover:-translate-y-0.5 hover:border-naranjo/40 ${SOMBRA_CALIDA}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-naranjo/10 text-naranjo">
        <Icono size={20} stroke={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-tinta">{titulo}</span>
        <span className="block text-[11px] text-gris">{detalle}</span>
      </span>
      <IconArrowRight size={16} className="shrink-0 text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
    </Link>
  );
}
