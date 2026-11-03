import Link from "next/link";
import { IconDownload } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import {
  RUTA_VH,
  SLUG_APP_VH,
  cantidad,
  fechaCorta,
  filtrarCatalogo,
  monto,
  montoCorto,
  unidadLegible,
  type ItemCatalogo,
} from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import FiltrosUrl from "@/components/valorizacion-historica/FiltrosUrl";
import Resaltar from "@/components/valorizacion-historica/Resaltar";
import { ChipCategoria, CifraBanda, Orden, Paginacion, SinRegistro, conParametros } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

const POR_PAGINA = 60;
const n = (x: number) => x.toLocaleString("es-CL");

type Params = { q?: string; categoria?: string; tipo?: string; orden?: string; pagina?: string };

const ORDENES: Record<string, (a: ItemCatalogo, b: ItemCatalogo) => number> = {
  monto: (a, b) => a.monto - b.monto,
  compras: (a, b) => a.compras - b.compras,
  cantidad: (a, b) => a.cantidad - b.cantidad,
  promedio: (a, b) => (a.costoPromedio ?? -1) - (b.costoPromedio ?? -1),
  ultimo: (a, b) => (a.ultimoCosto ?? -1) - (b.ultimoCosto ?? -1),
  fecha: (a, b) => (a.ultimaFecha ?? "").localeCompare(b.ultimaFecha ?? ""),
  item: (a, b) => b.clave.localeCompare(a.clave),
};

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const sp = await searchParams;
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;

  const items = filtrarCatalogo(vista.catalogo, sp);
  const orden = sp.orden ?? "-monto";
  const cmp = ORDENES[orden.replace(/^-/, "")] ?? ORDENES.monto;
  const ordenados = [...items].sort((a, b) => (orden.startsWith("-") ? -cmp(a, b) : cmp(a, b)));
  const paginas = Math.max(Math.ceil(ordenados.length / POR_PAGINA), 1);
  const pagina = Math.min(Math.max(Number(sp.pagina) || 1, 1), paginas);
  const visibles = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const enlace = (c: Record<string, string | number | null>) => conParametros(`${RUTA_VH}/catalogo`, sp, c);
  const ordenar = (o: string) => enlace({ orden: o === "-monto" ? null : o, pagina: null });
  const total = items.reduce((s, i) => s + i.monto, 0);
  const sinStockNeto = items.filter((i) => i.costoPromedio === null).length;

  return (
    <div className="space-y-5">
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Base de valorización
            </span>
            <p className="texto-banda mt-3 font-condensed text-4xl font-bold leading-none tabular-nums sm:text-5xl">{n(items.length)} ítems</p>
            <p className="texto-banda-65 mt-2 max-w-2xl text-sm">
              Cada ítem agrupa sus compras por glosa. Para valorizar usa el <strong className="texto-banda">último costo</strong> (criterio de reposición) o el{" "}
              <strong className="texto-banda">costo promedio ponderado</strong> (criterio contable). Netos sin IVA y después de descuentos.
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 lg:min-w-[22rem]">
            <CifraBanda etiqueta="Monto comprado" valor={montoCorto(total)} />
            <CifraBanda etiqueta="Sin cantidad neta" valor={n(sinStockNeto)} detalle="Devueltos o sin cantidad" />
          </dl>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <FiltrosUrl
            placeholder="Buscar ítem, marca, modelo o proveedor…"
            filtros={[
              { clave: "categoria", etiqueta: "Categoría", todas: "Todas las categorías", opciones: vista.resumen.porCategoria.map((c) => ({ valor: c.nombre, texto: c.nombre })) },
              { clave: "tipo", etiqueta: "Tipo de ítem", todas: "Todo tipo de ítem", opciones: vista.resumen.porTipoItem.map((t) => ({ valor: t.nombre, texto: t.nombre })) },
            ]}
          />
        </div>
        <a
          href={conParametros("/api/valorizacion-historica/exportar", { q: sp.q, categoria: sp.categoria, tipo: sp.tipo }, { que: "catalogo" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-2.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
        >
          <IconDownload size={14} /> Exportar CSV
        </a>
      </div>

      <div>
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3"><Orden etiqueta="Ítem" campo="item" actual={orden} enlace={ordenar} /></th>
                  <th className="px-3 py-3 text-right"><Orden etiqueta="Compras" campo="compras" actual={orden} enlace={ordenar} derecha /></th>
                  <th className="px-3 py-3 text-right"><Orden etiqueta="Cant. neta" campo="cantidad" actual={orden} enlace={ordenar} derecha /></th>
                  <th className="px-3 py-3 text-right"><Orden etiqueta="Costo prom." campo="promedio" actual={orden} enlace={ordenar} derecha /></th>
                  <th className="px-3 py-3 text-right">Mín. – máx.</th>
                  <th className="px-3 py-3 text-right"><Orden etiqueta="Último costo" campo="ultimo" actual={orden} enlace={ordenar} derecha /></th>
                  <th className="px-3 py-3 text-right"><Orden etiqueta="Última compra" campo="fecha" actual={orden} enlace={ordenar} derecha /></th>
                  <th className="px-4 py-3 text-right"><Orden etiqueta="Monto neto" campo="monto" actual={orden} enlace={ordenar} derecha /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {visibles.map((i) => (
                  <tr key={i.clave} className="align-top transition hover:bg-tinta/[0.02]">
                    <td className="max-w-[26rem] px-4 py-3">
                      <Link href={`${RUTA_VH}/item?c=${encodeURIComponent(i.clave)}`} className="font-semibold leading-snug text-tinta hover:text-naranjo">
                        <Resaltar texto={i.clave} q={sp.q} />
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <ChipCategoria nombre={i.subcategoria} chico />
                        {i.marca && <span className="rounded bg-tinta/[0.05] px-1.5 py-0.5 font-semibold text-tinta/70">{i.marca}</span>}
                        {i.modelo && <span className="rounded bg-tinta/[0.05] px-1.5 py-0.5 text-gris">{i.modelo}</span>}
                        {i.talla && <span className="rounded bg-tinta/[0.05] px-1.5 py-0.5 text-gris">Talla {i.talla}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gris">{i.compras}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-tinta">
                      {cantidad(i.cantidad)} <span className="text-[11px] text-gris">{unidadLegible(i.unidad)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{i.costoPromedio === null ? "—" : monto(i.costoPromedio)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-gris">
                      {i.costoMin === null ? "—" : i.costoMin === i.costoMax ? monto(i.costoMin) : `${monto(i.costoMin)} – ${monto(i.costoMax!)}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-tinta">{i.ultimoCosto === null ? "—" : monto(i.ultimoCosto)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-gris">
                      {fechaCorta(i.ultimaFecha)}
                      {i.ultimoProveedor && <span className="block max-w-[10rem] truncate text-[10px]" title={i.ultimoProveedor}>{i.ultimoProveedor}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-tinta">{monto(i.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibles.length === 0 && <p className="p-10 text-center text-sm text-gris">Ningún ítem calza con esa búsqueda.</p>}
        </div>
        <Paginacion pagina={pagina} paginas={paginas} total={ordenados.length} porPagina={POR_PAGINA} enlace={(p) => enlace({ pagina: p })} />
      </div>
    </div>
  );
}
