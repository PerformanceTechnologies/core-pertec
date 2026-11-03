import Link from "next/link";
import { IconDownload } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, fechaCorta, filtrarProveedores, monto, montoCorto, pct, type ProveedorConCifras } from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import FiltrosUrl from "@/components/valorizacion-historica/FiltrosUrl";
import Resaltar from "@/components/valorizacion-historica/Resaltar";
import { ChipCategoria, CifraBanda, Orden, SinRegistro, conParametros } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("es-CL");

type Params = { q?: string; categoria?: string; orden?: string };

const ORDENES: Record<string, (a: ProveedorConCifras, b: ProveedorConCifras) => number> = {
  monto: (a, b) => a.monto - b.monto,
  documentos: (a, b) => a.documentos - b.documentos,
  items: (a, b) => a.items - b.items,
  ultima: (a, b) => (a.ultimaCompra ?? "").localeCompare(b.ultimaCompra ?? ""),
  nombre: (a, b) => b.razonSocial.localeCompare(a.razonSocial),
};

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<Params> }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const sp = await searchParams;
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;

  const lista = filtrarProveedores(vista.proveedores, sp);
  const orden = sp.orden ?? "-monto";
  const cmp = ORDENES[orden.replace(/^-/, "")] ?? ORDENES.monto;
  const ordenados = [...lista].sort((a, b) => (orden.startsWith("-") ? -cmp(a, b) : cmp(a, b)));
  const ordenar = (o: string) => conParametros(`${RUTA_VH}/proveedores`, sp, { orden: o === "-monto" ? null : o });
  const maximo = Math.max(...vista.proveedores.map((p) => p.monto), 1);
  const ranking = new Map(vista.proveedores.map((p, i) => [p.rut, i + 1]));
  const categorias = [...new Set(vista.proveedores.map((p) => p.categoriaPrincipal).filter((c): c is string => Boolean(c)))].sort();

  // Concentración: cuántos proveedores juntan el 80 % de lo comprado.
  let acumulado = 0, al80 = 0;
  for (const p of vista.proveedores) {
    if (acumulado >= 0.8) break;
    acumulado += p.participacion;
    al80++;
  }

  return (
    <div className="space-y-5">
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Proveedores
            </span>
            <p className="texto-banda mt-3 font-condensed text-4xl font-bold leading-none tabular-nums sm:text-5xl">{n(lista.length)} proveedores</p>
            <p className="texto-banda-65 mt-2 max-w-2xl text-sm">
              Razón social, giro y dirección tomados del DTE más reciente de cada uno. El contacto es la persona de PERTEC que suele recibir: el SII no informa un contacto del proveedor.
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 lg:min-w-[22rem]">
            <CifraBanda etiqueta="Comprado" valor={montoCorto(lista.reduce((s, p) => s + p.monto, 0))} />
            <CifraBanda etiqueta="Concentración" valor={`${al80} prov.`} detalle="Juntan el 80% de lo comprado" />
          </dl>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <FiltrosUrl
            placeholder="Razón social, RUT, giro, comuna o quién recibe…"
            filtros={[{ clave: "categoria", etiqueta: "Categoría principal", todas: "Toda categoría principal", opciones: categorias.map((c) => ({ valor: c, texto: c })) }]}
          />
        </div>
        <a
          href={conParametros("/api/valorizacion-historica/exportar", { q: sp.q, categoria: sp.categoria }, { que: "proveedores" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-2.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
        >
          <IconDownload size={14} /> Exportar CSV
        </a>
      </div>

      <div className={`${TARJETA} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                <th className="w-10 px-3 py-3 text-right">#</th>
                <th className="px-3 py-3"><Orden etiqueta="Proveedor" campo="nombre" actual={orden} enlace={ordenar} /></th>
                <th className="px-3 py-3">Categoría principal</th>
                <th className="px-3 py-3 text-right"><Orden etiqueta="Docs." campo="documentos" actual={orden} enlace={ordenar} derecha /></th>
                <th className="px-3 py-3 text-right"><Orden etiqueta="Ítems" campo="items" actual={orden} enlace={ordenar} derecha /></th>
                <th className="px-3 py-3 text-right"><Orden etiqueta="Última compra" campo="ultima" actual={orden} enlace={ordenar} derecha /></th>
                <th className="w-56 px-4 py-3 text-right"><Orden etiqueta="Monto en alcance" campo="monto" actual={orden} enlace={ordenar} derecha /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {ordenados.map((p) => (
                <tr key={p.rut} className="align-top transition hover:bg-tinta/[0.02]">
                  <td className="px-3 py-3 text-right font-condensed font-bold tabular-nums text-gris-suave">{ranking.get(p.rut)}</td>
                  <td className="max-w-[24rem] px-3 py-3">
                    <Link href={`${RUTA_VH}/proveedores/${encodeURIComponent(p.rut)}`} className="block truncate font-semibold text-tinta hover:text-naranjo" title={p.razonSocial}>
                      <Resaltar texto={p.razonSocial} q={sp.q} />
                    </Link>
                    <span className="block truncate text-[11px] text-gris" title={p.giro ?? undefined}>
                      <span className="tabular-nums">{p.rut}</span>
                      {p.comuna && ` · ${p.comuna}`}
                      {p.giro && ` · ${p.giro.toLowerCase()}`}
                    </span>
                  </td>
                  <td className="px-3 py-3">{p.categoriaPrincipal && <ChipCategoria nombre={p.categoriaPrincipal} chico />}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gris">{p.documentos}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gris">{p.items}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-gris">
                    {fechaCorta(p.ultimaCompra)}
                    {p.primeraCompra && p.primeraCompra !== p.ultimaCompra && <span className="block text-[10px]">desde {fechaCorta(p.primeraCompra)}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold tabular-nums text-tinta">{monto(p.monto)}</span>
                    <span className="ml-1.5 text-[11px] tabular-nums text-gris">{pct(p.participacion)}</span>
                    <div className="ml-auto mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-tinta/[0.06]">
                      <div className="ml-auto h-full rounded-full bg-naranjo/80" style={{ width: `${Math.max((p.monto / maximo) * 100, 1)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ordenados.length === 0 && <p className="p-10 text-center text-sm text-gris">Ningún proveedor calza con esa búsqueda.</p>}
      </div>
    </div>
  );
}
