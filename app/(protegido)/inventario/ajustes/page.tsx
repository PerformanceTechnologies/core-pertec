import Link from "next/link";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import IntroSeccion, { Pistas } from "@/components/inventario/IntroSeccion";
import FormularioAjuste from "@/components/inventario/FormularioAjuste";
import { ChipEstado } from "@/components/inventario/Visual";
import {
  listarProductosConStock,
  listarTransferencias,
  listarUbicaciones,
  mapaDeStock,
} from "@/lib/inventario";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const [productos, ubicaciones, recientes, stock] = await Promise.all([
    listarProductosConStock(),
    listarUbicaciones(),
    listarTransferencias({ clase: "ajuste" }),
    mapaDeStock(),
  ]);
  const productosMin = productos
    .filter((p) => p.tipo !== "servicio")
    .map((p) => ({ id: p.id, nombre: p.nombre }));

  return (
    <div className="space-y-5">
      <IntroSeccion
        Icono={IconAdjustmentsHorizontal}
        tono="bg-amber-500/10 text-amber-600"
        titulo="Ajustes de inventario"
        bajada="¿Contaste y no cuadra con el sistema? Anota lo que hay físicamente y el Core corrige la diferencia."
      >
        <Pistas
          items={[
            "Elige producto y bodega",
            "Escribe lo que contaste",
            "Revisa la diferencia y aplica",
          ]}
        />
      </IntroSeccion>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${TARJETA} p-5`}>
          <h2 className="mb-4 text-sm font-bold text-tinta">Nuevo conteo</h2>
          {productosMin.length === 0 ? (
            <p className="text-sm text-gris">Primero crea productos.</p>
          ) : (
            <FormularioAjuste
              productos={productosMin}
              ubicaciones={ubicaciones}
              stock={stock}
            />
          )}
        </section>

        <section className={`${TARJETA} overflow-hidden`}>
          <h2 className="border-b border-borde px-4 py-3 text-sm font-bold text-tinta">
            Ajustes recientes
          </h2>
          {recientes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gris">
              Sin ajustes todavía.
            </p>
          ) : (
            <ul className="divide-y divide-borde">
              {recientes.slice(0, 15).map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/inventario/operaciones/${t.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-borde/30"
                  >
                    <span className="font-mono text-sm font-bold text-tinta">
                      {t.referencia}
                    </span>
                    <span className="flex-1 text-xs text-gris">
                      {new Date(t.creadoEn).toLocaleString("es-CL")}
                    </span>
                    <ChipEstado estado={t.estado} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
