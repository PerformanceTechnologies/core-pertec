import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArchive, IconArrowLeft, IconFileTypePdf, IconLock, IconTools } from "@tabler/icons-react";
import AccionesFabricacion from "@/components/inventario/AccionesFabricacion";
import EditorCostos from "@/components/inventario/EditorCostos";
import FormularioFabricacion from "@/components/inventario/FormularioFabricacion";
import { BarraComposicion, ChipEstadoFabricacion } from "@/components/inventario/VisualFabricacion";
import { IconoTile } from "@/components/contactos/Visual";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { fabricacionDisponible, obtenerFabricacion, productosParaMateriales } from "@/lib/fabricacion";
import { formatearMontoFino, formatearPct } from "@/lib/fabricacion-modelo";
import { puedeArchivar } from "@/lib/inventario-archivado";
import { listarUnidades } from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function FichaFabricacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await exigirAccesoApp("inventario");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await fabricacionDisponible())) notFound();

  const datos = await obtenerFabricacion(id);
  if (!datos) notFound();
  const { ficha, items } = datos;
  const [unidades, catalogo, puedeAdministrar] = await Promise.all([listarUnidades(), productosParaMateriales(), puedeArchivar(usuario)]);

  const r = ficha.resumen;
  const archivada = ficha.estado === "archivado";
  const abrev = unidades.find((u) => u.id === ficha.unidadId)?.abreviacion ?? "";

  return (
    <div className="space-y-5">
      <Link href="/inventario/fabricacion" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a Fabricación
      </Link>

      {archivada && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-tinta">
          <IconArchive size={20} className="shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1">
            <span className="font-bold text-amber-700">Este producto está archivado.</span> Se ve completo pero no se puede modificar.
            {!puedeAdministrar && " Solo un administrador puede restaurarlo."}
          </p>
        </div>
      )}

      {/* Cabecera: qué es, su estado y las acciones, en poco alto */}
      <section className={`${TARJETA} px-4 py-3.5`}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h2 className="text-xl font-extrabold leading-tight tracking-tight text-tinta">{ficha.nombre}</h2>
              <ChipEstadoFabricacion estado={ficha.estado} />
            </div>
            <p className="mt-0.5 text-[13px] text-gris">
              {ficha.codigo ? <>Código <span className="font-mono text-tinta">{ficha.codigo}</span></> : "Sin código"}
              {abrev && <> · Se mide en <span className="font-semibold text-tinta">{abrev}</span></>}
            </p>
          </div>
          {!archivada && <FormularioFabricacion unidades={unidades} ficha={ficha} />}
        </div>
        {ficha.descripcion && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-gris">{ficha.descripcion}</p>}
        <div className="mt-3 border-t border-borde pt-3">
          <AccionesFabricacion id={ficha.id} nombre={ficha.nombre} estado={ficha.estado} hayEnlazados={items.some((i) => i.productoId)} puedeAdministrar={puedeAdministrar} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <EditorCostos fabricacionId={ficha.id} items={items} catalogo={catalogo} editable={!archivada} />

        {/* El resultado: el costo (lo que se muestra afuera) y, aparte, lo interno. En el celular va primero. */}
        <aside className="order-first space-y-4 lg:sticky lg:top-4 lg:order-last">
          <section className={`${TARJETA} p-5`}>
            <div className="flex items-center gap-2.5">
              <IconoTile Icono={IconTools} tono="marca" tamano="chico" />
              <h3 className="text-sm font-bold text-tinta">Costo de fabricación</h3>
            </div>
            <p className="mt-3 text-3xl font-extrabold tabular-nums leading-none text-tinta">{formatearMontoFino(r.costo)}</p>
            <p className="mt-1 text-xs text-gris">{abrev ? `Por cada ${abrev}` : "Por unidad"} · {items.length} {items.length === 1 ? "ítem" : "ítems"}</p>
            {items.length > 0 ? (
              <div className="mt-4"><BarraComposicion porGrupo={r.porGrupo} /></div>
            ) : (
              <p className="mt-3 text-xs text-gris">Carga los ítems de costo para ver el total.</p>
            )}
            {items.length > 0 && (
              <a
                href={`/api/inventario/fabricacion/${ficha.id}/pdf`}
                target="_blank"
                rel="noopener"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
              >
                <IconFileTypePdf size={17} /> PDF para proveedor
              </a>
            )}
            {items.length > 0 && <p className="mt-1.5 text-center text-[11px] text-gris-suave">Una hoja con el costo. No incluye el margen.</p>}
          </section>

          <section className="rounded-xl border border-dashed border-borde bg-tinta/[0.02] p-5">
            <div className="flex items-center gap-2">
              <IconLock size={14} className="text-gris" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gris">Interno</h3>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gris">Margen que cobramos</dt>
                <dd className="font-semibold tabular-nums text-tinta">{formatearPct(ficha.margenPct)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gris">Precio con margen</dt>
                <dd className="text-lg font-extrabold tabular-nums text-tinta">{r.precioConMargen === null ? "—" : formatearMontoFino(r.precioConMargen)}</dd>
              </div>
              {r.utilidad !== null && ficha.margenPct > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gris">Utilidad</dt>
                  <dd className="font-semibold tabular-nums text-tinta">{formatearMontoFino(r.utilidad)}</dd>
                </div>
              )}
            </dl>
            {ficha.notas && (
              <div className="mt-3 border-t border-borde pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gris">Notas</p>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-gris">{ficha.notas}</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
