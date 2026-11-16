import Link from "next/link";
import { IconAlertTriangle, IconArchive, IconArrowLeft, IconChevronRight, IconHammer, IconTools } from "@tabler/icons-react";
import IntroSeccion, { Pistas } from "@/components/inventario/IntroSeccion";
import FormularioFabricacion from "@/components/inventario/FormularioFabricacion";
import { ChipEstadoFabricacion } from "@/components/inventario/VisualFabricacion";
import { contarFabricacionesArchivadas, fabricacionDisponible, listarFabricaciones, MIGRACION_FABRICACION } from "@/lib/fabricacion";
import { formatearMontoFino, formatearPct } from "@/lib/fabricacion-modelo";
import { listarUnidades } from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function FabricacionPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const archivadas = ver === "archivadas";

  if (!(await fabricacionDisponible())) return <AvisoSinActivar />;

  const [fichas, unidades, cuentaArchivadas] = await Promise.all([listarFabricaciones(archivadas), listarUnidades(), contarFabricacionesArchivadas()]);
  const visibles = archivadas ? fichas.filter((f) => f.estado === "archivado") : fichas;

  return (
    <div className="space-y-4">
      <IntroSeccion compacto
        Icono={IconTools}
        tono="bg-naranjo/12 text-naranjo"
        titulo={archivadas ? "Fabricación · Archivados" : "Fabricación"}
        bajada={
          archivadas
            ? "Productos fabricados que se sacaron de uso. No se borra nada: se pueden restaurar desde su ficha."
            : "Lo que cuesta fabricar cada producto, ítem por ítem, y el precio con nuestro margen. Desde la ficha sale el PDF con el costo para enviar a proveedores."
        }
      >
        {archivadas ? (
          <Link href="/inventario/fabricacion" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50">
            <IconArrowLeft size={16} /> Volver a Fabricación
          </Link>
        ) : (
          <div className="space-y-3">
            <Pistas items={["Crea el producto", "Carga cada ítem de costo", "Descarga el PDF con el costo"]} />
            <div className="flex flex-wrap items-center gap-2">
              <FormularioFabricacion unidades={unidades} />
              <Link href="/inventario/fabricacion?ver=archivadas" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50">
                <IconArchive size={16} /> Archivados{cuentaArchivadas > 0 ? ` (${cuentaArchivadas})` : ""}
              </Link>
              <span className="text-sm text-gris">{visibles.length} {visibles.length === 1 ? "producto" : "productos"}</span>
            </div>
          </div>
        )}
      </IntroSeccion>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-naranjo/12 text-naranjo"><IconHammer size={24} stroke={1.75} /></span>
          <p className="text-sm text-gris">
            {archivadas ? "No hay productos fabricados archivados." : "Todavía no hay productos fabricados. Crea el primero con «Nuevo producto»."}
          </p>
        </div>
      ) : (
        <>
          {/* Tabla: tablet y escritorio */}
          <div className={`${TARJETA} hidden overflow-hidden md:block`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Ítems</th>
                    <th className="px-3 py-2 text-right">Costo de fabricación</th>
                    <th className="px-3 py-2 text-right" title="Interno: lo que cobramos si fabricamos nosotros">Margen</th>
                    <th className="px-3 py-2 text-right" title="Interno: costo ÷ (1 − margen)">Precio con margen</th>
                    <th className="px-3 py-2"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {visibles.map((f) => (
                    <tr key={f.id} className="group transition hover:bg-tinta/[0.02]">
                      <td className="px-3 py-1.5">
                        <Link href={`/inventario/fabricacion/${f.id}`} className="block">
                          <span className="font-semibold text-tinta group-hover:text-naranjo">{f.nombre}</span>
                          <span className="block text-xs text-gris">{f.codigo ? <span className="font-mono">{f.codigo}</span> : "sin código"}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-1.5"><ChipEstadoFabricacion estado={f.estado} /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gris">{f.cantidadItems}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-tinta">{formatearMontoFino(f.resumen.costo)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gris">{formatearPct(f.margenPct)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gris">{f.resumen.precioConMargen === null ? "—" : formatearMontoFino(f.resumen.precioConMargen)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Link href={`/inventario/fabricacion/${f.id}`} aria-label={`Abrir ${f.nombre}`} className="inline-grid h-7 w-7 place-items-center rounded-lg text-gris-suave transition group-hover:text-cian">
                          <IconChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tarjetas: celular */}
          <ul className="space-y-2.5 md:hidden">
            {visibles.map((f) => (
              <li key={f.id}>
                <Link href={`/inventario/fabricacion/${f.id}`} className={`${TARJETA} block p-4 transition active:bg-tinta/[0.02]`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug text-tinta">{f.nombre}</p>
                      <p className="text-xs text-gris">{f.codigo ? <span className="font-mono">{f.codigo}</span> : "sin código"} · {f.cantidadItems} {f.cantidadItems === 1 ? "ítem" : "ítems"}</p>
                    </div>
                    <ChipEstadoFabricacion estado={f.estado} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-naranjo/[0.07] px-3 py-2">
                      <dt className="text-[11px] text-gris">Costo de fabricación</dt>
                      <dd className="font-extrabold tabular-nums text-tinta">{formatearMontoFino(f.resumen.costo)}</dd>
                    </div>
                    <div className="rounded-lg bg-tinta/[0.03] px-3 py-2">
                      <dt className="text-[11px] text-gris">Con margen {formatearPct(f.margenPct)}</dt>
                      <dd className="font-bold tabular-nums text-tinta">{f.resumen.precioConMargen === null ? "—" : formatearMontoFino(f.resumen.precioConMargen)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** La base todavía no tiene las tablas: se dice qué correr en vez de mostrar un error. */
function AvisoSinActivar() {
  return (
    <div className="space-y-4">
      <IntroSeccion compacto Icono={IconTools} tono="bg-naranjo/12 text-naranjo" titulo="Fabricación" bajada="Los productos que fabricamos y lo que cuesta hacer cada uno." />
      <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-tinta">
        <IconAlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <p>
          <span className="font-bold text-amber-700">Fabricación todavía no está activada en la base de datos.</span> Un administrador tiene que correr la migración{" "}
          <span className="break-all font-mono text-xs">{MIGRACION_FABRICACION}</span> en el editor SQL de Supabase. Después recarga esta página.
        </p>
      </div>
    </div>
  );
}
