import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import FormularioProducto from "@/components/inventario/FormularioProducto";
import { listarCategorias, listarProductosConStock, listarUnidades } from "@/lib/inventario";
import { ETIQUETA_SEGUIMIENTO, ETIQUETA_TIPO_PRODUCTO, formatearCantidad, formatearMonto } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const [productos, categorias, unidades] = await Promise.all([
    listarProductosConStock(),
    listarCategorias(),
    listarUnidades(),
  ]);
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]));
  const abrevUni = new Map(unidades.map((u) => [u.id, u.abreviacion]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gris">{productos.length} {productos.length === 1 ? "producto" : "productos"}</p>
        <FormularioProducto categorias={categorias} unidades={unidades} />
      </div>

      {productos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <p className="text-sm text-gris">Todavía no hay productos. Crea el primero con «Nuevo producto».</p>
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">A mano</th>
                  <th className="px-4 py-3 text-right">Disponible</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {productos.map((p) => (
                  <tr key={p.id} className="group transition hover:bg-borde/30">
                    <td className="px-4 py-3">
                      <Link href={`/inventario/productos/${p.id}`} className="block">
                        <span className="font-semibold text-tinta">{p.nombre}</span>
                        <span className="block text-xs text-gris">
                          {p.sku ? <span className="font-mono">{p.sku}</span> : "sin SKU"}
                          {p.seguimiento !== "ninguno" ? ` · ${ETIQUETA_SEGUIMIENTO[p.seguimiento]}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gris">{p.categoriaId ? nombreCat.get(p.categoriaId) ?? "—" : "—"}</td>
                    <td className="px-4 py-3 text-gris">{ETIQUETA_TIPO_PRODUCTO[p.tipo]}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-tinta">
                      {p.tipo === "servicio" ? "—" : `${formatearCantidad(p.aMano)} ${abrevUni.get(p.unidadId ?? "") ?? ""}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gris">
                      {p.tipo === "servicio" ? "—" : formatearCantidad(p.disponible)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gris">{formatearMonto(p.valor)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/inventario/productos/${p.id}`} className="inline-grid h-7 w-7 place-items-center rounded-lg text-gris-suave transition group-hover:text-cian">
                        <IconChevronRight size={18} />
                      </Link>
                    </td>
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
