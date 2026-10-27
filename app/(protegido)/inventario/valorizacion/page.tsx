import Link from "next/link";
import { valorizacion } from "@/lib/inventario";
import { formatearCantidad, formatearMonto } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ValorizacionPage() {
  const { filas, total } = await valorizacion();

  return (
    <div className="space-y-4">
      <div className={`${TARJETA} flex items-center justify-between p-4`}>
        <span className="text-sm font-semibold uppercase tracking-wide text-gris">Valor total del inventario</span>
        <span className="text-2xl font-extrabold tabular-nums text-tinta">{formatearMonto(total)}</span>
      </div>
      <p className="text-xs text-gris-suave">Valorización a costo estándar (cantidad a mano × costo unitario del producto).</p>

      {filas.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}><p className="text-sm text-gris">No hay productos almacenables con stock.</p></div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">A mano</th>
                  <th className="px-4 py-3 text-right">Costo unit.</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.map((f) => (
                  <tr key={f.producto.id} className="transition hover:bg-borde/30">
                    <td className="px-4 py-3">
                      <Link href={`/inventario/productos/${f.producto.id}`} className="font-semibold text-tinta hover:text-cian">{f.producto.nombre}</Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gris">{formatearCantidad(f.aMano)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gris">{formatearMonto(f.costo)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-tinta">{formatearMonto(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
