import Link from "next/link";
import { exigirAccesoOfertas, obtenerOfertaOSalir } from "@/lib/ofertas/datos";
import EditorOferta from "@/components/ofertas/EditorOferta";
import { listarMaestros } from "@/lib/ofertas/maestros";
import { asignarMaestroAction } from "../acciones";

export const dynamic = "force-dynamic";

export default async function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoOfertas();
  const { id } = await params;
  const oferta = await obtenerOfertaOSalir(id);
  const maestros = await listarMaestros();

  return (
    <div className="animar-entrada max-w-[1300px]">
      <Link
        href="/ofertas"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Ofertas
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="etiqueta-seccion">
            {oferta.estado === "emitida" ? "Emitida" : "Borrador"}
            {oferta.numeroOferta && ` · ${oferta.numeroOferta}`}
          </span>
          <h1 className="mt-2 max-w-[34ch] font-condensed text-2xl font-bold uppercase leading-[0.98] tracking-tight text-tinta sm:text-3xl">
            {oferta.contenido.titulo}
          </h1>
          {oferta.cliente && (
            <p className="mt-1 font-condensed text-lg uppercase leading-tight text-tinta/40">
              {oferta.cliente}
              {oferta.faena && ` · ${oferta.faena}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {oferta.archivoOrigen && (
            <p className="text-[11px] text-tinta/45">
              Desde <span className="text-tinta/70">{oferta.archivoOrigen}</span>
            </p>
          )}
          {/* El selector de maestro solo aparece si hay maestros subidos: sin
              ninguno, el formato es el de PERTEC y un desplegable de una sola
              opción es ruido. */}
          {maestros.length > 0 && oferta.estado === "borrador" && (
            <form action={asignarMaestroAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={oferta.id} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">Formato</span>
              <select
                name="maestroId"
                defaultValue={oferta.maestroId ?? ""}
                className="h-[30px] rounded-lg border border-borde bg-superficie px-2 text-xs text-tinta outline-none focus:border-naranjo/50"
              >
                <option value="">Predeterminado</option>
                {maestros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg border border-borde px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-tinta/70 transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
              >
                Aplicar
              </button>
            </form>
          )}
        </div>
      </div>

      <EditorOferta
        id={oferta.id}
        inicial={oferta.contenido}
        estado={oferta.estado}
        archivoOrigen={oferta.archivoOrigen}
      />
    </div>
  );
}
