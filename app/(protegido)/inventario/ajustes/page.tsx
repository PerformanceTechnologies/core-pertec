import Link from "next/link";
import FormularioAjuste from "@/components/inventario/FormularioAjuste";
import { ChipEstado } from "@/app/(protegido)/inventario/page";
import { listarProductosConStock, listarTransferencias, listarUbicaciones } from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const [productos, ubicaciones, recientes] = await Promise.all([
    listarProductosConStock(),
    listarUbicaciones(),
    listarTransferencias({ clase: "ajuste" }),
  ]);
  const productosMin = productos.filter((p) => p.tipo !== "servicio").map((p) => ({ id: p.id, nombre: p.nombre }));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={`${TARJETA} p-5`}>
        <h2 className="mb-1 text-sm font-bold text-tinta">Ajuste de inventario</h2>
        <p className="mb-4 text-xs text-gris">
          Registra el conteo físico de un producto en una ubicación. El sistema calcula la diferencia con lo que hay y la mueve contra «Ajustes de inventario».
        </p>
        {productosMin.length === 0 ? (
          <p className="text-sm text-gris">Primero crea productos.</p>
        ) : (
          <FormularioAjuste productos={productosMin} ubicaciones={ubicaciones} />
        )}
      </section>

      <section className={`${TARJETA} overflow-hidden`}>
        <h2 className="border-b border-borde px-4 py-3 text-sm font-bold text-tinta">Ajustes recientes</h2>
        {recientes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gris">Sin ajustes todavía.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {recientes.slice(0, 15).map((t) => (
              <li key={t.id}>
                <Link href={`/inventario/operaciones/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-borde/30">
                  <span className="font-mono text-sm font-bold text-tinta">{t.referencia}</span>
                  <span className="flex-1 text-xs text-gris">{new Date(t.creadoEn).toLocaleString("es-CL")}</span>
                  <ChipEstado estado={t.estado} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
