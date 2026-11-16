"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLink, IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { ESTILO_GRUPO } from "@/components/inventario/VisualFabricacion";
import { TARJETA } from "@/lib/estilos";
import {
  AYUDA_GRUPO,
  ETIQUETA_GRUPO,
  ETIQUETA_GRUPO_SINGULAR,
  GRUPOS_COSTO,
  UNIDAD_SUGERIDA,
  formatearMontoFino,
  formatearPct,
  subtotalItem,
  type GrupoCosto,
  type ItemCosto,
} from "@/lib/fabricacion-modelo";
import { formatearCantidad } from "@/lib/inventario-modelo";
import type { ProductoDeCatalogo } from "@/lib/fabricacion";
import { eliminarItemAction, guardarItemAction } from "@/app/(protegido)/inventario/fabricacion/acciones";

// Campo compacto del editor: 36 px en vez de los 44 del resto del Core. Dentro de una hoja de carga
// con muchas filas, el alto de siempre hace que cada ítem ocupe media pantalla.
const CAMPO_COMPACTO =
  "h-9 w-full rounded-lg border border-borde bg-superficie px-2.5 text-[13px] text-tinta placeholder:text-gris-suave focus:border-cian focus:outline-none focus:ring-2 focus:ring-cian/30";
const ETIQUETA = "mb-1 block text-[11px] font-semibold text-gris";

/**
 * La receta de costos de la ficha: UN listado con todos los ítems (el tipo va como columna/ícono) y el
 * costo directo al pie. «Agregar ítem» abre un popup donde se elige el tipo y se cargan los datos; tocar
 * una fila lo abre para editar. En pantalla ancha es una tabla; en el celular, dos líneas por ítem.
 */
export default function EditorCostos({
  fabricacionId,
  items,
  catalogo,
  editable,
}: {
  fabricacionId: string;
  items: ItemCosto[];
  catalogo: ProductoDeCatalogo[];
  /** Falso en una ficha archivada: se ve completa pero no se modifica. */
  editable: boolean;
}) {
  const [modal, setModal] = useState<{ grupo: GrupoCosto; item: ItemCosto | null } | null>(null);
  const porGrupo = useMemo(() => {
    const m = new Map<GrupoCosto, ItemCosto[]>();
    for (const g of GRUPOS_COSTO) m.set(g, []);
    for (const i of items) m.get(i.grupo)?.push(i);
    return m;
  }, [items]);
  const total = items.reduce((t, i) => t + subtotalItem(i), 0);

  // Un solo listado: se ordena por tipo (el orden de GRUPOS_COSTO) y, dentro del tipo, como se cargaron.
  const ordenados = GRUPOS_COSTO.flatMap((g) => porGrupo.get(g) ?? []);

  return (
    <section className={`${TARJETA} overflow-hidden`}>
      <div className="flex items-center gap-3 border-b border-borde px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-tinta">Costos de la receta</h3>
          <p className="text-xs text-gris">
            {items.length === 0 ? "Aún sin ítems" : `${items.length} ${items.length === 1 ? "ítem" : "ítems"} · costo directo ${formatearMontoFino(total)}`}
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setModal({ grupo: "material", item: null })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-naranjo px-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
          >
            <IconPlus size={15} /> Agregar ítem
          </button>
        )}
      </div>

      {ordenados.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gris">
          {editable ? "Todavía no hay costos. Usa «Agregar ítem» para cargar materiales, mano de obra, maquinaria, servicios u otros costos." : "Esta ficha no tiene ítems de costo."}
        </p>
      ) : (
        <>
          {/* Tabla: tablet y escritorio */}
          <table className="hidden w-full text-[13px] md:table">
            <thead>
              <tr className="border-b border-borde bg-tinta/[0.02] text-left text-[10px] font-semibold uppercase tracking-wide text-gris">
                <th className="px-4 py-2 font-semibold">Ítem</th>
                <th className="px-2 py-2 text-right font-semibold">Cantidad</th>
                <th className="px-2 py-2 text-right font-semibold">Costo unit.</th>
                <th className="px-2 py-2 text-right font-semibold">Merma</th>
                <th className="px-2 py-2 text-right font-semibold">Subtotal</th>
                <th className="w-12 py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((i) => {
                const { Icono, tono } = ESTILO_GRUPO[i.grupo];
                return (
                  <tr
                    key={i.id}
                    onClick={editable ? () => setModal({ grupo: i.grupo, item: i }) : undefined}
                    className={`group border-t border-borde/60 transition ${editable ? "cursor-pointer hover:bg-tinta/[0.03]" : ""}`}
                  >
                    <td className="max-w-0 px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-semibold text-tinta" title={i.nota ? `${i.descripcion} — ${i.nota}` : i.descripcion}>{i.descripcion}</span>
                        {i.productoId && <IconLink size={12} className="shrink-0 text-cian" aria-label="Enlazado al catálogo" />}
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${tono}`}>
                          <Icono size={11} stroke={2} /> {ETIQUETA_GRUPO_SINGULAR[i.grupo]}
                        </span>
                      </span>
                      {i.nota && <span className="block truncate text-[11px] text-gris">{i.nota}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gris">{formatearCantidad(i.cantidad)} {i.unidad}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gris">{formatearMontoFino(i.costoUnitario)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gris">{i.mermaPct > 0 ? formatearPct(i.mermaPct) : "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums text-tinta">{formatearMontoFino(subtotalItem(i))}</td>
                    <td className="px-2 py-0.5 text-right">{editable && <BotonQuitar fabricacionId={fabricacionId} item={i} />}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-borde bg-tinta/[0.02]">
                <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gris">Costo directo</td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right text-sm font-extrabold tabular-nums text-tinta">{formatearMontoFino(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          {/* Dos líneas por ítem: celular */}
          <ul className="md:hidden">
            {ordenados.map((i) => {
              const { Icono, tono } = ESTILO_GRUPO[i.grupo];
              return (
                <li key={i.id} className="flex items-stretch border-t border-borde/60 first:border-t-0">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setModal({ grupo: i.grupo, item: i })}
                    className="flex min-w-0 flex-1 items-start gap-2.5 px-4 py-2.5 text-left transition active:bg-tinta/[0.04] disabled:cursor-default"
                  >
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${tono}`} title={ETIQUETA_GRUPO_SINGULAR[i.grupo]}><Icono size={14} stroke={1.8} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-tinta">
                          {i.descripcion}
                          {i.productoId && <IconLink size={12} className="ml-1.5 inline text-cian" aria-label="Enlazado al catálogo" />}
                        </span>
                        <span className="shrink-0 text-[13px] font-bold tabular-nums text-tinta">{formatearMontoFino(subtotalItem(i))}</span>
                      </span>
                      <span className="block truncate text-[11px] tabular-nums text-gris">
                        {formatearCantidad(i.cantidad)} {i.unidad} × {formatearMontoFino(i.costoUnitario)}
                        {i.mermaPct > 0 ? ` · merma ${formatearPct(i.mermaPct)}` : ""}
                        {i.nota ? ` · ${i.nota}` : ""}
                      </span>
                    </span>
                  </button>
                  {editable && (
                    <div className="grid shrink-0 place-items-center pr-2">
                      <BotonQuitar fabricacionId={fabricacionId} item={i} />
                    </div>
                  )}
                </li>
              );
            })}
            <li className="flex items-center justify-between border-t border-borde bg-tinta/[0.02] px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gris">Costo directo</span>
              <span className="text-sm font-extrabold tabular-nums text-tinta">{formatearMontoFino(total)}</span>
            </li>
          </ul>
        </>
      )}

      {modal && (
        <FormularioItem
          key={modal.item?.id ?? `nuevo-${modal.grupo}`}
          fabricacionId={fabricacionId}
          grupoInicial={modal.grupo}
          item={modal.item}
          catalogo={catalogo}
          alCerrar={() => setModal(null)}
        />
      )}
    </section>
  );
}

function BotonQuitar({ fabricacionId, item }: { fabricacionId: string; item: ItemCosto }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function quitar(e: React.MouseEvent) {
    e.stopPropagation(); // la fila entera abre la edición: quitar no tiene que abrirla
    if (!confirm(`¿Quitar «${item.descripcion}» de la receta?`)) return;
    iniciar(async () => {
      const r = await eliminarItemAction(fabricacionId, item.id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  return (
    <button type="button" onClick={quitar} disabled={pendiente} aria-label={`Quitar ${item.descripcion}`} title="Quitar" className="grid h-8 w-8 place-items-center rounded-lg text-gris-suave transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50">
      {pendiente ? <IconLoader2 size={15} className="animate-spin" /> : <IconTrash size={15} />}
    </button>
  );
}

/** Agregar o editar un ítem. Muestra el subtotal en vivo, con la misma fórmula que usa el servidor. */
function FormularioItem({
  fabricacionId,
  grupoInicial,
  item,
  catalogo,
  alCerrar,
}: {
  fabricacionId: string;
  grupoInicial: GrupoCosto;
  item: ItemCosto | null;
  catalogo: ProductoDeCatalogo[];
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<GrupoCosto>(item?.grupo ?? grupoInicial);
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [productoId, setProductoId] = useState(item?.productoId ?? "");
  const [unidad, setUnidad] = useState(item?.unidad ?? UNIDAD_SUGERIDA[grupoInicial]);
  const [cantidad, setCantidad] = useState(item ? String(item.cantidad) : "");
  const [costo, setCosto] = useState(item ? String(item.costoUnitario) : "");
  const [merma, setMerma] = useState(item && item.mermaPct > 0 ? String(item.mermaPct) : "");
  const [nota, setNota] = useState(item?.nota ?? "");

  const subtotal = subtotalItem({ cantidad: Number(cantidad), costoUnitario: Number(costo), mermaPct: Number(merma) });
  const enlazado = catalogo.find((p) => p.id === productoId);

  function elegirProducto(id: string) {
    setProductoId(id);
    const p = catalogo.find((x) => x.id === id);
    if (!p) return;
    setDescripcion((d) => d.trim() || p.nombre);
    setUnidad(p.unidad);
    setCosto(String(p.costo));
  }

  function cambiarGrupo(g: GrupoCosto) {
    // La unidad sugerida sigue al grupo mientras nadie la haya tocado a mano.
    if (unidad === UNIDAD_SUGERIDA[grupo]) setUnidad(UNIDAD_SUGERIDA[g]);
    if (g !== "material") setProductoId("");
    setGrupo(g);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("grupo", grupo);
    fd.set("productoId", grupo === "material" ? productoId : "");
    setError(null);
    iniciar(async () => {
      const r = await guardarItemAction(fabricacionId, item?.id ?? null, fd);
      if (!r.ok) return setError(r.error);
      router.refresh();
      alCerrar();
    });
  }

  return (
    <VentanaModal abierta alCerrar={alCerrar} titulo={item ? "Editar ítem" : "Agregar ítem de costo"} ancho="max-w-lg" completaEnMovil>
      <form onSubmit={enviar} className="space-y-3.5">
        {/* Tipo: una sola fila de pastillas, sin cajas altas */}
        <div role="radiogroup" aria-label="Tipo de costo" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {GRUPOS_COSTO.map((g) => {
            const { Icono, tono } = ESTILO_GRUPO[g];
            const on = g === grupo;
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => cambiarGrupo(g)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${on ? "border-naranjo bg-naranjo/[0.08] text-tinta" : "border-borde text-gris hover:border-naranjo/40"}`}
              >
                <span className={`grid h-5 w-5 place-items-center rounded ${tono}`}><Icono size={12} stroke={1.9} /></span>
                {ETIQUETA_GRUPO[g]}
              </button>
            );
          })}
        </div>
        <p className="-mt-1.5 text-[11px] text-gris">{AYUDA_GRUPO[grupo]}</p>

        {grupo === "material" && catalogo.length > 0 && (
          <label className="block">
            <span className={ETIQUETA}>Traer del catálogo (opcional)</span>
            <select value={productoId} onChange={(e) => elegirProducto(e.target.value)} className={CAMPO_COMPACTO}>
              <option value="">Escribirlo a mano</option>
              {catalogo.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` · ${p.sku}` : ""} — {formatearMontoFino(p.costo)}/{p.unidad}</option>)}
            </select>
            {enlazado && <span className="mt-1 block text-[11px] text-gris-suave">Enlazado: puedes actualizar este costo desde la ficha cuando cambie en el catálogo.</span>}
          </label>
        )}

        <label className="block">
          <span className={ETIQUETA}>Qué es *</span>
          <input name="descripcion" required maxLength={160} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CAMPO_COMPACTO} placeholder={grupo === "mano_obra" ? "Soldador" : grupo === "maquinaria" ? "Corte plasma" : "Perfil de aluminio 40×40"} autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <label className="block">
            <span className={ETIQUETA}>Cantidad *</span>
            <input name="cantidad" type="number" required min="0" step="any" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={CAMPO_COMPACTO} />
          </label>
          <label className="block">
            <span className={ETIQUETA}>Unidad</span>
            <input name="unidad" maxLength={16} value={unidad} onChange={(e) => setUnidad(e.target.value)} className={CAMPO_COMPACTO} placeholder="kg, hr, un" />
          </label>
          <label className="block">
            <span className={ETIQUETA}>Costo unit. *</span>
            <input name="costoUnitario" type="number" required min="0" step="any" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} className={CAMPO_COMPACTO} />
          </label>
          <label className="block">
            <span className={ETIQUETA}>Merma %</span>
            <input name="mermaPct" type="number" min="0" max="100" step="any" inputMode="decimal" value={merma} onChange={(e) => setMerma(e.target.value)} className={CAMPO_COMPACTO} placeholder="0" />
          </label>
        </div>

        <label className="block">
          <span className={ETIQUETA}>Nota (opcional)</span>
          <input name="nota" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} className={CAMPO_COMPACTO} placeholder="Proveedor, medida, supuesto…" />
        </label>

        {error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{error}</p>}

        {/* Pie: subtotal a la izquierda, botones a la derecha; fijo abajo en el celular */}
        <div className="flex items-center gap-2 border-t border-borde pt-3 max-lg:sticky max-lg:bottom-0 max-lg:-mx-5 max-lg:bg-superficie max-lg:px-5 max-lg:pb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gris">Subtotal</p>
            <p className="truncate text-lg font-extrabold leading-tight tabular-nums text-tinta" aria-live="polite">{formatearMontoFino(subtotal)}</p>
          </div>
          <button type="button" onClick={alCerrar} className="inline-flex h-10 items-center rounded-lg border border-borde px-3.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
            Cancelar
          </button>
          <BotonGuardar pendiente={pendiente}>{item ? "Guardar" : "Agregar"}</BotonGuardar>
        </div>
      </form>
    </VentanaModal>
  );
}
