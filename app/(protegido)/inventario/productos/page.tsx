import FormularioProducto from "@/components/inventario/FormularioProducto";
import TablaDeProductos from "@/components/inventario/TablaDeProductos";
import { bodegasConStockPorProducto, contarProductosArchivados, listarAlmacenes, listarCategorias, listarProductosConStock, listarUbicaciones, listarUnidades, miniaturasDeProductos } from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const [productos, categorias, unidades, ubicaciones, miniaturas, archivados, almacenes, bodegasPorProducto] = await Promise.all([
    listarProductosConStock(),
    listarCategorias(),
    listarUnidades(),
    listarUbicaciones(),
    miniaturasDeProductos(),
    contarProductosArchivados(),
    listarAlmacenes(),
    bodegasConStockPorProducto(),
  ]);

  return (
    <div className="space-y-3">
      {productos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <p className="text-sm text-gris">Todavía no hay productos. Crea el primero:</p>
          <div className="mt-3 flex justify-center"><FormularioProducto categorias={categorias} unidades={unidades} ubicaciones={ubicaciones} /></div>
        </div>
      ) : (
        <TablaDeProductos
          productos={productos}
          archivados={archivados}
          nuevo={<FormularioProducto categorias={categorias} unidades={unidades} ubicaciones={ubicaciones} chico />}
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
          unidades={Object.fromEntries(unidades.map((u) => [u.id, u.abreviacion]))}
          ubicaciones={Object.fromEntries(ubicaciones.map((u) => [u.id, u.nombre]))}
          miniaturas={Object.fromEntries(miniaturas)}
          bodegas={almacenes.map((a) => ({ id: a.id, nombre: a.nombre }))}
          bodegasPorProducto={Object.fromEntries(bodegasPorProducto)}
        />
      )}
    </div>
  );
}
