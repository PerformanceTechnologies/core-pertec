import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import AccionesTransferencia from "@/components/inventario/AccionesTransferencia";
import { ChipEstado } from "@/app/(protegido)/inventario/page";
import { listarProductosConStock, listarUbicaciones, obtenerTransferencia } from "@/lib/inventario";
import { ETIQUETA_CLASE, formatearCantidad } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function DetalleOperacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detalle, productos, ubicaciones] = await Promise.all([
    obtenerTransferencia(id),
    listarProductosConStock(),
    listarUbicaciones(),
  ]);
  if (!detalle) notFound();
  const { transferencia: t, movimientos } = detalle;
  const nombreProd = new Map(productos.map((p) => [p.id, p.nombre]));
  const nombreUbi = new Map(ubicaciones.map((u) => [u.id, u.nombre]));

  return (
    <div className="space-y-5">
      <Link href="/inventario/operaciones" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a operaciones
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-xl font-extrabold text-tinta">{t.referencia}</h2>
            <ChipEstado estado={t.estado} />
          </div>
          <p className="mt-1 text-sm text-gris">
            {ETIQUETA_CLASE[t.clase]} · {nombreUbi.get(t.ubicacionOrigenId) ?? "—"} → {nombreUbi.get(t.ubicacionDestinoId) ?? "—"}
            {t.contraparte ? ` · ${t.contraparte}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className={`${TARJETA} overflow-hidden`}>
          <h3 className="border-b border-borde px-4 py-3 text-sm font-bold text-tinta">Líneas</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-xs font-semibold uppercase tracking-wide text-gris">
                <th className="px-4 py-2.5">Producto</th>
                <th className="px-4 py-2.5 text-right">Cantidad</th>
                <th className="px-4 py-2.5 text-right">Hecho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/inventario/productos/${m.productoId}`} className="font-semibold text-tinta hover:text-cian">
                      {nombreProd.get(m.productoId) ?? "Producto"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-tinta">{formatearCantidad(m.cantidad)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gris">{m.cantidadHecha != null ? formatearCantidad(m.cantidadHecha) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="space-y-4">
          <section className={`${TARJETA} p-4`}>
            <h3 className="mb-3 text-sm font-bold text-tinta">Acciones</h3>
            <AccionesTransferencia id={t.id} estado={t.estado} />
          </section>
          <section className={`${TARJETA} space-y-2 p-4 text-sm`}>
            <Fila etiqueta="Creada" valor={new Date(t.creadoEn).toLocaleString("es-CL")} />
            {t.fechaValidacion && <Fila etiqueta="Validada" valor={new Date(t.fechaValidacion).toLocaleString("es-CL")} />}
            {t.creadoPor && <Fila etiqueta="Por" valor={t.creadoPor} />}
            {t.nota && <Fila etiqueta="Nota" valor={t.nota} />}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gris">{etiqueta}</span>
      <span className="text-right text-tinta">{valor}</span>
    </div>
  );
}
