import CreadorEntidad from "@/components/inventario/CreadorEntidad";
import { crearCategoriaAction, crearUnidadAction } from "@/app/(protegido)/inventario/acciones";
import { listarCategorias, listarTiposOperacion, listarUnidades } from "@/lib/inventario";
import { ETIQUETA_CLASE } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ConfiguracionInventarioPage() {
  const [categorias, unidades, tipos] = await Promise.all([listarCategorias(), listarUnidades(), listarTiposOperacion()]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Categorías */}
      <section className={`${TARJETA} p-5`}>
        <h2 className="mb-3 text-sm font-bold text-tinta">Categorías de producto</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {categorias.map((c) => <span key={c.id} className="rounded-full bg-borde/60 px-3 py-1 text-sm text-tinta">{c.nombre}</span>)}
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
