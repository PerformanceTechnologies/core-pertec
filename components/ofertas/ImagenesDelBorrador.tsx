import type { ImagenGuardada } from "@/lib/ofertas/imagenes";

/**
 * Las imágenes que traía el borrador, para que la persona decida cuáles van.
 *
 * La elección del modelo es una propuesta: mira las medidas y el contexto del
 * marcador, y con eso se equivoca. Omitió una foto de 1162×667 px "por no poder
 * determinar con certeza" qué era y el anexo salió vacío — y no había forma de
 * corregirlo desde la pantalla.
 *
 * Es el mismo reparto que gobierna todo el módulo, aplicado a las imágenes: el
 * modelo propone, el servidor guarda, la persona decide. Y para decidir hay que
 * VER, así que van las miniaturas y no una lista de números.
 */
export default function ImagenesDelBorrador({
  ofertaId,
  imagenes,
  urls,
  fotos,
  firma,
  editable,
  accion,
}: {
  ofertaId: string;
  imagenes: ImagenGuardada[];
  /** Índice → URL firmada, corta, para la miniatura. */
  urls: Record<number, string>;
  fotos: number[];
  firma: number | null;
  editable: boolean;
  accion: (formData: FormData) => Promise<void>;
}) {
  if (imagenes.length === 0) return null;

  return (
    <form action={accion} className="mt-6 rounded-xl border border-borde bg-crema/40 p-4">
      <input type="hidden" name="id" value={ofertaId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
          Imágenes del borrador
        </p>
        <p className="text-[11px] text-tinta/45">
          {imagenes.length} encontrada{imagenes.length === 1 ? "" : "s"} · {fotos.length} en el anexo
        </p>
      </div>
      <p className="mt-0.5 max-w-[80ch] text-[11px] text-pretty text-tinta/45">
        Las que marques van al anexo del documento, en este orden. El sistema propuso una selección mirando el
        tamaño y el lugar donde estaba cada una; el logo y el membrete quedan afuera a propósito, porque el
        encabezado ya los pone.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {imagenes.map((imagen) => {
          const url = urls[imagen.indice];
          const marcada = fotos.includes(imagen.indice);
          return (
            <div
              key={imagen.indice}
              className={`rounded-lg border p-2 transition ${
                marcada ? "border-naranjo/60 bg-superficie" : "border-borde bg-superficie/50"
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
              <label className="mt-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="foto"
                  value={imagen.indice}
                  defaultChecked={marcada}
                  disabled={!editable}
                  className="h-3.5 w-3.5 accent-naranjo"
                />
                <span className="text-[11px] font-medium text-tinta/70">En el anexo</span>
              </label>
              <p className="mt-1 text-[10px] tabular-nums text-tinta/40">
                {imagen.ancho}×{imagen.alto} · nº {imagen.indice}
              </p>
              <label className="mt-1 flex items-center gap-2">
                <input
                  type="radio"
                  name="firma"
                  value={imagen.indice}
                  defaultChecked={firma === imagen.indice}
                  disabled={!editable}
                  className="h-3.5 w-3.5 accent-teal"
                />
                <span className="text-[10px] text-tinta/45">Es la firma</span>
              </label>
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg border border-borde px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Aplicar al documento
          </button>
          <label className="flex items-center gap-2 text-[11px] text-tinta/45">
            <input
              type="radio"
              name="firma"
              value="0"
              defaultChecked={firma === null}
              className="h-3.5 w-3.5"
            />
            Ninguna es la firma
          </label>
        </div>
      )}
    </form>
  );
}
