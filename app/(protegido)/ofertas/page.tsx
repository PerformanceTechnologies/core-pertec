import Link from "next/link";
import { exigirAccesoOfertas, listarOfertas } from "@/lib/ofertas/datos";
import SubirBorrador from "@/components/ofertas/SubirBorrador";
import { fechaCl } from "@/lib/cotizador/formato";
import { TARJETA } from "@/lib/estilos";
import { eliminarOfertaAction } from "./acciones";

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
        <Link
          href="/ofertas/maestros"
          className="text-xs font-medium text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo lg:shrink-0"
        >
          Maestros de formato →
        </Link>
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

          <div className={`mt-2 overflow-hidden ${TARJETA}`}>
            <table className="w-full text-sm">
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
                  <th className="px-4 py-3 font-medium">Oferta</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Por revisar</th>
                  <th className="px-4 py-3 font-medium">Modificada</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => (
                  <tr key={o.id} className="border-b border-borde/60 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/ofertas/${o.id}`}
                        className="font-medium text-tinta transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                      >
                        {o.nombre}
                      </Link>
                      {o.faena && <span className="block text-[11px] text-tinta/45">{o.faena}</span>}
                    </td>
                    <td className="px-4 py-3 text-tinta/70">{o.cliente ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          o.estado === "emitida" ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                        }`}
                      >
                        {o.estado === "emitida" ? "Emitida" : "Borrador"}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {o.cantidadInconsistencias === 0 ? (
                        <span className="text-teal">Nada</span>
                      ) : (
                        <span className="font-semibold text-naranjo">{o.cantidadInconsistencias}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] tabular-nums text-tinta/50">
                      {fechaCl(o.actualizadoEn)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Solo los borradores: una emitida ya salió para afuera y su
                          registro es lo único que queda de lo que se mandó. */}
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
