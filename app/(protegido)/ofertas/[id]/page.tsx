import Link from "next/link";
import { exigirAccesoOfertas, obtenerOfertaOSalir } from "@/lib/ofertas/datos";
import EditorOferta from "@/components/ofertas/EditorOferta";

export const dynamic = "force-dynamic";

export default async function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoOfertas();
  const { id } = await params;
  const oferta = await obtenerOfertaOSalir(id);

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
        {oferta.archivoOrigen && (
          <p className="shrink-0 text-[11px] text-tinta/45">
            Desde <span className="text-tinta/70">{oferta.archivoOrigen}</span>
          </p>
        )}
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
