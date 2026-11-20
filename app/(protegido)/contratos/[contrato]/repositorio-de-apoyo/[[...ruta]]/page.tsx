import { notFound } from "next/navigation";
import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconBooks, IconChevronRight, IconFolder } from "@tabler/icons-react";
import ConectarSharePoint from "@/components/contratos/ConectarSharePoint";
import ExploradorDeArchivos, { type ElementoDeLista } from "@/components/contratos/ExploradorDeArchivos";
import { SoloSi } from "@/components/contratos/PermisosDelUsuario";
import SubidaEnLinea from "@/components/contratos/SubidaEnLinea";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { TARJETA } from "@/lib/contratos/estilos";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import {
  CARPETA_DEL_REPOSITORIO,
  NOMBRE_DEL_REPOSITORIO,
  RUTA_DEL_REPOSITORIO,
} from "@/lib/contratos/repositorio-modelo";
import {
  ErrorDeGraph,
  formatearPeso,
  listar,
  secciones,
  segmentosDeRuta,
  sePuedeVerEnLinea,
  type ElementoSharePoint,
} from "@/lib/contratos/sharepoint";
import {
  prepararSubidaAlRepositorioAction,
  refrescarRepositorioAction,
  registrarSubidaAlRepositorioAction,
} from "../../acciones-repositorio";

/**
 * El repositorio de apoyo: documentos de consulta que acompañan a los requisitos de Documentos
 * generales. No es un requisito ni cuenta en ninguna cifra (ver repositorio-modelo.ts).
 *
 * Es un árbol de carpetas como el de SharePoint: se entra a cualquier subcarpeta y se ven sus
 * archivos. La dirección lleva el camino DENTRO del repositorio
 * (/contratos/<contrato>/repositorio-de-apoyo/<carpeta>/<carpeta>), y el servidor le antepone la
 * carpeta del repositorio: no hay forma de pedir una carpeta de afuera.
 *
 * Lo ve cualquiera que tenga Contratos, en solo lectura: abrir y descargar. Subir y eliminar es de
 * quien puede configurar el módulo (Administrador y Usuario Especial); lo niegan las acciones del
 * servidor, y acá solo se esconden los botones.
 */
export default async function RepositorioDeApoyoPage({ params }: { params: Promise<{ ruta?: string[] }> }) {
  const usuario = await exigirAccesoApp("contratos");

  // El camino viene de la dirección: se decodifica y se valida (sin «..» ni caracteres que
  // SharePoint no admite). Una dirección mal formada es una página que no existe.
  const { ruta: segmentos = [] } = await params;
  let dentro: string[];
  try {
    dentro = segmentosDeRuta(segmentos.map(decodeURIComponent).join("/"));
  } catch {
    notFound();
  }

  // Igual que la página de carpetas: sin acceso a SharePoint, pedirlo es un paso, no un error.
  const conectado = await tieneAccesoASharePoint(usuario.correo);
  const seccion = (await secciones())[0];

  const enLaRaiz = dentro.length === 0;
  const rutaRelativa = [CARPETA_DEL_REPOSITORIO, ...dentro].join("/");

  let elementos: ElementoSharePoint[] = [];
  let error: string | null = null;

  try {
    if (conectado) elementos = await listar(seccion, rutaRelativa);
  } catch (e) {
    if (e instanceof ErrorDeGraph && e.estado === 404) {
      // La carpeta del repositorio se crea con la primera subida: que todavía no exista es «sin
      // documentos». Una SUBcarpeta que no existe, en cambio, es una dirección que no lleva a nada.
      if (!enLaRaiz) notFound();
    } else {
      error = e instanceof Error ? e.message : "No se pudo leer el repositorio en SharePoint.";
    }
  }

  const filas: ElementoDeLista[] = elementos
    .filter((el) => !esBasura(el.nombre))
    .map((el) => ({
      id: el.id,
      nombre: el.nombre,
      esCarpeta: el.esCarpeta,
      // La ruta del elemento empieza por la carpeta del repositorio; la dirección lleva solo lo de
      // adentro.
      href: el.esCarpeta ? `/contratos/${RUTA_DEL_REPOSITORIO}/${enDireccion(el.ruta.split("/").slice(1))}` : null,
      ruta: el.ruta,
      // El número de elementos que da SharePoint cuenta también los archivos basura, y no
      // coincidiría con lo que se ve: para una carpeta, solo se dice que lo es.
      detalle: el.esCarpeta ? "Carpeta" : formatearPeso(el.tamano),
      modificado: fechaCorta(el.modificadoEn),
      modificadoPor: el.modificadoPor,
      sePuedeVer: !el.esCarpeta && sePuedeVerEnLinea(el.nombre),
      webUrl: el.webUrl,
      // Sin estado de requisito ni etapa de revisión: no hay nada que revisar ni que entregar.
      estado: null,
      subidoPor: el.subidoPor,
      comentario: null,
      comentarioAutor: null,
    }));

  const titulo = enLaRaiz ? NOMBRE_DEL_REPOSITORIO : dentro[dentro.length - 1];
  const Icono = enLaRaiz ? IconBooks : IconFolder;

  return (
    <div className="animar-entrada">
      <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Ruta">
        <Miga href="/contratos">Resumen</Miga>
        <IconChevronRight size={13} className="text-gris-suave" />
        <Miga href={`/contratos/${encodeURIComponent("DOCUMENTOS GENERALES")}`}>DOCUMENTOS GENERALES</Miga>
        <IconChevronRight size={13} className="text-gris-suave" />
        {enLaRaiz ? (
          <span className="font-bold uppercase tracking-wide text-azul">{NOMBRE_DEL_REPOSITORIO}</span>
        ) : (
          <Miga href={`/contratos/${RUTA_DEL_REPOSITORIO}`}>{NOMBRE_DEL_REPOSITORIO}</Miga>
        )}
        {dentro.map((nombre, i) => {
          const actual = i === dentro.length - 1;
          return (
            <span key={dentro.slice(0, i + 1).join("/")} className="flex items-center gap-1">
              <IconChevronRight size={13} className="text-gris-suave" />
              {actual ? (
                <span className="font-bold uppercase tracking-wide text-azul">{nombre}</span>
              ) : (
                <Miga href={`/contratos/${RUTA_DEL_REPOSITORIO}/${enDireccion(dentro.slice(0, i + 1))}`}>
                  {nombre}
                </Miga>
              )}
            </span>
          );
        })}
      </nav>

      {!conectado ? (
        <ConectarSharePoint />
      ) : error ? (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <IconAlertTriangle size={18} />
            No se pudo abrir SharePoint
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-700/90">{error}</p>
        </div>
      ) : (
        <div className={`${TARJETA} mt-6 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="tarjeta-icono" aria-hidden>
                <Icono size={19} stroke={1.75} />
              </span>
              <h2 className="titular min-w-0 text-base leading-snug text-azul [overflow-wrap:anywhere]">
                {titulo}
              </h2>
            </div>

            <SoloSi capacidad="configurar">
              <SubidaEnLinea
                seccion={seccion.slug}
                nombre={titulo}
                // La carpeta donde se está: la raíz del repositorio o la subcarpeta abierta.
                ruta={rutaRelativa}
                // No es un requisito: nada que pasar a «subido», y sin campo de comentario.
                itemId={null}
                conComentario={false}
                prepararSubida={prepararSubidaAlRepositorioAction}
                registrarSubida={registrarSubidaAlRepositorioAction}
                refrescar={refrescarRepositorioAction}
              />
            </SoloSi>
          </div>

          {filas.length > 0 ? (
            <ExploradorDeArchivos seccion={seccion.slug} elementos={filas} />
          ) : (
            <p className="px-5 py-10 text-center text-sm text-gris">
              {enLaRaiz ? "Todavía no hay documentos." : "Esta carpeta está vacía."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Los archivos que el sistema deja solos (Mac, Windows, Office): nadie los quiere ver en una lista. */
function esBasura(nombre: string): boolean {
  return nombre.startsWith(".") || nombre.startsWith("~$") || /^(thumbs\.db|desktop\.ini)$/i.test(nombre);
}

/** Un camino dentro del repositorio, listo para ir en la dirección. */
function enDireccion(partes: string[]): string {
  return partes.map(encodeURIComponent).join("/");
}

function Miga({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-bold uppercase tracking-wide text-gris transition hover:text-azul">
      {children}
    </Link>
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
