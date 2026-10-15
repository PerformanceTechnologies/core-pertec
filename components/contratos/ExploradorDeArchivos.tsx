"use client";

import { useState, useTransition } from "react";
import Link from "@/components/contratos/Enlace";
import { useRouter } from "next/navigation";
import {
  IconExternalLink,
  IconEye,
  IconFile,
  IconFolder,
  IconMessage,
  IconTrash,
} from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import VisorDeDocumento, { type DocumentoVisible } from "./VisorDeDocumento";
import SelectorDeEstadoDeArchivo from "./SelectorDeEstadoDeArchivo";
import SubidaEnLinea from "./SubidaEnLinea";
import {
  eliminarArchivoDeCarpetaAction,
  enlaceDeArchivoAction,
} from "@/app/(protegido)/contratos/[contrato]/acciones";
import { ETIQUETAS, type EstadoRequisito } from "@/lib/contratos/contratos-estado";
import type { EstadoDeArchivo } from "@/lib/contratos/documento-estado";
import { usePuede } from "./PermisosDelUsuario";

export interface ElementoDeLista {
  id: string;
  nombre: string;
  esCarpeta: boolean;
  /** A dónde lleva, si es carpeta. */
  href: string | null;
  /** La ruta relativa a la carpeta raíz, para pedir el enlace del archivo. */
  ruta: string;
  /** Peso si es archivo, cuántos elementos si es carpeta. */
  detalle: string;
  modificado: string;
  modificadoPor: string | null;
  sePuedeVer: boolean;
  webUrl: string;
  /** El estado del requisito, si la fila es una carpeta. */
  estado: EstadoRequisito | null;
  /** La etapa de revisión (Borrador, En revisión, Validado), si la fila es un archivo. */
  estadoDeArchivo?: EstadoDeArchivo | null;
  /** «Fulano, 05-10-2026»: quién dejó el archivo en esa etapa. */
  estadoDeArchivoPor?: string | null;
  /** Quién subió el archivo. Lo sabe SharePoint. */
  subidoPor: string | null;
  /** El comentario que dejó quien lo subió desde el core, si dejó alguno. */
  comentario: string | null;
  comentarioAutor: string | null;
}

export default function ExploradorDeArchivos({
  seccion,
  elementos,
  subida,
  soloLectura = false,
}: {
  seccion: string;
  elementos: ElementoDeLista[];
  /**
   * Un visor: sin eliminar ni subir. Es la carpeta de Acreditación, cuyos archivos se mantienen
   * desde ese módulo. Los botones se esconden, y las acciones del servidor además se niegan.
   */
  soloLectura?: boolean;
  /** Las acciones para subir desde una fila. Sin esto, las filas no ofrecen subir. */
  subida?: {
    prepararSubida: (
      seccion: string,
      rutaCarpeta: string,
      nombre: string,
    ) => Promise<{ url: string }>;
    registrarSubida: (datos: {
      seccion: string;
      itemIdArchivo: string;
      rutaArchivo: string;
      comentario: string;
      itemIdCarpeta: string | null;
      rutaCarpeta: string;
    }) => Promise<void>;
    refrescar: (seccion: string, rutaCarpeta: string) => Promise<void>;
  };
}) {
  const puedeEditar = usePuede("editar");
  const router = useRouter();
  const [abierto, setAbierto] = useState<DocumentoVisible | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [borrando, iniciarBorrado] = useTransition();
  const [errorAlBorrar, setErrorAlBorrar] = useState<string | null>(null);

  function eliminar(elemento: ElementoDeLista) {
    const aviso =
      `¿Eliminar «${elemento.nombre}»?\n\n` +
      "También se elimina en SharePoint: va a la papelera del sitio, de donde se puede restaurar.";
    if (!window.confirm(aviso)) return;

    setErrorAlBorrar(null);
    iniciarBorrado(async () => {
      // La carpeta es la ruta del archivo menos su nombre: es lo que hay que
      // volver a pedirle al servidor para que la lista se redibuje sin él.
      const carpeta = elemento.ruta.split("/").slice(0, -1).join("/");
      const resultado = await eliminarArchivoDeCarpetaAction(seccion, elemento.id, carpeta);
      if (resultado.error) setErrorAlBorrar(resultado.error);
      else router.refresh();
    });
  }

  // La columna de estado existe solo si alguna fila lo tiene: las carpetas son
  // tarjetas o filas de lista, así que esta tabla suele traer solo archivos, y estos
  // sí tienen una etapa de revisión (Borrador / En revisión / Validado). Una columna
  // vacía en todas las filas solo le roba ancho a los nombres, que acá son larguísimos.
  const hayEstados = elementos.some((e) => e.estado || e.estadoDeArchivo);

  // En el celular la columna de estado le quita al nombre casi todo el ancho —quedaba
  // «Con…»—, así que ahí solo se muestra si hay carpetas con estado (que no tienen otro
  // sitio). Para los archivos, la pastilla va DEBAJO del nombre en pantalla chica, y en
  // su propia columna desde `sm`.
  const columnaEnMovil = elementos.some((e) => e.estado);
  const claseColumna = columnaEnMovil ? "" : "hidden sm:table-cell";

  async function abrir(elemento: ElementoDeLista) {
    setCargando(elemento.id);
    try {
      const { url, urlDescarga } = await enlaceDeArchivoAction(seccion, elemento.ruta);
      setAbierto({
        nombre: elemento.nombre,
        url: url ?? "",
        urlDescarga: urlDescarga ?? "",
        webUrl: elemento.webUrl,
        // Sin URL no hay nada que mostrar: el visor cae al estado de "no se
        // puede ver acá", que al menos ofrece abrirlo en SharePoint.
        sePuedeVer: Boolean(url) && elemento.sePuedeVer,
        esImagen: /\.(png|jpe?g|gif|webp|svg)$/i.test(elemento.nombre),
      });
    } finally {
      setCargando(null);
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        {/* table-fixed + una primera columna con max-w-0.
            Sin esto, la columna del nombre crece con el nombre más largo —y acá
            son larguísimos: "8.- Comprobante de recepción entrega reglamento
            especial empresa contratista firmado por rep"— y empuja las demás
            fuera de la tarjeta. El truco de `max-w-0` sobre una celda al 100%
            hace que absorba el ancho sobrante y trunque, en vez de exigirlo. */}
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-borde bg-fondo/60 text-[11px] uppercase tracking-wide text-gris">
            <tr>
              <th className="w-full max-w-0 px-4 py-3 font-bold sm:px-5">Nombre</th>
              {hayEstados && <th className={`w-36 px-3 py-3 font-bold sm:px-5 ${claseColumna}`}>Estado</th>}
              <th className="hidden w-28 px-5 py-3 font-bold sm:table-cell">Contenido</th>
              <th className="hidden w-36 px-5 py-3 font-bold md:table-cell">Modificado</th>
              <th className="w-20 px-4 py-3 text-right font-bold sm:w-32 sm:px-5">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {elementos.map((elemento) => (
              <tr key={elemento.id} className="group transition hover:bg-cian-lavado/60">
                <td className="max-w-0 px-4 py-3 sm:px-5">
                  {elemento.esCarpeta ? (
                    <Link
                      href={elemento.href!}
                      className="flex min-w-0 items-center gap-2 font-semibold text-tinta transition group-hover:text-azul"
                    >
                      <IconFolder size={17} className="shrink-0 text-cian" />
                      <span className="min-w-0 truncate">{elemento.nombre}</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => void abrir(elemento)}
                      disabled={cargando === elemento.id}
                      className="flex min-w-0 max-w-full items-center gap-2 text-left"
                    >
                      {cargando === elemento.id ? (
                        <RuedaCarga className="h-[17px] w-[17px] shrink-0 text-cian" />
                      ) : (
                        <IconFile size={17} className="shrink-0 text-gris-suave" />
                      )}
                      <span className="min-w-0 truncate font-semibold text-tinta group-hover:text-azul">
                        {elemento.nombre}
                      </span>
                      <IconEye
                        size={15}
                        className="shrink-0 text-cian opacity-0 transition group-hover:opacity-100"
                      />
                    </button>
                  )}

                  {/* El comentario va bajo el nombre y no en una columna propia:
                      la mayoría de los archivos no tiene, y una columna vacía en
                      nueve de cada diez filas solo roba ancho a los nombres, que
                      acá son largos. */}
                  {elemento.estadoDeArchivo && !columnaEnMovil && (
                    <div className="mt-1.5 sm:hidden">
                      <SelectorDeEstadoDeArchivo
                        // La clave incluye el estado: si el servidor devuelve otro (el
                        // cambio se hizo en la otra copia del selector, o desde otra
                        // sesión), este se vuelve a montar con el valor nuevo.
                        key={`${elemento.id}-${elemento.estadoDeArchivo}`}
                        seccion={seccion}
                        itemId={elemento.id}
                        ruta={elemento.ruta}
                        estadoInicial={elemento.estadoDeArchivo}
                        cambiadoPor={elemento.estadoDeArchivoPor}
                      />
                    </div>
                  )}

                  {elemento.comentario && (
                    <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-gris">
                      <IconMessage size={13} className="mt-px shrink-0 text-cian" />
                      <span>
                        {elemento.comentario}
                        {elemento.comentarioAutor && (
                          <span className="text-gris-suave"> — {elemento.comentarioAutor}</span>
                        )}
                      </span>
                    </p>
                  )}
                </td>

                {hayEstados && (
                  <td className={`px-3 py-3 sm:px-5 ${claseColumna}`}>
                    {elemento.estado ? (
                      <Insignia estado={elemento.estado} />
                    ) : elemento.estadoDeArchivo ? (
                      <SelectorDeEstadoDeArchivo
                        key={`${elemento.id}-${elemento.estadoDeArchivo}`}
                        seccion={seccion}
                        itemId={elemento.id}
                        ruta={elemento.ruta}
                        estadoInicial={elemento.estadoDeArchivo}
                        cambiadoPor={elemento.estadoDeArchivoPor}
                      />
                    ) : null}
                  </td>
                )}

                <td className="hidden px-5 py-3 tabular-nums text-gris sm:table-cell">
                  {elemento.detalle}
                </td>

                <td className="hidden px-5 py-3 text-xs tabular-nums text-gris md:table-cell">
                  {elemento.modificado}
                  {/* Quien SUBIÓ, no quien modificó por última vez: en un
                      expediente de contratos, el dato que alguien busca meses
                      después es quién lo entregó. */}
                  {(elemento.subidoPor ?? elemento.modificadoPor) && (
                    <span className="block text-[11px] text-gris-suave">
                      {elemento.subidoPor ?? elemento.modificadoPor}
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-end gap-3">
                    {/* Subir a una carpeta sin entrar en ella: con quince
                        requisitos, entrar y volver por cada uno son cuarenta y
                        cinco navegaciones para subir quince archivos. */}
                    {elemento.esCarpeta && subida && (
                      <SubidaEnLinea
                        seccion={seccion}
                        nombre={elemento.nombre}
                        ruta={elemento.ruta}
                        itemId={elemento.id}
                        prepararSubida={subida.prepararSubida}
                        registrarSubida={subida.registrarSubida}
                        refrescar={subida.refrescar}
                      />
                    )}

                    {/* Borrar va por Graph con el token de quien pulsa, así que
                        los permisos del sitio siguen mandando —si no puede borrar
                        allá, tampoco acá— y el archivo va a la papelera de
                        SharePoint, de donde se restaura. */}
                    {!elemento.esCarpeta && !soloLectura && puedeEditar && (
                      <button
                        type="button"
                        onClick={() => eliminar(elemento)}
                        disabled={borrando}
                        title={`Eliminar ${elemento.nombre}`}
                        aria-label={`Eliminar ${elemento.nombre}`}
                        className="inline-flex items-center rounded-lg p-1 text-gris-suave transition hover:bg-red-50 hover:text-red-600 disabled:cursor-progress disabled:opacity-60"
                      >
                        {borrando ? (
                          <RuedaCarga className="h-[13px] w-[13px]" />
                        ) : (
                          <IconTrash size={13} />
                        )}
                      </button>
                    )}

                    <a
                      href={elemento.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir en SharePoint"
                      className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris-suave transition hover:text-azul"
                    >
                      <IconExternalLink size={13} />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errorAlBorrar && (
        <p role="alert" className="border-t border-borde px-5 py-3 text-xs font-semibold text-red-600">
          {errorAlBorrar}
        </p>
      )}

      <VisorDeDocumento documento={abierto} alCerrar={() => setAbierto(null)} />
    </>
  );
}

/**
 * El estado, de un vistazo.
 *
 * "Pendiente" va en gris y no en ámbar: en una lista de ocho requisitos recién
 * empezados, ocho insignias de alerta no avisan de nada — solo hacen ruido. El
 * color se reserva para lo que ya cambió.
 */
function Insignia({ estado }: { estado: EstadoRequisito }) {
  const clases: Record<EstadoRequisito, string> = {
    subido: "bg-emerald-50 text-emerald-700",
    no_aplica: "bg-borde/70 text-gris",
    pendiente: "bg-transparent text-gris-suave",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${clases[estado]}`}
    >
      {ETIQUETAS[estado]}
    </span>
  );
}
