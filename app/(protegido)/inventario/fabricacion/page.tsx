import Link from "next/link";
import { IconAlertTriangle, IconArchive, IconArrowLeft, IconChevronRight, IconHammer, IconTools } from "@tabler/icons-react";
import IntroSeccion, { Pistas } from "@/components/inventario/IntroSeccion";
import FormularioFabricacion from "@/components/inventario/FormularioFabricacion";
import { ChipEstadoFabricacion } from "@/components/inventario/VisualFabricacion";
import { contarFabricacionesArchivadas, fabricacionDisponible, listarFabricaciones, MIGRACION_FABRICACION, productosTerminadosDisponibles, type FabricacionConCosto } from "@/lib/fabricacion";
import { formatearMontoFino, formatearPct, lecturaMargen } from "@/lib/fabricacion-modelo";
import { listarUnidades } from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function FabricacionPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const archivadas = ver === "archivadas";

  if (!(await fabricacionDisponible())) return <AvisoSinActivar />;

  const [fichas, unidades, terminados, cuentaArchivadas] = await Promise.all([
    listarFabricaciones(archivadas),
    listarUnidades(),
    productosTerminadosDisponibles(),
    contarFabricacionesArchivadas(),
  ]);
  const visibles = archivadas ? fichas.filter((f) => f.estado === "archivado") : fichas;
  const activas = visibles.filter((f) => f.estado === "activo").length;
  const margenBajo = visibles.filter((f) => f.estado !== "archivado" && lecturaMargen(f.resumen.margenReal, f.margenPct) === "bajo").length;

  return (
    <div className="space-y-4">
      <IntroSeccion
        Icono={IconTools}
        tono="bg-naranjo/12 text-naranjo"
        titulo={archivadas ? "Fabricación · Archivados" : "Fabricación"}
        bajada={
          archivadas
            ? "Productos fabricados que se sacaron de uso. No se borra nada: se pueden restaurar desde su ficha."
            : "Los productos que fabricamos y lo que cuesta hacer cada uno: materiales, mano de obra, maquinaria y demás, con su costo por unidad y su precio sugerido."
        }
      >
        {archivadas ? (
          <Link href="/inventario/fabricacion" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50">
            <IconArrowLeft size={16} /> Volver a Fabricación
          </Link>
        ) : (
          <div className="space-y-3">
            <Pistas items={["Crea el producto y cuánto rinde", "Carga cada ítem de costo", "Revisa el costo y el precio sugerido"]} />
            <div className="flex flex-wrap items-center gap-2">
              <FormularioFabricacion unidades={unidades} terminados={terminados} />
              <Link href="/inventario/fabricacion?ver=archivadas" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50">
                <IconArchive size={16} /> Archivados{cuentaArchivadas > 0 ? ` (${cuentaArchivadas})` : ""}
              </Link>
            </div>
          </div>
        )}
      </IntroSeccion>

      {visibles.length > 0 && !archivadas && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Cifra etiqueta="Productos" valor={String(visibles.length)} />
          <Cifra etiqueta="Activos" valor={String(activas)} />
          <Cifra etiqueta="En borrador" valor={String(visibles.length - activas)} />
          <Cifra etiqueta="Margen bajo la meta" valor={String(margenBajo)} alerta={margenBajo > 0} />
        </div>
      )}

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
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Ítems</th>
                    <th className="px-4 py-3 text-right" title="Costo de la receta completa, con gastos indirectos">Costo receta</th>
                    <th className="px-4 py-3 text-right">Costo por unidad</th>
                    <th className="px-4 py-3 text-right">Precio venta</th>
                    <th className="px-4 py-3 text-right">Margen</th>
                    <th className="px-4 py-3"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {visibles.map((f) => (
                    <tr key={f.id} className="group transition hover:bg-tinta/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/inventario/fabricacion/${f.id}`} className="block">
                          <span className="font-semibold text-tinta group-hover:text-naranjo">{f.nombre}</span>
                          <span className="block text-xs text-gris">
                            {f.codigo ? <span className="font-mono">{f.codigo}</span> : "sin código"} · rinde {f.rendimiento.toLocaleString("es-CL")}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><ChipEstadoFabricacion estado={f.estado} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-gris">{f.cantidadItems}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gris">{formatearMontoFino(f.resumen.costoLote)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-tinta">{formatearMontoFino(f.resumen.costoUnitario)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gris">{f.precioVenta > 0 ? formatearMontoFino(f.precioVenta) : "—"}</td>
                      <td className="px-4 py-3 text-right"><ChipMargen f={f} /></td>
                      <td className="px-4 py-3 text-right">
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
                      <dt className="text-[11px] text-gris">Costo por unidad</dt>
                      <dd className="font-extrabold tabular-nums text-tinta">{formatearMontoFino(f.resumen.costoUnitario)}</dd>
                    </div>
                    <div className="rounded-lg bg-tinta/[0.03] px-3 py-2">
                      <dt className="text-[11px] text-gris">Precio de venta</dt>
                      <dd className="font-bold tabular-nums text-tinta">{f.precioVenta > 0 ? formatearMontoFino(f.precioVenta) : "—"}</dd>
                    </div>
                  </dl>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-gris">
                    <span>Receta completa: <span className="font-semibold tabular-nums text-tinta">{formatearMontoFino(f.resumen.costoLote)}</span></span>
                    <ChipMargen f={f} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`${TARJETA} px-4 py-3`}>
      <p className="text-xs text-gris">{etiqueta}</p>
      <p className={`text-2xl font-extrabold tabular-nums ${alerta ? "text-amber-600" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}

/** El margen real frente a la meta: en verde si la cumple, en ámbar si queda bajo, gris si no hay precio. */
function ChipMargen({ f }: { f: FabricacionConCosto }) {
  const lectura = lecturaMargen(f.resumen.margenReal, f.margenPct);
  if (lectura === "sin_precio") {
    return <span className="rounded-full bg-tinta/[0.06] px-2 py-0.5 text-[11px] font-semibold text-gris" title="Define un precio de venta para ver el margen real">Sin precio</span>;
  }
  const bajo = lectura === "bajo";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${bajo ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"}`}
      title={`Meta: ${formatearPct(f.margenPct)}`}
    >
      {bajo && <IconAlertTriangle size={12} />}
      {formatearPct(f.resumen.margenReal!)}
    </span>
  );
}

/** La base todavía no tiene las tablas: se dice qué correr en vez de mostrar un error. */
function AvisoSinActivar() {
  return (
    <div className="space-y-4">
      <IntroSeccion Icono={IconTools} tono="bg-naranjo/12 text-naranjo" titulo="Fabricación" bajada="Los productos que fabricamos y lo que cuesta hacer cada uno." />
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
