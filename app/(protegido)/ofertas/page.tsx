import Link from "next/link";
import { exigirAccesoOfertas, listarOfertas } from "@/lib/ofertas/datos";
import SubirBorrador from "@/components/ofertas/SubirBorrador";
import { fechaCl } from "@/lib/cotizador/formato";
import { TARJETA } from "@/lib/estilos";
import { duplicarOfertaAction, eliminarOfertaAction } from "./acciones";

export const dynamic = "force-dynamic";

export default async function OfertasPage() {
  await exigirAccesoOfertas();
  const ofertas = await listarOfertas();

  const conProblemas = ofertas.filter((o) => o.cantidadInconsistencias > 0).length;

  return (
    <div className="animar-entrada max-w-[1200px]">
      <Link
        href="/"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Volver al inicio
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className="etiqueta-seccion">Ofertas técnicas</span>
          <h1 className="mt-2 max-w-[26ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
            Ofertas técnicas
            <span className="block text-tinta/40">Del borrador al formato de la casa</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 lg:shrink-0">
          <Link
            href="/ofertas/logos"
            className="text-xs font-medium text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Logos →
          </Link>
          <Link
            href="/ofertas/maestros"
            className="text-xs font-medium text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Maestros de formato →
          </Link>
        </div>
      </div>

      <SubirBorrador />

      {ofertas.length === 0 ? (
        <p className="mt-8 text-sm text-tinta/50">Todavía no hay ofertas. Subí un borrador para empezar.</p>
      ) : (
        <>
          <p className="mt-8 text-xs text-tinta/45">
            {ofertas.length} oferta{ofertas.length === 1 ? "" : "s"}
            {conProblemas > 0 && (
              <span className="text-naranjo">
                {" · "}
                {conProblemas} con algo por revisar
              </span>
            )}
          </p>

          <div className={`mt-2 overflow-x-auto ${TARJETA}`}>
            <table className="w-full text-sm">
              {/* Los anchos se declaran para pantalla grande; en chica dos columnas
                  no se dibujan (hidden) y el resto se reparte el espacio solo. */}
              <colgroup>
                <col />
                <col style={{ width: "22%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-borde text-left text-[11px] uppercase tracking-wide text-tinta/45">
                  <th className="px-3 py-3 font-medium sm:px-4">Oferta</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Cliente</th>
                  <th className="px-3 py-3 font-medium sm:px-4">Estado</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Por revisar</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Modificada</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => (
                  <tr key={o.id} className="border-b border-borde/60 last:border-0">
                    <td className="break-words px-3 py-3 sm:px-4">
                      <Link
                        href={`/ofertas/${o.id}`}
                        className="font-medium text-tinta transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                      >
                        {o.nombre}
                      </Link>
                      {o.faena && <span className="block text-[11px] text-tinta/45">{o.faena}</span>}
                      {/* El cliente y la fecha, que en chico no tienen columna, se leen
                          acá abajo: esconder una columna no puede ser perder el dato. */}
                      {/* Lo de las tres columnas que en un teléfono no se dibujan.
                          El ancho mínimo de una tabla es la suma de sus columnas, y
                          "Por revisar" no baja de lo que mide su propio título: con
                          seis columnas la tabla no cabía y quedaba cortada. */}
                      <span className="mt-0.5 block text-[11px] text-tinta/45 sm:hidden">
                        {o.cliente ?? "Sin cliente"} · {fechaCl(o.actualizadoEn)}
                        {o.cantidadInconsistencias > 0 && (
                          <span className="font-semibold text-naranjo">
                            {" "}
                            · {o.cantidadInconsistencias} por revisar
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-tinta/70 sm:table-cell">{o.cliente ?? "—"}</td>
                    <td className="px-3 py-3 sm:px-4">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          o.estado === "emitida" ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                        }`}
                      >
                        {o.estado === "emitida" ? "Emitida" : "Borrador"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums sm:table-cell">
                      {o.cantidadInconsistencias === 0 ? (
                        <span className="text-teal">Nada</span>
                      ) : (
                        <span className="font-semibold text-naranjo">{o.cantidadInconsistencias}</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-[11px] tabular-nums text-tinta/50 sm:table-cell">
                      {fechaCl(o.actualizadoEn)}
                    </td>
                    <td className="px-3 py-3 text-right sm:px-4">
                      <div className="flex items-center justify-end gap-3">
                        {/* Duplicar vale para las dos: de una emitida es como se hace
                            la siguiente parecida, que es su caso principal. */}
                        <form action={duplicarOfertaAction}>
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            title="Crear un borrador nuevo con este contenido"
                            className="text-[11px] font-medium text-tinta/40 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                          >
                            Duplicar
                          </button>
                        </form>
                        {/* Eliminar, solo los borradores: una emitida ya salió para
                          afuera y su registro es lo único que queda de lo que se
                          mandó. */}
                        {o.estado === "borrador" && (
                          <form action={eliminarOfertaAction}>
                            <input type="hidden" name="id" value={o.id} />
                            <button
                              type="submit"
                              className="text-[11px] font-medium text-tinta/40 transition-colors hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                            >
                              Eliminar
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
