import Link from "next/link";
import { IconChevronRight, IconPackage, IconUpload } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import FormularioProducto from "@/components/inventario/FormularioProducto";
import { ChipEstadoOperativo, FichaProducto, tonoDeTexto } from "@/components/inventario/Visual";
import { listarCategorias, listarProductosConStock, listarUbicaciones, listarUnidades, miniaturasDeProductos } from "@/lib/inventario";
import {
  ETIQUETA_CERTIFICADO,
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  diasHasta,
  estadoCertificado,
  formatearCantidad,
  formatearMonto,
} from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const [productos, categorias, unidades, ubicaciones, miniaturas] = await Promise.all([
    listarProductosConStock(),
    listarCategorias(),
    listarUnidades(),
    listarUbicaciones(),
    miniaturasDeProductos(),
  ]);
  const nombreUbi = new Map(ubicaciones.map((u) => [u.id, u.nombre]));
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]));
  const abrevUni = new Map(unidades.map((u) => [u.id, u.abreviacion]));

  return (
    <div className="space-y-4">
      <IntroSeccion
        Icono={IconPackage}
        tono="bg-naranjo/12 text-naranjo"
        titulo="Productos"
        bajada="El catálogo: cada producto con su stock en todas las bodegas. Toca uno para ver su ficha, lotes y movimientos."
      >
        <div className="flex flex-wrap items-center gap-2">
          <FormularioProducto categorias={categorias} unidades={unidades} ubicaciones={ubicaciones} />
          <Link href="/inventario/importar" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50">
            <IconUpload size={16} /> Carga masiva
          </Link>
          <span className="text-sm text-gris">{productos.length} {productos.length === 1 ? "producto" : "productos"}</span>
        </div>
      </IntroSeccion>

      {productos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <p className="text-sm text-gris">Todavía no hay productos. Crea el primero con «Nuevo producto».</p>
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">A mano</th>
                  <th className="px-4 py-3 text-right">Disponible</th>
                  <th className="px-4 py-3 text-right" title="A mano + lo que llega - lo que sale en operaciones pendientes">Pronosticado</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {productos.map((p) => (
                  <tr key={p.id} className="group transition hover:bg-tinta/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/inventario/productos/${p.id}`} className="flex items-start gap-3">
                        <FichaProducto nombre={p.nombre} categoria={p.categoriaId ? nombreCat.get(p.categoriaId) ?? null : null} foto={miniaturas.get(p.id)} />
                        <span className="min-w-0">
                        <span className="font-semibold text-tinta group-hover:text-naranjo">{p.nombre}</span>
                        <span className="block text-xs text-gris">
                          {p.sku ? <span className="font-mono">{p.sku}</span> : "sin SKU"}
                          {p.marca ? ` · ${p.marca}` : ""}
                          {p.seguimiento !== "ninguno" ? ` · ${ETIQUETA_SEGUIMIENTO[p.seguimiento]}` : ""}
                          {p.ubicacionId && nombreUbi.get(p.ubicacionId) ? ` · ${nombreUbi.get(p.ubicacionId)}` : ""}
                        </span>
                        <Avisos producto={p} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {p.categoriaId && nombreCat.get(p.categoriaId) ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tonoDeTexto(nombreCat.get(p.categoriaId)!)}`}>{nombreCat.get(p.categoriaId)}</span>
                      ) : (
                        <span className="text-gris-suave">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gris">{ETIQUETA_TIPO_PRODUCTO[p.tipo]}</td>
                    <td className="px-4 py-3"><ChipEstadoOperativo estado={p.estadoOperativo} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-tinta">
                      {p.tipo === "servicio" ? "—" : `${formatearCantidad(p.aMano)} ${abrevUni.get(p.unidadId ?? "") ?? ""}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gris">
                      {p.tipo === "servicio" ? "—" : formatearCantidad(p.disponible)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${p.pronosticado < 0 ? "font-semibold text-rose-600" : "text-gris"}`}
                      title={p.tipo === "servicio" ? undefined : `+${formatearCantidad(p.entrante)} entrante · −${formatearCantidad(p.saliente)} saliente`}
                    >
                      {p.tipo === "servicio" ? "—" : formatearCantidad(p.pronosticado)}
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

/** Certificado faltante o vencido y vencimiento del producto, como etiquetas bajo el nombre. */
function Avisos({ producto: p }: { producto: Parameters<typeof estadoCertificado>[0] & { fechaVencimiento: string | null } }) {
  const cert = ETIQUETA_CERTIFICADO[estadoCertificado(p)];
  const dias = diasHasta(p.fechaVencimiento);
  const venc =
    dias === null ? null : dias < 0 ? { texto: "Producto vencido", tono: "bg-rose-500/10 text-rose-600" } : dias <= 30 ? { texto: `Vence en ${dias} d`, tono: "bg-amber-500/10 text-amber-700" } : null;
  if (!cert && !venc) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {cert && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cert.tono}`}>{cert.texto}</span>}
      {venc && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${venc.tono}`}>{venc.texto}</span>}
    </span>
  );
}
