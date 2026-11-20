import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconBooks, IconChevronRight } from "@tabler/icons-react";
import ConectarSharePoint from "@/components/contratos/ConectarSharePoint";
import ExploradorDeArchivos, { type ElementoDeLista } from "@/components/contratos/ExploradorDeArchivos";
import { SoloSi } from "@/components/contratos/PermisosDelUsuario";
import SubidaEnLinea from "@/components/contratos/SubidaEnLinea";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { TARJETA } from "@/lib/contratos/estilos";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { CARPETA_DEL_REPOSITORIO, NOMBRE_DEL_REPOSITORIO } from "@/lib/contratos/repositorio-modelo";
import {
  ErrorDeGraph,
  formatearPeso,
  listar,
  secciones,
  sePuedeVerEnLinea,
  type ElementoSharePoint,
} from "@/lib/contratos/sharepoint";
import {
  prepararSubidaAlRepositorioAction,
  refrescarRepositorioAction,
  registrarSubidaAlRepositorioAction,
} from "../acciones-repositorio";

/**
 * El repositorio de apoyo: documentos de consulta que acompañan a los requisitos de Documentos
 * generales. No es un requisito ni cuenta en ninguna cifra (ver repositorio-modelo.ts).
 *
 * Lo ve cualquiera que tenga Contratos, en solo lectura: abrir y descargar. Subir y eliminar es de
 * quien puede configurar el módulo (Administrador y Usuario Especial); lo niegan las acciones del
 * servidor, y acá solo se esconden los botones.
 *
 * Es una lista plana de archivos. Si alguien crea subcarpetas en SharePoint, el core no las
 * muestra: se ven allá.
 */
export default async function RepositorioDeApoyoPage() {
  const usuario = await exigirAccesoApp("contratos");
  // Igual que la página de carpetas: sin acceso a SharePoint, pedirlo es un paso, no un error.
  const conectado = await tieneAccesoASharePoint(usuario.correo);
  const seccion = (await secciones())[0];

  let elementos: ElementoSharePoint[] = [];
  let error: string | null = null;

  try {
    if (conectado) elementos = await listar(seccion, CARPETA_DEL_REPOSITORIO);
  } catch (e) {
    // La carpeta se crea con la primera subida: que todavía no exista es «sin documentos», no un fallo.
    if (!(e instanceof ErrorDeGraph && e.estado === 404)) {
      error = e instanceof Error ? e.message : "No se pudo leer el repositorio en SharePoint.";
    }
  }

  const filas: ElementoDeLista[] = elementos
    .filter((el) => !el.esCarpeta)
    .map((el) => ({
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
      // Sin estado de requisito ni etapa de revisión: no hay nada que revisar ni que entregar.
      estado: null,
      subidoPor: el.subidoPor,
      comentario: null,
      comentarioAutor: null,
    }));

  return (
    <div className="animar-entrada">
      <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Ruta">
        <Miga href="/contratos">Resumen</Miga>
        <IconChevronRight size={13} className="text-gris-suave" />
        <Miga href={`/contratos/${encodeURIComponent("DOCUMENTOS GENERALES")}`}>DOCUMENTOS GENERALES</Miga>
        <IconChevronRight size={13} className="text-gris-suave" />
        <span className="font-bold uppercase tracking-wide text-azul">{NOMBRE_DEL_REPOSITORIO}</span>
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
                <IconBooks size={19} stroke={1.75} />
              </span>
              <h2 className="titular min-w-0 text-base leading-snug text-azul [overflow-wrap:anywhere]">
                {NOMBRE_DEL_REPOSITORIO}
              </h2>
            </div>

            <SoloSi capacidad="configurar">
              <SubidaEnLinea
                seccion={seccion.slug}
                nombre={NOMBRE_DEL_REPOSITORIO}
                ruta={CARPETA_DEL_REPOSITORIO}
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
            <p className="px-5 py-10 text-center text-sm text-gris">Todavía no hay documentos.</p>
          )}
        </div>
      )}
    </div>
  );
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
