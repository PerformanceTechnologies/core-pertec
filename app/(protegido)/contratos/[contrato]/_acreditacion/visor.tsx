import Link from "@/components/contratos/Enlace";
import {
  IconAlertTriangle,
  IconChevronRight,
  IconEye,
  IconExternalLink,
  IconFolder,
  IconId,
  IconUserOff,
} from "@tabler/icons-react";
import BarraDeAvance from "@/components/contratos/BarraDeAvance";
import ExploradorDeArchivos, { type ElementoDeLista } from "@/components/contratos/ExploradorDeArchivos";
import { TARJETA } from "@/lib/contratos/estilos";
import { formatearRut } from "@/lib/contratos/rut";
import { comentariosDe } from "@/lib/contratos/contratos-comentarios";
import {
  cargarAcreditacionParaDocumentos,
  unidadDeCarpeta,
  type AcreditacionParaDocumentos,
  type UnidadDeLaCarpeta,
} from "@/lib/contratos/acreditacion-en-documentos";
import {
  acreditacionDeRuta,
  enlaceDeCarpeta,
  esCarpetaDeAcreditacion,
  formatearPeso,
  obtenerCarpeta,
  sePuedeVerEnLinea,
  type ElementoSharePoint,
  type Seccion,
  type TipoDeAcreditacion,
} from "@/lib/contratos/sharepoint";

/** Cómo se llama el submódulo y lo que se acredita, en los textos del visor. */
const TEXTOS = {
  personas: {
    modulo: "Acreditación Personas",
    ruta: "/contratos/acreditacion",
    unaUnidad: "persona",
    activas: ["persona activa", "personas activas"],
    acreditadas: ["acreditada", "acreditadas"],
    cuentaDe: "(documentos al 100%, Web Control y BUK)",
    expedientes: "Todavía no hay expedientes",
    cargaDesde: "Los documentos se cargan desde la ficha de cada persona en Acreditación Personas.",
    sinAsociar: "Esta carpeta no está asociada a ninguna persona de la nómina",
    suFicha: "Abrir su ficha",
  },
  vehiculos: {
    modulo: "Acreditación Vehículos",
    ruta: "/contratos/acreditacion-vehiculos",
    unaUnidad: "vehículo",
    activas: ["vehículo activo", "vehículos activos"],
    acreditadas: ["acreditado", "acreditados"],
    cuentaDe: "(documentos al 100% y Web Control)",
    expedientes: "Todavía no hay expedientes de vehículos",
    cargaDesde: "Los documentos se cargan desde la ficha de cada vehículo en Acreditación Vehículos.",
    sinAsociar: "Esta carpeta no está asociada a ningún vehículo de la flota",
    suFicha: "Abrir su ficha",
  },
} as const;

/** El color de una etapa, por su clave: pendiente de documentos, en Web Control, o completa. */
function claseDeEtapa(clave: string): string {
  if (clave === "acreditada" || clave === "acreditado") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (clave === "documentacion") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-cian/50 bg-cian-lavado text-azul";
}

function ChipDeEtapaDeLaUnidad({ etapa }: { etapa: UnidadDeLaCarpeta["etapa"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${claseDeEtapa(etapa.clave)}`}
    >
      {etapa.etiqueta}
    </span>
  );
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Un archivo como fila de la tabla: sin etapa de revisión (ver abajo) ni nada que lo modifique. */
function comoFila(
  el: ElementoSharePoint,
  comentarios: Awaited<ReturnType<typeof comentariosDe>>,
): ElementoDeLista {
  return {
    id: el.id,
    nombre: el.nombre,
    esCarpeta: false,
    href: null,
    ruta: el.ruta,
    detalle: formatearPeso(el.tamano),
    modificado: fechaCorta(el.modificadoEn),
    modificadoPor: el.modificadoPor,
    sePuedeVer: sePuedeVerEnLinea(el.nombre),
    webUrl: el.webUrl,
    estado: null,
    // Sin etapa de revisión a propósito: Borrador / En revisión / Validado es una forma de
    // trabajar los documentos de Contrato DCH. Estos los valida el submódulo de acreditación, que
    // sabe a qué documento exigido corresponde cada archivo, y ese es el estado que cuenta.
    estadoDeArchivo: null,
    estadoDeArchivoPor: null,
    subidoPor: el.subidoPor,
    comentario: comentarios.get(el.id)?.comentario ?? null,
    comentarioAutor: comentarios.get(el.id)?.autor ?? null,
  };
}

/** El aviso de arriba: lo que se ve acá, y dónde se hace lo demás. */
function AvisoDeSoloLectura({
  tipo,
  href,
  etiqueta,
}: {
  tipo: TipoDeAcreditacion;
  href: string;
  etiqueta: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cian/40 bg-cian-lavado px-4 py-3">
      <p className="flex min-w-0 items-start gap-2.5 text-xs leading-relaxed text-azul">
        <IconEye size={17} className="mt-px shrink-0" />
        <span>
          <strong className="font-bold">Solo lectura.</strong> Los documentos se cargan y se actualizan desde{" "}
          {TEXTOS[tipo].modulo}; acá se ven los archivos y cuánto va el proceso real.
        </span>
      </p>
      <Link
        href={href}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-azul px-3.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave"
      >
        <IconId size={15} />
        {etiqueta}
      </Link>
    </div>
  );
}

/**
 * Una carpeta de persona o de vehículo de la lista: su avance REAL, no cuántos archivos tiene.
 *
 * El avance sale del submódulo —documentos cargados y vigentes sobre los que se le exigen—, y por
 * eso uno con tres archivos puede estar al 40% y otro con uno solo, al 100%. Dos enlaces y no uno:
 * la fila lleva a los archivos, y «Ficha» a donde se gestiona todo.
 */
function FilaDeUnidad({
  tipo,
  carpeta,
  href,
  unidad,
}: {
  tipo: TipoDeAcreditacion;
  carpeta: ElementoSharePoint;
  href: string;
  unidad: UnidadDeLaCarpeta | null;
}) {
  const completa = unidad !== null && unidad.avance.total > 0 && unidad.avance.subidos === unidad.avance.total;

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_15rem_auto] lg:items-center lg:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cian-lavado text-azul">
          <IconFolder size={18} stroke={1.75} />
        </span>
        <div className="min-w-0">
          <Link
            href={href}
            prefetch={false}
            className="titular block truncate text-sm text-azul transition hover:underline"
          >
            {unidad?.nombre ?? carpeta.nombre}
          </Link>
          <p className="truncate text-[11px] text-gris">
            {unidad ? (
              <>
                {tipo === "personas" ? formatearRut(unidad.detalle) : unidad.detalle || "—"}
                {!unidad.activo && <span className="ml-2 font-bold text-gris-suave">· De baja</span>}
              </>
            ) : (
              carpeta.nombre
            )}
          </p>
        </div>
      </div>

      {unidad ? (
        <>
          <div>
            <ChipDeEtapaDeLaUnidad etapa={unidad.etapa} />
          </div>

          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="barra-estado flex-1"
              data-estado={completa ? "completa" : unidad.avance.subidos === 0 ? "sin" : "curso"}
              aria-hidden
            >
              <i style={{ width: `${unidad.avance.porcentaje}%` }} />
            </div>
            <span className="w-9 text-right text-xs font-extrabold tabular-nums text-tinta">
              {unidad.avance.porcentaje}%
            </span>
          </div>
        </>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 lg:col-span-2">
          <IconUserOff size={14} />
          {TEXTOS[tipo].sinAsociar}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 text-xs font-bold uppercase tracking-wide">
        {unidad && (
          <Link href={`${TEXTOS[tipo].ruta}/${unidad.id}`} className="text-azul transition hover:underline">
            Ficha
          </Link>
        )}
        <Link href={href} prefetch={false} className="inline-flex items-center gap-0.5 text-gris transition hover:text-azul">
          Archivos
          <IconChevronRight size={15} />
        </Link>
      </div>
    </li>
  );
}

/** Lo que dibuja el visor, ya leído: separado de la lectura para poder verlo con datos de ejemplo. */
export interface DatosDelVisor {
  tipo: TipoDeAcreditacion;
  esRaiz: boolean;
  /** El submódulo, o null si no se pudo leer. */
  datos: AcreditacionParaDocumentos | null;
  /** La persona o el vehículo dueño de la carpeta en la que uno está (solo dentro de un expediente). */
  unidad: UnidadDeLaCarpeta | null;
  carpetas: { carpeta: ElementoSharePoint; href: string; unidad: UnidadDeLaCarpeta | null }[];
  filas: ElementoDeLista[];
  urlCarpeta: string | null;
  seccion: string;
}

export function VistaDeAcreditacion({ tipo, esRaiz, datos, unidad, carpetas, filas, urlCarpeta, seccion }: DatosDelVisor) {
  const t = TEXTOS[tipo];

  return (
    <>
      <AvisoDeSoloLectura
        tipo={tipo}
        href={unidad ? `${t.ruta}/${unidad.id}` : t.ruta}
        etiqueta={unidad ? t.suFicha : `Ir a ${t.modulo}`}
      />

      {!datos && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
          <IconAlertTriangle size={16} />
          No se pudo leer {t.modulo}: se ven los archivos, pero no el avance.
        </p>
      )}

      {/* El avance de arriba. En la raíz, el de todo el submódulo; dentro de un expediente, el suyo. */}
      {datos && esRaiz && (
        <>
          <BarraDeAvance
            avance={datos.total}
            titulo="Avance real de la acreditación"
            unidad="documentos cargados y vigentes"
          />
          <p className="mt-2 text-xs text-gris">
            {datos.unidades} {datos.unidades === 1 ? t.activas[0] : t.activas[1]} · {datos.acreditadas}{" "}
            {datos.acreditadas === 1 ? t.acreditadas[0] : t.acreditadas[1]} {t.cuentaDe}. Es la cuenta del
            submódulo: un documento vencido u observado no cuenta.
          </p>
        </>
      )}
      {unidad && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="titular text-lg text-azul">{unidad.nombre}</h2>
            <ChipDeEtapaDeLaUnidad etapa={unidad.etapa} />
            {!unidad.activo && (
              <span className="rounded-lg border border-borde bg-fondo px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gris">
                De baja
              </span>
            )}
          </div>
          <p className="text-xs text-gris">{tipo === "personas" ? formatearRut(unidad.detalle) : unidad.detalle || "—"}</p>
          <BarraDeAvance
            avance={unidad.avance}
            titulo="Avance de su documentación"
            unidad="documentos cargados y vigentes"
          />
          {(unidad.vencidos > 0 || unidad.porVencer > 0) && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              {unidad.vencidos > 0 && `${unidad.vencidos} vencido${unidad.vencidos === 1 ? "" : "s"}`}
              {unidad.vencidos > 0 && unidad.porVencer > 0 && " · "}
              {unidad.porVencer > 0 && `${unidad.porVencer} por vencer`}
            </p>
          )}
        </div>
      )}

      {/* Las carpetas, con su avance real. */}
      {carpetas.length > 0 && (
        <ul className={`${TARJETA} mt-6 divide-y divide-borde overflow-hidden`}>
          {carpetas.map((c) => (
            <FilaDeUnidad key={c.carpeta.id} tipo={tipo} carpeta={c.carpeta} href={c.href} unidad={c.unidad} />
          ))}
        </ul>
      )}

      {/* Los archivos, solo para ver. */}
      {filas.length > 0 ? (
        <div className={`${TARJETA} mt-6 overflow-hidden`}>
          <ExploradorDeArchivos seccion={seccion} elementos={filas} soloLectura />
        </div>
      ) : (
        carpetas.length === 0 && (
          <div className={`${TARJETA} mt-6 p-10 text-center`}>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cian-lavado text-azul">
              <IconFolder size={24} />
            </span>
            <p className="mt-4 text-sm font-semibold text-tinta">
              {esRaiz ? t.expedientes : "Esta carpeta no tiene archivos"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-gris">{t.cargaDesde}</p>
          </div>
        )
      )}

      {urlCarpeta && (
        <div className="mt-6 flex justify-end">
          <a
            href={urlCarpeta}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
          >
            Abrir en SharePoint
            <IconExternalLink size={14} />
          </a>
        </div>
      )}
    </>
  );
}

/**
 * La carpeta de Acreditación Personas (1.3) o de Acreditación Vehículos (1.4), y lo que cuelga de
 * ella, como VISOR.
 *
 * Es el archivo de cada submódulo: una carpeta por persona o por vehículo con los documentos que se
 * cargan desde su ficha. Contrato DCH la mostraba como cualquier otra carpeta —con botones de
 * subir y eliminar, estados a mano y un porcentaje de «carpetas con algo adentro»— y eso permitía
 * modificar un expediente por fuera del proceso que lo valida, y daba un avance que no era el real.
 *
 * Acá:
 *  · NO se sube, se crea ni se elimina nada (y las acciones del servidor también se niegan);
 *  · el avance es el que dice el submódulo: documentos cargados y vigentes sobre los que cada cargo
 *    o tipo de vehículo exige, con la misma cuenta de la nómina y de la flota;
 *  · cada uno lleva a su ficha, que es donde se gestiona.
 */
export async function VisorDeAcreditacion({
  seccion,
  rutaRelativa,
  elementos,
}: {
  seccion: Seccion;
  rutaRelativa: string;
  elementos: ElementoSharePoint[];
}) {
  // Quien llama ya comprobó que la ruta es de una carpeta de acreditación; el respaldo es por tipar.
  const tipo = acreditacionDeRuta(rutaRelativa) ?? "personas";
  const esRaiz = esCarpetaDeAcreditacion(rutaRelativa);
  const archivos = elementos.filter((e) => !e.esCarpeta);

  // El submódulo es la fuente del avance. Si no se puede leer, el visor sigue mostrando los archivos y
  // lo dice, en vez de inventar un porcentaje a partir de ellos.
  let datos: AcreditacionParaDocumentos | null = null;
  try {
    datos = await cargarAcreditacionParaDocumentos(tipo);
  } catch (e) {
    console.error(`[contratos] No se pudo leer ${TEXTOS[tipo].modulo} para el visor: ${e instanceof Error ? e.message : e}`);
  }

  const [comentarios, carpetaActual, urlCarpeta] = await Promise.all([
    comentariosDe(archivos.map((a) => a.id)),
    esRaiz ? Promise.resolve(null) : obtenerCarpeta(seccion, rutaRelativa),
    enlaceDeCarpeta(seccion, rutaRelativa),
  ]);

  return (
    <VistaDeAcreditacion
      tipo={tipo}
      seccion={seccion.slug}
      esRaiz={esRaiz}
      datos={datos}
      unidad={datos && carpetaActual ? unidadDeCarpeta(datos, carpetaActual) : null}
      carpetas={elementos
        .filter((e) => e.esCarpeta)
        .map((c) => ({
          carpeta: c,
          href: `/contratos/${c.ruta.split("/").map(encodeURIComponent).join("/")}`,
          unidad: datos ? unidadDeCarpeta(datos, c) : null,
        }))}
      filas={archivos.map((a) => comoFila(a, comentarios))}
      urlCarpeta={urlCarpeta}
    />
  );
}
