import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import FormularioProducto from "@/components/inventario/FormularioProducto";
import FormularioLote from "@/components/inventario/FormularioLote";
import FormularioRegla from "@/components/inventario/FormularioRegla";
import FormularioAjuste from "@/components/inventario/FormularioAjuste";
import { listarCategorias, listarUbicaciones, listarUnidades, obtenerFichaProducto } from "@/lib/inventario";
import {
  ETIQUETA_SEGUIMIENTO,
  ETIQUETA_TIPO_PRODUCTO,
  diasHasta,
  formatearCantidad,
  formatearMonto,
  porVencer,
} from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function FichaProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ficha, categorias, unidades, ubicaciones] = await Promise.all([
    obtenerFichaProducto(id),
    listarCategorias(),
    listarUnidades(),
    listarUbicaciones(),
  ]);
  if (!ficha) notFound();

  const { producto, stock, aMano, lotes, reglas, movimientos } = ficha;
  const abrevUni = unidades.find((u) => u.id === producto.unidadId)?.abreviacion ?? "";
  const nombreCat = categorias.find((c) => c.id === producto.categoriaId)?.nombre;
  const nombreUbi = new Map(ubicaciones.map((u) => [u.id, u.nombre]));
  const esFisico = producto.tipo !== "servicio";

  return (
    <div className="space-y-5">
      <Link href="/inventario/productos" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a productos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-tinta">{producto.nombre}</h2>
          <p className="mt-0.5 text-sm text-gris">
            {producto.sku ? <span className="font-mono">{producto.sku}</span> : "sin SKU"}
            {" · "}{ETIQUETA_TIPO_PRODUCTO[producto.tipo]}
            {nombreCat ? ` · ${nombreCat}` : ""}
            {producto.seguimiento !== "ninguno" ? ` · ${ETIQUETA_SEGUIMIENTO[producto.seguimiento]}` : ""}
          </p>
        </div>
        <FormularioProducto categorias={categorias} unidades={unidades} producto={producto} />
      </div>

      {/* Resumen de números */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="A mano" valor={esFisico ? `${formatearCantidad(aMano)} ${abrevUni}` : "—"} />
        <Dato etiqueta="Costo unitario" valor={formatearMonto(producto.costo)} />
        <Dato etiqueta="Precio de venta" valor={formatearMonto(producto.precio)} />
        <Dato etiqueta="Valor en stock" valor={formatearMonto(aMano * producto.costo)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Stock por ubicación */}
        <section className={`${TARJETA} overflow-hidden`}>
          <h3 className="border-b border-borde px-4 py-3 text-sm font-bold text-tinta">Stock por ubicación</h3>
          {stock.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gris">Sin existencias registradas.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-borde">
                {stock.map((s) => (
                  <tr key={s.ubicacion.id}>
                    <td className="px-4 py-2.5 text-tinta">{s.ubicacion.nombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-tinta">{formatearCantidad(s.cantidad)} {abrevUni}</td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-gris">{s.reservado > 0 ? `${formatearCantidad(s.reservado)} reserv.` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Ajuste rápido */}
        {esFisico && (
          <section className={`${TARJETA} p-4`}>
            <h3 className="mb-3 text-sm font-bold text-tinta">Ajustar inventario</h3>
            <FormularioAjuste producto={{ id: producto.id, nombre: producto.nombre }} ubicaciones={ubicaciones} lotes={lotes} />
          </section>
        )}

        {/* Lotes/series */}
        {esFisico && producto.seguimiento !== "ninguno" && (
          <section className={`${TARJETA} p-4`}>
            <h3 className="mb-3 text-sm font-bold text-tinta">{producto.seguimiento === "serie" ? "Números de serie" : "Lotes"}</h3>
            {lotes.length > 0 && (
              <ul className="mb-3 divide-y divide-borde rounded-lg border border-borde">
                {lotes.map((l) => {
                  const d = diasHasta(l.fechaVencimiento);
                  return (
                    <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="flex-1 font-mono text-tinta">{l.nombre}</span>
                      {l.fechaVencimiento && (
                        <span className={`text-xs ${porVencer(l.fechaVencimiento) ? "font-semibold text-amber-600" : "text-gris"}`}>
                          vence {l.fechaVencimiento}{d !== null && d < 0 ? " (vencido)" : ""}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <FormularioLote productoId={producto.id} seguimiento={producto.seguimiento} />
          </section>
        )}

        {/* Reglas de reabastecimiento */}
        {esFisico && (
          <section className={`${TARJETA} p-4`}>
            <h3 className="mb-1 text-sm font-bold text-tinta">Reabastecimiento</h3>
            <p className="mb-3 text-xs text-gris">Cuando el disponible cae bajo el mínimo, aparece en el reporte de reabastecimiento.</p>
            <FormularioRegla productoId={producto.id} ubicaciones={ubicaciones} reglas={reglas} />
          </section>
        )}
      </div>

      {/* Movimientos */}
      <section className={`${TARJETA} overflow-hidden`}>
        <h3 className="border-b border-borde px-4 py-3 text-sm font-bold text-tinta">Movimientos recientes</h3>
        {movimientos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gris">Sin movimientos todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-2.5">Documento</th>
                  <th className="px-4 py-2.5">Movimiento</th>
                  <th className="px-4 py-2.5 text-right">Cantidad</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/inventario/operaciones/${m.transferenciaId}`} className="font-mono font-semibold text-azul hover:underline">{m.referencia}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-gris">
                      {nombreUbi.get(m.ubicacionOrigenId) ?? "—"} → {nombreUbi.get(m.ubicacionDestinoId) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-tinta">{formatearCantidad(m.cantidad)}</td>
                    <td className="px-4 py-2.5 text-xs text-gris">{m.estado === "hecho" ? "Hecho" : m.estado === "cancelado" ? "Cancelado" : "Borrador"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className={`${TARJETA} p-3`}>
      <p className="text-lg font-extrabold tabular-nums text-tinta">{valor}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-gris">{etiqueta}</p>
    </div>
  );
}
