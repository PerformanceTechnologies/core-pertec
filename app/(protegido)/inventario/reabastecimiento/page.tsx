import Link from "next/link";
import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { reporteReabastecimiento } from "@/lib/inventario";
import { formatearCantidad } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ReabastecimientoPage() {
  const filas = await reporteReabastecimiento();

  if (filas.length === 0) {
    return (
      <div className={`${TARJETA} flex flex-col items-center gap-2 p-10 text-center`}>
        <IconCircleCheck size={32} className="text-emerald-500" />
        <p className="text-sm font-semibold text-tinta">Todo con stock suficiente</p>
        <p className="text-sm text-gris">Ningún producto está bajo su mínimo. Define reglas mín/máx en cada ficha de producto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-amber-700">
        <IconAlertTriangle size={18} /> {filas.length} {filas.length === 1 ? "producto necesita" : "productos necesitan"} reposición.
      </p>
      <div className={`${TARJETA} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-xs font-semibold uppercase tracking-wide text-gris">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3 text-right">Disponible</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Máximo</th>
                <th className="px-4 py-3 text-right">Reponer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f) => (
                <tr key={`${f.producto.id}-${f.ubicacion.id}`} className="transition hover:bg-borde/30">
                  <td className="px-4 py-3">
                    <Link href={`/inventario/productos/${f.producto.id}`} className="font-semibold text-tinta hover:text-cian">{f.producto.nombre}</Link>
                  </td>
                  <td className="px-4 py-3 text-gris">{f.ubicacion.nombre}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-600">{formatearCantidad(f.disponible)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gris">{formatearCantidad(f.minimo)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gris">{formatearCantidad(f.maximo)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-tinta">{formatearCantidad(f.sugerido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
