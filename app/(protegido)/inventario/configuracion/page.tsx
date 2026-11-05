import { IconSettings } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import CreadorEntidad from "@/components/inventario/CreadorEntidad";
import { crearCategoriaAction, crearUnidadAction } from "@/app/(protegido)/inventario/acciones";
import { leerMinimoGeneral, listarCategorias, listarTiposOperacion, listarUnidades, productosPorCategoria } from "@/lib/inventario";
import MinimoGeneral from "@/components/inventario/MinimoGeneral";
import ChipCategoriaBorrable from "@/components/inventario/ChipCategoriaBorrable";
import { ETIQUETA_CLASE } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ConfiguracionInventarioPage() {
  const [categorias, unidades, tipos, enUso, general] = await Promise.all([listarCategorias(), listarUnidades(), listarTiposOperacion(), productosPorCategoria(), leerMinimoGeneral()]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <IntroSeccion
          Icono={IconSettings}
          tono="bg-slate-500/10 text-slate-600"
          titulo="Configuración"
          bajada="Las listas que usan los productos: categorías y unidades de medida. Los tipos de operación definen de dónde a dónde mueve cada documento."
        />
      </div>
      {/* Aviso de stock bajo, para todos */}
      <section className={`${TARJETA} p-5 lg:col-span-2`}>
        <h2 className="mb-1 text-sm font-bold text-tinta">Avisar cuando quede poco (para todos los productos)</h2>
        <p className="mb-4 text-xs text-gris">Si de un producto quedan menos de esto (sumando todas las bodegas), aparece en «Reabastecimiento» y en el tablero.</p>
        <MinimoGeneral minimo={general.minimo} maximo={general.maximo} />
      </section>

      {/* Categorías */}
      <section className={`${TARJETA} p-5`}>
        <h2 className="mb-3 text-sm font-bold text-tinta">Categorías de producto</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {categorias.map((c) => <ChipCategoriaBorrable key={c.id} id={c.id} nombre={c.nombre} productos={enUso.get(c.id) ?? 0} />)}
          {categorias.length === 0 && <span className="text-sm text-gris">Sin categorías.</span>}
        </div>
        <CreadorEntidad accion={crearCategoriaAction} campos={[{ name: "nombre", etiqueta: "Nueva categoría", requerido: true, placeholder: "EPP" }]} />
      </section>

      {/* Unidades */}
      <section className={`${TARJETA} p-5`}>
        <h2 className="mb-3 text-sm font-bold text-tinta">Unidades de medida</h2>
        <ul className="mb-4 flex flex-wrap gap-2">
          {unidades.map((u) => (
            <li key={u.id} className="rounded-full bg-borde/60 px-3 py-1 text-sm text-tinta">{u.nombre} <span className="text-gris">({u.abreviacion})</span></li>
          ))}
        </ul>
        <CreadorEntidad
          accion={crearUnidadAction}
          campos={[
            { name: "nombre", etiqueta: "Nombre", requerido: true, placeholder: "Bidón" },
            { name: "abreviacion", etiqueta: "Abrev.", requerido: true, placeholder: "BD" },
          ]}
        />
      </section>

      {/* Tipos de operación (solo lectura) */}
      <section className={`${TARJETA} p-5 lg:col-span-2`}>
        <h2 className="mb-1 text-sm font-bold text-tinta">Tipos de operación</h2>
        <p className="mb-3 text-xs text-gris">Plantillas de transferencia con sus ubicaciones y numeración por defecto.</p>
        <div className="overflow-hidden rounded-lg border border-borde">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde bg-borde/30 text-left text-xs font-semibold uppercase tracking-wide text-gris">
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Clase</th>
                <th className="px-4 py-2.5">Prefijo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {tipos.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 text-tinta">{t.nombre}</td>
                  <td className="px-4 py-2.5 text-gris">{ETIQUETA_CLASE[t.clase]}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gris">{t.prefijo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
