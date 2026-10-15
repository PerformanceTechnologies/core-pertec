import "server-only";
import { auth } from "@/auth";
import { obtenerAccessToken, SinCredencialesDeGraph } from "./graph-credenciales";
import { olvidarDashboard } from "./memoria-dashboard";
import { contratoActual } from "./contrato-actual";

/**
 * El sitio de SharePoint y la carpeta donde vive el módulo.
 *
 * El sitio se direcciona POR RUTA (`host:/sites/Nombre`) y no por GUID, que es
 * un formato que Graph acepta igual: así la variable se puede leer y verificar
 * de un vistazo, en vez de ser un identificador opaco que nadie sabe a qué
 * apunta cuando hay que revisarlo seis meses después.
 */
function sitioConfigurado(): string {
  // El sitio Core Pertec, donde vive la carpeta CONTRATOS. Se puede cambiar por variable de
  // entorno sin desplegar si algún día se mueve.
  return (process.env.SHAREPOINT_CONTRATOS_SITIO || "performancecl.sharepoint.com:/sites/COREPERTEC").trim();
}

/**
 * El identificador del sitio, resuelto una vez.
 *
 * Esto existe por un error concreto: `Resource not found for the segment 'root:'`.
 *
 * Graph deja direccionar un sitio por ruta —`host:/sites/CONTRATOS`— pero esa
 * forma termina en una ruta abierta, y al pegarle `/drive/root:/…` detrás, el
 * analizador se come `drive/root:` como parte del nombre del sitio y después no
 * encuentra nada. La ruta por nombre sirve para pedir EL SITIO, no para
 * encadenar llamadas debajo de él.
 *
 * Así que se pide una vez el sitio por su ruta, se guarda el id compuesto que
 * devuelve (`host,guid,guid`) y todo lo demás cuelga de ese id, que no tiene
 * dos puntos ni ambigüedad posible.
 *
 * Se cachea en el módulo: el id de un sitio no cambia, y resolverlo en cada
 * listado sería una llamada extra por cada carpeta que alguien abre.
 */
let idResuelto: string | null = null;

async function sitio(): Promise<string> {
  if (idResuelto) return idResuelto;

  const configurado = sitioConfigurado();

  // Sin dos puntos ya es un id (o un GUID): no hay nada que resolver.
  if (!configurado.includes(":")) {
    idResuelto = configurado;
    return idResuelto;
  }

  let datos: { id?: string };
  try {
    datos = await graph<{ id: string }>(`/sites/${configurado}`);
  } catch (e) {
    // Un 404 acá es el SITIO que no existe, no una carpeta. Son dos problemas
    // muy distintos —uno se arregla en una variable de entorno y el otro
    // navegando— y con el mensaje genérico se confunden.
    if (e instanceof ErrorDeGraph && e.estado === 404) {
      throw new ErrorDeGraph(
        `No existe el sitio "${configurado}", o tu cuenta no lo ve. ` +
          "Revisa SHAREPOINT_SITIO en las variables de entorno.",
        404,
      );
    }
    throw e;
  }

  if (!datos.id) {
    throw new ErrorDeGraph(`SharePoint no devolvió un identificador para "${configurado}".`, 404);
  }

  idResuelto = datos.id;
  return idResuelto;
}

/**
 * Carpetas de primer nivel que el módulo no muestra ni cuenta.
 *
 * Existen en SharePoint y se siguen usando allá; simplemente no son parte del
 * seguimiento. "Descartados" guarda lo que quedó fuera y "Anexos" material de
 * apoyo: contarlas como requisitos ensuciaba el avance con carpetas que nadie va
 * a completar nunca.
 *
 * Se comparan por nombre exacto, sin distinguir mayúsculas ni espacios de más, y
 * SOLO en el primer nivel. Si el filtro aplicara a cualquier profundidad, una
 * subcarpeta llamada igual desaparecería sin que nadie entendiera por qué.
 *
 * El día que alguien renombre una de estas en SharePoint, va a reaparecer en el
 * módulo. Es el precio de filtrar por nombre; filtrar por id sería estable pero
 * obligaría a ir a buscar tres identificadores opacos para configurarlo.
 */
function carpetasOcultas(): Set<string> {
  const valor =
    process.env.SHAREPOINT_CONTRATOS_CARPETAS_OCULTAS ?? "Descartados";
  return new Set(
    valor
      .split(",")
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Si esa carpeta de primer nivel está fuera del módulo. */
export function estaOculta(nombrePrimerNivel: string): boolean {
  const nombre = nombrePrimerNivel.trim().toLowerCase();
  if (carpetasOcultas().has(nombre)) return true;

  // Las carpetas de Logística y Gastos de arranque cuelgan de la misma carpeta de
  // arranque, pero NO son requisitos: son el archivo de esos submódulos. Sin esto
  // aparecerían en la portada como una tarjeta más, duplicando la del submódulo, y
  // contarían como un requisito pendiente en el avance. Van acá y no solo en
  // SHAREPOINT_CARPETAS_OCULTAS porque esa variable, si está definida en Vercel,
  // reemplaza a la lista por omisión entera, y bastaría que alguien la editara para
  // que reaparecieran.
  return carpetasDeSubmodulos().some((c) => c.toLowerCase() === nombre);
}

/**
 * El expediente sobre el que trabaja el módulo: una carpeta del sitio CONTRATOS.
 *
 * Es una lista de una sola entrada y no una constante porque las acciones del
 * servidor reciben su `slug` desde el navegador y lo validan contra esta lista:
 * así ninguna petición puede apuntar a una carpeta que el módulo no declara.
 *
 * El nombre de la carpeta en SharePoint se puede ajustar por variable de
 * entorno: si allá la renombran, se cambia la variable sin tocar código ni
 * desplegar.
 */
export interface Seccion {
  /** El identificador que viaja a las acciones del servidor. */
  slug: string;
  nombre: string;
  /** La carpeta dentro de "Documentos compartidos". */
  carpeta: string;
}

/** La carpeta, dentro de «Documentos compartidos» del sitio, donde vive un contrato por carpeta. */
export function carpetaRaizDeContratos(): string {
  return (process.env.SHAREPOINT_CONTRATOS_CARPETA || "CONTRATOS").replace(/^\/+|\/+$/g, "");
}

/**
 * El expediente del contrato de la dirección: su carpeta dentro de CONTRATOS.
 *
 * En core-ih era una sola carpeta fija. Acá hay una por contrato, así que la sección sale del
 * contrato de la petición (ver contrato-actual.ts). El `slug` sigue siendo "arranque" para todos:
 * es lo que las acciones mandan para decir «la sección de este contrato», y lo que identifica al
 * contrato es la dirección, no ese texto.
 */
export async function secciones(): Promise<Seccion[]> {
  const contrato = await contratoActual();
  return [
    {
      slug: "arranque",
      nombre: contrato.nombre,
      carpeta: `${carpetaRaizDeContratos()}/${contrato.carpeta}`,
    },
  ];
}

export async function buscarSeccion(slug: string): Promise<Seccion | null> {
  return (await secciones()).find((s) => s.slug === slug) ?? null;
}

/**
 * Donde caen las carpetas de las personas del submódulo Acreditación, relativa a
 * la carpeta de la sección "arranque". Es la carpeta "1.3 Documentos Acreditación Trabajadores" que
 * ya existe dentro de DOCUMENTOS GENERALES: los permisos los decide SharePoint,
 * así que quien no tenga acceso ahí tampoco puede subir desde el core.
 */
export function carpetaAcreditacion(): string {
  return (
    process.env.SHAREPOINT_CARPETA_ACREDITACION ||
    "DOCUMENTOS GENERALES/1.3 Documentos Acreditación Trabajadores"
  );
}

/**
 * Las carpetas de Logística y de Gastos de arranque, dentro de la carpeta de arranque.
 *
 * Una por submódulo, y dentro de cada una una carpeta por partida («0007 - Buses de
 * acercamiento»). Los nombres se pueden ajustar por variable de entorno, por si allá
 * ya existen con otro nombre: se usa la que exista, y solo se crea si falta.
 */
export function carpetaDeLogistica(): string {
  return process.env.SHAREPOINT_CARPETA_LOGISTICA || "LOGISTICA";
}

export function carpetaDeGastos(): string {
  return process.env.SHAREPOINT_CARPETA_GASTOS || "GASTOS ARRANQUE";
}

function carpetasDeSubmodulos(): string[] {
  return [carpetaDeLogistica(), carpetaDeGastos()];
}

/**
 * Donde caen las carpetas de los vehículos del submódulo Acreditación Vehículos: la carpeta
 * «1.4 Documentos Acreditación Vehículos», hermana de la de las personas y con los mismos permisos.
 */
export function carpetaVehiculos(): string {
  return (
    process.env.SHAREPOINT_CARPETA_VEHICULOS ||
    "DOCUMENTOS GENERALES/1.4 Documentos Acreditación Vehículos"
  );
}

/** Qué se acredita: las personas (carpeta 1.3) o los vehículos (carpeta 1.4). */
export type TipoDeAcreditacion = "personas" | "vehiculos";

function sinBarras(ruta: string): string {
  return ruta.replace(/^\/+|\/+$/g, "").toLowerCase();
}

const CARPETAS_DE_ACREDITACION: { tipo: TipoDeAcreditacion; ruta: () => string }[] = [
  { tipo: "personas", ruta: carpetaAcreditacion },
  { tipo: "vehiculos", ruta: carpetaVehiculos },
];

/**
 * De cuál de los dos submódulos de acreditación es esta ruta, si es EXACTAMENTE su carpeta (la 1.3
 * o la 1.4 de Documentos generales). Null si no es ninguna.
 */
export function tipoDeCarpetaDeAcreditacion(rutaRelativa: string): TipoDeAcreditacion | null {
  const ruta = sinBarras(rutaRelativa);
  return CARPETAS_DE_ACREDITACION.find((c) => ruta === c.ruta().toLowerCase())?.tipo ?? null;
}

/** De cuál de los dos submódulos es esta ruta, sea su carpeta o algo que cuelga de ella. */
export function acreditacionDeRuta(rutaRelativa: string): TipoDeAcreditacion | null {
  const ruta = sinBarras(rutaRelativa);
  return (
    CARPETAS_DE_ACREDITACION.find((c) => {
      const base = c.ruta().toLowerCase();
      return ruta === base || ruta.startsWith(`${base}/`);
    })?.tipo ?? null
  );
}

/** Si esta ruta ES la carpeta de Acreditación de personas o de vehículos (la 1.3 o la 1.4). */
export function esCarpetaDeAcreditacion(rutaRelativa: string): boolean {
  return tipoDeCarpetaDeAcreditacion(rutaRelativa) !== null;
}

/**
 * Si esta ruta es una carpeta de Acreditación (1.3 o 1.4) O algo que cuelga de ella (la carpeta de
 * una persona o de un vehículo, un archivo).
 *
 * Todo ese árbol es de SOLO LECTURA desde Contrato DCH: lo que hay ahí lo sube y lo mantiene el
 * submódulo de acreditación, que además es quien sabe si cada documento está cargado y vigente.
 * Dejar subir o borrar desde dos lados es la forma de que el expediente y su ficha digan cosas
 * distintas.
 */
export function estaEnAcreditacion(rutaRelativa: string): boolean {
  return acreditacionDeRuta(rutaRelativa) !== null;
}

/**
 * Si el nombre de esta carpeta lo usa el core y por eso no se puede cambiar desde acá.
 *
 * El core encuentra algunas carpetas POR SU NOMBRE (la configuración guarda rutas, no ids):
 *  · la raíz de la sección;
 *  · las de Acreditación (1.3 y 1.4) y todo lo que cuelga de ellas —las carpetas de cada
 *    persona y vehículo se nombran solas con sus datos, y renombrarlas a mano se perdería
 *    en la próxima edición de la ficha—;
 *  · las que están en el camino hacia ellas (DOCUMENTOS GENERALES): renombrar la de
 *    arriba deja la ruta configurada apuntando a nada;
 *  · DOCUMENTOS GENERALES por sí misma, de la que salen el plazo y el avance del tablero;
 *  · las de primer nivel ocultas o de los submódulos (Logística, Gastos).
 *
 * Todo lo demás se identifica por id en la base, así que cambiarle el nombre no pierde
 * estados, comentarios ni responsables.
 */
export function carpetaProtegida(rutaRelativa: string): boolean {
  const ruta = sinBarras(rutaRelativa);
  if (!ruta) return true;
  if (estaEnAcreditacion(rutaRelativa)) return true;
  if (CARPETAS_DE_ACREDITACION.some((c) => sinBarras(c.ruta()).startsWith(`${ruta}/`))) return true;

  const [primerNivel] = ruta.split("/");
  if (ruta === primerNivel && (primerNivel === "documentos generales" || estaOculta(primerNivel))) return true;
  return false;
}

/**
 * La ruta relativa de un elemento según SharePoint, y si es una carpeta. Null si no está
 * dentro de la sección o no se pudo leer.
 *
 * Para las reglas que dependen de DÓNDE está algo: la ruta que manda el navegador a una
 * Server Action se puede inventar, la que devuelve Graph no.
 */
export async function rutaDeElemento(
  seccion: Seccion,
  itemId: string,
): Promise<{ ruta: string; esCarpeta: boolean } | null> {
  try {
    const item = await graph<ItemGraph & { parentReference?: { path?: string } }>(
      `/sites/${await sitio()}/drive/items/${encodeURIComponent(itemId)}?$select=id,name,folder,parentReference`,
    );
    const padre = item.parentReference?.path;
    if (!padre) return null;

    const completa = decodeURIComponent(padre.replace(/^.*?root:/, "")).replace(/^\/+/, "");
    const base = seccion.carpeta.replace(/^\/+|\/+$/g, "");
    if (completa.toLowerCase() !== base.toLowerCase() && !completa.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
      return null;
    }
    const relativaDelPadre = completa.slice(base.length).replace(/^\/+/, "");
    return {
      ruta: [relativaDelPadre, item.name].filter(Boolean).join("/"),
      esCarpeta: Boolean(item.folder),
    };
  } catch {
    return null;
  }
}

/**
 * Si un requisito (carpeta hoja) ya tiene documentos dentro.
 *
 * Sale del `childCount` que Graph entrega en el listado del padre, así que saberlo no
 * cuesta ninguna llamada. Una hoja no tiene subcarpetas, o no sería hoja: lo que cuenta
 * son archivos.
 *
 * La carpeta de Acreditación es la excepción: por dentro tiene una carpeta por persona,
 * no documentos, y contarla «subida» porque ya hay gente en la nómina daría por cumplido
 * un requisito que se sigue en su propio submódulo.
 */
export function tieneDocumentos(carpeta: Pick<ElementoSharePoint, "elementos" | "ruta">): boolean {
  return (carpeta.elementos ?? 0) > 0 && !esCarpetaDeAcreditacion(carpeta.ruta);
}

export interface ElementoSharePoint {
  id: string;
  nombre: string;
  esCarpeta: boolean;
  /** Cuántos elementos tiene dentro, si es carpeta. */
  elementos: number | null;
  tamano: number | null;
  modificadoEn: string;
  modificadoPor: string | null;
  /** Quién lo subió y cuándo. Lo sabe SharePoint: no hace falta guardarlo. */
  subidoPor: string | null;
  subidoEn: string | null;
  /** La ruta relativa a la carpeta raíz, para navegar sin arrastrar ids. */
  ruta: string;
  /** Enlace para abrir el archivo en SharePoint, en el navegador. */
  webUrl: string;
}

export class ErrorDeGraph extends Error {
  constructor(
    message: string,
    /** Para distinguir "falta volver a entrar" de "no tienes acceso a esa carpeta". */
    readonly estado: number,
  ) {
    super(message);
    this.name = "ErrorDeGraph";
  }
}

/**
 * Llama a Graph CON EL TOKEN DE QUIEN TIENE LA SESIÓN.
 *
 * Es lo que hace que los permisos del sitio sigan mandando: si una persona no
 * está en el grupo privado de CONTRATOS, Graph le responde 403 y el core no
 * tiene forma de pasar por encima. No hay una identidad de aplicación que pueda
 * ver más que la persona.
 */
async function graph<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const session = await auth();
  if (!session?.user?.email) {
    throw new ErrorDeGraph("No hay sesión. Vuelve a entrar.", 401);
  }

  let accessToken: string;
  try {
    // Sale de la base, cifrado, y se refresca ahí mismo si hace falta. El token
    // NO está en la sesión: lo que devuelve el callback `session` se publica en
    // /api/auth/session, que cualquier JavaScript de la página puede pedir.
    accessToken = await obtenerAccessToken(session.user.email);
  } catch (e) {
    if (e instanceof SinCredencialesDeGraph) throw new ErrorDeGraph(e.message, 401);
    throw new ErrorDeGraph(
      `No se pudo renovar el acceso a Microsoft (${e instanceof Error ? e.message : "desconocido"}). ` +
        "Cierra sesión y vuelve a entrar; si sigue, un administrador tiene que aprobar los permisos en Entra.",
      401,
    );
  }

  const respuesta = await fetch(`https://graph.microsoft.com/v1.0${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...opciones.headers,
    },
    // SharePoint es la fuente de verdad y cambia por fuera del core: cachear un
    // listado significa mostrar una carpeta que ya no existe.
    cache: "no-store",
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    const motivo = cuerpo?.error?.message ?? `HTTP ${respuesta.status}`;
    throw new ErrorDeGraph(mensajeLegible(respuesta.status, motivo), respuesta.status);
  }

  // Un DELETE responde 204 sin cuerpo, y .json() sobre eso lanza. No hay nada que
  // devolver, y quien llama (eliminarElemento) no lo usa.
  if (respuesta.status === 204) return undefined as T;

  return (await respuesta.json()) as T;
}

/** Traduce lo que devuelve Graph a algo que diga qué hacer. */
function mensajeLegible(estado: number, motivo: string): string {
  if (estado === 401) return "Tu sesión con Microsoft caducó. Cierra sesión y vuelve a entrar.";
  if (estado === 403) {
    return (
      "Tu cuenta no tiene acceso a esta carpeta en SharePoint. El core no puede dárselo: " +
      "los permisos los decide el sitio Core Pertec. Si tu correo no es de Pertec, " +
      "además hace falta que te inviten al sitio como usuario externo: entrar al core y tener " +
      "acceso a los documentos son dos permisos distintos."
    );
  }
  // 404 en una carpeta que existe suele ser lo mismo que un 403: SharePoint
  // responde "no existe" para lo que uno no puede ver, así que decir solo "ya no
  // existe" manda a buscar un problema que no es.
  if (estado === 404) {
    return (
      "No se encontró esa carpeta en SharePoint. O la movieron, o tu cuenta no tiene acceso " +
      "al sitio Core Pertec —SharePoint responde lo mismo en los dos casos."
    );
  }
  // Crear o renombrar con un nombre que ya está en esa carpeta: sin esto llegaba el
  // texto de Microsoft, en inglés.
  if (estado === 409) return "Ya hay una carpeta o un archivo con ese nombre ahí. Elige otro.";
  return motivo;
}

/**
 * Valida una ruta relativa al módulo y devuelve sus segmentos.
 *
 * El punto está en `..`: un segmento así saca la ruta de CARPETA DE ARRANQUE
 * hacia el resto de la biblioteca. No es escalada de privilegios —el token es el
 * de la persona, así que no puede ver nada que no viera en SharePoint— pero sí
 * rompe la promesa del módulo, que dice trabajar sobre una carpeta concreta.
 *
 * Las rutas llegan desde la URL y desde los argumentos de las Server Actions,
 * que son endpoints: se pueden invocar a mano, sin pasar por la interfaz. Así
 * que la comprobación va acá, en el único punto por el que pasan todas, y no en
 * cada acción — donde faltó en dos de ellas y es exactamente lo que encontró la
 * revisión.
 */
export function segmentosDeRuta(rutaRelativa: string): string[] {
  const partes = rutaRelativa.split("/").filter(Boolean);

  for (const parte of partes) {
    if (parte === "." || parte === "..") {
      throw new ErrorDeGraph(`Ruta inválida: "${rutaRelativa}".`, 400);
    }
    // Los caracteres que SharePoint no admite en un nombre. Uno de ellos es la
    // barra invertida, que en una ruta pasaría por separador en otros sistemas.
    if (/["*:<>?\\|]/.test(parte)) {
      throw new ErrorDeGraph(`Ruta inválida: "${rutaRelativa}".`, 400);
    }
  }

  return partes;
}

/** El nombre de un archivo o carpeta, sin nada que lo convierta en una ruta. */
export function validarNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (!limpio) throw new ErrorDeGraph("El nombre no puede estar vacío.", 400);
  if (limpio === "." || limpio === "..") throw new ErrorDeGraph("Nombre inválido.", 400);
  if (/[/\\]/.test(limpio)) {
    throw new ErrorDeGraph("El nombre no puede contener barras.", 400);
  }
  if (/["*:<>?|]/.test(limpio)) {
    throw new ErrorDeGraph(
      'El nombre no puede tener ninguno de estos caracteres: " * : < > ? |',
      400,
    );
  }
  return limpio;
}

/** La ruta completa dentro de la biblioteca, a partir de la ruta relativa del módulo. */
function rutaCompleta(seccion: Seccion, rutaRelativa: string): string {
  // La carpeta de una sección puede ser una RUTA y no un solo nombre
  // ("CARPETA DE ARRANQUE/ACREDITACION"), así que se parte igual que el resto:
  // si fuera un único segmento, la barra se codificaría como %2F y SharePoint
  // buscaría una carpeta con ese nombre literal.
  const partes = [...seccion.carpeta.split("/").filter(Boolean), ...segmentosDeRuta(rutaRelativa)];
  // Cada segmento se codifica por separado: los nombres de estas carpetas tienen
  // espacios, puntos y acentos ("1.- Contrato orden de servicio (OS)"), y
  // codificar la ruta entera de una vez se come las barras que la separan.
  return partes.map((p) => encodeURIComponent(p)).join("/");
}

interface ItemGraph {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  createdBy?: { user?: { displayName?: string } };
  createdDateTime?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

/** Lo que hay dentro de una carpeta, ordenado con las carpetas primero. */
export async function listar(
  seccion: Seccion,
  rutaRelativa: string,
): Promise<ElementoSharePoint[]> {
  const ruta = rutaCompleta(seccion, rutaRelativa);
  const datos = await graph<{ value: ItemGraph[] }>(
    `/sites/${await sitio()}/drive/root:/${ruta}:/children` +
      "?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy," +
      "createdBy,createdDateTime,folder,file&$top=500",
  );

  const enLaRaiz = rutaRelativa === "";

  return datos.value
    .filter((item) => !(enLaRaiz && item.folder && estaOculta(item.name)))
    .map((item) => ({
      id: item.id,
      nombre: item.name,
      esCarpeta: Boolean(item.folder),
      elementos: item.folder?.childCount ?? null,
      tamano: item.file ? (item.size ?? null) : null,
      modificadoEn: item.lastModifiedDateTime,
      modificadoPor: item.lastModifiedBy?.user?.displayName ?? null,
      subidoPor: item.createdBy?.user?.displayName ?? null,
      subidoEn: item.createdDateTime ?? null,
      ruta: [rutaRelativa, item.name].filter(Boolean).join("/"),
      webUrl: item.webUrl,
    }))
    .sort((a, b) => {
      // Carpetas antes que archivos, y dentro de cada grupo por nombre. Es el
      // orden de cualquier explorador, y el que la gente espera; SharePoint
      // devuelve lo que quiere.
      if (a.esCarpeta !== b.esCarpeta) return a.esCarpeta ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
    });
}

/**
 * El enlace para ver o descargar un archivo.
 *
 * Es el `@microsoft.graph.downloadUrl` que da Graph: una URL pre-autenticada y
 * de vida corta, el equivalente a los enlaces firmados que usaba la versión
 * anterior sobre Supabase. No lleva el token de nadie.
 */
export async function enlaceDeArchivo(
  seccion: Seccion,
  rutaRelativa: string,
): Promise<string | null> {
  const item = await graph<ItemGraph>(
    `/sites/${await sitio()}/drive/root:/${rutaCompleta(seccion, rutaRelativa)}` +
      "?$select=id,name,file,@microsoft.graph.downloadUrl",
  );
  return item["@microsoft.graph.downloadUrl"] ?? null;
}

/**
 * Abre una sesión de subida y devuelve la URL a la que el navegador manda el
 * archivo.
 *
 * El archivo no pasa por el servidor del core, igual que antes con Supabase, y
 * por la misma razón: el cuerpo de una Server Action está limitado a 1 MB por
 * omisión y la plataforma corta en 4,5 MB. Un contrato escaneado pasa de ahí sin
 * esfuerzo.
 *
 * La URL que devuelve Graph ya viene autorizada para ESE archivo en ESA carpeta
 * y caduca sola, así que el navegador no necesita —ni recibe— ningún token.
 */
export async function sesionDeSubida(
  seccion: Seccion,
  rutaCarpeta: string,
  nombreArchivo: string,
): Promise<{ url: string }> {
  const destino = rutaCompleta(
    seccion,
    [rutaCarpeta, validarNombre(nombreArchivo)].filter(Boolean).join("/"),
  );

  const datos = await graph<{ uploadUrl: string }>(
    `/sites/${await sitio()}/drive/root:/${destino}:/createUploadSession`,
    {
      method: "POST",
      body: JSON.stringify({
        item: {
          // Si ya hay un archivo con ese nombre, SharePoint le agrega un sufijo
          // en vez de pisarlo. Reemplazar sería perder la versión anterior sin
          // preguntar, y acá hay contratos firmados de por medio.
          "@microsoft.graph.conflictBehavior": "rename",
        },
      }),
    },
  );

  return { url: datos.uploadUrl };
}

export async function crearCarpeta(
  seccion: Seccion,
  rutaPadre: string,
  nombre: string,
): Promise<void> {
  const limpio = validarNombre(nombre);
  const ruta = rutaCompleta(seccion, rutaPadre);
  await graph(`/sites/${await sitio()}/drive/root:/${ruta}:/children`, {
    method: "POST",
    body: JSON.stringify({
      name: limpio,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  olvidarEstructura();
}

/**
 * La carpeta misma, no sus hijos.
 *
 * Hace falta porque el listado devuelve los HIJOS: el id de la carpeta en la que
 * uno está no viene en esa respuesta, y es ese id —no la ruta— el que identifica
 * al requisito en la tabla de estados, porque sobrevive a renombrarla.
 */
export async function obtenerCarpeta(
  seccion: Seccion,
  rutaRelativa: string,
): Promise<{ id: string; nombre: string; webUrl: string } | null> {
  try {
    const item = await graph<ItemGraph>(
      `/sites/${await sitio()}/drive/root:/${rutaCompleta(seccion, rutaRelativa)}?$select=id,name,webUrl`,
    );
    return { id: item.id, nombre: item.name, webUrl: item.webUrl };
  } catch {
    return null;
  }
}

/** El enlace a la carpeta en SharePoint, para abrirla allá. */
export async function enlaceDeCarpeta(
  seccion: Seccion,
  rutaRelativa: string,
): Promise<string | null> {
  try {
    const item = await graph<ItemGraph>(
      `/sites/${await sitio()}/drive/root:/${rutaCompleta(seccion, rutaRelativa)}?$select=webUrl`,
    );
    return item.webUrl ?? null;
  } catch {
    // El enlace es una comodidad, no el contenido: si falla, la página se dibuja
    // igual y simplemente no aparece el botón.
    return null;
  }
}

/** Word, Excel y PowerPoint: los que necesitan a Office Online para verse. */
export function esDeOffice(nombre: string): boolean {
  return /\.(docx?|xlsx?|pptx?)$/i.test(nombre);
}

export function sePuedeVerEnLinea(nombre: string): boolean {
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|csv)$/i.test(nombre) || esDeOffice(nombre);
}

/**
 * Una URL para ver el archivo incrustado, sin descargarlo.
 *
 * Hace falta para los documentos de Office, que son casi todo el checklist: el
 * navegador no sabe dibujar un .docx ni un .xlsx, así que apuntar un iframe al
 * enlace de descarga solo conseguía que el archivo se bajara al abrirlo. Esta
 * acción de Graph devuelve la URL de Office Online para ESE archivo, en modo
 * lectura y con permiso ya resuelto.
 *
 * Es de lectura a propósito: editar se hace en SharePoint, por el enlace que el
 * visor tiene al lado. Así el control de versiones, el bloqueo y los permisos de
 * edición siguen siendo los de allá y no algo que el core reimplemente.
 */
export async function vistaPreviaDeArchivo(
  seccion: Seccion,
  rutaRelativa: string,
): Promise<string | null> {
  try {
    const respuesta = await graph<{ getUrl?: string }>(
      `/sites/${await sitio()}/drive/root:/${rutaCompleta(seccion, rutaRelativa)}:/preview`,
      { method: "POST", body: "{}" },
    );
    return respuesta.getUrl ?? null;
  } catch {
    // Sin vista previa el visor cae a su estado de "no se puede ver acá", que
    // ofrece descargar y abrir en SharePoint. Peor sería no abrir nada.
    return null;
  }
}

/** Para mostrar: 1536 → "1,5 KB". */
export function formatearPeso(bytes: number | null): string {
  if (!bytes) return "—";
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(i === 0 ? 0 : 1).replace(".", ",")} ${unidades[i]}`;
}

/**
 * La estructura de carpetas, recordada un minuto por persona.
 *
 * Armar el avance de la portada baja el árbol entero nivel por nivel —una llamada a
 * Graph por carpeta, decenas en total—, y volver a la portada o entrar a una carpeta y
 * salir repetía todo. Pero la ESTRUCTURA (qué carpetas hay) casi no cambia, a
 * diferencia de los archivos, así que se recuerda.
 *
 * Tres decisiones que no son obvias:
 *
 *  · La clave lleva el CORREO. Graph responde con el token de cada persona y sus
 *    permisos mandan: si dos personas compartieran la entrada, la que tiene menos
 *    acceso vería los nombres de carpetas que no puede abrir. Con la clave por
 *    persona, lo recordado es exactamente lo que Graph le respondió a ELLA.
 *
 *  · Se guarda la PROMESA, no el resultado. La página de una carpeta pide el mismo
 *    subárbol dos veces a la vez (el avance de arriba y el de cada tarjeta), y con el
 *    resultado solamente ambas llamadas salían a Graph antes de que la primera
 *    terminara. Con la promesa la segunda espera a la primera y comparte su respuesta.
 *
 *  · Solo lo usa hojasBajo. El listado que dibuja una carpeta (`listar`) sigue yendo
 *    siempre a Graph: ahí se ven los archivos, y un archivo recién subido que no
 *    aparece parece un fallo del core.
 *
 * Quien cambia carpetas desde el core (crear, renombrar, eliminar) la descarta con
 * olvidarEstructura(). Un cambio hecho DESDE SharePoint se ve en un minuto.
 *
 * Es memoria de cada instancia del servidor, no compartida.
 */
const VIGENCIA_ESTRUCTURA_MS = 60_000;
const MAXIMO_DE_ENTRADAS = 2_000;
const estructuraRecordada = new Map<
  string,
  { hijos: Promise<ElementoSharePoint[]>; hasta: number }
>();

export function olvidarEstructura(): void {
  estructuraRecordada.clear();
  olvidarDashboard();
}

async function listarEstructura(
  seccion: Seccion,
  rutaRelativa: string,
): Promise<ElementoSharePoint[]> {
  const session = await auth();
  // La carpeta de la sección y no su slug: el slug es "arranque" en todos los contratos.
  const clave = `${session?.user?.email?.toLowerCase() ?? ""}|${seccion.carpeta}|${rutaRelativa}`;

  const ahora = Date.now();
  const recordada = estructuraRecordada.get(clave);
  if (recordada && recordada.hasta > ahora) return recordada.hijos;

  // Sin tope, la memoria de una instancia de larga vida crecería con cada carpeta
  // que cualquier persona abriera. Pasado el límite se parte de cero: es una
  // memoria de apoyo, no una fuente de verdad.
  if (estructuraRecordada.size >= MAXIMO_DE_ENTRADAS) estructuraRecordada.clear();

  const hijos = listar(seccion, rutaRelativa);
  estructuraRecordada.set(clave, { hijos, hasta: ahora + VIGENCIA_ESTRUCTURA_MS });
  // Un fallo NO se recuerda: un 403 o una caída de red pasajera no pueden quedar
  // pegados un minuto. Se descarta solo si la entrada sigue siendo esta.
  hijos.catch(() => {
    if (estructuraRecordada.get(clave)?.hijos === hijos) estructuraRecordada.delete(clave);
  });
  return hijos;
}

/**
 * Los archivos de un requisito (una carpeta hoja), para saber en qué etapa de revisión va.
 *
 * Sale de la MISMA lectura que ya hizo hojasBajo al bajar el árbol —y que quedó en la
 * memoria de la estructura—, así que casi nunca cuesta una llamada a Graph: pedir los
 * archivos de las 14 filas de una lista no son 14 llamadas más. Si la lectura falla (sin
 * acceso, caída) devuelve vacío: la etapa de un requisito es un dato de apoyo, y no puede
 * tumbar la lista donde se ve.
 */
export async function archivosDeHoja(
  seccion: Seccion,
  carpeta: Pick<ElementoSharePoint, "elementos" | "ruta">,
): Promise<{ id: string; nombre: string }[]> {
  if (!tieneDocumentos(carpeta)) return [];
  try {
    const hijos = await listarEstructura(seccion, carpeta.ruta);
    return hijos.filter((h) => !h.esCarpeta).map((h) => ({ id: h.id, nombre: h.nombre }));
  } catch {
    return [];
  }
}

/**
 * Las carpetas HOJA que cuelgan de una ruta: las que no tienen subcarpetas.
 *
 * Son los requisitos. Las intermedias ("1.1 AREA DE SEGURIDAD Y SALUD") agrupan,
 * no se entregan, y contarlas distorsionaría el avance — una carpeta con ocho
 * requisitos aparecería con nueve.
 *
 * La regla se mantiene sola: si alguien le crea una subcarpeta a una hoja, deja
 * de serlo y pasan a contar sus hijas. No hay nada que marcar en ninguna parte.
 *
 * Graph no sabe listar un árbol de una vez, así que esto baja nivel por nivel,
 * en paralelo dentro de cada uno. El límite de profundidad no es por rendimiento:
 * es un seguro contra una estructura más honda de lo previsto, que convertiría
 * una página en cientos de llamadas.
 */
export async function hojasBajo(
  seccion: Seccion,
  rutaRelativa: string,
  profundidadMaxima = 4,
  /** Los hijos ya listados, si quien llama acaba de pedirlos. Evita repetir la llamada. */
  hijosConocidos?: ElementoSharePoint[],
): Promise<ElementoSharePoint[]> {
  if (profundidadMaxima <= 0) return [];

  const hijos = hijosConocidos ?? (await listarEstructura(seccion, rutaRelativa));
  const carpetas = hijos.filter((h) => h.esCarpeta);
  if (carpetas.length === 0) return [];

  const resultados = await Promise.all(
    carpetas.map(async (carpeta) => {
      // childCount viene en el listado del padre, así que saber si una carpeta
      // tiene hijos NO cuesta una llamada extra. Solo se baja a las que las
      // tienen, y una hoja se resuelve sin pedir nada.
      if (!carpeta.elementos) return [carpeta];

      // La carpeta de Acreditación es UN requisito de Contratos, no un árbol de
      // requisitos: por dentro tiene una carpeta por persona, y cada una pasaría
      // por hoja. Una acreditación nueva sumaría un requisito pendiente al avance
      // de DOCUMENTOS GENERALES, que no tiene nada que ver con lo que falta. El
      // avance de las personas se sigue en el submódulo, con su propio cálculo.
      if (esCarpetaDeAcreditacion(carpeta.ruta)) return [carpeta];

      const nietas = await hojasBajo(seccion, carpeta.ruta, profundidadMaxima - 1);
      // Con hijos pero sin subcarpetas —solo archivos— la carpeta es una hoja:
      // es exactamente el caso de un requisito que ya tiene su documento.
      return nietas.length > 0 ? nietas : [carpeta];
    }),
  );

  return resultados.flat();
}

/**
 * La carpeta `nombre` dentro de `rutaPadre`, creándola si no existe.
 *
 * Devuelve el id y no la ruta: es el id lo que se guarda en la base y por el que
 * se sube después, porque sobrevive a que alguien renombre o mueva la carpeta.
 */
export async function asegurarCarpeta(
  seccion: Seccion,
  rutaPadre: string,
  nombre: string,
): Promise<{ id: string; webUrl: string }> {
  const limpio = validarNombre(nombre);
  const ruta = [rutaPadre, limpio].filter(Boolean).join("/");

  const existente = await obtenerCarpeta(seccion, ruta);
  if (existente) return { id: existente.id, webUrl: existente.webUrl };

  try {
    const creada = await graph<ItemGraph>(
      `/sites/${await sitio()}/drive/root:/${rutaCompleta(seccion, rutaPadre)}:/children`,
      {
        method: "POST",
        body: JSON.stringify({
          name: limpio,
          folder: {},
          // "fail" y no "rename": con "rename", dos personas subiendo por primera
          // vez al mismo tiempo crearían dos carpetas para la misma ficha.
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
    );
    olvidarEstructura();
    return { id: creada.id, webUrl: creada.webUrl };
  } catch (e) {
    // Perdió la carrera: la otra petición ya la creó. Se usa esa.
    if (e instanceof ErrorDeGraph && e.estado === 409) {
      const ahora = await obtenerCarpeta(seccion, ruta);
      if (ahora) return { id: ahora.id, webUrl: ahora.webUrl };
    }
    throw e;
  }
}

/**
 * Abre una sesión de subida DENTRO de una carpeta, direccionada por su id.
 *
 * Por id y no por ruta: la carpeta de una persona puede haberse renombrado desde
 * SharePoint (se corrigió una errata en el nombre), y subir por la ruta vieja
 * crearía otra carpeta con el nombre antiguo. El id no cambia.
 */
export async function sesionDeSubidaEnCarpeta(
  carpetaItemId: string,
  nombreArchivo: string,
): Promise<{ url: string }> {
  const nombre = validarNombre(nombreArchivo);

  const datos = await graph<{ uploadUrl: string }>(
    `/sites/${await sitio()}/drive/items/${encodeURIComponent(carpetaItemId)}:/${encodeURIComponent(nombre)}:/createUploadSession`,
    {
      method: "POST",
      body: JSON.stringify({
        // Mismo criterio que sesionDeSubida: no se pisa nada. Acá además importa
        // porque un documento puede tener varios archivos (las 12 cotizaciones).
        item: { "@microsoft.graph.conflictBehavior": "rename" },
      }),
    },
  );

  return { url: datos.uploadUrl };
}

/**
 * Lo que SharePoint dice de un elemento, para no creerle al navegador.
 *
 * Al terminar una subida el navegador le cuenta al servidor "se creó el archivo X
 * con este enlace". Un cliente puede mentir —las Server Actions son endpoints—, y
 * un enlace inventado en el expediente de una persona es justo lo que no debe
 * pasar. Así que el servidor pregunta, y además comprueba que el archivo cuelgue
 * de la carpeta de esa persona y no de cualquier otra parte del sitio.
 */
export async function obtenerElemento(
  itemId: string,
): Promise<{ id: string; nombre: string; webUrl: string; carpetaId: string | null } | null> {
  try {
    const item = await graph<ItemGraph & { parentReference?: { id?: string } }>(
      `/sites/${await sitio()}/drive/items/${encodeURIComponent(itemId)}` +
        "?$select=id,name,webUrl,parentReference",
    );
    return {
      id: item.id,
      nombre: item.name,
      webUrl: item.webUrl,
      carpetaId: item.parentReference?.id ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * ¿Este elemento cuelga de la carpeta de Acreditación? Lo dice SharePoint, no el navegador.
 *
 * Eliminar recibe un id y la ruta de la carpeta que el navegador SAYS que es: una ruta que se
 * puede mentir en una Server Action. Para que lo de solo lectura lo sea de verdad, se le pregunta
 * a Graph dónde está el elemento. Si no se puede saber, se responde que SÍ: ante la duda de si
 * es del expediente de una persona, no se borra.
 */
export async function colgaDeAcreditacion(seccion: Seccion, itemId: string): Promise<boolean> {
  try {
    const item = await graph<ItemGraph & { parentReference?: { path?: string } }>(
      `/sites/${await sitio()}/drive/items/${encodeURIComponent(itemId)}?$select=id,name,parentReference`,
    );
    const padre = item.parentReference?.path;
    if (!padre) return true;

    // «/drive/root:/CARPETA DE ARRANQUE/DOCUMENTOS GENERALES/1.3 …/RUT - Nombre»: lo que va
    // después de la carpeta de la sección es la ruta relativa que usa el resto del core.
    const completa = decodeURIComponent(padre.replace(/^.*?root:/, "")).replace(/^\/+/, "");
    const base = seccion.carpeta.replace(/^\/+|\/+$/g, "");
    if (!completa.toLowerCase().startsWith(base.toLowerCase())) return false;
    const relativa = completa.slice(base.length).replace(/^\/+/, "");
    return estaEnAcreditacion(relativa);
  } catch {
    return true;
  }
}

/**
 * Elimina un archivo o una carpeta de SharePoint.
 *
 * Va a la PAPELERA del sitio, no se borra de verdad: SharePoint la conserva
 * decenas de días y desde ahí se puede restaurar. Es lo que hace aceptable que el
 * core elimine algo, y por eso se usa DELETE normal y no una eliminación
 * permanente.
 *
 * Con el token de la persona: si no tiene permiso para eliminar en esa carpeta,
 * SharePoint responde 403 y el core no puede pasar por encima. Un elemento que ya
 * no existe (404) se da por eliminado: es lo que se quería, y reintentar un
 * borrado a medias no debe fallar por eso.
 */
export async function eliminarElemento(itemId: string): Promise<void> {
  try {
    await graph<void>(`/sites/${await sitio()}/drive/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    olvidarEstructura();
  } catch (e) {
    if (e instanceof ErrorDeGraph && e.estado === 404) return;
    if (e instanceof ErrorDeGraph && e.estado === 403) {
      throw new ErrorDeGraph(
        "Tu cuenta no tiene permiso para eliminar en esa carpeta de SharePoint. " +
          "El core no puede dártelo: lo decide el sitio.",
        403,
      );
    }
    throw e;
  }
}

/**
 * Cambia el nombre de un archivo o carpeta, direccionado por su id.
 *
 * Se usa para que la carpeta de una persona siga llamándose como ella cuando se
 * corrige su nombre. Devuelve el enlace nuevo, que cambia con el nombre.
 */
export async function renombrarElemento(
  itemId: string,
  nuevoNombre: string,
): Promise<{ webUrl: string }> {
  const item = await graph<ItemGraph>(
    `/sites/${await sitio()}/drive/items/${encodeURIComponent(itemId)}?$select=id,webUrl`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: validarNombre(nuevoNombre),
        // Si ya hay otra con ese nombre no se pisa ni se duplica: se prefiere el
        // error, que dice qué pasó, a una carpeta "Nombre 1".
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    },
  );
  olvidarEstructura();
  return { webUrl: item.webUrl };
}

export interface ArchivoDeCarpeta {
  id: string;
  nombre: string;
  tamano: number | null;
  subidoEn: string;
  subidoPor: string | null;
  webUrl: string;
}

/**
 * Los archivos que hay en una carpeta, direccionada por su id, los más nuevos primero.
 *
 * Por id y no por ruta, por lo mismo que sesionDeSubidaEnCarpeta: la carpeta pudo
 * renombrarse desde SharePoint. Se lee SIEMPRE de SharePoint y no de una copia en la
 * base: así aparece también lo que alguien dejó directo en la carpeta, y lo que se
 * eliminó allá deja de mostrarse sin que nadie tenga que sincronizar nada.
 *
 * Solo archivos: una subcarpeta dentro de la de una partida no es un documento.
 */
export async function listarArchivosDeCarpeta(carpetaItemId: string): Promise<ArchivoDeCarpeta[]> {
  const datos = await graph<{ value: ItemGraph[] }>(
    `/sites/${await sitio()}/drive/items/${encodeURIComponent(carpetaItemId)}/children` +
      "?$select=id,name,size,webUrl,createdBy,createdDateTime,folder,file&$top=200",
  );

  return datos.value
    .filter((item) => !item.folder)
    .map((item) => ({
      id: item.id,
      nombre: item.name,
      tamano: item.size ?? null,
      subidoEn: item.createdDateTime ?? "",
      subidoPor: item.createdBy?.user?.displayName ?? null,
      webUrl: item.webUrl,
    }))
    .sort((a, b) => b.subidoEn.localeCompare(a.subidoEn));
}
