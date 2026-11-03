import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconBuildingStore, IconCalculator, IconChartLine, IconListDetails, IconPackages, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import {
  RUTA_VH,
  SLUG_APP_VH,
  cantidad,
  claveDocumento,
  fechaCorta,
  masRecientesPrimero,
  monto,
  pct,
  resumirLineas,
  unidadLegible,
  variacionDeCosto,
  type LineaCompra,
} from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import GraficoCostos from "@/components/valorizacion-historica/GraficoCostos";
import { ChipCategoria, ChipTipoDoc, Cifra, EnlacePdf, Seccion, SinRegistro } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

export default async function ItemPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const { c } = await searchParams;
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;
  const item = c ? vista.catalogoPorClave.get(c) : undefined;
  if (!item) notFound();

  const lineas = vista.datos.lineas.filter((l) => l.clave === item.clave).sort(masRecientesPrimero);
  const variacion = variacionDeCosto(lineas);

  // Quién lo vendió y a cuánto.
  const porProveedor = new Map<string, LineaCompra[]>();
  for (const l of lineas) porProveedor.set(l.rut, [...(porProveedor.get(l.rut) ?? []), l]);
  const proveedores = [...porProveedor.entries()].map(([rut, ls]) => ({ rut, nombre: ls[0].proveedor, r: resumirLineas(ls) })).sort((a, b) => b.r.monto - a.r.monto);

  // Ítems parecidos: el mismo producto (y marca si tiene), para comparar precios.
  const parecidos = item.producto
    ? vista.catalogo
        .filter((i) => i.clave !== item.clave && i.producto === item.producto && (!item.marca || i.marca === item.marca) && i.ultimoCosto !== null)
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <Link href={`${RUTA_VH}/catalogo`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo">
        <IconArrowLeft size={14} /> Catálogo
      </Link>

      <header className={`${TARJETA} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-naranjo/10 text-naranjo">
            <IconPackages size={24} stroke={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-snug tracking-tight text-tinta">{item.clave}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <ChipCategoria nombre={item.categoria} />
              <ChipCategoria nombre={item.subcategoria} />
              <span className="rounded-full border border-borde px-2.5 py-1 font-semibold text-gris">{item.tipoItem}</span>
              {item.producto && <span className="rounded-full bg-tinta/[0.05] px-2.5 py-1 font-semibold text-tinta/70">{item.producto}</span>}
              {item.marca && <span className="rounded-full bg-tinta/[0.05] px-2.5 py-1 font-semibold text-tinta/70">Marca {item.marca}</span>}
              {item.modelo && <span className="rounded-full bg-tinta/[0.05] px-2.5 py-1 text-gris">Modelo {item.modelo}</span>}
              {item.talla && <span className="rounded-full bg-tinta/[0.05] px-2.5 py-1 text-gris">Talla {item.talla}</span>}
            </div>
          </div>
          <Link
            href={`${RUTA_VH}/conteo?agregar=${encodeURIComponent(item.clave)}`}
            className="inline-flex items-center gap-1.5 self-center rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
          >
            <IconCalculator size={16} /> Valorizar en un conteo
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Cifra etiqueta="Último costo" valor={item.ultimoCosto === null ? "—" : monto(item.ultimoCosto)} detalle={item.ultimaFecha ? `${fechaCorta(item.ultimaFecha)} · reposición` : undefined} tono="text-naranjo" />
        <Cifra etiqueta="Costo promedio" valor={item.costoPromedio === null ? "—" : monto(item.costoPromedio)} detalle="Ponderado · contable" />
        <Cifra etiqueta="Mínimo – máximo" valor={item.costoMin === null ? "—" : `${monto(item.costoMin)}`} detalle={item.costoMax === null ? undefined : `hasta ${monto(item.costoMax)}`} />
        <Cifra etiqueta="Cantidad neta" valor={`${cantidad(item.cantidad)} ${unidadLegible(item.unidad)}`} detalle={`${item.compras} ${item.compras === 1 ? "compra" : "compras"}`} />
        <Cifra etiqueta="Monto neto" valor={monto(item.monto)} detalle={`${item.proveedores} ${item.proveedores === 1 ? "proveedor" : "proveedores"}`} />
        <Cifra
          etiqueta="Variación del costo"
          valor={variacion === null ? "—" : `${variacion > 0 ? "+" : ""}${pct(variacion)}`}
          detalle="Primera vs. última compra"
          tono={variacion === null ? "text-tinta" : variacion > 0.005 ? "text-rose-600" : variacion < -0.005 ? "text-emerald-600" : "text-tinta"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Seccion titulo="Costo unitario en el tiempo" icono={<IconChartLine size={15} />}>
          <div className={`${TARJETA} p-4`}>
            {lineas.filter((l) => (l.cantidad ?? 0) > 0).length >= 2 ? (
              <GraficoCostos lineas={lineas} />
            ) : (
              <p className="p-8 text-center text-sm text-gris">Se compró una sola vez: no hay evolución de precio que mostrar.</p>
            )}
            {variacion !== null && Math.abs(variacion) > 0.005 && (
              <p className={`mt-3 flex items-center gap-1.5 border-t border-borde pt-3 text-xs ${variacion > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {variacion > 0 ? <IconTrendingUp size={15} /> : <IconTrendingDown size={15} />}
                Entre la primera y la última compra el costo {variacion > 0 ? "subió" : "bajó"} {pct(Math.abs(variacion))}.
              </p>
            )}
          </div>
        </Seccion>

        <Seccion titulo="A quién se le compró" icono={<IconBuildingStore size={15} />}>
          <ul className={`${TARJETA} divide-y divide-borde`}>
            {proveedores.map((p) => (
              <li key={p.rut} className="px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <Link href={`${RUTA_VH}/proveedores/${encodeURIComponent(p.rut)}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta hover:text-naranjo">
                    {p.nombre}
                  </Link>
                  <span className="text-sm font-bold tabular-nums text-tinta">{monto(p.r.monto)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-gris">
                  {p.r.lineas} {p.r.lineas === 1 ? "compra" : "compras"} · {cantidad(p.r.cantidad)} {p.r.unidades.join("/")}
                  {p.r.ultimoCosto !== null && <> · último {monto(p.r.ultimoCosto)} ({fechaCorta(p.r.ultimaFecha)})</>}
                </p>
              </li>
            ))}
          </ul>
        </Seccion>
      </div>

      <Seccion titulo={`Todas las compras (${lineas.length})`} icono={<IconListDetails size={15} />}>
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-3 py-3">Proveedor</th>
                  <th className="px-3 py-3">Documento</th>
                  <th className="px-3 py-3 text-right">Cantidad</th>
                  <th className="px-3 py-3 text-right">Precio unit.</th>
                  <th className="px-3 py-3 text-right">Costo unit. real</th>
                  <th className="px-4 py-3 text-right">Valor neto</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {lineas.map((l) => {
                  const doc = vista.numeroDeDocumento.get(claveDocumento(l));
                  return (
                    <tr key={l.n} className={(l.cantidad ?? 0) < 0 ? "bg-rose-500/[0.03]" : ""}>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gris">{fechaCorta(l.fecha)}</td>
                      <td className="max-w-[16rem] truncate px-3 py-2.5 font-semibold text-tinta" title={l.proveedor}>{l.proveedor}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Link href={doc ? `${RUTA_VH}/documentos/${doc}` : `${RUTA_VH}/documentos?q=${l.folio}`} className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-tinta hover:text-naranjo">
                          <ChipTipoDoc tipo={l.tipoDocumento} /> {l.folio}
                        </Link>
                        {l.referencias && <span className="block max-w-[14rem] truncate text-[10px] text-gris" title={l.referencias}>{l.referencias}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-tinta">{cantidad(l.cantidad)} <span className="text-[11px] text-gris">{unidadLegible(l.unidad)}</span></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gris">{l.precioUnitario === null ? "—" : monto(l.precioUnitario)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-tinta">{l.costoUnitario === null ? "—" : monto(l.costoUnitario)}</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums ${l.valorAjustado < 0 ? "text-rose-600" : "text-tinta"}`}>{monto(l.valorAjustado)}</td>
                      <td className="px-3 py-2.5">{l.pdf && <EnlacePdf linea={l.n} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Seccion>

      {parecidos.length > 0 && (
        <Seccion titulo={`Otros «${item.producto}»${item.marca ? ` ${item.marca}` : ""} para comparar`} icono={<IconPackages size={15} />}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {parecidos.map((p) => (
              <li key={p.clave}>
                <Link href={`${RUTA_VH}/item?c=${encodeURIComponent(p.clave)}`} className={`${TARJETA} flex items-center gap-3 px-4 py-3 transition hover:border-naranjo/40`}>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta" title={p.clave}>{p.clave}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-tinta">{monto(p.ultimoCosto!)}</span>
                    <span className="block text-[10px] text-gris">{fechaCorta(p.ultimaFecha)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}
