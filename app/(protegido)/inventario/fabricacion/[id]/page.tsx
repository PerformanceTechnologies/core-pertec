import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconAlertTriangle,
  IconArchive,
  IconArrowLeft,
  IconCalculator,
  IconCoins,
  IconPackages,
  IconTag,
  IconTools,
  type Icon,
} from "@tabler/icons-react";
import AccionesFabricacion from "@/components/inventario/AccionesFabricacion";
import EditorCostos from "@/components/inventario/EditorCostos";
import FormularioFabricacion from "@/components/inventario/FormularioFabricacion";
import { BarraComposicion, ChipEstadoFabricacion } from "@/components/inventario/VisualFabricacion";
import { IconoTile } from "@/components/contactos/Visual";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { fabricacionDisponible, obtenerFabricacion, productosParaMateriales, productosTerminadosDisponibles } from "@/lib/fabricacion";
import { formatearMontoFino, formatearPct, lecturaMargen } from "@/lib/fabricacion-modelo";
import { puedeArchivar } from "@/lib/inventario-archivado";
import { listarUnidades } from "@/lib/inventario";
import { formatearCantidad } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function FichaFabricacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await exigirAccesoApp("inventario");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await fabricacionDisponible())) notFound();

  const datos = await obtenerFabricacion(id);
  if (!datos) notFound();
  const { ficha, items } = datos;
  const [unidades, catalogo, terminados, puedeAdministrar] = await Promise.all([
    listarUnidades(),
    productosParaMateriales(),
    productosTerminadosDisponibles(ficha.productoId),
    puedeArchivar(usuario),
  ]);

  const r = ficha.resumen;
  const archivada = ficha.estado === "archivado";
  const abrev = unidades.find((u) => u.id === ficha.unidadId)?.abreviacion ?? "";
  const unidadTexto = abrev ? ` ${abrev}` : "";
  const lectura = lecturaMargen(r.margenReal, ficha.margenPct);
  const enlazadoCatalogo = ficha.productoId ? terminados.find((t) => t.id === ficha.productoId) : null;

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

      {/* Cabecera: qué es, su estado y las acciones */}
      <section className={`${TARJETA} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold tracking-tight text-tinta">{ficha.nombre}</h2>
            <p className="mt-1 text-sm text-gris">
              {ficha.codigo ? <>Código <span className="font-mono text-tinta">{ficha.codigo}</span></> : "Sin código"}
              {" · "}rinde <span className="font-semibold text-tinta">{formatearCantidad(ficha.rendimiento)}{unidadTexto}</span> por receta
            </p>
          </div>
          {!archivada && <FormularioFabricacion unidades={unidades} terminados={terminados} ficha={ficha} />}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ChipEstadoFabricacion estado={ficha.estado} />
          {enlazadoCatalogo && (
            <Link href={`/inventario/productos/${enlazadoCatalogo.id}`} className="rounded-full bg-cian/10 px-2.5 py-0.5 text-[11px] font-semibold text-cian transition hover:bg-cian/20">
              En el catálogo: {enlazadoCatalogo.nombre}
            </Link>
          )}
        </div>
        {ficha.descripcion && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gris">{ficha.descripcion}</p>}
        <div className="mt-4 border-t border-borde pt-4">
          <AccionesFabricacion id={ficha.id} nombre={ficha.nombre} estado={ficha.estado} hayEnlazados={items.some((i) => i.productoId)} puedeAdministrar={puedeAdministrar} />
        </div>
      </section>

      {/* Las cifras que importan */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Dato Icono={IconCalculator} etiqueta="Costo directo" valor={formatearMontoFino(r.costoDirecto)} />
        <Dato Icono={IconPackages} etiqueta="Costo de la receta" valor={formatearMontoFino(r.costoLote)} />
        <Dato Icono={IconCoins} etiqueta={`Costo por unidad${abrev ? ` (${abrev})` : ""}`} valor={formatearMontoFino(r.costoUnitario)} destacado />
        <Dato
          Icono={IconTag}
          etiqueta={ficha.precioVenta > 0 ? "Margen real" : "Precio sugerido"}
          valor={ficha.precioVenta > 0 ? formatearPct(r.margenReal ?? 0) : r.precioSugerido === null ? "—" : formatearMontoFino(r.precioSugerido)}
          alerta={lectura === "bajo"}
        />
      </div>

      {items.length > 0 && (
        <section className={`${TARJETA} p-4 sm:p-5`}>
          <h3 className="mb-3 text-sm font-bold text-tinta">¿De qué está hecho el costo?</h3>
          <BarraComposicion porGrupo={r.porGrupo} />
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <EditorCostos fabricacionId={ficha.id} items={items} catalogo={catalogo} editable={!archivada} />

        {/* Cómo se llega al costo y al precio: el mismo cálculo, paso a paso. En el celular va primero. */}
        <aside className="order-first space-y-4 lg:sticky lg:top-4 lg:order-last">
          <section className={`${TARJETA} p-5`}>
            <div className="mb-3 flex items-center gap-3">
              <IconoTile Icono={IconTools} tono="marca" />
              <h3 className="text-base font-bold text-tinta">Del costo al precio</h3>
            </div>
            <dl className="space-y-1 text-sm">
              <Fila etiqueta="Costo directo" valor={formatearMontoFino(r.costoDirecto)} />
              <Fila etiqueta={`+ Gastos indirectos (${formatearPct(ficha.indirectosPct)})`} valor={formatearMontoFino(r.indirectos)} />
              <Fila etiqueta="= Costo de la receta" valor={formatearMontoFino(r.costoLote)} fuerte />
              <Fila etiqueta={`÷ Rinde ${formatearCantidad(ficha.rendimiento)}${unidadTexto}`} valor="" />
              <Fila etiqueta="= Costo por unidad" valor={formatearMontoFino(r.costoUnitario)} fuerte destacado />
              <div className="my-2 border-t border-borde" />
              <Fila etiqueta={`Precio sugerido (margen ${formatearPct(ficha.margenPct)})`} valor={r.precioSugerido === null ? "—" : formatearMontoFino(r.precioSugerido)} />
              <Fila etiqueta="Precio de venta actual" valor={ficha.precioVenta > 0 ? formatearMontoFino(ficha.precioVenta) : "Sin definir"} />
              {r.utilidadUnitaria !== null && (
                <>
                  <Fila etiqueta="Utilidad por unidad" valor={formatearMontoFino(r.utilidadUnitaria)} alerta={r.utilidadUnitaria < 0} />
                  <Fila etiqueta="Margen sobre el precio" valor={formatearPct(r.margenReal ?? 0)} alerta={lectura === "bajo"} />
                  <Fila etiqueta="Recargo sobre el costo" valor={r.recargoReal === null ? "—" : formatearPct(r.recargoReal)} />
                </>
              )}
            </dl>
            {lectura === "bajo" && (
              <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
                El margen real queda bajo la meta de {formatearPct(ficha.margenPct)}.
                {r.precioSugerido !== null && ` Para cumplirla, el precio tendría que ser ${formatearMontoFino(r.precioSugerido)}.`}
              </p>
            )}
            {items.length === 0 && <p className="mt-3 text-xs text-gris">Carga los ítems de costo para ver los números.</p>}
          </section>

          {ficha.notas && (
            <section className={`${TARJETA} p-5`}>
              <h3 className="mb-1.5 text-sm font-bold text-tinta">Notas</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-gris">{ficha.notas}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Dato({ Icono, etiqueta, valor, destacado = false, alerta = false }: { Icono: Icon; etiqueta: string; valor: string; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${destacado ? "bg-naranjo/[0.07]" : alerta ? "bg-amber-500/10" : "bg-tinta/[0.03]"}`}>
      <span className="flex items-center gap-1.5 text-xs text-gris">
        <Icono size={14} stroke={1.8} className={destacado ? "text-naranjo" : alerta ? "text-amber-600" : "text-gris-suave"} />
        {etiqueta}
      </span>
      <p className={`mt-0.5 text-lg font-extrabold tabular-nums ${alerta ? "text-amber-700" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}

function Fila({ etiqueta, valor, fuerte = false, destacado = false, alerta = false }: { etiqueta: string; valor: string; fuerte?: boolean; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 ${destacado ? "bg-naranjo/[0.07]" : ""}`}>
      <dt className={`min-w-0 ${fuerte ? "font-semibold text-tinta" : "text-gris"}`}>{etiqueta}</dt>
      <dd className={`shrink-0 tabular-nums ${fuerte ? "font-extrabold text-tinta" : "font-semibold text-tinta"} ${alerta ? "!text-amber-700" : ""}`}>{valor}</dd>
    </div>
  );
}
