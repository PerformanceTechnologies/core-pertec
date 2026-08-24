import { NOMBRE_DE_SECCION, SECCIONES_CON_IMAGENES, type SeccionConImagenes } from "@/lib/ofertas/tipos";
import type { ImagenGuardada } from "@/lib/ofertas/imagenes";
import SubirImagenes from "@/components/ofertas/SubirImagenes";
import QuitarImagen from "@/components/ofertas/QuitarImagen";
import Plegable from "@/components/Plegable";

/**
 * Las imágenes de una oferta: las que traía el borrador y las que se agreguen acá,
 * para que la persona decida dónde va cada una.
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
 * Y por eso mismo va plegado: nueve miniaturas con su desplegable son la mitad de
 * la pantalla, y esto se toca una vez por oferta. Cerrado dice cuántas hay y
 * cuántas están puestas, que es lo único que hace falta saber desde afuera.
 *
 * Y lo que el borrador traía casi nunca es todo: una foto sacada después, un plano
 * que llegó por correo, una firma escaneada. Por eso también se agregan acá, y
 * conviven con las del archivo — la única diferencia es que una agregada se puede
 * quitar y una del borrador no (ver QuitarImagen).
 */
export default function ImagenesDeLaOferta({
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
  // Sin imágenes el panel sigue existiendo, porque ahora es de donde se agregan. En
  // una oferta emitida, en cambio, no hay nada que hacer con él.
  if (imagenes.length === 0 && !editable) return null;

  /** En qué sección está una imagen hoy, o "" si no se usa. */
  const seccionDe = (indice: number): string =>
    SECCIONES_CON_IMAGENES.find((seccion) => (porSeccion[seccion] ?? []).includes(indice)) ?? "";

  const enUso = imagenes.filter((imagen) => seccionDe(imagen.indice) !== "").length;
  const agregadas = imagenes.filter((imagen) => imagen.origen === "subida").length;
  const delBorrador = imagenes.length - agregadas;

  // Tener imágenes y que ninguna salga en el documento es el caso que hay que
  // mirar: o el modelo no supo ubicarlas, o alguien las dejó a medias. Ese abre.
  const ningunaPuesta = imagenes.length > 0 && enUso === 0;
  const estado =
    imagenes.length === 0
      ? "Ninguna todavía"
      : [
          `${delBorrador} del borrador`,
          agregadas > 0 ? `${agregadas} agregada${agregadas === 1 ? "" : "s"}` : "",
          `${enUso} en el documento`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <Plegable titulo="Imágenes del documento" estado={estado} alerta={ningunaPuesta} abierto={ningunaPuesta}>
      <form action={accion}>
        <input type="hidden" name="id" value={ofertaId} />

        <p className="max-w-[85ch] text-[11px] text-pretty text-tinta/45">
          Cada imagen sale en la sección que elijas, donde estaba en el borrador: un diagrama del trabajo va
          en la metodología y las fotos de faena en el anexo. El sistema propuso una ubicación mirando el
          texto que la rodeaba y su tamaño; el logo y el membrete quedan sin sección a propósito, porque el
          encabezado ya los pone. Podés agregar las que falten: se suman sin sección, hasta que elijas dónde
          va cada una.
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
                  <div className="flex items-center gap-2.5">
                    {imagen.origen === "subida" && editable && (
                      <QuitarImagen ofertaId={ofertaId} indice={imagen.indice} />
                    )}
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
              </div>
            );
          })}
          {editable && <SubirImagenes ofertaId={ofertaId} />}
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
              <input
                type="radio"
                name="firma"
                value="0"
                defaultChecked={firma === null}
                className="h-3 w-3"
              />
              Ninguna es la firma
            </label>
          </div>
        )}
      </form>
    </Plegable>
  );
}
