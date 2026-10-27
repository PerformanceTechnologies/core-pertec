"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { eliminarReglaAction, guardarReglaAction } from "@/app/(protegido)/inventario/acciones";
import { formatearCantidad, type Regla, type Ubicacion } from "@/lib/inventario-modelo";

export default function FormularioRegla({
  productoId,
  ubicaciones,
  reglas,
}: {
  productoId: string;
  ubicaciones: Ubicacion[];
  reglas: Regla[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const internas = ubicaciones.filter((u) => u.tipo === "interna");
  const nombreUbi = new Map(ubicaciones.map((u) => [u.id, u.nombre]));

  function guardar(fd: FormData) {
    setError(null);
    fd.set("productoId", productoId);
    iniciar(async () => {
      const r = await guardarReglaAction(fd);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  function eliminar(id: string) {
    iniciar(async () => {
      await eliminarReglaAction(id, productoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {reglas.length > 0 && (
        <ul className="divide-y divide-borde rounded-lg border border-borde">
          {reglas.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 truncate text-tinta">{nombreUbi.get(r.ubicacionId) ?? "—"}</span>
              <span className="tabular-nums text-gris">mín {formatearCantidad(r.minimo)} · máx {formatearCantidad(r.maximo)}</span>
              <button onClick={() => eliminar(r.id)} disabled={pendiente} className="text-gris-suave transition hover:text-rose-500" title="Eliminar regla">
                <IconTrash size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={guardar} className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-xs font-semibold text-gris">Ubicación</span>
          <select name="ubicacionId" required className={CAMPO}>
            {internas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <label className="w-24">
          <span className="mb-1 block text-xs font-semibold text-gris">Mínimo</span>
          <input name="minimo" type="number" min="0" step="1" defaultValue={0} className={CAMPO} />
        </label>
        <label className="w-24">
          <span className="mb-1 block text-xs font-semibold text-gris">Máximo</span>
          <input name="maximo" type="number" min="0" step="1" defaultValue={0} className={CAMPO} />
        </label>
        <button type="submit" disabled={pendiente} className="min-h-11 rounded-lg border border-borde px-3 text-sm font-semibold text-azul transition hover:border-cian disabled:opacity-60">
          Guardar
        </button>
      </form>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
