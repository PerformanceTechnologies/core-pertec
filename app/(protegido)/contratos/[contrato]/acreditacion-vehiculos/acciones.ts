"use server";



import { enEsteContrato } from "@/lib/contratos/contrato-actual";
import { refrescarContrato } from "@/lib/contratos/refrescar";
import { signIn } from "@/auth";
import { redirect } from "next/navigation";
import { exigirAccesoApp, exigirCapacidad, exigirAdmin } from "@/lib/contratos/autorizacion";
import { hoyEnChile, type EstadoDocumento, type EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { analizarCampo, resumirErrores } from "@/lib/contratos/acreditacion-validacion";
import type { Actor } from "@/lib/contratos/acreditacion";
import {
  actualizarCategoria,
  actualizarDatosDeVehiculo,
  actualizarSeguimientoDeVehiculo,
  actualizarTipoDeDocumento,
  cambiarActivoDeVehiculo,
  crearCategoria,
  crearTipoDeDocumento,
  crearVehiculo,
  eliminarCategoria,
  eliminarTipoDeDocumento,
  eliminarVehiculo,
  guardarCarpetaDeVehiculo,
  guardarDocumentoDeVehiculo,
  guardarDotacionDeFlota,
  guardarEnlaceDeCarpetaDeVehiculo,
  listarCategorias,
  listarTiposDeDocumento,
  obtenerArchivoDeVehiculo,
  obtenerVehiculo,
  quitarRegistroDeArchivoDeVehiculo,
  registrarArchivoDeVehiculo,
  registrarHistorialDeVehiculo,
} from "@/lib/contratos/vehiculos";
import {
  CAMPOS_DE_VEHICULO,
  ESTADOS_WEB_CONTROL_VEHICULO,
  descripcionDeVehiculo,
  formatearPatente,
  type EstadoWebControlVehiculo,
} from "@/lib/contratos/vehiculos-modelo";
import { analizarDatosDeVehiculo, analizarPatente } from "@/lib/contratos/vehiculos-validacion";
import { olvidarAlertasDeVehiculos } from "@/lib/contratos/vehiculos-alertas";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { SCOPES_SHAREPOINT } from "@/lib/contratos/graph-token";
import { leerEnteroOpcional } from "@/lib/contratos/validar-form";
import {
  asegurarCarpeta,
  buscarSeccion,
  carpetaVehiculos,
  eliminarElemento,
  obtenerElemento,
  renombrarElemento,
  sesionDeSubidaEnCarpeta,
} from "@/lib/contratos/sharepoint";
import type { UsuarioConAcceso } from "@/lib/contratos/tipos";

// Las acciones de Acreditación Vehículos. Es el hermano de acreditacion/acciones.ts y se lee igual:
// mismas reglas y mismas razones, con «vehículo» donde allá dice «persona».

// exigirAccesoApp() se repite en CADA acción, no solo en la página. Una Server Action es un
// endpoint: se puede invocar sin pasar por la interfaz que la muestra, así que esconder un botón
// no protege nada.
//
// Y es solo la primera reja: la segunda la pone SharePoint, que responde con el token de la
// persona. Alguien con el submódulo asignado pero sin acceso a la carpeta 1.4 llega hasta acá y
// Graph lo frena al subir.
const APP = "acreditacion-vehiculos";

const RAIZ = "/contratos/acreditacion-vehiculos";

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

function campoDe(nombre: string) {
  const c = CAMPOS_DE_VEHICULO.find((x) => x.campo === nombre);
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

function refrescarVehiculo(id: string) {
  refrescarContrato();
  refrescarContrato();
  // La insignia del menú guarda su número un minuto; un cambio hecho acá tiene que verse en la
  // página siguiente de quien lo hizo, no un minuto después.
  olvidarAlertasDeVehiculos();
}

/**
 * Pide los permisos de SharePoint y vuelve a Acreditación Vehículos.
 *
 * Es la misma petición que hacen Contratos y Acreditación Personas, pero con la guardia de ESTE
 * módulo y regresando acá: quien solo tiene este submódulo se quedaría sin forma de conectarse.
 */
export async function conectarSharePointAction(): Promise<void> {
  await exigirAccesoApp(APP);
  await signIn("microsoft-entra-id", { redirectTo: await enEsteContrato(RAIZ) }, { scope: SCOPES_SHAREPOINT });
}

// -----------------------------------------------------------------------------
//  La carpeta de cada vehículo en SharePoint
//
//  Existe desde que el vehículo se da de alta, se renombra si cambia su descripción y se elimina
//  con su ficha: SharePoint y el core dicen lo mismo. Todo con el token de quien hace el cambio,
//  así que los permisos del sitio siguen mandando.
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

/** «ABCD-12 - Toyota Hilux»: la patente va primero, que es lo que identifica la ficha. */
function nombreDeCarpeta(vehiculo: { patente: string; datos: Record<string, string | null> }): string {
  const descripcion = descripcionDeVehiculo(vehiculo);
  return nombreSeguro(
    descripcion ? `${formatearPatente(vehiculo.patente)} - ${descripcion}` : formatearPatente(vehiculo.patente),
    100,
  );
}

/** La carpeta del vehículo: la que ya tiene, o la crea y la deja anotada. */
async function asegurarCarpetaDeVehiculo(vehiculo: {
  id: string;
  patente: string;
  datos: Record<string, string | null>;
  carpetaItemId: string | null;
}): Promise<string> {
  if (vehiculo.carpetaItemId) return vehiculo.carpetaItemId;

  // La carpeta de vehículos cuelga de la sección "arranque": es la misma carpeta de arranque que
  // recorre Contratos, y los permisos son los suyos.
  const seccion = await buscarSeccion("arranque");
  if (!seccion) throw new Error("La sección «arranque» no está configurada.");

  const carpeta = await asegurarCarpeta(seccion, carpetaVehiculos(), nombreDeCarpeta(vehiculo));
  await guardarCarpetaDeVehiculo(vehiculo.id, carpeta);
  return carpeta.id;
}

/**
 * Crea la carpeta al dar de alta, SIN hacer fallar el alta.
 *
 * La ficha es lo importante: si SharePoint no responde, o quien da de alta no ha conectado su
 * cuenta, el vehículo se crea igual y su carpeta se crea sola al subir el primer documento.
 */
async function crearCarpetaSiSePuede(
  vehiculo: { id: string; patente: string; datos: Record<string, string | null> },
  correo: string,
): Promise<boolean> {
  try {
    if (!(await tieneAccesoASharePoint(correo))) return false;
    await asegurarCarpetaDeVehiculo({ ...vehiculo, carpetaItemId: null });
    return true;
  } catch (e) {
    console.error(
      `[vehiculos] No se pudo crear la carpeta de ${vehiculo.patente}: ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}

// -----------------------------------------------------------------------------
//  Vehículos
// -----------------------------------------------------------------------------

export async function crearVehiculoAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "crear");

  let id: string;
  try {
    // La patente es la llave de la ficha: una mal tipeada crea un vehículo que nadie encuentra
    // después ni sabe que está duplicado. Se valida la FORMA antes de guardarla.
    const patente = analizarPatente(String(form.get("patente") ?? ""));
    if (patente.error) throw new Error(patente.error);

    // La faena es una lista con «otro»: con la grafía oficial si coincide con una opción.
    const faena = analizarCampo(campoDe("faena"), String(form.get("faena") ?? ""), { hoy: hoyEnChile() });
    if (faena.error) throw new Error(faena.error);

    id = await crearVehiculo(
      {
        patente: patente.valor as string,
        categoriaId: uuid(form.get("categoria_id"), "Tipo de vehículo"),
        faena: faena.valor,
      },
      actorDe(usuario),
    );

    // Su carpeta en SharePoint nace con la ficha.
    await crearCarpetaSiSePuede({ id, patente: patente.valor as string, datos: {} }, usuario.correo);
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertasDeVehiculos();
  // Fuera del try: redirect() lanza una excepción por diseño, y dentro de un catch se convertiría
  // en un "error" más.
  redirect(await enEsteContrato(`${RAIZ}/${id}`));
}

export async function actualizarDatosAction(
  vehiculoId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(vehiculoId, "Vehículo");
    const anterior = await obtenerVehiculo(vehiculoId);
    if (!anterior) throw new Error("El vehículo ya no existe.");

    // Todos los datos pasan por la validación y salen normalizados. Lo que NO cambió respecto de lo
    // guardado se acepta tal cual: una ficha anterior a una regla nueva no puede quedar bloqueada.
    const crudos: Record<string, string> = {};
    for (const c of CAMPOS_DE_VEHICULO) crudos[c.campo] = String(form.get(c.campo) ?? "");
    const { datos, errores } = analizarDatosDeVehiculo(crudos, anterior.vehiculo.datos);
    if (errores.length > 0) throw new Error(resumirErrores(errores));

    // La patente se puede corregir. Si llega igual a la guardada no se vuelve a validar: una
    // ficha anterior a una regla nueva no puede quedar sin poder guardarse por un dato que nadie
    // tocó. Sin el campo en el formulario, se queda la que estaba.
    const previo = anterior.vehiculo;
    const patenteEscrita = String(form.get("patente") ?? "").trim();
    let patenteNueva = previo.patente;
    if (patenteEscrita && patenteEscrita.toUpperCase() !== formatearPatente(previo.patente).toUpperCase()) {
      const patente = analizarPatente(patenteEscrita);
      if (patente.error) throw new Error(patente.error);
      patenteNueva = patente.valor as string;
    }

    await actualizarDatosDeVehiculo(
      vehiculoId,
      {
        categoriaId: uuid(form.get("categoria_id"), "Tipo de vehículo"),
        datos,
        ...(patenteNueva !== previo.patente
          ? { patente: { anterior: formatearPatente(previo.patente), nueva: formatearPatente(patenteNueva) } }
          : {}),
      },
      actorDe(usuario),
    );

    // Si cambió la patente, la marca o el modelo, la carpeta en SharePoint cambia con ellos. Es lo
    // último y no hace fallar el guardado: los datos ya están guardados, y una carpeta con el
    // nombre viejo es un desorden, no una pérdida.
    if (previo.carpetaItemId) {
      const nombreNuevo = nombreDeCarpeta({ patente: patenteNueva, datos });
      if (nombreNuevo !== nombreDeCarpeta(previo)) {
        try {
          const { webUrl } = await renombrarElemento(previo.carpetaItemId, nombreNuevo);
          await guardarEnlaceDeCarpetaDeVehiculo(vehiculoId, webUrl);
        } catch (e) {
          console.error(
            `[vehiculos] No se pudo renombrar la carpeta de ${previo.patente}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    }
  } catch (e) {
    return comoError(e);
  }

  refrescarVehiculo(vehiculoId);
  return { ok: true };
}

export async function actualizarSeguimientoAction(
  vehiculoId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(vehiculoId, "Vehículo");
    const wc = String(form.get("estado_web_control") ?? "") as EstadoWebControlVehiculo;
    if (!ESTADOS_WEB_CONTROL_VEHICULO.includes(wc)) throw new Error("Estado de Web Control desconocido.");

    await actualizarSeguimientoDeVehiculo(
      vehiculoId,
      {
        estadoWebControl: wc,
        wcAcreditado: form.get("wc_acreditado") === "on",
        observaciones: texto(form.get("observaciones"), 1000),
      },
      actorDe(usuario),
    );
  } catch (e) {
    return comoError(e);
  }

  refrescarVehiculo(vehiculoId);
  return { ok: true };
}

export async function cambiarActivoAction(vehiculoId: string, activo: boolean) {
  const usuario = await exigirCapacidad(APP, "editar");
  await cambiarActivoDeVehiculo(uuid(vehiculoId, "Vehículo"), activo, actorDe(usuario));
  refrescarVehiculo(vehiculoId);
}

/**
 * Elimina la ficha Y su carpeta en SharePoint.
 *
 * SharePoint va primero, y si falla no se toca la ficha: borrar la ficha y que la carpeta quede
 * huérfana en el sitio es peor que no borrar nada, porque ya nadie sabe de qué vehículo es. La
 * carpeta va a la papelera de SharePoint, así que se puede restaurar desde allá; la ficha, con su
 * historial, no.
 *
 * Solo administradores. Para un vehículo que ya no está en la flota existe la baja, que conserva
 * el expediente entero.
 */
export async function eliminarVehiculoAction(vehiculoId: string): Promise<EstadoForm> {
  const admin = await exigirAdmin();

  try {
    uuid(vehiculoId, "Vehículo");
    const encontrado = await obtenerVehiculo(vehiculoId);
    if (!encontrado) throw new Error("El vehículo ya no existe.");

    if (encontrado.vehiculo.carpetaItemId) {
      await eliminarElemento(encontrado.vehiculo.carpetaItemId);
    }

    await eliminarVehiculo(vehiculoId);
    console.info(`[vehiculos] ${admin.correo} eliminó la ficha ${encontrado.vehiculo.patente} y su carpeta.`);
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}

// -----------------------------------------------------------------------------
//  Documentos
// -----------------------------------------------------------------------------

/**
 * Abre la subida de un archivo a la carpeta del vehículo, creando la carpeta la primera vez, y le
 * pone el nombre que corresponde: «02 - Permiso de circulación.pdf».
 *
 * El nombre lo decide el servidor, no el navegador. Así la carpeta de cada vehículo queda
 * ordenada igual que el checklist aunque suban «IMG_4421.jpg», y quien abre SharePoint sin pasar
 * por el core entiende qué es cada archivo.
 *
 * Devuelve el error en vez de lanzarlo, y no es una preferencia de estilo: Next SANEA todo error
 * lanzado desde una Server Action en producción, y el navegador recibiría siempre el mismo texto
 * de React con un enlace a su documentación. Devuelto, el motivo llega entero.
 */
export async function prepararSubidaDocumentoAction(
  vehiculoId: string,
  tipoId: string,
  nombreOriginal: string,
): Promise<{ url: string; error?: undefined } | { url?: undefined; error: string }> {
  await exigirCapacidad(APP, "crear");
  uuid(vehiculoId, "Vehículo");
  uuid(tipoId, "Documento");

  try {
    const [encontrado, tipos] = await Promise.all([obtenerVehiculo(vehiculoId), listarTiposDeDocumento()]);
    if (!encontrado) return { error: "El vehículo ya no existe." };
    const tipo = tipos.find((t) => t.id === tipoId);
    if (!tipo) return { error: "Ese documento ya no está en el catálogo." };

    const carpetaId = await asegurarCarpetaDeVehiculo(encontrado.vehiculo);

    const extension = /(\.[A-Za-z0-9]{1,8})$/.exec(nombreOriginal)?.[1]?.toLowerCase() ?? "";
    const numero = String(tipo.orden).padStart(2, "0");
    const nombreFinal = `${numero} - ${nombreSeguro(tipo.nombre, 100)}${extension}`;

    return await sesionDeSubidaEnCarpeta(carpetaId, nombreFinal);
  } catch (e) {
    // El motivo de Graph —sin acceso al sitio, carpeta borrada, token caducado— es justo lo que
    // hace falta para saber qué hacer.
    console.error(`[vehiculos] No se pudo preparar la subida de ${vehiculoId}:`, e);
    return { error: e instanceof Error ? e.message : "No se pudo preparar la subida." };
  }
}

/**
 * Lo que pasa cuando un archivo termina de subir.
 *
 * Se llama desde el navegador con el id que devolvió SharePoint. NO se le cree el nombre ni el
 * enlace: se le pregunta a SharePoint, y además se comprueba que el archivo cuelgue de la carpeta
 * de ESTE vehículo. Sin eso, cualquiera con el módulo podría anotar en un expediente un enlace a
 * cualquier otra parte.
 */
export async function registrarSubidaDocumentoAction(
  vehiculoId: string,
  tipoId: string,
  itemId: string,
): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "crear");
  uuid(vehiculoId, "Vehículo");
  uuid(tipoId, "Documento");

  const [encontrado, tipos, elemento] = await Promise.all([
    obtenerVehiculo(vehiculoId),
    listarTiposDeDocumento(),
    obtenerElemento(String(itemId)),
  ]);
  // Devueltos y no lanzados, por lo mismo que arriba.
  if (!encontrado) return { error: "El vehículo ya no existe." };
  if (!elemento) return { error: "SharePoint no reconoce el archivo que se acaba de subir." };
  if (!encontrado.vehiculo.carpetaItemId || elemento.carpetaId !== encontrado.vehiculo.carpetaItemId) {
    return { error: "Ese archivo no está en la carpeta de este vehículo." };
  }

  const tipo = tipos.find((t) => t.id === tipoId);
  const actor = actorDe(usuario);

  await registrarArchivoDeVehiculo(
    vehiculoId,
    tipoId,
    { itemId: elemento.id, nombre: elemento.nombre, webUrl: elemento.webUrl },
    {},
    actor,
  );
  await registrarHistorialDeVehiculo(
    vehiculoId,
    "Documento subido",
    `${tipo?.nombre ?? "Documento"}: ${elemento.nombre}`,
    actor,
  );

  refrescarVehiculo(vehiculoId);
  return { ok: true };
}

/**
 * Elimina un archivo de un documento, también en SharePoint.
 *
 * SharePoint primero: si se quitara antes el registro y SharePoint fallara, el core diría «ya no
 * está» de un archivo que sigue en el sitio. Al revés, un fallo a medias se puede reintentar sin
 * riesgo (un 404 se da por eliminado). El archivo va a la papelera de SharePoint.
 *
 * Se comprueba que el archivo sea de ESE vehículo: el id viaja desde el navegador.
 */
export async function eliminarArchivoAction(vehiculoId: string, archivoId: string): Promise<EstadoForm> {
  const usuario = await exigirCapacidad(APP, "editar");

  try {
    uuid(vehiculoId, "Vehículo");
    uuid(archivoId, "Archivo");

    const archivo = await obtenerArchivoDeVehiculo(archivoId);
    if (!archivo || archivo.vehiculoId !== vehiculoId) {
      throw new Error("Ese archivo ya no está registrado en este vehículo.");
    }

    await eliminarElemento(archivo.itemId);
    await quitarRegistroDeArchivoDeVehiculo(archivo);
    await registrarHistorialDeVehiculo(vehiculoId, "Archivo eliminado", archivo.nombre, actorDe(usuario));
  } catch (e) {
    return comoError(e);
  }

  refrescarVehiculo(vehiculoId);
  return { ok: true };
}

export async function cambiarEstadoDocumentoAction(vehiculoId: string, tipoId: string, estado: EstadoDocumento) {
  const usuario = await exigirCapacidad(APP, "editar");
  uuid(vehiculoId, "Vehículo");
  uuid(tipoId, "Documento");
  if (!ESTADOS_DOCUMENTO.includes(estado)) throw new Error(`Estado desconocido: ${estado}`);

  const actor = actorDe(usuario);
  const tipos = await listarTiposDeDocumento();
  await guardarDocumentoDeVehiculo(vehiculoId, tipoId, { estado }, actor);
  await registrarHistorialDeVehiculo(
    vehiculoId,
    "Estado de documento",
    `${tipos.find((t) => t.id === tipoId)?.nombre ?? "Documento"} → ${estado}`,
    actor,
  );

  refrescarVehiculo(vehiculoId);
}

export async function guardarDetalleDocumentoAction(
  vehiculoId: string,
  tipoId: string,
  detalle: { fechaEmision: string; fechaVencimiento: string; nota: string },
) {
  const usuario = await exigirCapacidad(APP, "crear");
  uuid(vehiculoId, "Vehículo");
  uuid(tipoId, "Documento");

  const emision = fecha(detalle.fechaEmision, "Fecha de emisión");
  const vencimiento = fecha(detalle.fechaVencimiento, "Fecha de vencimiento");
  if (emision && vencimiento && vencimiento < emision) {
    throw new Error("El vencimiento no puede ser anterior a la emisión.");
  }

  await guardarDocumentoDeVehiculo(
    vehiculoId,
    tipoId,
    { fechaEmision: emision, fechaVencimiento: vencimiento, nota: texto(detalle.nota, 500) },
    actorDe(usuario),
  );

  refrescarVehiculo(vehiculoId);
}

export async function cambiarRequeridoExtraAction(vehiculoId: string, tipoId: string, requerido: boolean) {
  const usuario = await exigirCapacidad(APP, "editar");
  uuid(vehiculoId, "Vehículo");
  uuid(tipoId, "Documento");

  await guardarDocumentoDeVehiculo(vehiculoId, tipoId, { requeridoExtra: requerido }, actorDe(usuario));
  refrescarVehiculo(vehiculoId);
}

// -----------------------------------------------------------------------------
//  Configuración: tipos de vehículo y catálogo de documentos
//
//  Cualquiera con el submódulo puede crear y editar tipos de vehículo y documentos: son los
//  requisitos de su propio trabajo, y pedirle a un administrador que tilde un documento sería una
//  fricción sin protección real que dar. Lo que sí es de administrador es borrar vehículos.
// -----------------------------------------------------------------------------

function tiposElegidos(form: FormData): string[] {
  return form.getAll("tipos").map((t) => uuid(t, "Documento"));
}

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
    await crearTipoDeDocumento({
      ...datosDeTipo(form),
      // El campo se llama «cargos» por el componente compartido con Acreditación Personas.
      categoriaIds: form.getAll("cargos").map((c) => uuid(c, "Tipo de vehículo")),
    });
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}

export async function actualizarTipoAction(
  tipoId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await actualizarTipoDeDocumento(uuid(tipoId, "Documento"), {
      ...datosDeTipo(form),
      activo: form.get("activo") === "on",
    });
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}

export async function eliminarTipoAction(tipoId: string): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await eliminarTipoDeDocumento(uuid(tipoId, "Documento"));
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}

/**
 * Guarda la dotación: cuántos vehículos se deben contratar, en total y por tipo.
 *
 * Los campos son `total` y `cargo_<id>` (los nombres son los del componente compartido con
 * Acreditación Personas). Un campo vacío es «sin definir» (null), no cero. Y solo se tocan los
 * tipos CUYO campo viene en el formulario: uno desactivado que no aparece no debe quedar en blanco.
 */
export async function guardarDotacionAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    const total = leerEnteroOpcional(form.get("total"), "El total");

    const categorias = await listarCategorias();
    const porCategoria = categorias
      .filter((c) => form.has(`cargo_${c.id}`))
      .map((c) => ({
        id: c.id,
        cantidad: leerEnteroOpcional(form.get(`cargo_${c.id}`), `«${c.nombre}»`),
      }));

    await guardarDotacionDeFlota(total, porCategoria);
  } catch (e) {
    return comoError(e);
  }

  // La lista muestra el seguimiento y la tarjeta de la portada lo resume.
  refrescarContrato();
  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}

export async function crearCategoriaAction(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    const nombre = texto(form.get("nombre"), 80);
    if (!nombre) throw new Error("Falta el nombre del tipo de vehículo.");
    await crearCategoria(nombre, tiposElegidos(form));
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}

export async function actualizarCategoriaAction(
  categoriaId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    const nombre = texto(form.get("nombre"), 80);
    if (!nombre) throw new Error("El nombre no puede quedar vacío.");
    await actualizarCategoria(uuid(categoriaId, "Tipo de vehículo"), {
      nombre,
      activo: form.get("activo") === "on",
      tipoIds: tiposElegidos(form),
    });
  } catch (e) {
    return comoError(e);
  }

  // Cambiar lo que pide un tipo mueve el avance de todos sus vehículos.
  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}

export async function eliminarCategoriaAction(categoriaId: string): Promise<EstadoForm> {
  await exigirCapacidad(APP, "configurar");

  try {
    await eliminarCategoria(uuid(categoriaId, "Tipo de vehículo"));
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  olvidarAlertasDeVehiculos();
  return { ok: true };
}
