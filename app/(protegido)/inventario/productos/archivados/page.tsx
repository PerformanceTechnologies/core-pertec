import Link from "next/link";
import { IconArchive, IconArrowLeft, IconChevronRight } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import { BotonRestaurar } from "@/components/inventario/BotonesArchivado";
import { FichaProducto, tonoDeTexto } from "@/components/inventario/Visual";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarCategorias, listarProductosArchivados } from "@/lib/inventario";
import { puedeArchivar } from "@/lib/inventario-archivado";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

export default async function ProductosArchivadosPage() {
  const usuario = await exigirAccesoApp("inventario");
  const [productos, categorias, puedeRestaurar] = await Promise.all([listarProductosArchivados(), listarCategorias(), puedeArchivar(usuario)]);
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]));

  return (
    <div className="space-y-4">
      <Link href="/inventario/productos" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a productos
      </Link>

      <IntroSeccion
        Icono={IconArchive}
        tono="bg-amber-500/10 text-amber-600"
        titulo="Productos archivados"
        bajada={
          puedeRestaurar
            ? "Ya no aparecen en el catálogo ni se pueden usar en operaciones nuevas, pero conservan su ficha y su historial. Restaura uno para volver a usarlo."
            : "Ya no aparecen en el catálogo ni se pueden usar en operaciones nuevas, pero conservan su ficha y su historial. Solo un administrador puede restaurarlos."
        }
      >
        <span className="text-sm text-gris">{productos.length} {productos.length === 1 ? "producto archivado" : "productos archivados"}</span>
      </IntroSeccion>

      {productos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <p className="text-sm text-gris">No hay productos archivados.</p>
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Archivado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {productos.map((p) => {
                  const categoria = p.categoriaId ? nombreCat.get(p.categoriaId) ?? null : null;
                  return (
                    <tr key={p.id} className="group transition hover:bg-tinta/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/inventario/productos/${p.id}`} className="flex items-start gap-3">
                          <FichaProducto nombre={p.nombre} categoria={categoria} />
                          <span className="min-w-0">
                            <span className="font-semibold text-tinta group-hover:text-naranjo">{p.nombre}</span>
                            <span className="block text-xs text-gris">
                              {p.sku ? <span className="font-mono">{p.sku}</span> : "sin SKU"}
                              {p.marca ? ` · ${p.marca}` : ""}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {categoria ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tonoDeTexto(categoria)}`}>{categoria}</span>
                        ) : (
                          <span className="text-gris-suave">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gris">
                        {p.archivadoEn ? fechaCorta(p.archivadoEn) : "Sin fecha"}
                        {p.archivadoPor && <span className="block text-xs">por {p.archivadoPor}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start justify-end gap-2">
                          {puedeRestaurar && <BotonRestaurar productoId={p.id} nombre={p.nombre} chico />}
                          <Link href={`/inventario/productos/${p.id}`} aria-label={`Ver la ficha de ${p.nombre}`} className="inline-grid h-7 w-7 place-items-center rounded-lg text-gris-suave transition group-hover:text-cian">
                            <IconChevronRight size={18} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
