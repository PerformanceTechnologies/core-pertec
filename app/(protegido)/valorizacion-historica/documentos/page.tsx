import Link from "next/link";
import { IconDownload } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, fechaCorta, filtrarDocumentos, monto, montoCorto, pct, type DocumentoConAlcance } from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import FiltrosUrl from "@/components/valorizacion-historica/FiltrosUrl";
import Resaltar from "@/components/valorizacion-historica/Resaltar";
import { ChipTipoDoc, CifraBanda, EnlacePdf, Orden, Paginacion, SinRegistro, conParametros } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

const POR_PAGINA = 60;
const n = (x: number) => x.toLocaleString("es-CL");

type Params = { q?: string; anio?: string; tipo?: string; cuadra?: string; orden?: string; pagina?: string };

const ORDENES: Record<string, (a: DocumentoConAlcance, b: DocumentoConAlcance) => number> = {
  fecha: (a, b) => a.fecha.localeCompare(b.fecha) || a.n - b.n,
  total: (a, b) => a.total - b.total,
  alcance: (a, b) => a.montoAlcance - b.montoAlcance,
  folio: (a, b) => a.folio - b.folio,
};

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const sp = await searchParams;
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;

  const docs = filtrarDocumentos(vista.documentos, { q: sp.q, anio: sp.anio ? Number(sp.anio) : undefined, tipo: sp.tipo, cuadra: sp.cuadra === "1" });
  const orden = sp.orden ?? "-fecha";
  const cmp = ORDENES[orden.replace(/^-/, "")] ?? ORDENES.fecha;
  const ordenados = [...docs].sort((a, b) => (orden.startsWith("-") ? -cmp(a, b) : cmp(a, b)));
  const paginas = Math.max(Math.ceil(ordenados.length / POR_PAGINA), 1);
  const pagina = Math.min(Math.max(Number(sp.pagina) || 1, 1), paginas);
  const visibles = ordenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const enlace = (c: Record<string, string | number | null>) => conParametros(`${RUTA_VH}/documentos`, sp, c);
  const ordenar = (o: string) => enlace({ orden: o === "-fecha" ? null : o, pagina: null });

  const tipos = [...new Set(vista.documentos.map((d) => d.tipo))].sort();
  const suma = (f: (d: DocumentoConAlcance) => number) => docs.reduce((s, d) => s + f(d), 0);
  const notas = docs.filter((d) => /cr[eé]dito/i.test(d.tipo)).length;

  return (
    <div className="space-y-5">
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Documentos con compras en alcance
            </span>
            <p className="texto-banda mt-3 font-condensed text-4xl font-bold leading-none tabular-nums sm:text-5xl">{n(docs.length)} documentos</p>
            <p className="texto-banda-65 mt-2 max-w-2xl text-sm">
              Facturas, notas de crédito y de débito que traen al menos una línea de materiales, herramientas o EPP. Los montos son del documento completo; «en alcance» suma solo esas líneas.
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-3 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 lg:min-w-[30rem]">
            <CifraBanda etiqueta="Total documentos" valor={montoCorto(suma((d) => d.total))} detalle="Con IVA" />
            <CifraBanda etiqueta="En alcance" valor={montoCorto(suma((d) => d.montoAlcance))} detalle="Neto" />
            <CifraBanda etiqueta="Notas de crédito" valor={n(notas)} />
          </dl>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <FiltrosUrl
            placeholder="Folio, proveedor, RUT, orden de compra o quién recibió…"
            filtros={[
              { clave: "anio", etiqueta: "Año", todas: "Todos los años", opciones: vista.resumen.anios.map((a) => ({ valor: String(a), texto: String(a) })) },
              { clave: "tipo", etiqueta: "Tipo", todas: "Todos los tipos", opciones: tipos.map((t) => ({ valor: t, texto: t })) },
            ]}
            extra={[{ clave: "cuadra", etiqueta: "Con descuento o sin cuadrar" }]}
          />
        </div>
        <a
          href={conParametros("/api/valorizacion-historica/exportar", { q: sp.q, anio: sp.anio, tipo: sp.tipo, cuadra: sp.cuadra }, { que: "documentos" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-2.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
        >
          <IconDownload size={14} /> Exportar CSV
        </a>
      </div>

      <div>
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3"><Orden etiqueta="Fecha" campo="fecha" actual={orden} enlace={ordenar} /></th>
                  <th className="px-3 py-3"><Orden etiqueta="Documento" campo="folio" actual={orden} enlace={ordenar} /></th>
                  <th className="px-3 py-3">Proveedor</th>
                  <th className="px-3 py-3 text-right">Neto</th>
                  <th className="px-3 py-3 text-right">IVA</th>
                  <th className="px-3 py-3 text-right"><Orden etiqueta="Total" campo="total" actual={orden} enlace={ordenar} derecha /></th>
                  <th className="px-3 py-3 text-right"><Orden etiqueta="En alcance" campo="alcance" actual={orden} enlace={ordenar} derecha /></th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {visibles.map((d) => (
                  <tr key={d.n} className={`align-top transition hover:bg-tinta/[0.02] ${d.total < 0 ? "bg-rose-500/[0.03]" : ""}`}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gris">{fechaCorta(d.fecha)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Link href={`${RUTA_VH}/documentos/${d.n}`} className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-tinta hover:text-naranjo">
                        <ChipTipoDoc tipo={d.tipo} /> <Resaltar texto={String(d.folio)} q={sp.q} />
                      </Link>
                      {!/^cuadra$/i.test(d.estadoCuadratura) && <span className="mt-1 block text-[10px] font-semibold text-amber-600">{d.estadoCuadratura}</span>}
                    </td>
                    <td className="max-w-[22rem] px-3 py-3">
                      <Link href={`${RUTA_VH}/proveedores/${encodeURIComponent(d.rut)}`} className="block truncate font-semibold text-tinta hover:text-naranjo" title={d.proveedor}>
                        <Resaltar texto={d.proveedor} q={sp.q} />
                      </Link>
                      <span className="block text-[11px] tabular-nums text-gris">
                        {d.rut}
                        {d.contactoPertec && <> · recibió {d.contactoPertec}</>}
                      </span>
                      {d.referencias && <span className="block truncate text-[10px] text-gris" title={d.referencias}>{d.referencias}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{monto(d.montoNeto + d.montoExento)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{monto(d.iva)}</td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums ${d.total < 0 ? "text-rose-600" : "text-tinta"}`}>{monto(d.total)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      <span className="font-semibold text-tinta">{monto(d.montoAlcance)}</span>
                      <span className="block text-[10px] text-gris">
                        {d.lineasAlcance} {d.lineasAlcance === 1 ? "línea" : "líneas"}
                        {d.participacion !== null && d.participacion < 0.995 && ` · ${pct(d.participacion, 0)}`}
                      </span>
                    </td>
                    <td className="px-3 py-3">{d.pdf && <EnlacePdf doc={d.n} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibles.length === 0 && <p className="p-10 text-center text-sm text-gris">Ningún documento calza con esa búsqueda.</p>}
        </div>
        <Paginacion pagina={pagina} paginas={paginas} total={ordenados.length} porPagina={POR_PAGINA} enlace={(p) => enlace({ pagina: p })} />
      </div>
    </div>
  );
}
