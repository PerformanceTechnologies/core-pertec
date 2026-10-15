"use server";



import { enEsteContrato } from "@/lib/contratos/contrato-actual";
import { refrescarContrato } from "@/lib/contratos/refrescar";
import { signIn } from "@/auth";
import { redirect } from "next/navigation";
import { exigirAccesoApp, exigirCapacidad, exigirAdmin, tieneAccesoAApp } from "@/lib/contratos/autorizacion";
import { MENSAJE_SIN_PERMISO, puede, type Capacidad } from "@/lib/contratos/permisos";
import {
  CAMPOS_DE_PERSONA,
  hoyEnChile,
  type EstadoCurso,
  type EstadoDocumento,
  type ResultadoDeCurso,
  type TipoDeCapacitacion,
  type EstadoForm,
  type EstadoWebControl,
} from "@/lib/contratos/acreditacion-modelo";
import {
  actualizarCargo,
  actualizarDatos,
  actualizarSeguimiento,
  actualizarTipo,
  actualizarCurso,
  agregarCurso,
  cambiarActivo,
  cambiarEstadoCurso,
  crearCargo,
  crearPersona,
  crearTipo,
  eliminarCargo,
  eliminarPersona,
  eliminarTipo,
  guardarCarpetaDePersona,
  guardarEnlaceDeCarpeta,
  guardarContrato,
  guardarDocumento,
  guardarDotacion,
  listarCargos,
  listarTipos,
  obtenerArchivo,
  obtenerCurso,
  obtenerPersona,
  quitarCurso,
  vincularDocumentoACurso,
  vincularGastoACurso,
  fijarPlazoDeFactura,
  cambiarCreadoEnBuk,
  cambiarSinContrato,
  quitarRegistroDeArchivo,
  registrarArchivo,
  registrarHistorial,
  rutsExistentes,
  type Actor,
  type DatosDeCapacitacion,
} from "@/lib/contratos/acreditacion";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { olvidarAlertas } from "@/lib/contratos/acreditacion-alertas";
import { SCOPES_SHAREPOINT } from "@/lib/contratos/graph-token";
import {
  MAXIMO_IMPORTACION,
  comparable,
  leerTabla,
  type RevisionDeImportacion,
  type ResultadoDeImportacion,
} from "@/lib/contratos/acreditacion-importar";
import { normalizarRut, rutEsValido } from "@/lib/contratos/rut";
import { leerEnteroOpcional, nombreParaSharePoint } from "@/lib/contratos/validar-form";
import { leerMonto, MODULOS } from "@/lib/contratos/arranque-modelo";
import { asegurarCarpetaDePartida } from "@/lib/contratos/arranque-carpetas";
import { obtenerPartida } from "@/lib/contratos/arranque";
import { guardarGastoDeFactura, quitarGastoDeFactura } from "@/lib/contratos/capacitaciones-gastos";
import { PLAZOS_DE_PAGO, horaEsValida } from "@/lib/contratos/capacitaciones-modelo";
import {
  analizarCampo,
  analizarDatos,
  analizarNombre,
  analizarNumeroDePase,
  analizarRutDePersona,
  limpiarTexto,
  resumirErrores,
} from "@/lib/contratos/acreditacion-validacion";
import { ESTADOS_DE_PASE } from "@/lib/contratos/acreditacion-catalogos";
import {
  asegurarCarpeta,
  buscarSeccion,
  carpetaAcreditacion,
  eliminarElemento,
  obtenerElemento,
  renombrarElemento,
  sesionDeSubidaEnCarpeta,
} from "@/lib/contratos/sharepoint";
import type { UsuarioConAcceso } from "@/lib/contratos/tipos";

// exigirAccesoApp() se repite en CADA acción, no solo en la página. Una Server
// Action es un endpoint: se puede invocar sin pasar por la interfaz que la
// muestra, así que esconder un botón no protege nada.
//
// Y es solo la primera reja: la segunda la pone SharePoint, que responde con el
// token de la persona. Alguien con el submódulo asignado pero sin acceso a la
// carpeta 1.3 llega hasta acá y Graph lo frena al subir.
const APP = "acreditacion";

const RAIZ = "/contratos/acreditacion";

// -----------------------------------------------------------------------------
//  Validación: todo lo que llega de una acción es entrada no confiable
// -----------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(valor: unknown, nombre: string): string {
  const texto = String(valor ?? "");
  if (!UUID.test(texto)) throw new Error(`${nombre} inválido.`);
  return texto;
}

/** "AAAA-MM-DD" real (rechaza 2026-02-31), o null si viene vacío. */
function fecha(valor: unknown, etiqueta: string): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  const d = coincide ? new Date(Date.UTC(+coincide[1], +coincide[2] - 1, +coincide[3])) : null;
  if (!coincide || !d || d.toISOString().slice(0, 10) !== texto) {
    throw new Error(`${etiqueta}: la fecha no es válida.`);
  }
  return texto;
}

function texto(valor: unknown, largoMaximo = 200): string | null {
  const limpio = String(valor ?? "").trim();
  return limpio ? limpio.slice(0, largoMaximo) : null;
}

const ESTADOS_DOCUMENTO: EstadoDocumento[] = ["pendiente", "cargado", "observado", "no_aplica"];
const ESTADOS_WEB_CONTROL: EstadoWebControl[] = [
  "sin_cargar",
  "falta_contratos_examenes",
  "falta_un_documento",
  "al_dia",
];
const ESTADOS_CURSO: EstadoCurso[] = ["reservado", "realizado", "cancelado"];
const RESULTADOS_CURSO: ResultadoDeCurso[] = ["aprobado", "reprobado"];
const TIPOS_CAPACITACION: TipoDeCapacitacion[] = ["curso", "examen"];

/** La definición de un campo de CAMPOS_DE_PERSONA, por su nombre de columna. */
function campoDe(nombre: string) {
  const c = CAMPOS_DE_PERSONA.find((x) => x.campo === nombre);
  if (!c) throw new Error(`Campo desconocido: ${nombre}`);
  return c;
}

function actorDe(usuario: UsuarioConAcceso): Actor {
  return { id: usuario.id, nombre: usuario.nombre || usuario.correo };
}

/** Convierte una excepción en lo que un formulario puede mostrar. */
function comoError(e: unknown): EstadoForm {
  return { error: e instanceof Error ? e.message : "No se pudo guardar." };
}

function refrescarPersona(id: string) {
  refrescarContrato();
  refrescarContrato();
  // La insignia del menú guarda su número un minuto; un cambio hecho acá tiene que
  // verse en la página siguiente de quien lo hizo, no un minuto después.
  olvidarAlertas();
  // Una factura de un curso o examen es una línea de Gastos de arranque: su lista, su presupuesto y
  // la portada de Contratos tienen que mostrarla (o dejar de hacerlo) sin esperar.
  refrescarContrato();
  refrescarContrato();
}

/**
 * Pide los permisos de SharePoint y vuelve a Acreditación.
 *
 * Es la misma petición que hace Contratos (mismo proveedor, mismo `scope` más
 * ancho), pero con la guardia de ESTE módulo y regresando acá: la de Contratos
 * exige tener "contratos" asignado, y quien solo tiene Acreditación se quedaría
 * sin forma de conectarse.
 */
export async function conectarSharePointAction(): Promise<void> {
  await exigirAccesoApp(APP);
  await signIn("microsoft-entra-id", { redirectTo: await enEsteContrato(RAIZ) }, { scope: SCOPES_SHAREPOINT });
}

// -----------------------------------------------------------------------------
//  La carpeta de cada persona en SharePoint
//
//  Existe desde que la persona se da de alta, se renombra si se corrige su nombre
//  y se elimina con su ficha: SharePoint y el core dicen lo mismo. Todo con el
//  token de quien hace el cambio, así que los permisos del sitio siguen mandando.
// -----------------------------------------------------------------------------

/** Quita lo que SharePoint no admite en un nombre, y los puntos y espacios del final. */
function nombreSeguro(nombre: string, largoMaximo: number): string {
  return nombre
    .replace(/["*:<>?|/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, largoMaximo)
    .replace(/[. ]+$/, "");
}

function nombreDeCarpeta(persona: { rut: string; nombre: string }): string {
  return nombreSeguro(`${persona.rut} - ${persona.nombre}`, 100);
}

/** La carpeta de la persona: la que ya tiene, o la crea y la deja anotada. */
async function asegurarCarpetaDePersona(persona: {
  id: string;
  rut: string;
  nombre: string;
  carpetaItemId: string | null;
}): Promise<string> {
  if (persona.carpetaItemId) return persona.carpetaItemId;

  // La carpeta de Acreditación cuelga de la sección "arranque": es la misma
  // carpeta de arranque que recorre Contratos, y los permisos son los suyos.
  const seccion = await buscarSeccion("arranque");
  if (!seccion) throw new Error("La sección «arranque» no está configurada.");

  const carpeta = await asegurarCarpeta(seccion, carpetaAcreditacion(), nombreDeCarpeta(persona));
  await guardarCarpetaDePersona(persona.id, carpeta);
  return carpeta.id;
}

/**
 * Crea la carpeta al dar de alta, SIN hacer fallar el alta.
 *
 * La ficha es lo importante: si SharePoint no responde, o quien da de alta no ha
 * conectado su cuenta, la persona se crea igual y su carpeta se crea sola al
 * subir el primer documento. Fallar el alta por eso dejaría a quien carga una
 * nómina sin poder cargarla por un problema que se arregla solo después.
 */
async function crearCarpetaSiSePuede(
  persona: { id: string; rut: string; nombre: string },
  correo: string,
): Promise<boolean> {
  try {
    if (!(await tieneAccesoASharePoint(correo))) return false;
    await asegurarCarpetaDePersona({ ...persona, carpetaItemId: null });
    return true;
  } catch (e) {
    console.error(
      `[acreditacion] No se pudo crear la carpeta de ${persona.rut}: ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}

// -----------------------------------------------------------------------------
//  Personas
// -----------------------------------------------------------------------------

export async function crearPersonaAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "crear");

  let id: string;
  try {
    // Nombre y RUT pasan por la misma validación que el formulario y que la carga masiva
    // (acreditacion-validacion.ts). El RUT es la llave de la ficha: uno mal tipeado crea una
    // persona que nadie encuentra después ni sabe que está duplicada.
    const nombre = analizarNombre(String(form.get("nombre") ?? ""));
    if (nombre.error) throw new Error(nombre.error);
    const rut = analizarRutDePersona(String(form.get("rut") ?? ""));
    if (rut.error) throw new Error(rut.error);

    // Faena y turno son listas con «otro»: se guardan con la grafía oficial si coinciden con
    // una opción, y tal cual si no.
    const hoy = hoyEnChile();
    const faena = analizarCampo(campoDe("faena"), String(form.get("faena") ?? ""), { hoy });
    const turno = analizarCampo(campoDe("turno"), String(form.get("turno") ?? ""), { hoy });
    if (faena.error) throw new Error(faena.error);
    if (turno.error) throw new Error(turno.error);

    id = await crearPersona(
      {
        nombre: nombre.valor as string,
        rut: rut.valor as string,
        cargoId: uuid(form.get("cargo_id"), "Cargo"),
        faena: faena.valor,
        turno: turno.valor,
      },
      actorDe(usuario),
    );

    // Su carpeta en SharePoint nace con la ficha.
    await crearCarpetaSiSePuede({ id, rut: rut.valor as string, nombre: nombre.valor as string }, usuario.correo);
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertas();
  // Fuera del try: redirect() lanza una excepción por diseño, y dentro de un
  // catch se convertiría en un "error" más.
  redirect(await enEsteContrato(`${RAIZ}/${id}`));
}

export async function actualizarDatosAction(
  personaId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(personaId, "Persona");
    const anterior = await obtenerPersona(personaId);
    if (!anterior) throw new Error("La persona ya no existe.");

    const nombre = analizarNombre(String(form.get("nombre") ?? ""));
    if (nombre.error) throw new Error(nombre.error);

    // Todos los datos pasan por la validación y salen normalizados (teléfono con formato,
    // correo en minúsculas, lista con la grafía oficial). Lo que NO cambió respecto de lo
    // guardado se acepta tal cual: una ficha anterior a las listas no puede quedar bloqueada.
    const crudos: Record<string, string> = {};
    for (const c of CAMPOS_DE_PERSONA) crudos[c.campo] = String(form.get(c.campo) ?? "");
    const { datos, errores } = analizarDatos(crudos, anterior.persona.datos);
    if (errores.length > 0) throw new Error(resumirErrores(errores));

    await actualizarDatos(
      personaId,
      {
        nombre: nombre.valor as string,
        cargoId: uuid(form.get("cargo_id"), "Cargo"),
        indefinido: form.get("indefinido") === "on",
        datos,
      },
      actorDe(usuario),
    );

    // Si cambió el nombre, la carpeta en SharePoint cambia con él. Es lo último y
    // no hace fallar el guardado: los datos ya están guardados, y una carpeta con
    // el nombre viejo es un desorden, no una pérdida.
    const previa = anterior?.persona;
    if (previa?.carpetaItemId && previa.nombre !== nombre.valor) {
      try {
        const { webUrl } = await renombrarElemento(
          previa.carpetaItemId,
          nombreDeCarpeta({ rut: previa.rut, nombre: nombre.valor as string }),
        );
        await guardarEnlaceDeCarpeta(personaId, webUrl);
      } catch (e) {
        console.error(
          `[acreditacion] No se pudo renombrar la carpeta de ${previa.rut}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

export async function actualizarSeguimientoAction(
  personaId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(personaId, "Persona");
    const wc = String(form.get("estado_web_control") ?? "") as EstadoWebControl;
    if (!ESTADOS_WEB_CONTROL.includes(wc)) throw new Error("Estado de Web Control desconocido.");

    const pase = analizarNumeroDePase(String(form.get("numero_pase") ?? ""));
    if (pase.error) throw new Error(pase.error);

    // El estatus del pase es una lista cerrada. Si la ficha trae uno de antes de que existiera
    // la lista y no se toca, se conserva; lo nuevo tiene que ser una de las opciones.
    const estadoPase = limpiarTexto(String(form.get("estado_pase") ?? "")) || null;
    const previo = (await obtenerPersona(personaId))?.persona.estadoPase ?? null;
    if (estadoPase && estadoPase !== previo && !(ESTADOS_DE_PASE as readonly string[]).includes(estadoPase)) {
      throw new Error("El estatus del pase tiene que ser una de las opciones de la lista.");
    }

    await actualizarSeguimiento(
      personaId,
      {
        estadoWebControl: wc,
        wcAcreditado: form.get("wc_acreditado") === "on",
        creadoEnBuk: form.get("creado_en_buk") === "on",
        numeroPase: pase.valor,
        estadoPase: estadoPase,
        observaciones: texto(form.get("observaciones"), 1000),
      },
      actorDe(usuario),
    );
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

/**
 * «Creado en BUK» desde la pestaña Datos, junto a Guardar datos: es la misma casilla del seguimiento,
 * pero se guarda al tocarla, sin tener que enviar el formulario entero.
 */
export async function cambiarCreadoEnBukAction(personaId: string, creado: boolean): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    await cambiarCreadoEnBuk(uuid(personaId, "Persona"), Boolean(creado), actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

/**
 * «Sin contrato aún» desde Datos: saca a la persona de la dotación sin quitarla de la nómina ni de
 * los documentos. Se guarda al tocarlo, igual que «Creado en BUK».
 */
export async function cambiarSinContratoAction(personaId: string, sinContrato: boolean): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    await cambiarSinContrato(uuid(personaId, "Persona"), Boolean(sinContrato), actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

export async function cambiarActivoAction(personaId: string, activo: boolean) {
  const usuario = await exigirCapacidad(APP, "editar");
  await cambiarActivo(uuid(personaId, "Persona"), activo, actorDe(usuario));
  refrescarPersona(personaId);
}

/**
 * Elimina la ficha Y su carpeta en SharePoint.
 *
 * SharePoint va primero, y si falla no se toca la ficha: borrar la ficha y que la
 * carpeta quede huérfana en el sitio es peor que no borrar nada, porque ya nadie
 * sabe de quién es. La carpeta va a la papelera de SharePoint, así que se puede
 * restaurar desde allá; la ficha, con su historial, no.
 *
 * Solo administradores. Para quien ya no trabaja existe la baja, que conserva el
 * expediente entero.
 */
export async function eliminarPersonaAction(personaId: string): Promise<EstadoForm> {
  const admin = await exigirAdmin();

  try {
    uuid(personaId, "Persona");
    const encontrada = await obtenerPersona(personaId);
    if (!encontrada) throw new Error("La persona ya no existe.");

    if (encontrada.persona.carpetaItemId) {
      await eliminarElemento(encontrada.persona.carpetaItemId);
    }

    await eliminarPersona(personaId);
    console.info(
      `[acreditacion] ${admin.correo} eliminó la ficha ${encontrada.persona.rut} y su carpeta.`,
    );
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Documentos
// -----------------------------------------------------------------------------

/**
 * Abre la subida de un archivo a la carpeta de la persona, creando la carpeta la
 * primera vez, y le pone el nombre que corresponde: "07 - Examen preocupacional.pdf".
 *
 * El nombre lo decide el servidor, no el navegador. Así la carpeta de cada
 * persona queda ordenada igual que el checklist aunque suban "IMG_4421.jpg", y
 * quien abre SharePoint sin pasar por el core entiende qué es cada archivo.
 */
/**
 * Devuelve el error en vez de lanzarlo, y no es una preferencia de estilo.
 *
 * Next SANEA todo error lanzado desde una Server Action en producción: el
 * navegador no recibe "La persona ya no existe" ni el motivo que dio Graph, sino
 * siempre el mismo texto de React con un enlace a su documentación. Eso es lo
 * que aparecía en pantalla al fallar una subida. Devuelto, el motivo llega
 * entero y la persona sabe si tiene que conectar SharePoint, pedir acceso al
 * sitio o avisar de que la carpeta ya no está.
 */
export async function prepararSubidaDocumentoAction(
  personaId: string,
  tipoId: string,
  nombreOriginal: string,
): Promise<{ url: string; error?: undefined } | { url?: undefined; error: string }> {
  await exigirCapacidad(APP, "crear");
  uuid(personaId, "Persona");
  uuid(tipoId, "Documento");

  try {
    const [encontrada, tipos] = await Promise.all([obtenerPersona(personaId), listarTipos()]);
    if (!encontrada) return { error: "La persona ya no existe." };
    const tipo = tipos.find((t) => t.id === tipoId);
    if (!tipo) return { error: "Ese documento ya no está en el catálogo." };

    const { persona } = encontrada;

    const carpetaId = await asegurarCarpetaDePersona(persona);

    const extension = /(\.[A-Za-z0-9]{1,8})$/.exec(nombreOriginal)?.[1]?.toLowerCase() ?? "";
    const numero = String(tipo.orden).padStart(2, "0");
    const nombreFinal = `${numero} - ${nombreSeguro(tipo.nombre, 100)}${extension}`;

    return await sesionDeSubidaEnCarpeta(carpetaId, nombreFinal);
  } catch (e) {
    // El motivo de Graph —sin acceso al sitio, carpeta borrada, token caducado—
    // es justo lo que hace falta para saber qué hacer.
    console.error(`[acreditacion] No se pudo preparar la subida de ${personaId}:`, e);
    return { error: e instanceof Error ? e.message : "No se pudo preparar la subida." };
  }
}

/**
 * Lo que pasa cuando un archivo termina de subir.
 *
 * Se llama desde el navegador con el id que devolvió SharePoint. NO se le cree el
 * nombre ni el enlace: se le pregunta a SharePoint, y además se comprueba que el
 * archivo cuelgue de la carpeta de ESTA persona. Sin eso, cualquiera con el
 * módulo podría anotar en un expediente un enlace a cualquier otra parte.
 */
export async function registrarSubidaDocumentoAction(
  personaId: string,
  tipoId: string,
  itemId: string,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "crear");
  uuid(personaId, "Persona");
  uuid(tipoId, "Documento");

  const [encontrada, tipos, elemento] = await Promise.all([
    obtenerPersona(personaId),
    listarTipos(),
    obtenerElemento(String(itemId)),
  ]);
  // Devueltos y no lanzados, por lo mismo que arriba: lanzados, Next los
  // reemplaza por un texto de React antes de que lleguen al navegador.
  if (!encontrada) return { error: "La persona ya no existe." };
  if (!elemento) return { error: "SharePoint no reconoce el archivo que se acaba de subir." };
  if (!encontrada.persona.carpetaItemId || elemento.carpetaId !== encontrada.persona.carpetaItemId) {
    return { error: "Ese archivo no está en la carpeta de esta persona." };
  }

  const tipo = tipos.find((t) => t.id === tipoId);
  const actor = actorDe(usuario);

  await registrarArchivo(
    personaId,
    tipoId,
    { itemId: elemento.id, nombre: elemento.nombre, webUrl: elemento.webUrl },
    {},
    actor,
  );
  await registrarHistorial(
    personaId,
    "Documento subido",
    `${tipo?.nombre ?? "Documento"}: ${elemento.nombre}`,
    actor,
  );

  refrescarPersona(personaId);
  return { ok: true };
}

/**
 * Elimina un archivo de un documento, también en SharePoint.
 *
 * SharePoint primero: si se quitara antes el registro y SharePoint fallara, el core
 * diría "ya no está" de un archivo que sigue en el sitio. Al revés, un fallo a
 * medias se puede reintentar sin riesgo (un 404 se da por eliminado). El archivo va
 * a la papelera de SharePoint, de donde se puede restaurar.
 *
 * Se comprueba que el archivo sea de ESA persona: el id viaja desde el navegador.
 */
export async function eliminarArchivoAction(
  personaId: string,
  archivoId: string,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(personaId, "Persona");
    uuid(archivoId, "Archivo");

    const archivo = await obtenerArchivo(archivoId);
    if (!archivo || archivo.personaId !== personaId) {
      throw new Error("Ese archivo ya no está registrado en esta persona.");
    }

    await eliminarElemento(archivo.itemId);
    await quitarRegistroDeArchivo(archivo);
    await registrarHistorial(personaId, "Archivo eliminado", archivo.nombre, actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

export async function cambiarEstadoDocumentoAction(
  personaId: string,
  tipoId: string,
  estado: EstadoDocumento,
) {
  const usuario = await exigirCapacidad(APP, "editar");
  uuid(personaId, "Persona");
  uuid(tipoId, "Documento");
  if (!ESTADOS_DOCUMENTO.includes(estado)) throw new Error(`Estado desconocido: ${estado}`);

  const actor = actorDe(usuario);
  const tipos = await listarTipos();
  await guardarDocumento(personaId, tipoId, { estado }, actor);
  await registrarHistorial(
    personaId,
    "Estado de documento",
    `${tipos.find((t) => t.id === tipoId)?.nombre ?? "Documento"} → ${estado}`,
    actor,
  );

  refrescarPersona(personaId);
}

export async function guardarDetalleDocumentoAction(
  personaId: string,
  tipoId: string,
  detalle: { fechaEmision: string; fechaVencimiento: string; nota: string },
) {
  const usuario = await exigirCapacidad(APP, "crear");
  uuid(personaId, "Persona");
  uuid(tipoId, "Documento");

  const emision = fecha(detalle.fechaEmision, "Fecha de emisión");
  const vencimiento = fecha(detalle.fechaVencimiento, "Fecha de vencimiento");
  if (emision && vencimiento && vencimiento < emision) {
    throw new Error("El vencimiento no puede ser anterior a la emisión.");
  }

  await guardarDocumento(
    personaId,
    tipoId,
    { fechaEmision: emision, fechaVencimiento: vencimiento, nota: texto(detalle.nota, 500) },
    actorDe(usuario),
  );

  refrescarPersona(personaId);
}

export async function cambiarRequeridoExtraAction(
  personaId: string,
  tipoId: string,
  requerido: boolean,
) {
  const usuario = await exigirCapacidad(APP, "editar");
  uuid(personaId, "Persona");
  uuid(tipoId, "Documento");

  await guardarDocumento(personaId, tipoId, { requeridoExtra: requerido }, actorDe(usuario));
  refrescarPersona(personaId);
}

// -----------------------------------------------------------------------------
//  Cursos
// -----------------------------------------------------------------------------

/**
 * Lo que trae el formulario de un curso o examen, ya validado. Lo comparten agregar y editar: son
 * los mismos campos y las mismas reglas, y repetirlas es como una de las dos acaba aceptando algo
 * que la otra rechaza.
 */
function leerCapacitacion(form: FormData): DatosDeCapacitacion {
  const tipo = String(form.get("tipo") ?? "curso") as TipoDeCapacitacion;
  if (!TIPOS_CAPACITACION.includes(tipo)) throw new Error("Tipo desconocido: debe ser curso o examen.");

  const curso = texto(form.get("curso"), 80);
  if (!curso) throw new Error(tipo === "examen" ? "Falta el nombre del examen." : "Falta el nombre del curso.");

  const estado = String(form.get("estado") ?? "reservado") as EstadoCurso;
  if (!ESTADOS_CURSO.includes(estado)) throw new Error("Estado desconocido.");

  const fechaDelCurso = fecha(form.get("fecha"), "Fecha");

  const horaCruda = String(form.get("hora") ?? "").trim();
  const hora = horaCruda ? horaCruda.slice(0, 5) : null;
  if (hora !== null) {
    if (!horaEsValida(hora)) throw new Error("La hora no es válida.");
    // La base lo exige igual; acá se dice con palabras.
    if (!fechaDelCurso) throw new Error("Para anotar una hora hay que indicar la fecha.");
  }

  const resultadoCrudo = String(form.get("resultado") ?? "").trim();
  const resultado = resultadoCrudo ? (resultadoCrudo as ResultadoDeCurso) : null;
  if (resultado !== null && !RESULTADOS_CURSO.includes(resultado)) throw new Error("Resultado desconocido.");
  if (resultado !== null && estado !== "realizado") {
    throw new Error("El resultado solo se anota en lo que ya se realizó.");
  }

  return {
    tipo,
    curso,
    estado,
    fecha: fechaDelCurso,
    hora,
    lugar: texto(form.get("lugar"), 80),
    resultado,
    nota: texto(form.get("nota"), 300),
  };
}

export async function agregarCursoAction(
  personaId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "crear");

  try {
    uuid(personaId, "Persona");
    await agregarCurso(personaId, leerCapacitacion(form), actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

/** Corregir lo ya anotado (reprogramar, poner el resultado, cambiar el lugar) es editar. */
export async function actualizarCursoAction(
  personaId: string,
  cursoId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(personaId, "Persona");
    uuid(cursoId, "Curso");
    await actualizarCurso(personaId, cursoId, leerCapacitacion(form), actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

/**
 * El botón de la fila: marcar realizado (con su resultado si ya se sabe), volver a reservado o
 * cancelar. Devuelve el error en vez de lanzarlo: en producción Next esconde el mensaje de una
 * excepción de una Server Action y la persona vería un genérico.
 */
export async function cambiarEstadoCursoAction(
  personaId: string,
  cursoId: string,
  estado: EstadoCurso,
  resultado: ResultadoDeCurso | null = null,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    if (!ESTADOS_CURSO.includes(estado)) throw new Error("Estado desconocido.");
    if (resultado !== null && !RESULTADOS_CURSO.includes(resultado)) throw new Error("Resultado desconocido.");
    await cambiarEstadoCurso(uuid(personaId, "Persona"), uuid(cursoId, "Curso"), estado, actorDe(usuario), resultado);
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

/**
 * Si quien actúa puede además hacer `capacidad` en GASTOS DE ARRANQUE, o el mensaje que se le dice.
 *
 * Una factura crea y toca una línea de otro módulo, y el rol y los módulos asignados mandan ahí
 * igual que en cualquier otra parte: tener Acreditación no da derecho a escribir en Gastos. Se
 * DEVUELVE el mensaje (no se lanza ni se redirige) porque la acción lo muestra tal cual en el
 * formulario.
 */
async function sinAccesoAGastos(usuario: UsuarioConAcceso, capacidad: Capacidad): Promise<string | null> {
  if (!(await tieneAccesoAApp(usuario, MODULOS.gastos.appSlug))) {
    return "Para registrar facturas necesitas tener asignado el módulo Gastos de arranque.";
  }
  if (!puede(usuario.rol, capacidad)) return MENSAJE_SIN_PERMISO;
  return null;
}

/**
 * Quita un curso o examen que se agregó mal.
 *
 * Qué se lleva y qué no, a propósito:
 *  · SE VA el registro de la reserva.
 *  · SE VA, si se pide, el gasto de su factura en Gastos de arranque (con su carpeta, que queda en la
 *    papelera de SharePoint). Si no se pide, el gasto sigue siendo un gasto real y queda sin
 *    asociar: una factura que se pagó no deja de existir porque alguien corrigió una reserva.
 *  · SE QUEDA el documento que se subió a la ficha de la persona: es un papel suyo (un resultado de
 *    examen) y se elimina desde Documentos si de verdad sobra.
 */
export async function eliminarCursoAction(
  personaId: string,
  cursoId: string,
  quitarGasto: boolean,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(personaId, "Persona");
    uuid(cursoId, "Curso");
    const curso = await obtenerCurso(personaId, cursoId);
    if (!curso) throw new Error("Ese curso o examen ya no existe.");

    if (quitarGasto && curso.partidaGastoId) {
      const sinAcceso = await sinAccesoAGastos(usuario, "editar");
      if (sinAcceso) throw new Error(sinAcceso);
      // Primero el gasto: si falla (SharePoint, permisos), la reserva se queda y se puede reintentar,
      // en vez de dejar una factura huérfana que ya nadie sabe de dónde salió.
      await quitarGastoDeFactura(curso.partidaGastoId);
    }

    await quitarCurso(personaId, cursoId, actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  El documento de un curso o examen: va al listado de documentos de la persona
// -----------------------------------------------------------------------------

/**
 * Lo que pasa cuando termina de subir el archivo de un curso o examen.
 *
 * El archivo se sube con `prepararSubidaDocumentoAction` (el de siempre: carpeta de la persona y
 * nombre «NN - Documento») y se registra acá en el MISMO documento del catálogo que eligió quien lo
 * subió, así que aparece en la pestaña Documentos, cuenta para el avance y sus vencimientos entran a
 * las alertas como cualquier otro. Lo único propio de esta acción es recordar de qué curso es.
 */
export async function registrarDocumentoDeCursoAction(
  personaId: string,
  cursoId: string,
  tipoId: string,
  itemId: string,
  fechas: { emision: string | null; vencimiento: string | null },
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "crear");

  try {
    uuid(personaId, "Persona");
    uuid(cursoId, "Curso");
    uuid(tipoId, "Documento");
    const emision = fecha(fechas.emision, "Fecha de emisión");
    const vencimiento = fecha(fechas.vencimiento, "Vigente hasta");
    if (emision && vencimiento && vencimiento < emision) {
      throw new Error("«Vigente hasta» no puede ser anterior a la fecha de emisión.");
    }

    const [encontrada, tipos, elemento, curso] = await Promise.all([
      obtenerPersona(personaId),
      listarTipos(),
      obtenerElemento(String(itemId)),
      obtenerCurso(personaId, cursoId),
    ]);
    if (!encontrada) throw new Error("La persona ya no existe.");
    if (!curso) throw new Error("Ese curso o examen ya no existe.");
    if (!elemento) throw new Error("SharePoint no reconoce el archivo que se acaba de subir.");
    // El servidor no le cree al navegador: el archivo tiene que colgar de la carpeta de ESTA persona.
    if (!encontrada.persona.carpetaItemId || elemento.carpetaId !== encontrada.persona.carpetaItemId) {
      throw new Error("Ese archivo no está en la carpeta de esta persona.");
    }
    const tipo = tipos.find((t) => t.id === tipoId);
    if (!tipo) throw new Error("Ese documento ya no está en el catálogo.");

    const actor = actorDe(usuario);
    await registrarArchivo(
      personaId,
      tipoId,
      { itemId: elemento.id, nombre: elemento.nombre, webUrl: elemento.webUrl },
      {
        // Sin fecha de emisión escrita, la del examen o curso: es cuando se hizo.
        fechaEmision: emision ?? curso.fecha,
        // Solo si se indicó: no se pisa el vencimiento que el documento ya tuviera.
        ...(vencimiento ? { fechaVencimiento: vencimiento } : {}),
      },
      actor,
    );
    await vincularDocumentoACurso(cursoId, tipoId);
    await registrarHistorial(
      personaId,
      "Documento subido",
      `${tipo.nombre} (de ${curso.curso}): ${elemento.nombre}`,
      actor,
    );
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  La factura de un curso o examen: se refleja como un gasto en Gastos de arranque
// -----------------------------------------------------------------------------

/**
 * Registra (o corrige) la factura: crea la línea de Gastos en su categoría y la deja asociada al
 * curso o examen. Devuelve el id de la línea; el archivo lo sube después el navegador a la carpeta
 * de esa línea (`prepararSubidaDeFacturaAction`).
 *
 * Primera vez: pide poder CREAR en los dos módulos. Corregir una factura ya registrada es EDITAR.
 */
export async function guardarFacturaDeCursoAction(
  personaId: string,
  cursoId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "crear");

  try {
    uuid(personaId, "Persona");
    uuid(cursoId, "Curso");

    const [encontrada, curso] = await Promise.all([obtenerPersona(personaId), obtenerCurso(personaId, cursoId)]);
    if (!encontrada) throw new Error("La persona ya no existe.");
    if (!curso) throw new Error("Ese curso o examen ya no existe.");

    const capacidad: Capacidad = curso.partidaGastoId ? "editar" : "crear";
    if (!puede(usuario.rol, capacidad)) throw new Error(MENSAJE_SIN_PERMISO);
    const sinAcceso = await sinAccesoAGastos(usuario, capacidad);
    if (sinAcceso) throw new Error(sinAcceso);

    const referencia = limpiarTexto(String(form.get("referencia") ?? "")).slice(0, 60);
    if (!referencia) throw new Error("Falta el número de la factura.");
    const proveedor = limpiarTexto(String(form.get("proveedor") ?? "")).slice(0, 120);
    if (!proveedor) throw new Error("Falta el proveedor (la clínica, el centro o la empresa que facturó).");
    const monto = leerMonto(form.get("monto"), "Monto neto");
    if (monto === null || monto <= 0) throw new Error("Escribe el monto neto de la factura, mayor que cero.");
    const pagada = form.get("pagada") === "on";
    const fechaDeFactura = fecha(form.get("fecha"), "Fecha de la factura");

    // El plazo de pago solo existe en lo que está por pagar, y se cuenta desde la fecha de la factura.
    const plazoCrudo = String(form.get("plazo") ?? "").trim();
    const plazo = plazoCrudo && !pagada ? Number(plazoCrudo) : null;
    if (plazo !== null && !PLAZOS_DE_PAGO.includes(plazo)) throw new Error("Ese plazo de pago no es válido.");
    if (plazo !== null && !fechaDeFactura) {
      throw new Error("Para un pago a plazo indica la fecha de la factura: el vencimiento se cuenta desde ella.");
    }

    const partidaId = await guardarGastoDeFactura({
      curso,
      persona: encontrada.persona,
      datos: {
        referencia,
        proveedor,
        fecha: fechaDeFactura,
        monto,
        pagada,
        notas: texto(form.get("notas"), 500),
      },
      partidaId: curso.partidaGastoId,
      creadoPor: usuario.nombre || usuario.correo,
    });

    if (curso.partidaGastoId !== partidaId) await vincularGastoACurso(cursoId, partidaId);
    await fijarPlazoDeFactura(cursoId, plazo);

    await registrarHistorial(
      personaId,
      "Factura",
      `${curso.curso}: factura ${referencia} de ${proveedor}, $${monto.toLocaleString("es-CL")} neto (${pagada ? "pagada" : plazo ? `por pagar, a ${plazo} días` : "por pagar"}).`,
      actorDe(usuario),
    );

    refrescarPersona(personaId);
    return { ok: true, id: partidaId };
  } catch (e) {
    return comoError(e);
  }
}

/** Abre la subida del archivo de la factura a la carpeta de SU línea en Gastos, creándola la primera vez. */
export async function prepararSubidaDeFacturaAction(
  personaId: string,
  cursoId: string,
  nombreOriginal: string,
): Promise<{ url: string; error?: undefined } | { url?: undefined; error: string }> {
  const usuario = await exigirCapacidad(APP, "crear");

  try {
    uuid(personaId, "Persona");
    uuid(cursoId, "Curso");
    const sinAcceso = await sinAccesoAGastos(usuario, "crear");
    if (sinAcceso) return { error: sinAcceso };

    const curso = await obtenerCurso(personaId, cursoId);
    if (!curso?.partidaGastoId) return { error: "Primero hay que registrar los datos de la factura." };
    const partida = await obtenerPartida(curso.partidaGastoId);
    if (!partida || partida.modulo !== "gastos") return { error: "El gasto de esta factura ya no existe." };

    const carpetaId = await asegurarCarpetaDePartida(partida);

    const coincide = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(nombreOriginal.trim());
    const base = nombreParaSharePoint(coincide?.[1] ?? "", 100) || "archivo";
    const extension = (coincide?.[2] ?? "").toLowerCase();
    // «Factura 1234 - scan.pdf»: se reconoce en la carpeta de la línea sin abrirla.
    const referencia = partida.referencia ? nombreParaSharePoint(partida.referencia, 40) : "";
    const nombre = `Factura${referencia ? ` ${referencia}` : ""} - ${base}${extension}`;

    return await sesionDeSubidaEnCarpeta(carpetaId, nombre);
  } catch (e) {
    console.error(`[acreditacion] No se pudo preparar la subida de la factura de ${cursoId}:`, e);
    return { error: e instanceof Error ? e.message : "No se pudo preparar la subida." };
  }
}

/** Quita la factura: elimina su línea de Gastos (y su carpeta) y deja el curso sin factura. */
export async function quitarFacturaDeCursoAction(personaId: string, cursoId: string): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(personaId, "Persona");
    uuid(cursoId, "Curso");
    const sinAcceso = await sinAccesoAGastos(usuario, "editar");
    if (sinAcceso) throw new Error(sinAcceso);

    const curso = await obtenerCurso(personaId, cursoId);
    if (!curso) throw new Error("Ese curso o examen ya no existe.");

    if (curso.partidaGastoId) await quitarGastoDeFactura(curso.partidaGastoId);
    await vincularGastoACurso(cursoId, null);
    await registrarHistorial(personaId, "Factura", `Se quitó la factura de ${curso.curso}.`, actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarPersona(personaId);
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Configuración: cargos y datos del contrato
//
//  Cualquiera con el submódulo puede crear y editar cargos: son los requisitos de
//  su propio trabajo, y pedirle a un administrador que tilde un documento sería
//  una fricción sin protección real que dar. Lo que sí es de administrador es
//  borrar personas.
// -----------------------------------------------------------------------------

function tiposElegidos(form: FormData): string[] {
  return form.getAll("tipos").map((t) => uuid(t, "Documento"));
}

// -----------------------------------------------------------------------------
//  El catálogo de documentos
//
//  Cambiarlo cambia lo que se pide a TODOS, así que revalida todo el submódulo.
// -----------------------------------------------------------------------------

function datosDeTipo(form: FormData) {
  const nombre = texto(form.get("nombre"), 120);
  if (!nombre) throw new Error("Falta el nombre del documento.");
  const grupo = texto(form.get("grupo"), 60);
  if (!grupo) throw new Error("Falta el grupo: la sección del checklist donde va.");
  return { nombre, grupo, tieneVencimiento: form.get("tiene_vencimiento") === "on" };
}

export async function crearTipoAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await crearTipo({
      ...datosDeTipo(form),
      cargoIds: form.getAll("cargos").map((c) => uuid(c, "Cargo")),
    });
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

export async function actualizarTipoAction(
  tipoId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await actualizarTipo(uuid(tipoId, "Documento"), {
      ...datosDeTipo(form),
      activo: form.get("activo") === "on",
    });
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

export async function eliminarTipoAction(tipoId: string): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await eliminarTipo(uuid(tipoId, "Documento"));
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

/**
 * Guarda la dotación: cuántas personas se deben contratar, en total y por cargo.
 *
 * Los campos son `total` y `cargo_<id>`. Un campo vacío es «sin definir» (null), no cero. Y
 * solo se tocan los cargos CUYO campo viene en el formulario: el formulario ofrece los
 * cargos activos, y uno desactivado que no aparece no debe quedar en blanco por omisión.
 */
export async function guardarDotacionAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    const total = leerEnteroOpcional(form.get("total"), "El total");

    const cargos = await listarCargos();
    const porCargo = cargos
      .filter((c) => form.has(`cargo_${c.id}`))
      .map((c) => ({
        id: c.id,
        cantidad: leerEnteroOpcional(form.get(`cargo_${c.id}`), `«${c.nombre}»`),
      }));

    await guardarDotacion(total, porCargo);
  } catch (e) {
    return comoError(e);
  }

  // La nómina muestra el seguimiento y la tarjeta de la portada lo resume.
  refrescarContrato();
  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

export async function crearCargoAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    const nombre = texto(form.get("nombre"), 80);
    if (!nombre) throw new Error("Falta el nombre del cargo.");
    await crearCargo(nombre, tiposElegidos(form));
  } catch (e) {
    return comoError(e);
  }

  // Un cargo nuevo aparece en la dotación por cargo de la nómina, el tablero y la portada: no solo
  // en la configuración.
  refrescarContrato();
  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

export async function actualizarCargoAction(
  cargoId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    const nombre = texto(form.get("nombre"), 80);
    if (!nombre) throw new Error("El nombre no puede quedar vacío.");
    await actualizarCargo(uuid(cargoId, "Cargo"), {
      nombre,
      activo: form.get("activo") === "on",
      tipoIds: tiposElegidos(form),
    });
  } catch (e) {
    return comoError(e);
  }

  // Cambiar lo que pide un cargo mueve el avance de todas sus personas.
  refrescarContrato();
  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

export async function eliminarCargoAction(cargoId: string): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await eliminarCargo(uuid(cargoId, "Cargo"));
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

export async function guardarContratoAction(
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await guardarContrato({
      nombre: texto(form.get("nombre"), 120) ?? "",
      fechaInicio: fecha(form.get("fecha_inicio"), "Fecha de inicio"),
      administrador: texto(form.get("administrador"), 120),
    });
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertas();
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Carga masiva
//
//  Dos acciones sobre el MISMO texto: revisar y importar. Importar vuelve a leer
//  y a validar todo en el servidor en vez de recibir las filas ya revisadas: una
//  Server Action es un endpoint, y unas filas "ya validadas" que llegan del
//  navegador son exactamente lo que no hay que creerle.
// -----------------------------------------------------------------------------

/** Un pegado de más de esto no es una lista de personas. */
const LARGO_MAXIMO_DE_TEXTO = 200_000;

async function revisarTexto(texto: string): Promise<RevisionDeImportacion> {
  const vacia = (error: string): RevisionDeImportacion => ({ filas: [], aviso: null, error });

  if (texto.length > LARGO_MAXIMO_DE_TEXTO) return vacia("Lo pegado es demasiado largo para ser una lista de personas.");

  const { filas, aviso } = leerTabla(texto);
  if (filas.length === 0) return vacia("No encontré ninguna fila. Pega la tabla, con una persona por línea.");
  if (filas.length > MAXIMO_IMPORTACION) {
    return vacia(`Son ${filas.length} filas y el máximo por importación es ${MAXIMO_IMPORTACION}. Divídela en partes.`);
  }

  const rutsDeLaLista = filas.map((f) => normalizarRut(f.rut)).filter((r) => rutEsValido(r));
  const [cargos, existentes] = await Promise.all([listarCargos(), rutsExistentes(rutsDeLaLista)]);
  const activos = cargos.filter((c) => c.activo);
  const cargoPorNombre = new Map(activos.map((c) => [comparable(c.nombre), c]));

  const vistos = new Map<string, number>();
  const revisadas = filas.map((f) => {
    const rut = normalizarRut(f.rut);
    const problemas: string[] = [];
    let cargoId: string | null = null;

    const nombre = analizarNombre(f.nombre);
    if (nombre.error) problemas.push(nombre.error.replace(/\.$/, "").replace(/^Falta el nombre$/, "falta el nombre"));

    // La misma validación del alta: dígito verificador, y que no sea de una empresa ni de
    // dígitos repetidos. Una lista pegada es justo donde más se cuelan esos errores.
    const validacionRut = analizarRutDePersona(f.rut);
    if (!f.rut.trim()) problemas.push("falta el RUT");
    else if (validacionRut.error) problemas.push(validacionRut.error.replace(/\.$/, "").replace(/^El/, "el"));
    else if (existentes.has(rut)) problemas.push("ya está en la nómina");
    else if (vistos.has(rut)) problemas.push(`repetido (ya en la línea ${vistos.get(rut)})`);
    else vistos.set(rut, f.linea);

    if (!f.cargo.trim()) problemas.push("falta el cargo");
    else {
      const cargo = cargoPorNombre.get(comparable(f.cargo));
      if (cargo) cargoId = cargo.id;
      else problemas.push(`el cargo «${f.cargo}» no existe`);
    }

    return {
      ...f,
      estado: problemas.length === 0 ? ("ok" as const) : ("error" as const),
      mensaje: problemas.length === 0 ? null : problemas.join(", "),
      cargoId,
      rutNormalizado: validacionRut.error ? null : validacionRut.valor,
    };
  });

  return { filas: revisadas, aviso, error: null };
}

export async function revisarImportacionAction(texto: string): Promise<RevisionDeImportacion> {
  await exigirCapacidad(APP, "crear");
  return await revisarTexto(String(texto ?? ""));
}

export async function importarPersonasAction(texto: string): Promise<ResultadoDeImportacion> {
  const usuario = await exigirCapacidad(APP, "crear");
  const actor = actorDe(usuario);

  const revision = await revisarTexto(String(texto ?? ""));
  if (revision.error) {
    return { creadas: 0, fallidas: [], carpetasPendientes: 0, error: revision.error };
  }

  let creadas = 0;
  const fallidas: ResultadoDeImportacion["fallidas"] = [];
  const nuevas: { id: string; rut: string; nombre: string }[] = [];

  // De a una y no en paralelo: el número de la persona (#) lo asigna la base en
  // orden de inserción, y que salgan en el orden de la lista es lo que espera
  // quien la pegó.
  for (const f of revision.filas) {
    if (f.estado !== "ok" || !f.cargoId || !f.rutNormalizado) {
      fallidas.push({ linea: f.linea, nombre: f.nombre, mensaje: f.mensaje ?? "no se pudo revisar" });
      continue;
    }
    try {
      const hoy = hoyEnChile();
      const nombre = (analizarNombre(f.nombre).valor ?? f.nombre.trim()).slice(0, 120);
      const id = await crearPersona(
        {
          nombre,
          rut: f.rutNormalizado,
          cargoId: f.cargoId,
          // Con la grafía oficial si coincide con la lista («cch» → «CCH», «7X7» → «7x7»).
          faena: analizarCampo(campoDe("faena"), f.faena, { hoy }).valor,
          turno: analizarCampo(campoDe("turno"), f.turno, { hoy }).valor,
        },
        actor,
      );
      nuevas.push({ id, rut: f.rutNormalizado, nombre });
      creadas++;
    } catch (e) {
      // Una fila que falla no detiene a las demás: ya hay personas creadas y
      // abortar a la mitad dejaría a quien importa sin saber cuáles quedaron.
      fallidas.push({
        linea: f.linea,
        nombre: f.nombre,
        mensaje: e instanceof Error ? e.message : "no se pudo crear",
      });
    }
  }

  // Las carpetas, DESPUÉS de crear a todos: las fichas son lo importante, y un
  // problema con SharePoint no puede dejar a medias una carga de cien personas.
  const carpetasPendientes = await crearCarpetasEnLote(nuevas, usuario.correo);

  refrescarContrato();
  olvidarAlertas();
  return { creadas, fallidas, carpetasPendientes, error: null };
}

/**
 * Crea las carpetas de varias personas, con un límite de tiempo.
 *
 * Cada carpeta son un par de llamadas a SharePoint: cien seguidas pasarían del
 * tiempo que da la plataforma a una acción. Se hacen de a cinco, y a los 40
 * segundos se corta; las que quedan sin crear no se pierden — se crean solas al
 * subir el primer documento de cada persona. Devuelve cuántas quedaron así.
 */
async function crearCarpetasEnLote(
  personas: { id: string; rut: string; nombre: string }[],
  correo: string,
): Promise<number> {
  if (personas.length === 0) return 0;

  // Sin la cuenta conectada a SharePoint ninguna se puede crear: se dice, en vez
  // de intentarlo cien veces para fallar cien veces.
  if (!(await tieneAccesoASharePoint(correo))) return personas.length;

  const limite = Date.now() + 40_000;
  const cola = [...personas];
  let sinCrear = 0;

  const trabajador = async () => {
    for (;;) {
      const persona = cola.shift();
      if (!persona) return;
      if (Date.now() > limite) {
        sinCrear++;
        continue;
      }
      try {
        await asegurarCarpetaDePersona({ ...persona, carpetaItemId: null });
      } catch (e) {
        sinCrear++;
        console.error(
          `[acreditacion] No se pudo crear la carpeta de ${persona.rut}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: 5 }, trabajador));
  return sinCrear;
}
