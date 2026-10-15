import { Suspense } from "react";
import Link from "@/components/contratos/Enlace";
import { notFound } from "next/navigation";
import {
  IconAlertTriangle,
  IconChevronRight,
  IconExternalLink,
  IconFolder,
} from "@tabler/icons-react";
import BarraDeAvance from "@/components/contratos/BarraDeAvance";
import BotonRenombrarCarpeta from "@/components/contratos/BotonRenombrarCarpeta";
import ConectarSharePoint from "@/components/contratos/ConectarSharePoint";
import ExploradorDeArchivos, { type ElementoDeLista } from "@/components/contratos/ExploradorDeArchivos";
import FormularioCarpeta from "@/components/contratos/FormularioCarpeta";
import ResumenDeArranque, { type ResumenGlobal } from "@/components/contratos/ResumenDeArranque";
import SelectorDeEstado from "@/components/contratos/SelectorDeEstado";
import SelectorDeResponsable from "@/components/contratos/SelectorDeResponsable";
import SubidaEnLinea from "@/components/contratos/SubidaEnLinea";
import FilaDeCarpeta from "@/components/contratos/FilaDeCarpeta";
import PlazoDeCabecera from "@/components/contratos/PlazoDeCabecera";
import TarjetaDeCarpeta from "@/components/contratos/TarjetaDeCarpeta";
import TarjetaDeAcreditacion from "@/components/contratos/TarjetaDeAcreditacion";
import TarjetaDeVehiculos from "@/components/contratos/TarjetaDeVehiculos";
import { VisorDeAcreditacion } from "../_acreditacion/visor";
import TarjetaDeArranque from "@/components/contratos/TarjetaDeArranque";
import { exigirAccesoApp, exigirSesion, tieneAccesoAApp } from "@/lib/contratos/autorizacion";
import { MODULOS } from "@/lib/contratos/arranque-modelo";
import { hoyEnChile } from "@/lib/contratos/acreditacion-modelo";
import { listarPlazos } from "@/lib/contratos/plazos";
import { leerPlazo } from "@/lib/contratos/plazos-modelo";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { listarResponsables, type Responsables } from "@/lib/contratos/responsables";
import { calcularAvance, estadoEfectivo, type Avance } from "@/lib/contratos/contratos-estado";
import { comentariosDe } from "@/lib/contratos/contratos-comentarios";
import { estadosDeArchivos } from "@/lib/contratos/contratos-archivo-estados";
import {
  ESTADO_INICIAL_DE_ARCHIVO,
  contarPorEstado,
  type RevisionDeCarpeta,
} from "@/lib/contratos/documento-estado";
import { revisionDeGrupos, type RequisitoLeido } from "@/lib/contratos/contratos-revision";
import {
  aplicarEstadoDeAcreditacion,
  cargarAcreditacionParaDocumentos,
  detalleDeAcreditacion,
  type AcreditacionParaDocumentos,
} from "@/lib/contratos/acreditacion-en-documentos";
import { estadosDe } from "@/lib/contratos/contratos-seguimiento";
import {
  carpetaProtegida,
  enlaceDeCarpeta,
  esCarpetaDeAcreditacion,
  estaEnAcreditacion,
  estaOculta,
  tipoDeCarpetaDeAcreditacion,
  type TipoDeAcreditacion,
  formatearPeso,
  hojasBajo,
  listar,
  obtenerCarpeta,
  secciones,
  sePuedeVerEnLinea,
  tieneDocumentos,
  type ElementoSharePoint,
  type Seccion,
} from "@/lib/contratos/sharepoint";
import { TARJETA } from "@/lib/contratos/estilos";
import {
  asignarResponsableAction,
  cambiarEstadoAction,
  crearCarpetaAction,
  prepararSubidaAction,
  refrescarAction,
  registrarSubidaAction,
} from "../acciones";
import { SoloSi } from "@/components/contratos/PermisosDelUsuario";

export const dynamic = "force-dynamic";

/** El nombre del módulo. El de la barra sale del catálogo; este es el de la página. */
// La raíz de las migas: la portada del contrato. El nombre del contrato ya está arriba, en el
// encabezado del layout, así que acá no se repite como título.
const TITULO = "Resumen";

export default async function ContratosPage({ params }: { params: Promise<{ ruta?: string[] }> }) {
  const usuario = await exigirAccesoApp("contratos");

  // Antes de hablar con Graph: si esta persona todavía no le dio al core acceso
  // a SharePoint, pedírselo es un paso, no un error. Llamar igual devolvería un
  // mensaje de Microsoft sobre un consentimiento que nadie le pidió.
  const conectado = await tieneAccesoASharePoint(usuario.correo);

  const { ruta: segmentos = [] } = await params;
  // Los segmentos vienen codificados en la URL: estos nombres tienen espacios,
  // puntos y paréntesis.
  const resto = segmentos.map(decodeURIComponent);
  const rutaRelativa = resto.join("/");

  // El módulo es la carpeta de arranque: lo que va en la URL es la ruta dentro
  // de ella, sin ningún tramo extra que atravesar antes de llegar al contenido.
  const seccion = (await secciones())[0];

  // Esconder las carpetas excluidas de la lista no alcanza: la URL sigue siendo
  // adivinable, y una carpeta que el módulo dice no tener pero que abre igual es
  // peor que no filtrarla.
  if (resto.length > 0 && estaOculta(resto[0])) notFound();

  let elementos: ElementoSharePoint[] = [];
  let error: string | null = null;

  try {
    if (conectado) elementos = await listar(seccion, rutaRelativa);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer la carpeta en SharePoint.";
  }

  return (
    <div className="animar-entrada">
      <Migas partes={resto} />

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
      ) : resto.length === 0 ? (
        <PortadaDeSeccion seccion={seccion} elementos={elementos} />
      ) : (
        <>
          {resto.length === 1 && esDocumentosGenerales(resto[0]) && (
            <div className="mt-4">
              <PlazoDeCabecera modulo="documentos-generales" />
            </div>
          )}
          <Carpeta seccion={seccion} rutaRelativa={rutaRelativa} elementos={elementos} />
        </>
      )}
    </div>
  );
}

/** El avance real de la fila de una carpeta de Acreditación, o nada si no lo es (o no se pudo leer). */
function filaDeAcreditacion(
  ruta: string,
  datos: Map<TipoDeAcreditacion, AcreditacionParaDocumentos | null>,
): { avance: Avance; detalle: string } | undefined {
  const tipo = tipoDeCarpetaDeAcreditacion(ruta);
  const leidos = tipo ? datos.get(tipo) : null;
  return leidos ? { avance: leidos.total, detalle: detalleDeAcreditacion(leidos) } : undefined;
}

/** La carpeta DOCUMENTOS GENERALES, por su nombre en SharePoint (sin distinguir mayúsculas). */
function esDocumentosGenerales(nombre: string): boolean {
  return nombre.trim().toLowerCase() === "documentos generales";
}

/** Qué módulos hermanos tiene asignados quien mira la portada. */
async function accesosDeLaPortada() {
  const usuario = await exigirSesion();
  const [acreditacion, vehiculos, logistica, gastos] = await Promise.all([
    tieneAccesoAApp(usuario, "acreditacion"),
    tieneAccesoAApp(usuario, "acreditacion-vehiculos"),
    tieneAccesoAApp(usuario, MODULOS.logistica.appSlug),
    tieneAccesoAApp(usuario, MODULOS.gastos.appSlug),
  ]);
  return { acreditacion, vehiculos, logistica, gastos };
}

/**
 * El hueco de una tarjeta que todavía carga. Si el usuario no tiene el módulo la
 * tarjeta resuelve a nada y este hueco desaparece; el desplazamiento es de una
 * tarjeta chica, y es el precio de no hacer esperar a las demás.
 */
function EsqueletoDeTarjeta() {
  return (
    <li>
      <div className={`${TARJETA} h-36 animate-pulse`} aria-hidden />
    </li>
  );
}

interface TarjetaDeCarpetaDatos {
  carpeta: ElementoSharePoint;
  avance: Avance;
  /** Quién responde por ella, si es un requisito y alguien la tiene asignada. */
  responsableId: string | null;
  /** O la contraparte, si lo que falta depende de afuera. */
  responsableExternoId: string | null;
  /** Solo las hojas se asignan: una carpeta que agrupa no la entrega nadie. */
  esRequisito: boolean;
  /** En qué etapa de revisión va lo de adentro. Solo si se pidió (ver `conRevision`). */
  revision?: RevisionDeCarpeta;
}

/**
 * Una tarjeta por carpeta, con su avance. Lo mismo en la portada y adentro.
 *
 * El caso de la hoja es el que hay que mirar: una carpeta sin subcarpetas no
 * tiene hojas que sumar, pero ES el requisito, así que su avance es su propio
 * estado. Tratándola como "sin requisitos" quedaba fuera de toda cuenta —ni
 * sumaba al total ni se notaba que faltaba— y la tarjeta no decía nada.
 */
async function tarjetasDeCarpetas(
  seccion: Seccion,
  carpetas: ElementoSharePoint[],
  /**
   * Si además hay que decir en qué etapa de revisión va cada una (Borrador / En revisión /
   * Validado). Solo la lista de dentro de una carpeta lo muestra; la portada no, así que
   * ahí se ahorra la consulta de los estados de los archivos.
   */
  conRevision = false,
): Promise<TarjetaDeCarpetaDatos[]> {
  const propios = await estadosDe(carpetas.map((c) => c.id));

  const leidas = await Promise.all(
    carpetas.map(async (carpeta) => {
      const propio = propios.get(carpeta.id);
      const vacio = {
        carpeta,
        avance: calcularAvance([]),
        responsableId: propio?.responsableId ?? null,
        responsableExternoId: propio?.responsableExternoId ?? null,
        esRequisito: false,
      };

      // La carpeta de Acreditación (1.3) es UN requisito cuyo cumplimiento mide el submódulo
      // Acreditación. Bajar a sus hojas contaría una «persona» por cada carpeta con archivos, que
      // es medir cuánta gente tiene algo subido y no cuántos documentos están cargados y vigentes.
      if (esCarpetaDeAcreditacion(carpeta.ruta)) {
        const [req] = await aplicarEstadoDeAcreditacion([
          { estado: estadoEfectivo(propio?.estado, false), carpeta },
        ]);
        return {
          datos: { ...vacio, avance: calcularAvance([req.estado]), esRequisito: true },
          requisitos: [req] as RequisitoLeido[],
        };
      }

      let hojas: ElementoSharePoint[];
      try {
        hojas = await hojasBajo(seccion, carpeta.ruta);
      } catch {
        // Una carpeta a la que esta persona no tiene acceso no puede tumbar la
        // pantalla entera: se muestra sin avance y el resto sigue. Y se muestra
        // SIN avance, no como hoja pendiente: no haber podido mirar adentro no
        // es lo mismo que haber mirado y no encontrar nada.
        return { datos: vacio, requisitos: null };
      }

      if (hojas.length === 0) {
        // El estado que se muestra mira también la carpeta: con documentos adentro y
        // el estado todavía en «pendiente», el requisito está subido (ver estadoEfectivo).
        const estado = estadoEfectivo(propio?.estado, tieneDocumentos(carpeta));
        return {
          datos: { ...vacio, avance: calcularAvance([estado]), esRequisito: true },
          requisitos: [{ estado, carpeta }] as RequisitoLeido[],
        };
      }

      const estados = await estadosDe(hojas.map((h) => h.id));
      // Si entre las hojas está la carpeta de Acreditación, su estado es el que dice ese módulo.
      const requisitos = await aplicarEstadoDeAcreditacion(
        hojas.map((h): RequisitoLeido => ({
          estado: estadoEfectivo(estados.get(h.id)?.estado, tieneDocumentos(h)),
          carpeta: h,
        })),
      );
      return {
        datos: { ...vacio, avance: calcularAvance(requisitos.map((r) => r.estado)) },
        requisitos,
      };
    }),
  );

  if (!conRevision) return leidas.map((l) => l.datos);

  // Las etapas de TODAS las carpetas de una vez: una sola consulta a la base. Las que no se
  // pudieron leer se quedan sin revisión (la fila muestra solo su estado).
  const conDatos = leidas.filter((l): l is typeof l & { requisitos: RequisitoLeido[] } => l.requisitos !== null);
  const revisiones = await revisionDeGrupos(
    seccion,
    conDatos.map((l) => l.requisitos),
  );
  const porCarpeta = new Map(conDatos.map((l, i) => [l.datos.carpeta.id, revisiones[i]]));

  return leidas.map((l) => ({ ...l.datos, revision: porCarpeta.get(l.datos.carpeta.id) }));
}

/**
 * El selector de responsable de una tarjeta, o nada si no corresponde.
 *
 * Solo en los requisitos: una carpeta que agrupa no la entrega nadie, y poner un
 * responsable en ella invitaría a asignarla creyendo que eso asigna lo de
 * adentro, que no es así.
 */
function responsableDe(
  seccion: Seccion,
  datos: TarjetaDeCarpetaDatos,
  responsables: Responsables,
): React.ReactNode {
  if (!datos.esRequisito) return null;
  // Tampoco en la carpeta de Acreditación: no la entrega nadie desde acá, su avance es el que dice
  // ese módulo, y asignarle un responsable invitaría a creer que se completa de otra forma.
  if (esCarpetaDeAcreditacion(datos.carpeta.ruta)) return null;

  return (
    <SelectorDeResponsable
      compacto
      seccion={seccion.slug}
      itemId={datos.carpeta.id}
      ruta={datos.carpeta.ruta}
      responsableInicial={datos.responsableId ?? datos.responsableExternoId}
      responsables={responsables}
      asignar={asignarResponsableAction}
    />
  );
}

/** La portada del módulo: el resumen y una tarjeta por carpeta de primer nivel. */
async function PortadaDeSeccion({
  seccion,
  elementos,
}: {
  seccion: Seccion;
  elementos: ElementoSharePoint[];
}) {
  const carpetas = elementos.filter((e) => e.esCarpeta);

  // Ya no se piden las personas asignables acá: el selector de responsable vive en
  // las filas de dentro de cada carpeta, no en las tarjetas de la portada.
  const [porCarpeta, accesos, plazos] = await Promise.all([
    tarjetasDeCarpetas(seccion, carpetas),
    accesosDeLaPortada(),
    listarPlazos(),
  ]);
  const plazoDeDocumentosGenerales = leerPlazo(plazos["documentos-generales"], hoyEnChile());

  // El porcentaje global se calcula sobre los TOTALES, no promediando el de cada
  // tarjeta. Promediar le daría el mismo peso a una carpeta de 2 requisitos que a
  // una de 34: con 34 pendientes y 2 subidos, el promedio diría 50% y la realidad
  // es 6%.
  const resumen: ResumenGlobal = porCarpeta.reduce<ResumenGlobal>(
    (acumulado, { avance }) => ({
      total: acumulado.total + avance.total,
      subidos: acumulado.subidos + avance.subidos,
      pendientes: acumulado.pendientes + avance.pendientes,
      noAplican: acumulado.noAplican + avance.noAplican,
      porcentaje: 0,
      carpetas: acumulado.carpetas + (avance.total > 0 ? 1 : 0),
      carpetasCompletas:
        acumulado.carpetasCompletas + (avance.total > 0 && avance.subidos === avance.total ? 1 : 0),
    }),
    {
      total: 0,
      subidos: 0,
      pendientes: 0,
      noAplican: 0,
      porcentaje: 0,
      carpetas: 0,
      carpetasCompletas: 0,
    },
  );
  resumen.porcentaje = resumen.total === 0 ? 0 : Math.round((resumen.subidos / resumen.total) * 100);

  return (
    <>
      {porCarpeta.length === 0 ? (
        // Vacía no es un error: listar() respondió, así que la carpeta existe y
        // simplemente no tiene nada todavía.
        <div className={`${TARJETA} mt-8 p-10 text-center`}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cian-lavado text-azul">
            <IconFolder size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold text-tinta">Todavía no hay carpetas acá</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-gris">
            Cada carpeta de <strong>{seccion.carpeta}</strong> en SharePoint es un requisito que se
            sigue desde esta pantalla.
          </p>
        </div>
      ) : (
        <>
          <ResumenDeArranque resumen={resumen} titulo={seccion.nombre} />

          {/* Cuatro por fila en pantalla ancha: las tarjetas son chicas a propósito
              (ver TarjetaDeCarpeta) y los cuatro módulos caben sin desplazarse. */}
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {porCarpeta.map((datos) => (
              <li key={datos.carpeta.id}>
                <TarjetaDeCarpeta
                  nombre={datos.carpeta.nombre}
                  href={`/contratos/${encodeURIComponent(datos.carpeta.nombre)}`}
                  avance={datos.avance}
                  // La fecha límite es del módulo «Documentos generales»: solo esa tarjeta
                  // la lleva, no las demás carpetas que pudiera traer SharePoint.
                  plazo={esDocumentosGenerales(datos.carpeta.nombre) ? plazoDeDocumentosGenerales : null}
                  accion={
                    carpetaProtegida(datos.carpeta.ruta) ? null : (
                      <BotonRenombrarCarpeta
                        seccion={seccion.slug}
                        itemId={datos.carpeta.id}
                        nombre={datos.carpeta.nombre}
                        rutaPadre=""
                      />
                    )
                  }
                />
              </li>
            ))}
            {/* Acreditación vive en su propio submódulo, pero es un requisito de
                este contrato: aparece junto a las demás carpetas, solo para quien
                lo tiene asignado. */}
            {/* En un Suspense: su lectura es de la base y no de SharePoint, y sin él la
                portada esperaba a que terminara TODO lo de Graph para recién
                entonces pedirla (el componente se crea al devolver el JSX), sumando
                su latencia a la de las carpetas en vez de correr a la par. */}
            {seccion.slug === "arranque" && (
              <>
                {/* El acceso se decide ANTES del esqueleto: quien no tiene el módulo
                    no tiene por qué ver aparecer y desaparecer un hueco. Es
                    instantáneo —el catálogo ya está en memoria desde el layout—. */}
                {accesos.acreditacion && (
                  <Suspense fallback={<EsqueletoDeTarjeta />}>
                    <TarjetaDeAcreditacion />
                  </Suspense>
                )}
                {accesos.vehiculos && (
                  <Suspense fallback={<EsqueletoDeTarjeta />}>
                    <TarjetaDeVehiculos />
                  </Suspense>
                )}
                {/* Logística y Gastos de arranque, por el mismo motivo que la de
                    arriba: cada una lee de la base y aparece cuando está lista, sin
                    hacer esperar a las demás. */}
                {accesos.logistica && (
                  <Suspense fallback={<EsqueletoDeTarjeta />}>
                    <TarjetaDeArranque modulo="logistica" />
                  </Suspense>
                )}
                {accesos.gastos && (
                  <Suspense fallback={<EsqueletoDeTarjeta />}>
                    <TarjetaDeArranque modulo="gastos" />
                  </Suspense>
                )}
              </>
            )}
          </ul>
        </>
      )}

    </>
  );
}

/**
 * El pie de cualquier carpeta: crear subcarpeta e ir a SharePoint.
 *
 * Ya NO lleva la zona grande de «arrastra archivos acá»: ocupaba media pantalla al pie
 * de cada carpeta, incluidas las que solo agrupan y a las que no se sube nada. Subir se
 * hace con el botón «Subir» de cada documento, en la lista, y desde la tarjeta del
 * requisito cuando uno está adentro.
 */
async function HerramientasDeCarpeta({
  seccion,
  rutaRelativa,
}: {
  seccion: Seccion;
  rutaRelativa: string;
}) {
  const urlCarpeta = await enlaceDeCarpeta(seccion, rutaRelativa);

  return (
    <>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        {/* Crear una carpeta es definir un requisito nuevo: es configurar, no «agregar datos». */}
        <SoloSi capacidad="configurar" alternativa={<span />}>
          <FormularioCarpeta
            seccion={seccion.slug}
            rutaPadre={rutaRelativa}
            accion={crearCarpetaAction}
          />
        </SoloSi>
        {urlCarpeta && (
          <a
            href={urlCarpeta}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
          >
            Abrir en SharePoint
            <IconExternalLink size={14} />
          </a>
        )}
      </div>
    </>
  );
}

/** Una carpeta cualquiera: su contenido, el estado si es un requisito, y el subidor. */
async function Carpeta({
  seccion,
  rutaRelativa,
  elementos,
}: {
  seccion: Seccion;
  rutaRelativa: string;
  elementos: ElementoSharePoint[];
}) {
  // La carpeta de Acreditación y lo que cuelga de ella es un VISOR: se ven los archivos, pero se
  // cargan y se actualizan desde Acreditación, y su avance es el que dice ese módulo.
  if (estaEnAcreditacion(rutaRelativa)) {
    return <VisorDeAcreditacion seccion={seccion} rutaRelativa={rutaRelativa} elementos={elementos} />;
  }

  const subcarpetas = elementos.filter((e) => e.esCarpeta);
  // Una carpeta sin subcarpetas es una hoja: un requisito que recibe documentos.
  // Las que agrupan no se entregan, así que no llevan estado.
  const esRequisito = subcarpetas.length === 0;

  // Las hojas que cuelgan de acá, para la barra de arriba. Se le pasan los hijos
  // ya listados para que no vuelva a pedirlos: con subcarpetas vacías —el caso
  // normal de una carpeta de requisitos— no cuesta ninguna llamada extra.
  const hojas = await hojasBajo(seccion, rutaRelativa, 4, elementos);

  const archivos = elementos.filter((e) => !e.esCarpeta);

  const [porSubcarpeta, responsables, estadosHojas, comentarios, propia, revision] = await Promise.all([
    tarjetasDeCarpetas(seccion, subcarpetas, true),
    listarResponsables(),
    estadosDe(hojas.map((h) => h.id)),
    comentariosDe(archivos.map((e) => e.id)),
    esRequisito ? obtenerCarpeta(seccion, rutaRelativa) : Promise.resolve(null),
    estadosDeArchivos(archivos.map((e) => e.id)),
  ]);

  const requisitos = await aplicarEstadoDeAcreditacion(
    hojas.map((h): RequisitoLeido => ({
      estado: estadoEfectivo(estadosHojas.get(h.id)?.estado, tieneDocumentos(h)),
      carpeta: h,
    })),
  );
  const avance = calcularAvance(requisitos.map((r) => r.estado));

  // La fila de una carpeta de Acreditación (1.3 personas, 1.4 vehículos) muestra su avance REAL
  // (documentos cargados y vigentes sobre los exigidos), no el de un requisito que se entrega o no.
  const tiposDeAcreditacion = new Set<TipoDeAcreditacion>();
  for (const d of porSubcarpeta) {
    const tipo = tipoDeCarpetaDeAcreditacion(d.carpeta.ruta);
    if (tipo) tiposDeAcreditacion.add(tipo);
  }
  const acreditacion = new Map<TipoDeAcreditacion, AcreditacionParaDocumentos | null>();
  await Promise.all(
    [...tiposDeAcreditacion].map(async (tipo) =>
      acreditacion.set(tipo, await cargarAcreditacionParaDocumentos(tipo).catch(() => null)),
    ),
  );

  // La barra de arriba, partida por etapa. Sale de las MISMAS hojas que el avance, así que
  // «subidos» y la suma de validado + en revisión + borrador no pueden discrepar. Solo en las
  // carpetas que agrupan; un requisito no tiene barra.
  const etapasDeLaCarpeta = esRequisito
    ? undefined
    : (await revisionDeGrupos(seccion, [requisitos]))[0]?.etapas;

  // El estado de ESTA carpeta se pide aparte, y no se busca en `estadosHojas`.
  //
  // Parecía estar ahí, pero no: `hojas` son las que cuelgan de acá, y una
  // carpeta de requisito no tiene ninguna —hojasBajo devuelve [] para una hoja—,
  // así que ese mapa está vacío justo en el único caso en que hace falta. El
  // resultado era que el selector mostraba "Pendiente" siempre, aunque estuviera
  // guardado como subido, mientras la tarjeta del nivel de arriba sí lo decía
  // bien. Una consulta de más, solo en la página de un requisito.
  const propio = propia ? (await estadosDe([propia.id])).get(propia.id) : undefined;

  const base = "/contratos";

  // La tabla queda solo para los archivos: las carpetas son tarjetas.
  const filas: ElementoDeLista[] = archivos.map((el) => ({
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
    // Sin fila guardada, Borrador: es lo que es todo archivo recién subido.
    estadoDeArchivo: revision.get(el.id)?.estado ?? ESTADO_INICIAL_DE_ARCHIVO,
    estadoDeArchivoPor: revision.get(el.id)
      ? `${revision.get(el.id)?.por ?? "alguien"}, ${fechaCorta(revision.get(el.id)!.en)}`
      : null,
    subidoPor: el.subidoPor,
    comentario: comentarios.get(el.id)?.comentario ?? null,
    comentarioAutor: comentarios.get(el.id)?.autor ?? null,
  }));

  return (
    <>
      {/* Arriba del todo: el avance de esta carpeta, con el mismo cálculo que la
          tarjeta de la portada. En una carpeta de requisito no aparece —no tiene
          hijas que contar— y en su lugar va el selector de estado. */}
      {!esRequisito && <BarraDeAvance avance={avance} etapas={etapasDeLaCarpeta} />}

      {esRequisito && (
        <div className={`${TARJETA} mt-6 flex flex-wrap items-center justify-between gap-4 p-5`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gris">
              Estado de este requisito
            </p>
            <p className="mt-0.5 text-xs text-gris-suave">
              Es lo que mueve la barra de la tarjeta de arriba. «No aplica» lo saca de la cuenta.
            </p>
            {archivos.length > 0 && <ResumenDeRevision filas={filas} />}
          </div>
          {propia ? (
            <div className="flex flex-wrap items-center gap-3">
              {/* El botón compacto que reemplaza a la zona grande de arrastrar
                  archivos: abre el mismo cuadro de subida que el «Subir» de la lista. */}
              <span className="inline-flex items-center text-xs font-bold uppercase tracking-wide text-azul">
                <SubidaEnLinea
                  seccion={seccion.slug}
                  nombre={nombreDe(rutaRelativa)}
                  ruta={rutaRelativa}
                  itemId={propia.id}
                  prepararSubida={prepararSubidaAction}
                  registrarSubida={registrarSubidaAction}
                  refrescar={refrescarAction}
                />
              </span>
              <SelectorDeResponsable
                seccion={seccion.slug}
                itemId={propia.id}
                ruta={rutaRelativa}
                responsableInicial={propio?.responsableId ?? propio?.responsableExternoId ?? null}
                responsables={responsables}
                asignar={asignarResponsableAction}
              />
              <SelectorDeEstado
                seccion={seccion.slug}
                itemId={propia.id}
                ruta={rutaRelativa}
                // Lo que se ve, no lo guardado: si la carpeta ya tiene archivos el
                // selector tiene que decir «Subido», igual que la lista de arriba.
                estadoInicial={estadoEfectivo(propio?.estado, archivos.length > 0)}
                // La clave incluye el estado mostrado para que, al llegar otro del
                // servidor, el selector se monte de nuevo con el valor correcto.
                key={estadoEfectivo(propio?.estado, archivos.length > 0)}
                cambiar={cambiarEstadoAction}
              />
            </div>
          ) : (
            <p className="text-xs text-gris-suave">
              No se pudo leer esta carpeta en SharePoint para guardar su estado.
            </p>
          )}
        </div>
      )}

      {/* Las subcarpetas, como LISTA: cada una es un requisito o un grupo de
          requisitos, y con decenas de ellas una lista se recorre de un vistazo
          donde las tarjetas obligaban a desplazarse. Conserva lo que ofrecían: el
          responsable, subir sin entrar y el enlace a SharePoint. Las tarjetas
          quedan para la portada, donde son pocas y cada una es un módulo. */}
      {porSubcarpeta.length > 0 && (
        <ul className="mt-6 divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie shadow-[var(--sombra-tarjeta)]">
          {porSubcarpeta.map((datos) => {
            const carpeta = datos.carpeta;
            return (
              <FilaDeCarpeta
                key={carpeta.id}
                nombre={carpeta.nombre}
                href={`${base}/${carpeta.ruta.split("/").map(encodeURIComponent).join("/")}`}
                avance={datos.avance}
                esRequisito={datos.esRequisito}
                revision={datos.revision}
                responsable={responsableDe(seccion, datos, responsables)}
                acreditacion={filaDeAcreditacion(carpeta.ruta, acreditacion)}
                accion={
                  <>
                    {/* «Subir» solo en un REQUISITO: la carga se hace dentro de la carpeta. Una
                        carpeta que agrupa no recibe documentos —subir un archivo suelto ahí lo deja
                        fuera de todo requisito— y la de Acreditación se carga desde su módulo. */}
                    {datos.esRequisito && !esCarpetaDeAcreditacion(carpeta.ruta) && (
                      <SubidaEnLinea
                        seccion={seccion.slug}
                        nombre={carpeta.nombre}
                        ruta={carpeta.ruta}
                        itemId={carpeta.id}
                        prepararSubida={prepararSubidaAction}
                        registrarSubida={registrarSubidaAction}
                        refrescar={refrescarAction}
                      />
                    )}
                    {!carpetaProtegida(carpeta.ruta) && (
                      <BotonRenombrarCarpeta
                        seccion={seccion.slug}
                        itemId={carpeta.id}
                        nombre={carpeta.nombre}
                        rutaPadre={rutaRelativa}
                      />
                    )}
                    <a
                      href={carpeta.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir en SharePoint"
                      aria-label={`Abrir ${carpeta.nombre} en SharePoint`}
                      className="inline-flex transition hover:text-azul"
                    >
                      <IconExternalLink size={15} />
                    </a>
                  </>
                }
              />
            );
          })}
        </ul>
      )}

      {/* Sin archivos pero con tarjetas no se dibuja nada: una caja vacía bajo
          las tarjetas solo diría que no hay lo que nadie estaba buscando. El
          "está vacía" se reserva para cuando no hay ni carpetas ni archivos. */}
      {filas.length > 0 ? (
        <div className={`${TARJETA} mt-6 overflow-hidden`}>
          <ExploradorDeArchivos
            seccion={seccion.slug}
            elementos={filas}
            subida={{
              prepararSubida: prepararSubidaAction,
              registrarSubida: registrarSubidaAction,
              refrescar: refrescarAction,
            }}
          />
        </div>
      ) : (
        porSubcarpeta.length === 0 && (
          <div className={`${TARJETA} mt-6 p-10 text-center`}>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cian-lavado text-azul">
              <IconFolder size={24} />
            </span>
            <p className="mt-4 text-sm font-semibold text-tinta">Esta carpeta está vacía</p>
            <p className="mt-1 text-xs text-gris">Sube el primer archivo con la zona de abajo.</p>
          </div>
        )
      )}

      <HerramientasDeCarpeta seccion={seccion} rutaRelativa={rutaRelativa} />
    </>
  );
}

/** El último tramo de una ruta: el nombre de la carpeta en la que uno está. */
function nombreDe(ruta: string): string {
  return ruta.split("/").filter(Boolean).at(-1) ?? ruta;
}

/**
 * «3 documentos · 1 validado · 1 en revisión · 1 borrador», en una línea.
 *
 * Es la forma discreta de ver en qué etapa va el requisito sin recorrer la tabla: no
 * suma una columna ni una tarjeta, y solo nombra las etapas que tienen algo (cero
 * validados no se dice).
 */
function ResumenDeRevision({ filas }: { filas: ElementoDeLista[] }) {
  const cuenta = contarPorEstado(filas.map((f) => f.estadoDeArchivo ?? ESTADO_INICIAL_DE_ARCHIVO));
  const partes = [
    cuenta.validado > 0 && `${cuenta.validado} ${cuenta.validado === 1 ? "validado" : "validados"}`,
    cuenta.en_revision > 0 && `${cuenta.en_revision} en revisión`,
    cuenta.borrador > 0 && `${cuenta.borrador} ${cuenta.borrador === 1 ? "borrador" : "borradores"}`,
  ].filter(Boolean);

  return (
    <p className="mt-1.5 text-xs font-semibold text-gris">
      {filas.length} {filas.length === 1 ? "documento" : "documentos"}
      {partes.length > 0 && <span className="font-normal text-gris-suave"> · {partes.join(" · ")}</span>}
    </p>
  );
}

function Migas({ partes }: { partes: string[] }) {
  // En la raíz la única miga es el nombre del módulo, que ya es el título de la
  // página: repetirlo debajo es ruido. Desde la primera subcarpeta sí hace falta,
  // porque ahí es el camino de vuelta.
  if (partes.length === 0) return null;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Ruta">
      <Miga href="/contratos" activo={partes.length === 0}>
        {TITULO}
      </Miga>
      {partes.map((parte, i) => {
        const href = `/contratos/${partes
          .slice(0, i + 1)
          .map(encodeURIComponent)
          .join("/")}`;
        return (
          <span key={href} className="flex items-center gap-1">
            <IconChevronRight size={13} className="text-gris-suave" />
            <Miga href={href} activo={i === partes.length - 1}>
              {parte}
            </Miga>
          </span>
        );
      })}
    </nav>
  );
}

function Miga({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  if (activo) {
    return <span className="font-bold uppercase tracking-wide text-azul">{children}</span>;
  }
  return (
    <Link
      href={href}
      className="font-bold uppercase tracking-wide text-gris transition hover:text-azul"
    >
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
