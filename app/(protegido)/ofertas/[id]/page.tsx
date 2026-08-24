import Link from "next/link";
import { exigirAccesoOfertas, obtenerOfertaOSalir } from "@/lib/ofertas/datos";
import EditorOferta from "@/components/ofertas/EditorOferta";
import { listarMaestros } from "@/lib/ofertas/maestros";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import { urlFirmadaLogo } from "@/lib/ofertas/logos-archivo";
import { urlFirmadaImagen } from "@/lib/ofertas/imagenes";
import ImagenesDeLaOferta from "@/components/ofertas/ImagenesDeLaOferta";
import SubirLogo from "@/components/ofertas/SubirLogo";
import Plegable from "@/components/Plegable";
import { asignarMaestroAction, elegirImagenesAction } from "../acciones";

export const dynamic = "force-dynamic";

/**
 * Una oferta: el documento y lo que lo rodea.
 *
 * El orden de la pantalla es una decisión, no una casualidad. Antes abría con los
 * dos logos, las nueve miniaturas del borrador y el selector de formato, y el
 * documento —que es a lo que se entra— quedaba abajo de todo eso: quien llegaba por
 * primera vez veía una pared de controles sin saber cuál tocar primero.
 *
 * Ahora todo eso va plegado y diciendo su estado en una línea, así que se abre solo
 * lo que hace falta abrir, y lo primero de verdad es el documento. La regla para
 * decidir qué se pliega: se pliega lo que se toca UNA vez —el logo, el formato, la
 * ubicación de las fotos— y queda a la vista lo que se toca todo el rato, que es el
 * texto de la oferta.
 */
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

  // Las miniaturas de lo que traía el borrador: para elegir hay que ver.
  const urlsImagenes: Record<number, string> = {};
  await Promise.all(
    oferta.imagenes.map(async (imagen) => {
      const url = await urlFirmadaImagen(imagen.ruta);
      if (url) urlsImagenes[imagen.indice] = url;
    }),
  );

  const borrador = oferta.estado === "borrador";
  // El de la empresa es el que de verdad falta cuando falta: sin él, el encabezado
  // de todas las páginas sale con el nombre en texto. El del cliente es opcional —
  // sin él sale el rótulo del maestro— así que no se marca como pendiente.
  const estadoLogos = urlLogoCasa
    ? urlLogoCliente
      ? "Los dos puestos"
      : "Falta el del cliente"
    : "Falta el de la empresa";
  const maestro = maestros.find((m) => m.id === oferta.maestroId);

  return (
    <div className="animar-entrada max-w-[1300px]">
      <Link
        href="/ofertas"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Ofertas
      </Link>

      <div className="mt-3">
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

        {/* Qué es esta pantalla y cómo termina. Es lo que antes había que deducir. */}
        <p className="mt-3 max-w-[78ch] text-sm text-pretty text-tinta/55">
          {oferta.archivoOrigen && (
            <>
              Salió de <span className="text-tinta/75">{oferta.archivoOrigen}</span>.{" "}
            </>
          )}
          {borrador ? (
            <>
              Corregila abajo, escribiendo sobre el documento: la numeración, el índice y los totales los
              calcula el sistema. Cuando esté lista, <b className="font-semibold text-tinta/75">Emitir</b>{" "}
              genera el PDF y la deja de solo lectura.
            </>
          ) : (
            <>Ya está emitida, así que quedó de solo lectura. El PDF se puede descargar cuando haga falta.</>
          )}
        </p>
      </div>

      {/* ── Lo que rodea al documento: se toca una vez y se pliega ────────── */}
      <div className="mt-6 flex flex-col gap-3">
        <Plegable titulo="Logos del encabezado" estado={estadoLogos} alerta={!urlLogoCasa}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                borrador
                  ? "Va en la celda derecha del encabezado. Sin logo sale el rótulo del maestro."
                  : "La oferta ya está emitida: su logo no se cambia."
              }
              nombreActual={oferta.logoClienteNombre}
              urlActual={urlLogoCliente}
              deshabilitado={!borrador}
            />
          </div>
        </Plegable>

        <ImagenesDeLaOferta
          ofertaId={oferta.id}
          imagenes={oferta.imagenes}
          urls={urlsImagenes}
          porSeccion={oferta.contenido.imagenesPorSeccion ?? {}}
          firma={oferta.contenido.cierre?.firmaImagen ?? null}
          editable={borrador}
          accion={elegirImagenesAction}
        />

        {/* El selector de maestro solo aparece si hay maestros subidos: sin ninguno,
            el formato es el de PERTEC y un desplegable de una sola opción es ruido. */}
        {maestros.length > 0 && borrador && (
          <Plegable titulo="Formato" estado={maestro?.nombre ?? "Predeterminado"}>
            <p className="max-w-[78ch] text-[11px] text-pretty text-tinta/45">
              El maestro aporta la piel del documento —paleta, tipografías, medidas del encabezado—, no su
              contenido: cambiarlo no toca ni un dato de la oferta.
            </p>
            <form action={asignarMaestroAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={oferta.id} />
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
          </Plegable>
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
