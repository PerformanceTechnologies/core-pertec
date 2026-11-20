import Link from "next/link";
import { IconArchive, IconPackage, IconUpload } from "@tabler/icons-react";
import FormularioProducto from "@/components/inventario/FormularioProducto";
import TablaDeProductos from "@/components/inventario/TablaDeProductos";
import { bodegasConStockPorProducto, contarProductosArchivados, listarAlmacenes, listarCategorias, listarProductosConStock, listarUbicaciones, listarUnidades, miniaturasDeProductos } from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const BOTON_CHICO = "inline-flex items-center gap-1.5 rounded-lg border border-borde px-2.5 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50";

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
      {/* Cabecera en una sola línea: título y cantidad a la izquierda, acciones a la derecha. */}
      <div className={`${TARJETA} flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-naranjo/12 text-naranjo">
          <IconPackage size={17} />
        </span>
        <h1 className="text-base font-bold text-tinta">Productos</h1>
        <span className="text-sm text-gris">{productos.length} {productos.length === 1 ? "producto" : "productos"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href="/inventario/productos/archivados" className={BOTON_CHICO}>
            <IconArchive size={15} /> Archivados{archivados > 0 ? ` (${archivados})` : ""}
          </Link>
          <Link href="/inventario/importar" className={BOTON_CHICO}>
            <IconUpload size={15} /> Carga masiva
          </Link>
          <FormularioProducto categorias={categorias} unidades={unidades} ubicaciones={ubicaciones} />
        </div>
      </div>

      {productos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <p className="text-sm text-gris">Todavía no hay productos. Crea el primero con «Nuevo producto».</p>
        </div>
      ) : (
        <TablaDeProductos
          productos={productos}
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
