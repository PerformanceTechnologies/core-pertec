import { NOMBRE_DE_SECCION, SECCIONES_CON_IMAGENES, type SeccionConImagenes } from "@/lib/ofertas/tipos";
import type { ImagenGuardada } from "@/lib/ofertas/imagenes";

/**
 * Las imágenes que traía el borrador, para que la persona decida dónde va cada una.
 *
 * La elección del modelo es una propuesta: mira las medidas y el texto que rodeaba
 * al marcador, y con eso se equivoca. Omitió una foto "por no poder determinar con
 * certeza" qué era y el anexo salió vacío, sin forma de corregirlo desde la
 * pantalla.
 *
 * Y la sección importa tanto como la inclusión: un borrador pone el diagrama de
 * disposición de equipos en medio de la metodología y las fotos de faena en el
 * anexo. Mandarlas todas al final convierte el documento en un collage, así que acá
 * se elige la sección de cada una.
 *
 * Para decidir hay que VER, así que van las miniaturas y no una lista de números.
 */
export default function ImagenesDelBorrador({
  ofertaId,
  imagenes,
  urls,
  porSeccion,
  firma,
  editable,
  accion,
}: {
  ofertaId: string;
  imagenes: ImagenGuardada[];
  /** Índice → URL firmada, corta, para la miniatura. */
  urls: Record<number, string>;
  porSeccion: Partial<Record<SeccionConImagenes, number[]>>;
  firma: number | null;
  editable: boolean;
  accion: (formData: FormData) => Promise<void>;
}) {
  if (imagenes.length === 0) return null;

  /** En qué sección está una imagen hoy, o "" si no se usa. */
  const seccionDe = (indice: number): string =>
    SECCIONES_CON_IMAGENES.find((seccion) => (porSeccion[seccion] ?? []).includes(indice)) ?? "";

  const enUso = imagenes.filter((imagen) => seccionDe(imagen.indice) !== "").length;

  return (
    <form action={accion} className="mt-6 rounded-xl border border-borde bg-crema/40 p-4">
      <input type="hidden" name="id" value={ofertaId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
          Imágenes del borrador
        </p>
        <p className="text-[11px] text-tinta/45">
          {imagenes.length} encontrada{imagenes.length === 1 ? "" : "s"} · {enUso} en el documento
        </p>
      </div>
      <p className="mt-0.5 max-w-[85ch] text-[11px] text-pretty text-tinta/45">
        Cada imagen sale en la sección que elijas, donde estaba en el borrador: un diagrama del trabajo va en
        la metodología y las fotos de faena en el anexo. El sistema propuso una ubicación mirando el texto que
        la rodeaba y su tamaño; el logo y el membrete quedan sin sección a propósito, porque el encabezado ya
        los pone.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {imagenes.map((imagen) => {
          const url = urls[imagen.indice];
          const seccion = seccionDe(imagen.indice);
          return (
            <div
              key={imagen.indice}
              className={`rounded-lg border p-2 transition ${
                seccion ? "border-naranjo/60 bg-superficie" : "border-borde bg-superficie/50"
              }`}
            >
              <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-white">
                {url ? (
                  // Sin next/image: es un bucket privado con URL firmada y corta, no
                  // tiene por qué quedar cacheada en un CDN público.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-tinta/30">Sin vista</span>
                )}
              </div>

              <select
                name={`seccion-${imagen.indice}`}
                defaultValue={seccion}
                disabled={!editable}
                className="mt-2 h-[30px] w-full rounded-lg border border-borde bg-superficie px-2 text-[11px] text-tinta outline-none focus:border-naranjo/50 disabled:opacity-60"
              >
                <option value="">No usar</option>
                {SECCIONES_CON_IMAGENES.map((clave) => (
                  <option key={clave} value={clave}>
                    {NOMBRE_DE_SECCION[clave]}
                  </option>
                ))}
              </select>

              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] tabular-nums text-tinta/40">
                  {imagen.ancho}×{imagen.alto} · nº {imagen.indice}
                </span>
                <label className="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name="firma"
                    value={imagen.indice}
                    defaultChecked={firma === imagen.indice}
                    disabled={!editable}
                    className="h-3 w-3 accent-teal"
                  />
                  <span className="text-[10px] text-tinta/45">Firma</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="rounded-lg border border-borde px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Aplicar al documento
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-tinta/45">
            <input type="radio" name="firma" value="0" defaultChecked={firma === null} className="h-3 w-3" />
            Ninguna es la firma
          </label>
        </div>
      )}
    </form>
  );
}
