import Link from "next/link";
import { exigirAccesoOfertas, obtenerOfertaOSalir } from "@/lib/ofertas/datos";
import EditorOferta from "@/components/ofertas/EditorOferta";
import { listarMaestros } from "@/lib/ofertas/maestros";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import { urlFirmadaLogo } from "@/lib/ofertas/logos-archivo";
import SubirLogo from "@/components/ofertas/SubirLogo";
import { asignarMaestroAction } from "../acciones";

export const dynamic = "force-dynamic";

export default async function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoOfertas();
  const { id } = await params;
  const oferta = await obtenerOfertaOSalir(id);
  const [maestros, empresa] = await Promise.all([listarMaestros(), obtenerEmpresaPorNombre(oferta.empresa)]);
  // Dos logos y dos dueños distintos: el de la casa es de la empresa emisora y
  // sirve para todas sus ofertas, así que se sube una vez en /ofertas/logos; el
  // del cliente es de ESTA oferta.
  const [urlLogoCasa, urlLogoCliente] = await Promise.all([
    urlFirmadaLogo(empresa?.logoRuta ?? null),
    urlFirmadaLogo(oferta.logoClienteRuta),
  ]);

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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* El de la casa se muestra pero no se edita desde acá: es de la empresa y
            cambiarlo desde un documento cambiaría todos los demás. */}
        <div className="rounded-xl border border-borde bg-crema/40 p-4">
          <p className="font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
            Logo de {oferta.empresa}
          </p>
          <p className="mt-0.5 text-[11px] text-tinta/45">
            Es el de la empresa emisora: el mismo en todas sus ofertas.
          </p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded-lg border border-borde bg-white p-1.5">
              {urlLogoCasa ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={urlLogoCasa} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-tinta/30">Sin logo</span>
              )}
            </div>
            <div className="min-w-0">
              {empresa?.logoNombre && (
                <p className="truncate text-[11px] text-tinta/55">{empresa.logoNombre}</p>
              )}
              <Link
                href="/ofertas/logos"
                className="mt-1 inline-block text-[11px] font-semibold uppercase tracking-wide text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
              >
                {urlLogoCasa ? "Cambiarlo en Logos →" : "Subirlo en Logos →"}
              </Link>
            </div>
          </div>
        </div>

        <SubirLogo
          destino="cliente"
          clave={oferta.id}
          titulo="Logo del cliente"
          nota={
            oferta.estado === "emitida"
              ? "La oferta ya está emitida: su logo no se cambia."
              : "Va en la celda derecha del encabezado. Sin logo sale el rótulo del maestro."
          }
          nombreActual={oferta.logoClienteNombre}
          urlActual={urlLogoCliente}
          deshabilitado={oferta.estado === "emitida"}
        />
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
