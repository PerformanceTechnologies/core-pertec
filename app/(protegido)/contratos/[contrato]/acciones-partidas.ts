"use server";



import { enEsteContrato } from "@/lib/contratos/contrato-actual";
import { refrescarContrato } from "@/lib/contratos/refrescar";
import { signIn } from "@/auth";
import { exigirAccesoApp, exigirCapacidad } from "@/lib/contratos/autorizacion";
import type { Capacidad } from "@/lib/contratos/permisos";
import { resolverResponsable } from "@/lib/contratos/responsables";
import { SCOPES_SHAREPOINT } from "@/lib/contratos/graph-token";
import { asegurarCarpetaDePartida, nombreDeCarpeta } from "@/lib/contratos/arranque-carpetas";
import {
  eliminarElemento,
  obtenerElemento,
  renombrarElemento,
  sesionDeSubidaEnCarpeta,
} from "@/lib/contratos/sharepoint";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import {
  actualizarCategoria,
  actualizarPartida,
  cambiarEstadoDePartida,
  crearCategoria,
  crearPartida,
  eliminarCategoria,
  eliminarPartida,
  guardarEnlaceDeCarpetaDePartida,
  listarCategorias,
  obtenerPartida,
  type DatosDePartida,
} from "@/lib/contratos/arranque";
import {
  MODULOS,
  esModulo,
  estadoValido,
  leerMonto,
  type ModuloArranque,
} from "@/lib/contratos/arranque-modelo";
import { esModalidad, leerCantidad } from "@/lib/contratos/gastos-modelo";
import {
  leerFecha,
  leerTexto,
  leerUuid,
  leerUuidOpcional,
  nombreParaSharePoint,
} from "@/lib/contratos/validar-form";

// exigirAccesoApp() se repite en CADA acción, no solo en la página: una Server Action
// es un endpoint, y esconder un botón no protege nada. El slug depende del módulo, así
// que quien tiene Logística pero no Gastos de arranque no puede tocar los gastos
// llamando a la acción a mano.

/**
 * El módulo de la petición, con su guardia de acceso ya pasada.
 *
 * Va FUERA de los try de cada acción, a propósito: exigirAccesoApp() redirige
 * lanzando una excepción, y dentro de un catch se convertiría en un mensaje de error
 * en vez de sacar a quien no tiene acceso.
 */
async function guardia(valor: unknown, capacidad: Capacidad) {
  if (!esModulo(valor)) throw new Error("Módulo inválido.");
  // El módulo dice DÓNDE puede actuar y el rol QUÉ puede hacer ahí (lib/permisos.ts).
  const usuario = await exigirCapacidad(MODULOS[valor].appSlug, capacidad);
  return { m: valor, usuario };
}

function comoError(e: unknown): EstadoForm {
  return { error: e instanceof Error ? e.message : "No se pudo guardar." };
}

function refrescar(m: ModuloArranque) {
  // La portada de Contratos lleva la tarjeta del módulo.
  refrescarContrato();
  refrescarContrato();
}

/**
 * El vínculo con una partida del OTRO módulo, o null. Se comprueba contra la base y no se confía en
 * lo que mandó el navegador: tiene que existir y ser del módulo contrario (la base también lo exige,
 * pero este mensaje es el que se entiende).
 */
async function leerVinculo(m: ModuloArranque, valor: FormDataEntryValue | null): Promise<string | null> {
  const id = leerUuidOpcional(valor, "El vínculo");
  if (!id) return null;
  const destino = await obtenerPartida(id);
  if (!destino) throw new Error("La partida a vincular ya no existe.");
  if (destino.modulo === m) {
    throw new Error("El vínculo es entre Logística y Gastos: elige una partida del otro módulo.");
  }
  return id;
}

/** Lo que el formulario manda, ya validado contra el módulo al que pertenece. */
async function leerDatos(m: ModuloArranque, form: FormData): Promise<DatosDePartida> {
  const config = MODULOS[m];

  const descripcion = leerTexto(form.get("descripcion"), 200);
  if (!descripcion) throw new Error(`Falta la descripción del ${config.singular}.`);

  const categoriaId = leerUuid(form.get("categoria_id"), "Categoría");
  // La categoría tiene que ser de ESTE módulo: sin esto, una petición armada a mano
  // podría colgar un gasto de una categoría de logística.
  const categorias = await listarCategorias(m, { incluirInactivas: true });
  if (!categorias.some((c) => c.id === categoriaId)) throw new Error("Esa categoría no existe.");

  const estado = String(form.get("estado") ?? "");
  if (!estadoValido(m, estado)) throw new Error("Estado inválido.");

  const montoPresupuestado = leerMonto(form.get("monto_presupuestado"), config.etiquetaPresupuesto);
  const montoReal = leerMonto(form.get("monto_real"), config.etiquetaReal);

  // Cantidad y modalidad solo existen en Gastos: en Logística se guardan los valores por omisión.
  const esGastos = m === "gastos";
  const cantidad = esGastos ? leerCantidad(form.get("cantidad")) : 1;
  const modalidadEntrante = form.get("modalidad");
  const modalidad = esGastos && esModalidad(modalidadEntrante) ? modalidadEntrante : "cotizacion";

  return {
    categoriaId,
    descripcion,
    proveedor: leerTexto(form.get("proveedor"), 120),
    referencia: leerTexto(form.get("referencia"), 60),
    estado,
    fecha: leerFecha(form.get("fecha"), config.etiquetaFecha),
    montoPresupuestado,
    montoReal,
    cantidad,
    modalidad,
    partidaVinculadaId: await leerVinculo(m, form.get("partida_vinculada_id")),
    notas: leerTexto(form.get("notas"), 1000),
    // El desplegable manda un solo valor y puede ser de cualquiera de las dos
    // listas; resolverResponsable decide a qué columna va y rechaza lo que no
    // esté en ninguna.
    ...(await resolverResponsable(leerUuidOpcional(form.get("responsable_id"), "Responsable"))),
  };
}

/** Crea una partida (sin `partidaId`) o guarda los cambios de una existente. */
export async function guardarPartidaAction(
  moduloEntrante: string,
  partidaId: string | null,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const { m, usuario } = await guardia(moduloEntrante, partidaId ? "editar" : "crear");

  let nuevaId: string | null = null;
  try {
    const datos = await leerDatos(m, form);

    if (partidaId) {
      const id = leerUuid(partidaId, "Partida");
      // Se comprueba que la partida sea de ESTE módulo: el guardia de arriba es el del
      // módulo que llegó en el argumento, y sin esto bastaría pasar «logistica» con el
      // id de un gasto para editar un gasto con el permiso de logística.
      const existente = await obtenerPartida(id);
      if (!existente || existente.modulo !== m) throw new Error("La partida ya no existe.");
      await actualizarPartida(id, datos);

      // Si cambió la descripción, la carpeta en SharePoint cambia con ella. Es lo
      // último y no hace fallar el guardado: los datos ya están guardados, y una
      // carpeta con el nombre viejo es un desorden, no una pérdida.
      if (existente.carpetaItemId && existente.descripcion !== datos.descripcion) {
        try {
          const { webUrl } = await renombrarElemento(
            existente.carpetaItemId,
            nombreDeCarpeta({ numero: existente.numero, descripcion: datos.descripcion }),
          );
          await guardarEnlaceDeCarpetaDePartida(id, webUrl);
        } catch (e) {
          console.error(
            `[${MODULOS[m].appSlug}] No se pudo renombrar la carpeta de la partida ${existente.numero}: ${
              e instanceof Error ? e.message : e
            }`,
          );
        }
      }
    } else {
      nuevaId = await crearPartida(m, datos, usuario.nombre || usuario.correo);
    }
  } catch (e) {
    return comoError(e);
  }

  refrescar(m);
  // Una alta devuelve el id y NO redirige: el formulario tiene que subir los archivos
  // que traía a la carpeta de la partida recién creada, y eso lo hace el navegador (el
  // archivo no pasa por el servidor). Cuando termina, es el formulario quien abre la
  // ficha.
  return nuevaId ? { ok: true, id: nuevaId } : { ok: true };
}

/** El cambio rápido de estado desde la lista, sin abrir la partida. */
export async function cambiarEstadoDePartidaAction(
  moduloEntrante: string,
  partidaId: string,
  estado: string,
): Promise<EstadoForm> {
  const { m } = await guardia(moduloEntrante, "editar");

  try {
    const id = leerUuid(partidaId, "Partida");
    if (!estadoValido(m, estado)) throw new Error("Estado inválido.");
    const existente = await obtenerPartida(id);
    if (!existente || existente.modulo !== m) throw new Error("La partida ya no existe.");

    await cambiarEstadoDePartida(id, estado);
    refrescar(m);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

export async function eliminarPartidaAction(
  moduloEntrante: string,
  partidaId: string,
): Promise<EstadoForm> {
  const { m } = await guardia(moduloEntrante, "editar");

  try {
    const id = leerUuid(partidaId, "Partida");
    const existente = await obtenerPartida(id);
    if (!existente || existente.modulo !== m) throw new Error("La partida ya no existe.");

    // SharePoint va primero, y si falla no se toca la partida: borrar la partida y que
    // su carpeta quede huérfana en el sitio es peor que no borrar nada, porque ya
    // nadie sabe de cuál era. La carpeta va a la papelera de SharePoint, de donde se
    // puede restaurar; la partida no.
    if (existente.carpetaItemId) await eliminarElemento(existente.carpetaItemId);

    await eliminarPartida(id);
    refrescar(m);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

// -----------------------------------------------------------------------------
//  Archivos de la partida
// -----------------------------------------------------------------------------

/**
 * Abre la subida de un archivo a la carpeta de la partida, creándola la primera vez.
 *
 * El archivo conserva su nombre —limpiado de lo que SharePoint no admite—: a
 * diferencia de Acreditación, acá no hay una lista fija de documentos que le dé un
 * nombre, y una cotización se reconoce por el suyo. Si ya hay uno igual, SharePoint le
 * agrega un sufijo en vez de pisarlo.
 */
export async function prepararSubidaDePartidaAction(
  moduloEntrante: string,
  partidaId: string,
  nombreOriginal: string,
): Promise<{ url: string }> {
  const { m } = await guardia(moduloEntrante, "crear");

  const partida = await obtenerPartida(leerUuid(partidaId, "Partida"));
  if (!partida || partida.modulo !== m) throw new Error("La partida ya no existe.");

  const carpetaId = await asegurarCarpetaDePartida(partida);

  const coincide = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(nombreOriginal.trim());
  const base = nombreParaSharePoint(coincide?.[1] ?? "", 120) || "archivo";
  const extension = (coincide?.[2] ?? "").toLowerCase();

  return await sesionDeSubidaEnCarpeta(carpetaId, `${base}${extension}`);
}

/**
 * Elimina un archivo de la carpeta de una partida, también en SharePoint.
 *
 * El id del archivo viaja desde el navegador, y un cliente puede mentir: se le pregunta
 * a SharePoint de dónde cuelga, y solo se elimina si es de la carpeta DE ESTA partida.
 * Sin esa comprobación, quien tuviera el módulo podría eliminar cualquier archivo del
 * sitio al que su cuenta llegue. Va a la papelera de SharePoint.
 */
export async function eliminarArchivoDePartidaAction(
  moduloEntrante: string,
  partidaId: string,
  archivoId: string,
): Promise<EstadoForm> {
  const { m, usuario } = await guardia(moduloEntrante, "editar");

  try {
    const partida = await obtenerPartida(leerUuid(partidaId, "Partida"));
    if (!partida || partida.modulo !== m) throw new Error("La partida ya no existe.");
    if (!partida.carpetaItemId) throw new Error("Esta partida todavía no tiene carpeta.");

    const id = String(archivoId ?? "");
    if (!id) throw new Error("Archivo inválido.");
    const elemento = await obtenerElemento(id);
    // Un archivo que ya no está se da por eliminado: es lo que se quería.
    if (elemento) {
      if (elemento.carpetaId !== partida.carpetaItemId) {
        throw new Error("Ese archivo no está en la carpeta de esta partida.");
      }
      await eliminarElemento(elemento.id);
      console.info(
        `[${MODULOS[m].appSlug}] ${usuario.correo} eliminó «${elemento.nombre}» de la partida ${partida.numero}.`,
      );
    }
  } catch (e) {
    return comoError(e);
  }

  refrescarContrato();
  return { ok: true };
}

/**
 * Pide los permisos de SharePoint y vuelve al módulo.
 *
 * La misma petición que hace Contratos, pero con la guardia de ESTE módulo y regresando
 * a él: la de Contratos exige tener «contratos» asignado, y quien solo tiene Logística
 * se quedaría sin forma de conectarse.
 */
async function conectar(m: ModuloArranque): Promise<void> {
  await exigirAccesoApp(MODULOS[m].appSlug);
  await signIn("microsoft-entra-id", { redirectTo: await enEsteContrato(MODULOS[m].ruta) }, { scope: SCOPES_SHAREPOINT });
}

export async function conectarLogisticaAction(): Promise<void> {
  await conectar("logistica");
}

export async function conectarGastosAction(): Promise<void> {
  await conectar("gastos");
}

// -----------------------------------------------------------------------------
//  Categorías
// -----------------------------------------------------------------------------

export async function crearCategoriaAction(
  moduloEntrante: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const { m } = await guardia(moduloEntrante, "configurar");

  try {
    const nombre = leerTexto(form.get("nombre"), 80);
    if (!nombre) throw new Error("Falta el nombre de la categoría.");
    await crearCategoria(m, nombre);
    refrescar(m);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

/** Comprueba que la categoría sea del módulo cuyo permiso se exigió. */
async function categoriaDelModulo(m: ModuloArranque, categoriaId: string): Promise<string> {
  const id = leerUuid(categoriaId, "Categoría");
  const categorias = await listarCategorias(m, { incluirInactivas: true });
  if (!categorias.some((c) => c.id === id)) throw new Error("Esa categoría no existe.");
  return id;
}

export async function actualizarCategoriaAction(
  moduloEntrante: string,
  categoriaId: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  const { m } = await guardia(moduloEntrante, "configurar");

  try {
    const id = await categoriaDelModulo(m, categoriaId);
    const nombre = leerTexto(form.get("nombre"), 80);
    if (!nombre) throw new Error("El nombre no puede quedar vacío.");
    await actualizarCategoria(id, { nombre, activo: form.get("activo") === "on" });
    refrescar(m);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}

export async function eliminarCategoriaAction(
  moduloEntrante: string,
  categoriaId: string,
): Promise<EstadoForm> {
  const { m } = await guardia(moduloEntrante, "configurar");

  try {
    await eliminarCategoria(await categoriaDelModulo(m, categoriaId));
    refrescar(m);
    return { ok: true };
  } catch (e) {
    return comoError(e);
  }
}
