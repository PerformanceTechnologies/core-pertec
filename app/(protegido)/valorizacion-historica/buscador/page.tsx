import Link from "next/link";
import { IconAlertTriangle, IconBulb, IconDownload, IconListDetails, IconPackages } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import {
  RUTA_VH,
  SLUG_APP_VH,
  cantidad,
  claveDocumento,
  fechaCorta,
  filtrarLineas,
  masRecientesPrimero,
  monto,
  productosFrecuentes,
  resumirLineas,
  unidadLegible,
  type LineaCompra,
} from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import FiltrosUrl from "@/components/valorizacion-historica/FiltrosUrl";
import Resaltar from "@/components/valorizacion-historica/Resaltar";
import { ChipCategoria, ChipTipoDoc, EnlacePdf, Orden, Paginacion, SinRegistro, conParametros } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

const POR_PAGINA = 100;
const n = (x: number) => x.toLocaleString("es-CL");

type Params = { q?: string; categoria?: string; anio?: string; proveedor?: string; tipo?: string; revisar?: string; ver?: string; orden?: string; pagina?: string };

const ORDENES: Record<string, (a: LineaCompra, b: LineaCompra) => number> = {
  fecha: (a, b) => -masRecientesPrimero(a, b),
  valor: (a, b) => a.valorAjustado - b.valorAjustado,
  costo: (a, b) => (a.costoUnitario ?? -1) - (b.costoUnitario ?? -1),
  cantidad: (a, b) => (a.cantidad ?? 0) - (b.cantidad ?? 0),
};

export default async function BuscadorPage({ searchParams }: { searchParams: Promise<Params> }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const sp = await searchParams;
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;

  const filtros = {
    q: sp.q,
    categoria: sp.categoria,
    anio: sp.anio ? Number(sp.anio) : undefined,
    proveedor: sp.proveedor,
    tipoItem: sp.tipo,
    soloRevisar: sp.revisar === "1",
  };
  const encontradas = filtrarLineas(vista.datos.lineas, filtros, vista.textos);
  const r = resumirLineas(encontradas);
  const hayBusqueda = Boolean(sp.q || sp.categoria || sp.anio || sp.proveedor || sp.tipo || sp.revisar);
  const porItem = sp.ver === "items";

  const enlace = (cambios: Record<string, string | number | null>) => conParametros(`${RUTA_VH}/buscador`, sp, cambios);
  const exportar = conParametros("/api/valorizacion-historica/exportar", { ...sp, ver: undefined, orden: undefined, pagina: undefined }, { que: "lineas" });

  const proveedoresOpc = [...vista.proveedores].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial)).map((p) => ({ valor: p.rut, texto: p.razonSocial }));

  return (
    <div className="space-y-5">
      <div className={`${TARJETA} space-y-3 p-4 sm:p-5`}>
        <FiltrosUrl
          grande
          autoFocus={!hayBusqueda}
          placeholder="Escribe un producto, marca, modelo, código o proveedor… (taladro, guante 3m, taladro*makita)"
          filtros={[
            { clave: "categoria", etiqueta: "Categoría", todas: "Todas las categorías", opciones: vista.resumen.porCategoria.map((c) => ({ valor: c.nombre, texto: c.nombre })) },
            { clave: "anio", etiqueta: "Año", todas: "Todos los años", opciones: vista.resumen.anios.map((a) => ({ valor: String(a), texto: String(a) })) },
            { clave: "tipo", etiqueta: "Tipo de ítem", todas: "Todo tipo de ítem", opciones: vista.resumen.porTipoItem.map((t) => ({ valor: t.nombre, texto: t.nombre })) },
            { clave: "proveedor", etiqueta: "Proveedor", todas: "Todos los proveedores", opciones: proveedoresOpc },
          ]}
          extra={[{ clave: "revisar", etiqueta: "Solo «Revisar»" }]}
        />
        <p className="text-[11px] text-gris">
          Busca en glosa, producto, marca, modelo, proveedor, subcategoría, código y folio, sin importar tildes ni mayúsculas. Varias palabras = todas deben aparecer;
          con <code className="rounded bg-tinta/[0.06] px-1 font-mono">*</code> exiges un orden: <code className="rounded bg-tinta/[0.06] px-1 font-mono">taladro*makita</code>.
        </p>
        {!sp.q && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gris">Prueba con</span>
            {productosFrecuentes(vista.catalogo, 10).map((p) => (
              <Link key={p} href={enlace({ q: p, pagina: null })} scroll={false} className="rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-semibold text-tinta transition hover:border-naranjo/50 hover:text-naranjo">
                {p}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Lo que dice la búsqueda ── */}
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
          <div className="min-w-0">
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 shrink-0 bg-naranjo" />
              <span className="truncate">{sp.q ? `Resultado de «${sp.q}»` : hayBusqueda ? "Resultado del filtro" : "Todo el registro"}</span>
            </span>
            <p className="texto-banda mt-3 font-condensed text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl">{monto(r.monto)}</p>
            <p className="texto-banda-45 mt-1.5 text-xs">Monto neto comprado, sin IVA</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Dato valor={n(r.lineas)} texto={r.lineas === 1 ? "línea" : "líneas"} />
            <Dato valor={n(r.documentos)} texto={r.documentos === 1 ? "documento" : "documentos"} />
            <Dato valor={n(r.proveedores)} texto={r.proveedores === 1 ? "proveedor" : "proveedores"} />
            {r.primeraFecha && <Dato valor={`${fechaCorta(r.primeraFecha)} – ${fechaCorta(r.ultimaFecha ?? encontradas[0]?.fecha)}`} texto="período" />}
          </div>
        </div>

        {sp.q ? (
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Casilla
              etiqueta="Último costo"
              valor={r.ultimoCosto === null ? "—" : monto(r.ultimoCosto)}
              detalle={r.ultimaFecha ? `${fechaCorta(r.ultimaFecha)} · ${r.ultimoProveedor}` : "Sin compras con precio"}
              destacado
            />
            <Casilla etiqueta="Costo mínimo" valor={r.costoMin === null ? "—" : monto(r.costoMin)} detalle="Lo más barato que se pagó" />
            <Casilla etiqueta="Costo máximo" valor={r.costoMax === null ? "—" : monto(r.costoMax)} detalle="Lo más caro que se pagó" />
            <Casilla
              etiqueta="Cantidad neta"
              valor={cantidad(r.cantidad)}
              detalle={r.unidades.length > 1 ? `Suma ${r.unidades.length} unidades distintas` : r.unidades[0] ? `En ${r.unidades[0]}, menos devoluciones` : "Menos devoluciones"}
            />
          </dl>
        ) : (
          <div className="borde-banda texto-banda-65 mt-6 flex items-start gap-3 rounded-xl border px-5 py-4 text-sm">
            <IconBulb size={18} className="mt-0.5 shrink-0 text-naranjo" />
            <p>
              Escribe un producto, marca o proveedor en el buscador de arriba y aquí vas a ver <strong className="texto-banda">el último costo, el mínimo, el máximo y la cantidad comprada</strong>.
              {hayBusqueda && " Con solo filtros se mezclan productos muy distintos, así que esas cifras no se muestran."}
            </p>
          </div>
        )}

        {sp.q && r.unidades.length > 1 && (
          <p className="texto-banda-65 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <IconAlertTriangle size={14} className="shrink-0 text-amber-400" />
            La búsqueda junta productos distintos ({r.unidades.slice(0, 4).join(", ")}{r.unidades.length > 4 ? "…" : ""}): la cantidad y los costos son de referencia.
            {!porItem && (
              <Link href={enlace({ ver: "items", pagina: null })} scroll={false} className="font-semibold text-naranjo hover:underline">
                Ver el costo de cada ítem →
              </Link>
            )}
          </p>
        )}
      </section>

      {/* ── Resultados ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-borde bg-superficie p-1">
          <Link href={enlace({ ver: null, pagina: null })} scroll={false} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!porItem ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>
            <IconListDetails size={15} /> Líneas de compra <span className="tabular-nums opacity-70">{n(r.lineas)}</span>
          </Link>
          <Link href={enlace({ ver: "items", pagina: null })} scroll={false} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${porItem ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>
            <IconPackages size={15} /> Por ítem <span className="tabular-nums opacity-70">{n(new Set(encontradas.map((l) => l.clave)).size)}</span>
          </Link>
        </div>
        <span className="flex-1" />
        {encontradas.length > 0 && (
          <a href={exportar} className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50">
            <IconDownload size={14} /> Exportar a Excel (CSV)
          </a>
        )}
      </div>

      {encontradas.length === 0 ? (
        <div className={`${TARJETA} p-12 text-center`}>
          <p className="text-sm font-semibold text-tinta">No se encontró nada con esa búsqueda</p>
          <p className="mt-1 text-xs text-gris">Prueba con menos palabras, otra forma de escribirlo (p. ej. «guant» en vez de «guantes») o quita algún filtro.</p>
        </div>
      ) : porItem ? (
        <TablaItems lineas={encontradas} q={sp.q} />
      ) : (
        <TablaLineas lineas={encontradas} sp={sp} enlace={enlace} docs={vista.numeroDeDocumento} />
      )}
    </div>
  );
}

function TablaLineas({ lineas, sp, enlace, docs }: { lineas: LineaCompra[]; sp: Params; enlace: (c: Record<string, string | number | null>) => string; docs: Map<string, number> }) {
  const orden = sp.orden ?? "-fecha";
  const campo = orden.replace(/^-/, "");
  const cmp = ORDENES[campo] ?? ORDENES.fecha;
  const ordenadas = [...lineas].sort((a, b) => (orden.startsWith("-") ? -cmp(a, b) : cmp(a, b)));
  const paginas = Math.ceil(ordenadas.length / POR_PAGINA);
  const pagina = Math.min(Math.max(Number(sp.pagina) || 1, 1), paginas);
  const visibles = ordenadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const ordenar = (o: string) => enlace({ orden: o === "-fecha" ? null : o, pagina: null });

  return (
    <div>
      <div className={`${TARJETA} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-superficie">
              <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                <th className="px-4 py-3"><Orden etiqueta="Fecha" campo="fecha" actual={orden} enlace={ordenar} /></th>
                <th className="px-3 py-3">Glosa y proveedor</th>
                <th className="px-3 py-3">Documento</th>
                <th className="px-3 py-3 text-right"><Orden etiqueta="Cant." campo="cantidad" actual={orden} enlace={ordenar} derecha /></th>
                <th className="px-3 py-3 text-right">Precio unit.</th>
                <th className="px-3 py-3 text-right"><Orden etiqueta="Costo unit. real" campo="costo" actual={orden} enlace={ordenar} derecha /></th>
                <th className="px-4 py-3 text-right"><Orden etiqueta="Valor neto" campo="valor" actual={orden} enlace={ordenar} derecha /></th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {visibles.map((l) => (
                <tr key={l.n} className={`align-top transition hover:bg-tinta/[0.02] ${(l.cantidad ?? 0) < 0 ? "bg-rose-500/[0.03]" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gris">{fechaCorta(l.fecha)}</td>
                  <td className="max-w-[30rem] px-3 py-3">
                    <Link href={`${RUTA_VH}/item?c=${encodeURIComponent(l.clave)}`} className="font-semibold leading-snug text-tinta hover:text-naranjo">
                      <Resaltar texto={l.glosa} q={sp.q} />
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gris">
                      <Link href={`${RUTA_VH}/proveedores/${encodeURIComponent(l.rut)}`} className="font-semibold hover:text-naranjo">
                        <Resaltar texto={l.proveedor} q={sp.q} />
                      </Link>
                      <span>·</span>
                      <ChipCategoria nombre={l.subcategoria} chico />
                      {l.marca && <span className="rounded bg-tinta/[0.05] px-1.5 py-0.5 font-semibold text-tinta/70">{l.marca}</span>}
                      {l.talla && <span className="rounded bg-tinta/[0.05] px-1.5 py-0.5">Talla {l.talla}</span>}
                      {l.revisar && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">Revisar</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <DocLink linea={l} numero={docs.get(claveDocumento(l))} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-tinta">
                    {cantidad(l.cantidad)} <span className="text-[11px] text-gris">{unidadLegible(l.unidad)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">
                    {l.precioUnitario === null ? "—" : monto(l.precioUnitario)}
                    {/* Un «descuento» sobre 100 % es un dato mal leído del PDF: no se muestra como porcentaje. */}
                    {l.descuentoLinea && l.descuentoLinea <= 1 ? <span className="block text-[10px] text-emerald-600">−{Math.round(l.descuentoLinea * 1000) / 10}%</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-tinta">{l.costoUnitario === null ? "—" : monto(l.costoUnitario)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${l.valorAjustado < 0 ? "text-rose-600" : "text-tinta"}`}>{monto(l.valorAjustado)}</td>
                  <td className="px-3 py-3">{l.pdf && <EnlacePdf linea={l.n} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Paginacion pagina={pagina} paginas={paginas} total={ordenadas.length} porPagina={POR_PAGINA} enlace={(p) => enlace({ pagina: p })} />
    </div>
  );
}

function Dato({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div>
      <p className="texto-banda font-semibold tabular-nums">{valor}</p>
      <p className="texto-banda-45 text-[11px]">{texto}</p>
    </div>
  );
}

/** Una cifra de la búsqueda dentro de la banda; la primera (el último costo) va resaltada. */
function Casilla({ etiqueta, valor, detalle, destacado = false }: { etiqueta: string; valor: string; detalle: string; destacado?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border px-4 py-3.5 sm:px-5 ${destacado ? "border-naranjo/40 bg-naranjo/[0.12]" : "borde-banda bg-white/[0.03]"}`}>
      <dt className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${destacado ? "text-naranjo" : "texto-banda-45"}`}>{etiqueta}</dt>
      <dd className="texto-banda mt-1 truncate font-condensed text-2xl font-bold tabular-nums sm:text-3xl">{valor}</dd>
      <dd className="texto-banda-45 mt-0.5 truncate text-[11px]" title={detalle}>{detalle}</dd>
    </div>
  );
}

/** El documento de una línea: tipo y folio, enlazado a su ficha. */
function DocLink({ linea: l, numero }: { linea: LineaCompra; numero?: number }) {
  return (
    <Link href={numero ? `${RUTA_VH}/documentos/${numero}` : `${RUTA_VH}/documentos?q=${l.folio}`} className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-tinta hover:text-naranjo">
      <ChipTipoDoc tipo={l.tipoDocumento} /> {l.folio}
    </Link>
  );
}

function TablaItems({ lineas, q }: { lineas: LineaCompra[]; q?: string }) {
  const grupos = new Map<string, LineaCompra[]>();
  for (const l of lineas) grupos.set(l.clave, [...(grupos.get(l.clave) ?? []), l]);
  const items = [...grupos.entries()]
    .map(([clave, ls]) => ({ clave, ref: [...ls].sort(masRecientesPrimero)[0], r: resumirLineas(ls) }))
    .sort((a, b) => b.r.monto - a.r.monto)
    .slice(0, 300);

  return (
    <div className={`${TARJETA} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
              <th className="px-4 py-3">Ítem</th>
              <th className="px-3 py-3 text-right">Compras</th>
              <th className="px-3 py-3 text-right">Cantidad neta</th>
              <th className="px-3 py-3 text-right">Costo prom.</th>
              <th className="px-3 py-3 text-right">Mín. – máx.</th>
              <th className="px-3 py-3 text-right">Último costo</th>
              <th className="px-4 py-3 text-right">Monto neto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {items.map(({ clave, ref, r }) => (
              <tr key={clave} className="transition hover:bg-tinta/[0.02]">
                <td className="max-w-[28rem] px-4 py-3">
                  <Link href={`${RUTA_VH}/item?c=${encodeURIComponent(clave)}`} className="font-semibold leading-snug text-tinta hover:text-naranjo">
                    <Resaltar texto={clave} q={q} />
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ChipCategoria nombre={ref.subcategoria} chico />
                    {ref.marca && <span className="rounded bg-tinta/[0.05] px-1.5 py-0.5 text-[11px] font-semibold text-tinta/70">{ref.marca}</span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-gris">{r.lineas}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-tinta">
                  {cantidad(r.cantidad)} <span className="text-[11px] text-gris">{r.unidades.join("/")}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{r.cantidad > 0 ? monto(r.monto / r.cantidad) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums text-gris">
                  {r.costoMin === null ? "—" : r.costoMin === r.costoMax ? monto(r.costoMin) : `${monto(r.costoMin)} – ${monto(r.costoMax!)}`}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                  <span className="font-semibold text-tinta">{r.ultimoCosto === null ? "—" : monto(r.ultimoCosto)}</span>
                  {r.ultimaFecha && <span className="block text-[10px] text-gris">{fechaCorta(r.ultimaFecha)}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-tinta">{monto(r.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grupos.size > 300 && <p className="border-t border-borde px-4 py-2.5 text-xs text-gris">Se muestran los 300 ítems de mayor monto de {n(grupos.size)}. Afina la búsqueda para ver el resto.</p>}
    </div>
  );
}
