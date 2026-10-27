"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconPencil } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { CAMPO } from "@/lib/estilos";
import {
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  type Categoria,
  type Producto,
  type Seguimiento,
  type TipoProducto,
  type Unidad,
} from "@/lib/inventario-modelo";
import { actualizarProductoAction, crearProductoAction } from "@/app/(protegido)/inventario/acciones";

export default function FormularioProducto({
  categorias,
  unidades,
  producto,
}: {
  categorias: Categoria[];
  unidades: Unidad[];
  producto?: Producto;
}) {
  const editar = Boolean(producto);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = editar ? await actualizarProductoAction(producto!.id, fd) : await crearProductoAction(fd);
      if (r.ok) {
        setAbierta(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setAbierta(true)}
        className={
          editar
            ? "inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian"
            : "inline-flex items-center gap-1.5 rounded-lg bg-azul px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave"
        }
      >
        {editar ? <IconPencil size={16} /> : <IconPlus size={16} />}
        {editar ? "Editar" : "Nuevo producto"}
      </button>

      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo={editar ? "Editar producto" : "Nuevo producto"}>
        <form action={enviar} className="space-y-4">
          <Campo etiqueta="Nombre" obligatorio>
            <input name="nombre" required defaultValue={producto?.nombre} className={CAMPO} placeholder="Casco de seguridad" />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="SKU / código">
              <input name="sku" defaultValue={producto?.sku ?? ""} className={CAMPO} placeholder="EPP-001" />
            </Campo>
            <Campo etiqueta="Unidad de medida">
              <select name="unidadId" defaultValue={producto?.unidadId ?? ""} className={CAMPO}>
                <option value="">— Sin unidad —</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre} ({u.abreviacion})</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Tipo">
              <select name="tipo" defaultValue={producto?.tipo ?? "almacenable"} className={CAMPO}>
                {(Object.keys(ETIQUETA_TIPO_PRODUCTO) as TipoProducto[]).map((t) => (
                  <option key={t} value={t}>{ETIQUETA_TIPO_PRODUCTO[t]}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Seguimiento">
              <select name="seguimiento" defaultValue={producto?.seguimiento ?? "ninguno"} className={CAMPO}>
                {(Object.keys(ETIQUETA_SEGUIMIENTO) as Seguimiento[]).map((s) => (
                  <option key={s} value={s}>{ETIQUETA_SEGUIMIENTO[s]}</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Categoría">
              <select name="categoriaId" defaultValue={producto?.categoriaId ?? ""} className={CAMPO}>
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Costo ($)">
                <input name="costo" type="number" min="0" step="1" defaultValue={producto?.costo ?? 0} className={CAMPO} />
              </Campo>
              <Campo etiqueta="Precio ($)">
                <input name="precio" type="number" min="0" step="1" defaultValue={producto?.precio ?? 0} className={CAMPO} />
              </Campo>
            </div>
          </div>

          <Campo etiqueta="Descripción">
            <textarea name="descripcion" rows={2} defaultValue={producto?.descripcion ?? ""} className={CAMPO} />
          </Campo>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
              Cancelar
            </button>
            <BotonGuardar pendiente={pendiente}>{editar ? "Guardar cambios" : "Crear producto"}</BotonGuardar>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

function Campo({ etiqueta, obligatorio, children }: { etiqueta: string; obligatorio?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gris">
        {etiqueta} {obligatorio && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
