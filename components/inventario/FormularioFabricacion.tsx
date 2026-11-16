"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { CAMPO } from "@/lib/estilos";
import type { ProductoFabricado } from "@/lib/fabricacion-modelo";
import type { Unidad } from "@/lib/inventario-modelo";
import { actualizarFabricacionAction, crearFabricacionAction } from "@/app/(protegido)/inventario/fabricacion/acciones";

/**
 * Crear o editar un producto fabricado: identidad (nombre, código, unidad) y los parámetros que
 * gobiernan el costo (rendimiento, gastos indirectos, margen y precio). Los ítems de costo se
 * agregan después, en la ficha. Al crear, abre la ficha recién hecha para empezar a cargarlos.
 */
export default function FormularioFabricacion({
  unidades,
  terminados,
  ficha,
}: {
  unidades: Unidad[];
  /** Productos del catálogo que se pueden enlazar como «producto terminado». */
  terminados: { id: string; nombre: string; sku: string | null }[];
  ficha?: ProductoFabricado;
}) {
  const editar = Boolean(ficha);
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    iniciar(async () => {
      const r = ficha ? await actualizarFabricacionAction(ficha.id, fd) : await crearFabricacionAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      if (!ficha && r.id) router.push(`/inventario/fabricacion/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setAbierta(true);
        }}
        className={
          editar
            ? "inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian"
            : "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
        }
      >
        {editar ? <IconPencil size={16} /> : <IconPlus size={16} />}
        {editar ? "Editar" : "Nuevo producto"}
      </button>

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={editar ? "Editar producto fabricado" : "Nuevo producto fabricado"}
        descripcion={editar ? undefined : "Primero lo identificas y defines cuánto rinde; los costos los cargas enseguida en su ficha."}
        completaEnMovil
      >
        <form onSubmit={enviar} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-gris">Producto</legend>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gris">Nombre *</span>
              <input name="nombre" required maxLength={120} defaultValue={ficha?.nombre} className={CAMPO} placeholder="Escalera de aluminio 6 peldaños" autoFocus />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gris">Código</span>
                <input name="codigo" maxLength={40} defaultValue={ficha?.codigo ?? ""} className={`${CAMPO} font-mono uppercase`} placeholder="FAB-001" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gris">Se mide en</span>
                <select name="unidadId" defaultValue={ficha?.unidadId ?? ""} className={CAMPO}>
                  <option value="">Sin unidad</option>
                  {unidades.filter((u) => u.activo).map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviacion})</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gris">Descripción</span>
              <textarea name="descripcion" rows={2} maxLength={600} defaultValue={ficha?.descripcion ?? ""} className={CAMPO} placeholder="Medidas, versión, para qué se usa…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gris">Producto terminado en el catálogo (opcional)</span>
              <select name="productoId" defaultValue={ficha?.productoId ?? ""} className={CAMPO}>
                <option value="">Sin enlazar</option>
                {terminados.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` · ${p.sku}` : ""}</option>)}
              </select>
              <span className="mt-1 block text-xs text-gris-suave">Enlázalo si el producto ya existe en Inventario: así quedan conectados cuando se produzca.</span>
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-gris">Cómo se calcula el costo</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gris">Rinde (unidades por receta) *</span>
                <input name="rendimiento" type="number" required min="0.001" step="any" inputMode="decimal" defaultValue={ficha?.rendimiento ?? 1} className={CAMPO} />
                <span className="mt-1 block text-xs text-gris-suave">Si la receta completa produce 10 piezas, escribe 10: el costo de cada una sale de dividir.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gris">Gastos indirectos (% del costo directo)</span>
                <input name="indirectosPct" type="number" min="0" max="1000" step="any" inputMode="decimal" defaultValue={ficha?.indirectosPct ?? 0} className={CAMPO} />
                <span className="mt-1 block text-xs text-gris-suave">Administración, arriendo, energía general… que no se cargan ítem por ítem.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gris">Margen objetivo (% del precio)</span>
                <input name="margenPct" type="number" min="0" max="99.9" step="any" inputMode="decimal" defaultValue={ficha?.margenPct ?? 0} className={CAMPO} />
                <span className="mt-1 block text-xs text-gris-suave">Con 30 %, el precio sugerido es el costo ÷ 0,70.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gris">Precio de venta actual (c/u)</span>
                <input name="precioVenta" type="number" min="0" step="any" inputMode="decimal" defaultValue={ficha?.precioVenta ?? 0} className={CAMPO} />
                <span className="mt-1 block text-xs text-gris-suave">Déjalo en 0 si todavía no tiene precio.</span>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gris">Notas internas</span>
              <textarea name="notas" rows={2} maxLength={2000} defaultValue={ficha?.notas ?? ""} className={CAMPO} placeholder="Supuestos del cálculo, proveedor de referencia, fecha de la cotización…" />
            </label>
          </fieldset>

          {error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 max-lg:sticky max-lg:bottom-0 max-lg:-mx-5 max-lg:border-t max-lg:border-borde max-lg:bg-superficie max-lg:px-5 max-lg:py-3">
            <button type="button" onClick={() => setAbierta(false)} className="inline-flex min-h-11 items-center rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
              Cancelar
            </button>
            <BotonGuardar pendiente={pendiente}>{editar ? "Guardar cambios" : "Crear y cargar costos"}</BotonGuardar>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}
