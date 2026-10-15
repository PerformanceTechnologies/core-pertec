"use server";


import { refrescarContrato } from "@/lib/contratos/refrescar";
import { exigirAccesoApp, exigirCapacidad } from "@/lib/contratos/autorizacion";
import { resolverResponsable } from "@/lib/contratos/responsables";
import {
  buscarSeccion,
  carpetaProtegida,
  renombrarElemento,
  rutaDeElemento,
  colgaDeAcreditacion,
  crearCarpeta,
  eliminarElemento,
  enlaceDeArchivo,
  esCarpetaDeAcreditacion,
  esDeOffice,
  ErrorDeGraph,
  estaEnAcreditacion,
  olvidarEstructura,
  segmentosDeRuta,
  sesionDeSubida,
  vistaPreviaDeArchivo,
  type Seccion,
} from "@/lib/contratos/sharepoint";
import { estadosDe, guardarEstado, guardarResponsable } from "@/lib/contratos/contratos-seguimiento";
import { guardarComentario, olvidarComentario } from "@/lib/contratos/contratos-comentarios";
import { guardarEstadoDeArchivo } from "@/lib/contratos/contratos-archivo-estados";
import { esEstadoDeArchivo, type EstadoDeArchivo } from "@/lib/contratos/documento-estado";
import type { EstadoRequisito } from "@/lib/contratos/contratos-estado";

// exigirAccesoApp() se repite en CADA acción, no solo en la página. Una Server
// Action es un endpoint: se puede invocar sin pasar por la interfaz que la
// muestra, así que esconder un botón no protege nada.
//
// Y es solo la primera reja: la segunda la pone SharePoint, que responde con el
// token de la persona y no con uno de la aplicación. Alguien que tenga el módulo
// asignado pero no esté en el sitio CONTRATOS llega hasta acá y Graph lo frena.
const APP = "contratos";

/**
 * La sección llega desde el cliente, así que no se puede confiar en ella: se
 * busca en la lista y se rechaza lo que no esté. Sin esto, el slug sería otro
 * trozo de ruta sin validar.
 */
async function seccionValida(slug: string): Promise<Seccion> {
  const seccion = await buscarSeccion(slug);
  if (!seccion) throw new ErrorDeGraph(`Sección desconocida: ${slug}`, 400);
  return seccion;
}

/**
 * La carpeta de Acreditación (la 1.3) y todo lo que cuelga de ella es de SOLO LECTURA desde acá.
 *
 * Los documentos de las personas se cargan, reemplazan y quitan desde Acreditación, que es quien
 * sabe a qué persona y a qué documento corresponde cada archivo y si está vigente. Si Contrato
 * DCH también dejara escribir ahí, el expediente de una persona y su ficha podrían decir cosas
 * distintas. La interfaz ya no ofrece los botones, pero una Server Action es un endpoint: la
 * regla se hace cumplir acá también.
 */
const SOLO_LECTURA =
  "Esa carpeta es de Acreditación Personas o Vehículos: los documentos se cargan y se actualizan desde ese módulo. " +
  "Desde acá solo se ven.";

function exigirEscribible(ruta: string): void {
  if (estaEnAcreditacion(ruta)) throw new Error(SOLO_LECTURA);
}

/**
 * Vuelve a pedirle al servidor la carpeta tocada y la portada.
 *
 * Las dos y no solo la primera: la portada muestra el avance de cada tarjeta, así
 * que cambiar algo adentro la cambia a ella también.
 *
 * Los segmentos se codifican igual que en los enlaces de la página. Sin eso, una
 * ruta con espacios —y acá son todas— no coincide con ningún camino renderizado
 * y la invalidación no alcanza a nada: no falla, simplemente no refresca.
 */
function refrescarRutas(ruta: string): void {
  refrescarContrato();
  const segmentos = ruta.split("/").filter(Boolean).map(encodeURIComponent);
  if (segmentos.length > 0) refrescarContrato();
}

export async function prepararSubidaAction(slug: string, rutaCarpeta: string, nombre: string) {
  await exigirCapacidad(APP, "crear");
  exigirEscribible(rutaCarpeta);
  return await sesionDeSubida(await seccionValida(slug), rutaCarpeta, nombre);
}

/**
 * El enlace de un archivo, pedido al abrirlo y no al pintar la lista.
 *
 * Graph entrega la URL de descarga en la consulta de CADA elemento, así que
 * tenerla lista para toda la carpeta serían tantas llamadas como archivos haya.
 * La gente abre uno o dos de una lista de treinta: se pide cuando se necesita.
 */
export async function enlaceDeArchivoAction(
  slug: string,
  ruta: string,
): Promise<{ url: string | null; urlDescarga: string | null }> {
  await exigirAccesoApp(APP);
  const seccion = await seccionValida(slug);

  // Un .docx o un .xlsx no los dibuja el navegador: para esos hay que pedirle a
  // Graph la URL de Office Online. Para un PDF o una imagen el enlace de
  // descarga se muestra tal cual, y pedir la vista previa sería una llamada de
  // más para llegar al mismo sitio.
  const [urlDescarga, vistaPrevia] = await Promise.all([
    enlaceDeArchivo(seccion, ruta),
    esDeOffice(ruta) ? vistaPreviaDeArchivo(seccion, ruta) : Promise.resolve(null),
  ]);

  return { url: vistaPrevia ?? (esDeOffice(ruta) ? null : urlDescarga), urlDescarga };
}

export async function refrescarAction(slug: string, rutaCarpeta: string) {
  await exigirAccesoApp(APP);
  // Un archivo nuevo cambia lo que las listas saben de la carpeta (cuántos documentos
  // tiene, en qué etapa va). Se descarta la memoria de la estructura para que la lista que
  // se vuelve a pintar lo lea de SharePoint y no del último minuto.
  olvidarEstructura();
  // La lista la pinta el servidor: después de subir hay que pedirle que la
  // vuelva a traer de SharePoint.
  refrescarRutas(rutaCarpeta);
}

export async function crearCarpetaAction(slug: string, rutaPadre: string, form: FormData) {
  await exigirCapacidad(APP, "configurar");
  exigirEscribible(rutaPadre);
  // El nombre lo valida crearCarpeta, con validarNombre: la comprobación vive
  // en sharepoint.ts, que es por donde pasan TODAS las rutas.
  await crearCarpeta(await seccionValida(slug), rutaPadre, String(form.get("nombre") ?? ""));
  refrescarRutas(rutaPadre);
}

/**
 * Cambia el nombre de una carpeta de Contrato DCH.
 *
 * Con la misma capacidad que crear una: renombrar un requisito es redefinirlo, no
 * agregar datos. Se puede sin miedo porque la base sigue cada carpeta por su id —el
 * estado, el responsable y los comentarios no se pierden—, salvo las que el core
 * encuentra por nombre (ver carpetaProtegida), que se rechazan.
 *
 * Dónde está la carpeta se le pregunta a SharePoint y no al navegador, igual que al
 * eliminar: la ruta que llega a una Server Action se puede inventar.
 */
export async function renombrarCarpetaAction(
  slug: string,
  itemId: string,
  rutaPadre: string,
  nombreNuevo: string,
): Promise<{ error?: string }> {
  await exigirCapacidad(APP, "configurar");
  const seccion = await seccionValida(slug);

  const elemento = await rutaDeElemento(seccion, itemId);
  if (!elemento || !elemento.esCarpeta) return { error: "No se encontró la carpeta en SharePoint." };
  if (carpetaProtegida(elemento.ruta)) {
    return {
      error:
        "Esta carpeta no se puede renombrar desde el core: su nombre lo usa el sistema " +
        "(Documentos generales, Acreditación o sus carpetas, Logística o Gastos).",
    };
  }

  try {
    await renombrarElemento(itemId, nombreNuevo);
  } catch (e) {
    // Devuelto y no lanzado, por lo mismo que al eliminar: lanzado, Next lo cambia por un
    // texto genérico y la persona no sabría si fue un nombre repetido o un permiso.
    console.error(`[contratos] No se pudo renombrar ${itemId}:`, e);
    return { error: e instanceof Error ? e.message : "No se pudo renombrar la carpeta." };
  }

  refrescarRutas(rutaPadre);
  return {};
}

export async function cambiarEstadoAction(
  slug: string,
  itemId: string,
  ruta: string,
  estado: EstadoRequisito,
) {
  const usuario = await exigirCapacidad(APP, "editar");
  await seccionValida(slug);
  // El estado de la 1.3 no se marca a mano: es lo que dice Acreditación.
  exigirEscribible(ruta);

  if (!["pendiente", "subido", "no_aplica"].includes(estado)) {
    throw new Error(`Estado desconocido: ${estado}`);
  }

  await guardarEstado({ itemId, ruta, estado, usuarioId: usuario.id });

  // La carpeta PADRE: el estado se cambia desde la tarjeta del requisito, que se
  // pinta un nivel más arriba.
  refrescarRutas(ruta.split("/").slice(0, -1).join("/"));
  refrescarRutas(ruta);
}

/**
 * Cambia la etapa de revisión de un ARCHIVO: Borrador, En revisión o Validado.
 *
 * Es del archivo y no del requisito (ver documento-estado.ts), así que no toca el
 * avance de la carpeta: «subido» sigue significando que hay algo entregado. Quien lo
 * cambió queda anotado con nombre y fecha.
 */
export async function cambiarEstadoDeArchivoAction(
  slug: string,
  itemId: string,
  rutaArchivo: string,
  estado: EstadoDeArchivo,
) {
  const usuario = await exigirCapacidad(APP, "editar");
  await seccionValida(slug);

  exigirEscribible(rutaArchivo);
  if (!esEstadoDeArchivo(estado)) throw new Error(`Estado desconocido: ${estado}`);
  const id = String(itemId ?? "");
  if (!id || id.length > 200) throw new Error("Archivo inválido.");
  // Rechaza `..` como cualquier otra ruta que llega del navegador.
  segmentosDeRuta(rutaArchivo);

  await guardarEstadoDeArchivo({
    itemId: id,
    ruta: rutaArchivo,
    estado,
    usuarioId: usuario.id,
    usuarioNombre: usuario.nombre || usuario.correo,
  });

  // La etapa de un archivo se ve en la página de su carpeta Y en la fila de cada carpeta que
  // la contiene: la lista de arriba y la de más arriba parten su barra por etapa. Se refresca
  // toda la cadena de carpetas, de la del archivo hacia la raíz.
  const carpetas = rutaArchivo.split("/").filter(Boolean).slice(0, -1);
  for (let hasta = carpetas.length; hasta >= 1; hasta--) {
    refrescarRutas(carpetas.slice(0, hasta).join("/"));
  }
}

/** Asigna —o quita, con null— el responsable de un requisito. */
export async function asignarResponsableAction(
  slug: string,
  itemId: string,
  ruta: string,
  responsableId: string | null,
) {
  const usuario = await exigirCapacidad(APP, "editar");
  await seccionValida(slug);
  // Sí se puede asignar quién responde por la 1.3 entera; no por la carpeta de una persona.
  if (!esCarpetaDeAcreditacion(ruta)) exigirEscribible(ruta);

  // El valor llega del navegador y puede ser de cualquiera de las dos listas.
  // resolverResponsable decide a qué columna va y rechaza lo que no esté en
  // ninguna: una acción es un endpoint, y una clave foránea inventada daría un
  // error de Postgres en vez de un motivo entendible.
  const { responsableId: interno, responsableExternoId } =
    await resolverResponsable(responsableId);

  await guardarResponsable({
    itemId,
    ruta,
    responsableId: interno,
    responsableExternoId,
    usuarioId: usuario.id,
  });

  refrescarRutas(ruta.split("/").slice(0, -1).join("/"));
  refrescarRutas(ruta);
}

/**
 * Lo que pasa cuando un archivo termina de subir.
 *
 * Se llama desde el navegador con el id que devuelve SharePoint al cerrar la
 * sesión de subida, así que acá ya existe el archivo y se le puede colgar el
 * comentario.
 */
export async function registrarSubidaAction(datos: {
  seccion: string;
  /** El archivo recién creado en SharePoint. */
  itemIdArchivo: string;
  rutaArchivo: string;
  comentario: string;
  /** La carpeta de requisito, si la hay: es la que pasa a "subido". */
  itemIdCarpeta: string | null;
  rutaCarpeta: string;
}) {
  const usuario = await exigirCapacidad(APP, "crear");
  await seccionValida(datos.seccion);
  exigirEscribible(datos.rutaCarpeta);
  exigirEscribible(datos.rutaArchivo);
  olvidarEstructura();

  if (datos.comentario.trim()) {
    await guardarComentario({
      itemId: datos.itemIdArchivo,
      ruta: datos.rutaArchivo,
      comentario: datos.comentario,
      autorId: usuario.id,
      autorNombre: usuario.nombre || usuario.correo,
    });
  }

  if (datos.itemIdCarpeta) {
    // Subir marca el requisito como cumplido, pero NO pisa un "no aplica".
    //
    // Que alguien haya dicho que ese requisito no corresponde a este contrato es
    // una decisión deliberada; un archivo suelto en la carpeta no alcanza para
    // revertirla sin avisar. Si de verdad aplica, se cambia a mano.
    const actual = (await estadosDe([datos.itemIdCarpeta])).get(datos.itemIdCarpeta)?.estado;
    if (actual !== "no_aplica") {
      await guardarEstado({
        itemId: datos.itemIdCarpeta,
        ruta: datos.rutaCarpeta,
        estado: "subido",
        usuarioId: usuario.id,
      });
    }
  }

  refrescarRutas(datos.rutaCarpeta);
}

/**
 * Elimina un archivo de una carpeta del módulo, también en SharePoint.
 *
 * ── Por qué ahora sí ────────────────────────────────────────────────────────
 *
 * Esto no existía a propósito, con el argumento de que «el dueño de estos
 * documentos es SharePoint y borrar desde acá saltaría sus permisos, su papelera
 * y su control de versiones». Ese argumento era falso: la llamada va por Graph
 * con el token de QUIEN pulsa, así que los permisos del sitio se aplican igual —
 * si esa persona no puede borrar allá, tampoco puede desde acá— y el archivo va
 * a la papelera del sitio, de donde se restaura.
 *
 * Además era incoherente: Acreditación y las partidas de Logística y Gastos ya
 * borraban así desde el primer día. Lo único que conseguía era obligar a abrir
 * SharePoint para corregir una subida equivocada.
 *
 * Se borra el archivo y su comentario. El ESTADO del requisito no se toca: que
 * alguien lo haya marcado como subido o como «no aplica» es una afirmación suya,
 * y reemplazar un archivo por otro no la cambia.
 */
export async function eliminarArchivoDeCarpetaAction(
  slug: string,
  itemId: string,
  rutaCarpeta: string,
): Promise<{ error?: string }> {
  await exigirCapacidad(APP, "editar");
  const seccion = await seccionValida(slug);

  // La ruta que manda el navegador no basta para esta regla (se puede mentir): se le pregunta a
  // SharePoint dónde está el archivo. Devuelto y no lanzado, por lo mismo que más abajo.
  if (estaEnAcreditacion(rutaCarpeta) || (await colgaDeAcreditacion(seccion, itemId))) {
    return { error: SOLO_LECTURA };
  }

  try {
    // Por id y no por ruta: un id de SharePoint identifica un archivo concreto,
    // mientras que una ruta puede apuntar a otra cosa si entremedio renombraron.
    await eliminarElemento(itemId);
    await olvidarComentario(itemId);
  } catch (e) {
    // Devuelto y no lanzado: lanzado, Next lo reemplaza por un texto de React
    // antes de que llegue al navegador y la persona no sabría si fue por
    // permisos, porque el archivo ya no estaba, o por otra cosa.
    console.error(`[contratos] No se pudo eliminar ${itemId}:`, e);
    return { error: e instanceof Error ? e.message : "No se pudo eliminar el archivo." };
  }

  olvidarEstructura();
  refrescarRutas(rutaCarpeta);
  return {};
}
