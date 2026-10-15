import Link from "@/components/contratos/Enlace";
import { IconChevronRight, IconFileDescription, IconFolder } from "@tabler/icons-react";
import type { Avance } from "@/lib/contratos/contratos-estado";
import {
  ESTADOS_DE_ARCHIVO,
  ETIQUETAS_DE_ETAPA,
  etapaUnica,
  type EstadoDeArchivo,
  type RevisionDeCarpeta,
} from "@/lib/contratos/documento-estado";
import { estadoDeAvance, etiquetaDeEstado, type EstadoVisual } from "@/lib/contratos/estado-de-avance";
import BarraDeEtapas, { cantidadDeEtapa, textoDeEtapas } from "./BarraDeEtapas";

/** El `data-estado` de cada etapa: el que pinta la franja y la etiqueta de la fila. */
const VISUAL_DE_ETAPA: Record<EstadoDeArchivo, string> = {
  borrador: "borrador",
  en_revision: "revision",
  validado: "validado",
};

/**
 * «3 archivos · 1 validado · 2 en revisión». Con un solo archivo no se repite su etapa: ya
 * la dice la etiqueta de la fila.
 */
function textoDeArchivos(archivos: Record<EstadoDeArchivo, number>): string | null {
  const total = archivos.borrador + archivos.en_revision + archivos.validado;
  if (total === 0) return null;
  if (total === 1) return "1 archivo";

  const partes = [...ESTADOS_DE_ARCHIVO]
    .reverse()
    .filter((e) => archivos[e] > 0)
    .map((e) => cantidadDeEtapa(e, archivos[e]));
  return `${total} archivos · ${partes.join(" · ")}`;
}

/**
 * Un requisito se entrega o no: no tiene «en curso», y el chip tiene que decir lo que es.
 *
 * «Vacía» tiene dos orígenes: marcado «no aplica», o una carpeta que no se pudo leer
 * (sin acceso en SharePoint). Se distinguen por `noAplican`: llamar «No aplica» a una
 * carpeta que simplemente no se pudo abrir esconde el problema.
 */
function etiquetaDeRequisito(estado: EstadoVisual, avance: Avance): string | undefined {
  if (estado === "sin") return "Pendiente";
  if (estado === "completa") return "Subido";
  if (estado === "vacia") return avance.noAplican > 0 ? "No aplica" : "Sin datos";
  return undefined;
}

/** El chip de la carpeta de Acreditación: no «Subido», que se entrega o no, sino cuánto va. */
function etiquetaDeAcreditacion(avance: Avance): string {
  if (avance.total === 0) return "Sin datos";
  if (avance.subidos === avance.total) return "Completa";
  return avance.subidos === 0 ? "Pendiente" : "En curso";
}

/**
 * Una carpeta de DENTRO de un módulo, como fila de una lista.
 *
 * Eran tarjetas, y con 31 requisitos en una carpeta eso eran once filas de tarjetas
 * de 370 px: para ver cuál faltaba había que recorrer toda la pantalla. En una lista
 * se escanea de un vistazo, el estado se lee en la columna del chip y el responsable
 * queda alineado debajo del anterior.
 *
 * Mismo lenguaje visual que la tarjeta de la portada —franja de color, chip y barra
 * con el par del estado—, y la misma regla del enlace estirado: toda la fila entra a la
 * carpeta, y lo interactivo del costado (responsable, subir) va con z-10 por encima.
 *
 * Una carpeta que AGRUPA muestra su avance (barra y «x de y»); un requisito, que se
 * entrega o no, solo su estado.
 */
export default function FilaDeCarpeta({
  nombre,
  href,
  avance,
  esRequisito,
  revision,
  responsable,
  accion,
  acreditacion,
}: {
  nombre: string;
  href: string;
  avance: Avance;
  /** Una hoja: recibe documentos, y no tiene carpetas debajo que contar. */
  esRequisito: boolean;
  /**
   * En qué etapa de revisión va lo que hay dentro. Sin esto, la fila muestra solo el estado
   * (pendiente / subido): es lo que pasa cuando la carpeta no se pudo leer.
   */
  revision?: RevisionDeCarpeta;
  /** El selector de responsable, solo en los requisitos. */
  responsable?: React.ReactNode;
  /** Subir sin entrar, y el enlace a SharePoint. */
  accion?: React.ReactNode;
  /**
   * Solo la carpeta de Acreditación (1.3): su avance no es el de una carpeta con archivos sino el
   * que dice el submódulo —documentos cargados y vigentes sobre los exigidos—. Con esto la fila,
   * aunque sea un requisito, muestra su porcentaje real y no solo «Pendiente».
   */
  acreditacion?: { avance: Avance; detalle: string };
}) {
  // Con avance real, es ese el que pinta la fila: el color, la etiqueta y la barra.
  const visual = acreditacion?.avance ?? avance;
  const estadoBase = estadoDeAvance(visual);

  // Un requisito ya entregado dice en qué etapa va —Borrador, En revisión, Validado— en vez
  // del genérico «Subido»; uno pendiente o que no aplica conserva su etiqueta de siempre.
  const etapa = esRequisito && revision ? etapaUnica(revision.etapas) : null;
  const conEtapa = etapa !== null && etapa !== "pendiente";

  const estado: string = conEtapa ? VISUAL_DE_ETAPA[etapa] : estadoBase;
  const etiqueta = acreditacion
    ? etiquetaDeAcreditacion(acreditacion.avance)
    : conEtapa
      ? ETIQUETAS_DE_ETAPA[etapa]
      : (esRequisito && etiquetaDeRequisito(estadoBase, avance)) || etiquetaDeEstado(estadoBase);
  const Icono = esRequisito ? IconFileDescription : IconFolder;
  const archivos = esRequisito && revision ? textoDeArchivos(revision.archivos) : null;

  return (
    <li
      data-estado={estado}
      className="fila-estado group flex flex-col gap-2.5 py-3 pl-5 pr-4 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem_11rem_auto] lg:items-center lg:gap-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="tarjeta-icono" aria-hidden>
          <Icono size={19} stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            // Sin precarga. Con 14 requisitos en la lista, el navegador pedía las 14
            // páginas apenas aparecían —14 ejecuciones del servidor, cada una con sus
            // llamadas a SharePoint— aunque la persona abriera una sola, y lo repetía
            // en cada visita a la lista. Al hacer clic, el esqueleto de carga (loading.tsx)
            // responde igual de rápido.
            prefetch={false}
            className="titular block text-sm leading-snug text-azul [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']"
          >
            {nombre}
          </Link>
          {!esRequisito && avance.total > 0 && (
            <p className="text-[11px] text-gris">
              {avance.total} {avance.total === 1 ? "requisito" : "requisitos"}
              {avance.pendientes > 0 && (
                <>
                  {" · "}
                  <span className="font-bold text-amber-600">faltan {avance.pendientes}</span>
                </>
              )}
              {revision && revision.etapas.validado > 0 && (
                <>
                  {" · "}
                  <span className="font-bold text-emerald-700">
                    {revision.etapas.validado} {revision.etapas.validado === 1 ? "validado" : "validados"}
                  </span>
                </>
              )}
            </p>
          )}
          {acreditacion ? (
            <p className="text-[11px] text-gris">{acreditacion.detalle}</p>
          ) : (
            archivos && <p className="text-[11px] text-gris">{archivos}</p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <span className="tarjeta-chip">{etiqueta}</span>
        {(acreditacion ? visual.total > 0 : !esRequisito && avance.total > 0) && (
          <div
            className="flex min-w-0 flex-1 items-center gap-2"
            role="img"
            aria-label={`${visual.porcentaje}% ${acreditacion ? "de los documentos cargados" : "subido"}${!acreditacion && revision ? `: ${textoDeEtapas(revision.etapas)}` : ""}`}
          >
            {/* Partida por etapa cuando se sabe (la fila de un grupo suma las de todos sus
                requisitos); si no, la barra de un solo color de siempre. */}
            {revision && !acreditacion ? (
              <div className="min-w-0 flex-1">
                <BarraDeEtapas etapas={revision.etapas} fina />
              </div>
            ) : (
              <div className="barra-estado flex-1" aria-hidden>
                <i style={{ width: `${visual.porcentaje}%` }} />
              </div>
            )}
            <span className="w-9 text-right text-xs font-extrabold tabular-nums text-tinta" aria-hidden>
              {visual.porcentaje}%
            </span>
          </div>
        )}
      </div>

      {/* z-10: el desplegable tiene que recibir el clic antes que el enlace estirado.
          Vacío se esconde en el celular —no deja un hueco entre filas— pero en
          pantalla ancha sigue ocupando su columna, para que las demás no se corran. */}
      <div className="relative z-10 min-w-0 empty:hidden lg:empty:block">{responsable}</div>

      <div className="flex items-center justify-end gap-3 text-gris">
        {/* z-10 por lo mismo: sin esto el clic en «Subir» lo recibe el enlace y uno
            entra a la carpeta. */}
        {accion && (
          // Con el dedo, los botones de esta franja miden 44 px (lo que recomiendan
          // Apple y Material); con mouse se quedan chicos para no engordar la lista.
          <span className="relative z-10 flex items-center gap-3 pointer-coarse:[&_a]:inline-flex pointer-coarse:[&_a]:min-h-11 pointer-coarse:[&_a]:min-w-11 pointer-coarse:[&_a]:items-center pointer-coarse:[&_a]:justify-center pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11">
            {accion}
          </span>
        )}
        <IconChevronRight
          size={18}
          className="hidden shrink-0 text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-azul lg:block"
          aria-hidden
        />
      </div>
    </li>
  );
}
