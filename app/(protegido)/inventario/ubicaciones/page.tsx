import CreadorEntidad from "@/components/inventario/CreadorEntidad";
import { crearAlmacenAction, crearUbicacionAction } from "@/app/(protegido)/inventario/acciones";
import { listarAlmacenes, listarUbicaciones } from "@/lib/inventario";
import { ETIQUETA_TIPO_UBICACION, type TipoUbicacion } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function UbicacionesPage() {
  const [almacenes, ubicaciones] = await Promise.all([listarAlmacenes(), listarUbicaciones(true)]);
  const nombreAlmacen = new Map(almacenes.map((a) => [a.id, a.nombre]));

  const tipos = (Object.keys(ETIQUETA_TIPO_UBICACION) as TipoUbicacion[]).map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO_UBICACION[t] }));
  const opcionesAlmacen = [{ valor: "", etiqueta: "— Sin almacén —" }, ...almacenes.map((a) => ({ valor: a.id, etiqueta: a.nombre }))];

  return (
    <div className="space-y-6">
      {/* Almacenes */}
      <section className={`${TARJETA} p-5`}>
        <h2 className="mb-3 text-sm font-bold text-tinta">Almacenes (bodegas)</h2>
        <ul className="mb-4 divide-y divide-borde rounded-lg border border-borde">
          {almacenes.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono text-xs font-bold text-gris">{a.codigo}</span>
              <span className="text-tinta">{a.nombre}</span>
            </li>
          ))}
          {almacenes.length === 0 && <li className="px-4 py-3 text-sm text-gris">Sin almacenes.</li>}
        </ul>
        <CreadorEntidad
          accion={crearAlmacenAction}
          campos={[
            { name: "nombre", etiqueta: "Nombre", requerido: true, placeholder: "Bodega Norte" },
            { name: "codigo", etiqueta: "Código", requerido: true, placeholder: "BN" },
          ]}
          textoBoton="Crear almacén"
        />
      </section>

      {/* Ubicaciones */}
      <section className={`${TARJETA} p-5`}>
        <h2 className="mb-1 text-sm font-bold text-tinta">Ubicaciones</h2>
        <p className="mb-3 text-xs text-gris">
          Las internas guardan stock propio. Las virtuales (proveedores, clientes, ajuste, tránsito) son la contraparte de cada movimiento.
        </p>
        <div className="mb-4 overflow-hidden rounded-lg border border-borde">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde bg-borde/30 text-left text-xs font-semibold uppercase tracking-wide text-gris">
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Almacén</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {ubicaciones.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 text-tinta">{u.nombre}{u.esStockPrincipal ? " ★" : ""}</td>
                  <td className="px-4 py-2.5 text-gris">{ETIQUETA_TIPO_UBICACION[u.tipo]}</td>
                  <td className="px-4 py-2.5 text-gris">{u.almacenId ? nombreAlmacen.get(u.almacenId) ?? "—" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CreadorEntidad
          accion={crearUbicacionAction}
          campos={[
            { name: "nombre", etiqueta: "Nombre", requerido: true, placeholder: "Estantería A" },
            { name: "codigo", etiqueta: "Código" },
            { name: "tipo", etiqueta: "Tipo", tipo: "select", opciones: tipos },
            { name: "almacenId", etiqueta: "Almacén", tipo: "select", opciones: opcionesAlmacen },
          ]}
          textoBoton="Crear ubicación"
        />
      </section>
    </div>
  );
}
