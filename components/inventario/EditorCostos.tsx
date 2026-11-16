"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLink, IconLoader2, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { ESTILO_GRUPO, IconoGrupo } from "@/components/inventario/VisualFabricacion";
import { CAMPO, TARJETA } from "@/lib/estilos";
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

/**
 * La receta de costos de la ficha: una sección por tipo de costo (materiales, mano de obra…), cada
 * una con sus ítems, su subtotal y su botón para agregar. En pantalla ancha los ítems van en tabla;
 * en el celular, cada uno es una tarjeta con las mismas cifras (una tabla de siete columnas no cabe).
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

  return (
    <div className="space-y-4">
      {GRUPOS_COSTO.map((g) => (
        <SeccionGrupo
          key={g}
          grupo={g}
          items={porGrupo.get(g) ?? []}
          fabricacionId={fabricacionId}
          editable={editable}
          alAgregar={() => setModal({ grupo: g, item: null })}
          alEditar={(item) => setModal({ grupo: g, item })}
        />
      ))}
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
    </div>
  );
}

function SeccionGrupo({
  grupo,
  items,
  fabricacionId,
  editable,
  alAgregar,
  alEditar,
}: {
  grupo: GrupoCosto;
  items: ItemCosto[];
  fabricacionId: string;
  editable: boolean;
  alAgregar: () => void;
  alEditar: (i: ItemCosto) => void;
}) {
  const subtotal = items.reduce((t, i) => t + subtotalItem(i), 0);
  return (
    <section className={`${TARJETA} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <IconoGrupo grupo={grupo} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-tinta">{ETIQUETA_GRUPO[grupo]}</h3>
          <p className="text-xs text-gris">{AYUDA_GRUPO[grupo]}</p>
        </div>
        {items.length > 0 && (
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gris">Subtotal</p>
            <p className="text-lg font-extrabold tabular-nums text-tinta">{formatearMontoFino(subtotal)}</p>
          </div>
        )}
        {editable && (
          <button
            type="button"
            onClick={alAgregar}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 max-sm:w-full max-sm:justify-center"
          >
            <IconPlus size={16} /> Agregar
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-tinta/[0.03] px-4 py-5 text-center text-sm text-gris">
          Sin {ETIQUETA_GRUPO[grupo].toLowerCase()} todavía.{editable ? ` Usa «Agregar» para cargar el primero.` : ""}
        </p>
      ) : (
        <>
          {/* Tabla: desde tablet hacia arriba */}
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-borde md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde bg-tinta/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-3 py-2.5">Ítem</th>
                  <th className="px-3 py-2.5 text-right">Cantidad</th>
                  <th className="px-3 py-2.5 text-right">Costo unit.</th>
                  <th className="px-3 py-2.5 text-right">Merma</th>
                  <th className="px-3 py-2.5 text-right">Subtotal</th>
                  {editable && <th className="w-24 px-3 py-2.5"><span className="sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {items.map((i) => (
                  <tr key={i.id} className="group transition hover:bg-tinta/[0.02]">
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-tinta">{i.descripcion}</span>
                      {i.productoId && <IconLink size={13} className="ml-1.5 inline text-cian" aria-label="Enlazado al catálogo" />}
                      {i.nota && <span className="block text-xs text-gris">{i.nota}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gris">{formatearCantidad(i.cantidad)} {i.unidad}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gris">{formatearMontoFino(i.costoUnitario)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gris">{i.mermaPct > 0 ? formatearPct(i.mermaPct) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-tinta">{formatearMontoFino(subtotalItem(i))}</td>
                    {editable && (
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          <BotonEditar onClick={() => alEditar(i)} nombre={i.descripcion} />
                          <BotonQuitar fabricacionId={fabricacionId} item={i} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas: celular */}
          <ul className="mt-4 space-y-2 md:hidden">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl border border-borde p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug text-tinta">
                      {i.descripcion}
                      {i.productoId && <IconLink size={13} className="ml-1.5 inline text-cian" aria-label="Enlazado al catálogo" />}
                    </p>
                    {i.nota && <p className="mt-0.5 text-xs text-gris">{i.nota}</p>}
                  </div>
                  <p className="shrink-0 text-base font-extrabold tabular-nums text-tinta">{formatearMontoFino(subtotalItem(i))}</p>
                </div>
                <p className="mt-1.5 text-xs tabular-nums text-gris">
                  {formatearCantidad(i.cantidad)} {i.unidad} × {formatearMontoFino(i.costoUnitario)}
                  {i.mermaPct > 0 ? ` + ${formatearPct(i.mermaPct)} de merma` : ""}
                </p>
                {editable && (
                  <div className="mt-2 flex justify-end gap-1 border-t border-borde pt-2">
                    <BotonEditar onClick={() => alEditar(i)} nombre={i.descripcion} conTexto />
                    <BotonQuitar fabricacionId={fabricacionId} item={i} conTexto />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function BotonEditar({ onClick, nombre, conTexto = false }: { onClick: () => void; nombre: string; conTexto?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Editar ${nombre}`} className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-gris transition hover:bg-tinta/[0.05] hover:text-tinta">
      <IconPencil size={16} /> {conTexto && "Editar"}
    </button>
  );
}

function BotonQuitar({ fabricacionId, item, conTexto = false }: { fabricacionId: string; item: ItemCosto; conTexto?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function quitar() {
    if (!confirm(`¿Quitar «${item.descripcion}» de la receta?`)) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarItemAction(fabricacionId, item.id);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <>
      <button type="button" onClick={quitar} disabled={pendiente} aria-label={`Quitar ${item.descripcion}`} className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-gris transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50">
        {pendiente ? <IconLoader2 size={16} className="animate-spin" /> : <IconTrash size={16} />} {conTexto && "Quitar"}
      </button>
      {error && <span role="alert" className="sr-only">{error}</span>}
    </>
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
    <VentanaModal
      abierta
      alCerrar={alCerrar}
      titulo={item ? "Editar ítem de costo" : `Agregar ${ETIQUETA_GRUPO_SINGULAR[grupo]}`}
      descripcion={AYUDA_GRUPO[grupo]}
      ancho="max-w-xl"
      completaEnMovil
    >
      <form onSubmit={enviar} className="space-y-4">
        <div role="radiogroup" aria-label="Tipo de costo" className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
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
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-[11px] font-semibold leading-tight transition ${on ? "border-naranjo bg-naranjo/[0.07] text-tinta" : "border-borde text-gris hover:border-naranjo/40"}`}
              >
                <span className={`grid h-6 w-6 place-items-center rounded-lg ${tono}`}><Icono size={14} stroke={1.8} /></span>
                {ETIQUETA_GRUPO[g]}
              </button>
            );
          })}
        </div>

        {grupo === "material" && catalogo.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Traer del catálogo de Inventario (opcional)</span>
            <select value={productoId} onChange={(e) => elegirProducto(e.target.value)} className={CAMPO}>
              <option value="">Escribirlo a mano</option>
              {catalogo.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` · ${p.sku}` : ""} — {formatearMontoFino(p.costo)}/{p.unidad}</option>)}
            </select>
            {enlazado && <span className="mt-1 block text-xs text-gris-suave">Enlazado: desde la ficha puedes actualizar este costo cuando cambie en el catálogo.</span>}
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">Qué es *</span>
          <input name="descripcion" required maxLength={160} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CAMPO} placeholder={grupo === "mano_obra" ? "Soldador" : grupo === "maquinaria" ? "Corte plasma" : "Perfil de aluminio 40×40"} autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Cantidad *</span>
            <input name="cantidad" type="number" required min="0" step="any" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={CAMPO} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Unidad</span>
            <input name="unidad" maxLength={16} value={unidad} onChange={(e) => setUnidad(e.target.value)} className={CAMPO} placeholder="kg, hr, un…" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Costo unitario *</span>
            <input name="costoUnitario" type="number" required min="0" step="any" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} className={CAMPO} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Merma %</span>
            <input name="mermaPct" type="number" min="0" max="100" step="any" inputMode="decimal" value={merma} onChange={(e) => setMerma(e.target.value)} className={CAMPO} placeholder="0" />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">Nota (opcional)</span>
          <input name="nota" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} className={CAMPO} placeholder="Proveedor, medida, supuesto…" />
        </label>

        <div className="flex items-center justify-between rounded-xl bg-naranjo/[0.07] px-4 py-3">
          <span className="text-xs font-semibold text-gris">Subtotal de este ítem</span>
          <span className="text-xl font-extrabold tabular-nums text-tinta" aria-live="polite">{formatearMontoFino(subtotal)}</span>
        </div>

        {error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 max-lg:sticky max-lg:bottom-0 max-lg:-mx-5 max-lg:border-t max-lg:border-borde max-lg:bg-superficie max-lg:px-5 max-lg:py-3">
          <button type="button" onClick={alCerrar} className="inline-flex min-h-11 items-center rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
            Cancelar
          </button>
          <BotonGuardar pendiente={pendiente}>{item ? "Guardar cambios" : "Agregar a la receta"}</BotonGuardar>
        </div>
      </form>
    </VentanaModal>
  );
}
