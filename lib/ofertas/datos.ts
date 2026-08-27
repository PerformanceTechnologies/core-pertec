import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { exigirAccesoApp, verificarAccesoAppApi } from "@/lib/autorizacion";
import { calcularTotales, detectarInconsistencias } from "./verificar";
import type { Inconsistencia, OfertaCanonica, SeccionConImagenes } from "./tipos";
import type { Empresa } from "@/lib/cotizador/empresas";
import { duplicarImagenes, type ImagenGuardada } from "./imagenes";
import { contenidoDuplicado, sinLaImagen } from "./normalizar";
import { puedeVerOferta } from "./permisos";
import { conLaMarca, cuantasPendientes, revisadasVigentes } from "./revisiones";
import type { UsuarioConAcceso } from "@/lib/tipos";

/**
 * Las ofertas guardadas.
 *
 * Las inconsistencias no se guardan tal como vinieron de la lectura: se
 * RECALCULAN en cada guardado. Es la única forma de que la lista sirva de algo —
 * si alguien corrige el número de oferta en pantalla, el aviso de que no coincidía
 * tiene que desaparecer solo. Guardar la lista del primer análisis dejaría avisos
 * fantasma que la gente aprende a ignorar.
 */

const COLUMNAS = `
  id, nombre, numero_oferta, cliente, faena, empresa, contenido, inconsistencias,
  estado, archivo_origen, maestro_id, logo_cliente_ruta, logo_cliente_nombre,
  imagenes, emision, revisadas, creado_por, creado_en, actualizado_en
`;

export interface OfertaResumen {
  id: string;
  nombre: string;
  numeroOferta: string | null;
  cliente: string | null;
  faena: string | null;
  empresa: Empresa;
  estado: "borrador" | "emitida";
  /** Cuántos controles se levantaron en total, revisados o no. */
  cantidadInconsistencias: number;
  /**
   * Cuántos quedan SIN revisar, que es lo que significa "por revisar".
   *
   * Se cuenta acá y no en la pantalla porque el listado no trae los avisos, solo su
   * cuenta: mandar los nueve textos de cada oferta para contar los pendientes sería
   * mandar el módulo entero por la red.
   */
  pendientes: number;
  /** Las claves de los avisos ya revisados. Ver lib/ofertas/revisiones.ts. */
  revisadas: string[];
  /** Con qué maestro de formato se imprime. null = el predeterminado. */
  maestroId: string | null;
  /**
   * El logo del cliente de ESTA oferta, en el bucket "logos".
   *
   * Es por documento porque el cliente cambia en cada oferta, al contrario del
   * logo de la casa, que es de la empresa emisora y se sube una sola vez.
   */
  logoClienteRuta: string | null;
  logoClienteNombre: string | null;
  /**
   * Las imágenes que traía el borrador, en el orden en que aparecían.
   *
   * El contenido canónico se refiere a ellas por número —`anexo.fotos: [3, 4]`—
   * y este inventario dice dónde quedó cada una. Ver lib/ofertas/imagenes.ts.
   */
  imagenes: ImagenGuardada[];
  /** Qué se hizo al emitir, o null si todavía no se emitió. */
  emision: RegistroEmision | null;
  /** Quién la creó. Null en cargas manuales: ver puedeVerOferta. */
  creadoPor: string | null;
  actualizadoEn: string;
}

/**
 * El registro de una emisión.
 *
 * Hasta ahora "emitida" era solo un estado: no había forma de saber si el documento
 * llegó a alguien. Esto es lo que lo hace verificable — y por eso guarda también los
 * problemas: una emisión donde el correo no salió tiene que quedar registrada como
 * tal, no como una emisión limpia.
 */
export interface RegistroEmision {
  emitidaEn: string;
  emitidaPor: string;
  enviadoA: string[];
  copias: string[];
  /** La URL en SharePoint, o null si no se pidió guardarla. */
  enWorkspace: string | null;
  nombreArchivo: string;
  /**
   * El PDF congelado, en el bucket "ofertas-emitidas".
   *
   * Null en las ofertas emitidas antes de que se guardara, y ahí la descarga vuelve
   * a imprimir: es lo único que se puede hacer, pero deja de ser el archivo que
   * recibió el cliente si el maestro cambió desde entonces.
   */
  pdfRuta?: string | null;
  problemas: string[];
}

export interface OfertaGuardada extends OfertaResumen {
  contenido: OfertaCanonica;
  inconsistencias: Inconsistencia[];
  archivoOrigen: string | null;
  creadoEn: string;
}

interface Fila {
  id: string;
  nombre: string;
  numero_oferta: string | null;
  cliente: string | null;
  faena: string | null;
  empresa: Empresa;
  contenido: OfertaCanonica;
  inconsistencias: Inconsistencia[];
  estado: "borrador" | "emitida";
  archivo_origen: string | null;
  maestro_id: string | null;
  logo_cliente_ruta: string | null;
  logo_cliente_nombre: string | null;
  imagenes: ImagenGuardada[] | null;
  emision: RegistroEmision | null;
  revisadas: string[] | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

function filaAGuardada(f: Fila): OfertaGuardada {
  return {
    id: f.id,
    nombre: f.nombre,
    numeroOferta: f.numero_oferta,
    cliente: f.cliente,
    faena: f.faena,
    empresa: f.empresa,
    estado: f.estado,
    contenido: f.contenido,
    inconsistencias: f.inconsistencias ?? [],
    cantidadInconsistencias: (f.inconsistencias ?? []).length,
    pendientes: cuantasPendientes(f.inconsistencias ?? [], f.revisadas ?? []),
    revisadas: f.revisadas ?? [],
    maestroId: f.maestro_id,
    logoClienteRuta: f.logo_cliente_ruta,
    logoClienteNombre: f.logo_cliente_nombre,
    imagenes: f.imagenes ?? [],
    emision: f.emision ?? null,
    creadoPor: f.creado_por ?? null,
    archivoOrigen: f.archivo_origen,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  };
}

/** El guard de las PÁGINAS: si no hay acceso, redirige. */
export async function exigirAccesoOfertas() {
  return exigirAccesoApp("ofertas");
}

/**
 * El guard de las RUTAS de API. No es el mismo y la diferencia se ve en pantalla.
 *
 * `exigirAccesoOfertas` usa `redirect()`, que en una route handler no devuelve un
 * status: devuelve una redirección al login. El fetch la sigue, recibe el HTML de
 * la pantalla de ingreso y el `respuesta.json()` del navegador explota con
 * "JSON.parse: unexpected character at line 1 column 1" — un mensaje que no dice
 * nada de lo que pasó y que hace parecer que el archivo estaba mal.
 *
 * Acá se devuelve 401/403 con un JSON que la pantalla puede mostrar.
 */
export async function verificarAccesoOfertasApi() {
  return verificarAccesoAppApi("ofertas");
}

/**
 * El listado que le corresponde a quien mira: las suyas, o todas si es admin.
 *
 * Recibe el usuario y no un booleano ni un id opcional, y por lo mismo que en el
 * Cotizador: así no existe la forma de llamarla "sin filtro" por descuido, que es el
 * error que dejaría el portafolio completo a la vista de todos.
 *
 * El filtro va en la consulta y no en memoria: traer todo y descartar después
 * significa mandar por la red ofertas que quien mira no puede ver.
 */
export async function listarOfertas(usuario: UsuarioConAcceso): Promise<OfertaResumen[]> {
  let consulta = supabaseAdmin.from("ofertas_documentos").select(COLUMNAS);
  if (usuario.rol !== "admin") consulta = consulta.eq("creado_por", usuario.id);

  const { data } = await consulta.order("actualizado_en", { ascending: false });
  return ((data ?? []) as unknown as Fila[]).map(filaAGuardada);
}

export async function obtenerOferta(id: string): Promise<OfertaGuardada | null> {
  const { data } = await supabaseAdmin.from("ofertas_documentos").select(COLUMNAS).eq("id", id).maybeSingle();

  return data ? filaAGuardada(data as unknown as Fila) : null;
}

/**
 * El guard de UNA oferta, para páginas y Server Actions: sesión, acceso a la app y
 * que la oferta sea de quien la pide.
 *
 * Filtrar el listado no es control de acceso: sin esto, pegar la URL de la oferta de
 * otro seguía abriendo el editor con sus precios, y las acciones seguían aceptando el
 * id de cualquiera. Redirige al listado tanto si no existe como si no le
 * corresponde: distinguir los dos casos contaría si el id existe.
 */
export async function exigirOferta(id: string): Promise<{ usuario: UsuarioConAcceso; oferta: OfertaGuardada }> {
  const usuario = await exigirAccesoOfertas();
  const oferta = await obtenerOferta(id);
  if (!oferta || !puedeVerOferta(oferta, usuario)) redirect("/ofertas");
  return { usuario, oferta };
}

/**
 * Lo mismo para las RUTAS de API, que responden con un status en vez de redirigir.
 *
 * Devuelve la oferta ya verificada, y no solo el permiso, a propósito: todas las
 * rutas de `[id]` necesitaban las dos cosas y las pedían por separado, así que la
 * comprobación de dueño era una línea más que había que acordarse de escribir en la
 * próxima ruta. Acá no se puede olvidar: sin oferta no hay nada con qué seguir.
 *
 * "No es tuya" contesta 404 y no 403: para quien la pide, no existe.
 */
export async function accesoAOfertaApi(
  id: string,
): Promise<
  | { oferta: OfertaGuardada; usuario: UsuarioConAcceso; error?: undefined; status?: undefined }
  | { oferta?: undefined; usuario?: undefined; error: string; status: number }
> {
  const acceso = await verificarAccesoOfertasApi();
  if (!acceso.usuario) return { error: acceso.error, status: acceso.status };

  const oferta = await obtenerOferta(id);
  if (!oferta || !puedeVerOferta(oferta, acceso.usuario)) {
    return { error: "La oferta no existe.", status: 404 };
  }
  return { oferta, usuario: acceso.usuario };
}

/** El nombre del listado: número de oferta y servicio, acotado. */
function nombreDe(contenido: OfertaCanonica): string {
  const partes = [contenido.identificacion.numeroOferta, contenido.titulo].filter(Boolean);
  const nombre = partes.join(" · ").replace(/\s+/g, " ").trim();
  if (!nombre) return "OFERTA SIN NOMBRE";
  return nombre.length <= 90
    ? nombre.toLocaleUpperCase("es-CL")
    : nombre.slice(0, 89).toLocaleUpperCase("es-CL") + "…";
}

export async function crearOferta(
  contenido: OfertaCanonica,
  empresa: Empresa,
  archivoOrigen: string,
  /** El ID del usuario (uuid), no su correo: es lo que espera la columna. */
  creadoPorUsuarioId: string,
  imagenes: ImagenGuardada[] = [],
): Promise<{ id: string; inconsistencias: Inconsistencia[] }> {
  const inconsistencias = detectarInconsistencias(contenido, calcularTotales(contenido), archivoOrigen);

  const { data, error } = await supabaseAdmin
    .from("ofertas_documentos")
    .insert({
      nombre: nombreDe(contenido),
      numero_oferta: contenido.identificacion.numeroOferta,
      cliente: contenido.identificacion.cliente,
      faena: contenido.identificacion.faena,
      empresa,
      contenido,
      inconsistencias,
      estado: "borrador",
      archivo_origen: archivoOrigen,
      imagenes,
      creado_por: creadoPorUsuarioId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`No se pudo guardar la oferta: ${error?.message}`);
  return { id: data.id as string, inconsistencias };
}

/**
 * Guarda las correcciones hechas en pantalla.
 *
 * Vuelve a correr los controles con el contenido nuevo, así que un dato corregido
 * limpia su propio aviso sin que nadie lo borre a mano.
 */
export async function guardarContenido(
  id: string,
  contenido: OfertaCanonica,
  archivoOrigen: string | null,
  /**
   * Las marcas de revisado que había, para quedarse solo con las que siguen
   * correspondiendo a un aviso. Sin esto la lista de claves crece con cada corrección
   * y se queda para siempre con avisos que ya no existen.
   *
   * Obligatorio y sin valor por omisión a propósito: con un `= []`, una llamada que se
   * olvidara de pasarlo BORRARÍA todas las marcas de la oferta en silencio. Así el
   * compilador lo pide.
   */
  revisadas: string[],
): Promise<Inconsistencia[]> {
  const inconsistencias = detectarInconsistencias(contenido, calcularTotales(contenido), archivoOrigen ?? "");

  const { error } = await supabaseAdmin
    .from("ofertas_documentos")
    .update({
      nombre: nombreDe(contenido),
      numero_oferta: contenido.identificacion.numeroOferta,
      cliente: contenido.identificacion.cliente,
      faena: contenido.identificacion.faena,
      contenido,
      inconsistencias,
      revisadas: revisadasVigentes(revisadas, inconsistencias),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo guardar la oferta: ${error.message}`);
  return inconsistencias;
}

/**
 * Suma al inventario las imágenes que alguien subió a mano.
 *
 * El inventario dice qué imágenes TIENE la oferta; dónde va cada una lo dice el
 * contenido (`imagenesPorSeccion`). Por eso una imagen recién subida no aparece en
 * el documento hasta que se le elige una sección: agregarla y ubicarla son dos
 * decisiones distintas, y meterla sola en alguna parte sería adivinar.
 */
export async function agregarImagenesAlInventario(
  id: string,
  nuevas: ImagenGuardada[],
): Promise<ImagenGuardada[]> {
  const oferta = await obtenerOferta(id);
  if (!oferta) throw new Error("La oferta no existe.");

  const inventario = [...oferta.imagenes, ...nuevas];
  const { error } = await supabaseAdmin
    .from("ofertas_documentos")
    .update({ imagenes: inventario, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No se pudieron guardar las imágenes: ${error.message}`);
  return inventario;
}

/**
 * Saca una imagen del inventario y de donde estuviera puesta.
 *
 * Las dos cosas juntas, porque son la misma: una imagen que ya no existe pero sigue
 * nombrada en `imagenesPorSeccion` es un número que no dibuja nada, y como firma
 * dejaría el bloque de firma con un hueco reservado y vacío.
 *
 * Devuelve la que sacó, para que quien llama borre el archivo DESPUÉS de que la
 * fila quedó guardada: al revés, un fallo al guardar dejaría el inventario
 * apuntando a un archivo que ya no está.
 */
export async function quitarImagenDelInventario(id: string, indice: number): Promise<ImagenGuardada | null> {
  const oferta = await obtenerOferta(id);
  if (!oferta) return null;

  const imagen = oferta.imagenes.find((i) => i.indice === indice);
  if (!imagen) return null;

  const inventario = oferta.imagenes.filter((i) => i.indice !== indice);
  const contenido = sinLaImagen(oferta.contenido, indice);

  const { error } = await supabaseAdmin
    .from("ofertas_documentos")
    .update({ imagenes: inventario, contenido, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No se pudo quitar la imagen: ${error.message}`);
  return imagen;
}

/** Cambia el maestro con que se imprime una oferta. */
export async function asignarMaestro(id: string, maestroId: string | null): Promise<void> {
  await supabaseAdmin
    .from("ofertas_documentos")
    .update({ maestro_id: maestroId, actualizado_en: new Date().toISOString() })
    .eq("id", id);
}

/** Guarda (o saca, con null) el logo del cliente de esta oferta. */
export async function guardarLogoCliente(
  id: string,
  ruta: string | null,
  nombreArchivo: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("ofertas_documentos")
    .update({
      logo_cliente_ruta: ruta,
      logo_cliente_nombre: nombreArchivo,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo guardar el logo del cliente: ${error.message}`);
}

/**
 * Cambia dónde va cada imagen del borrador.
 *
 * La elección del modelo es una PROPUESTA, no la última palabra: mira medidas y
 * contexto, y con eso se equivoca. Acá la persona ve las miniaturas, elige la
 * sección de cada una y de quién es cada rúbrica, que es el mismo reparto que
 * gobierna el resto del módulo.
 *
 * Las firmas vienen por posición del firmante —`firmas.get(0)` es la del primero—
 * porque es lo que la pantalla acaba de mostrar, y se escriben ADENTRO de cada
 * firmante para que después la rúbrica siga a la persona si alguien reordena la
 * lista. La del borrador queda en null: existía como "la firma" de una época en la
 * que había una sola, y con las elegidas escritas ya no tiene a quién representar.
 *
 * Se escribe sobre el contenido y se vuelven a correr los controles, como cualquier
 * corrección.
 */
export async function guardarImagenesElegidas(
  id: string,
  porSeccion: Partial<Record<SeccionConImagenes, number[]>>,
  firmas: Map<number, number>,
): Promise<void> {
  const oferta = await obtenerOferta(id);
  if (!oferta) return;
  const cierre = oferta.contenido.cierre;

  const contenido: OfertaCanonica = {
    ...oferta.contenido,
    imagenesPorSeccion: porSeccion,
    cierre: cierre
      ? {
          ...cierre,
          firmantes: cierre.firmantes.map((f, i) => ({ ...f, firmaImagen: firmas.get(i) ?? null })),
          firmaImagen: null,
        }
      : cierre,
  };

  await guardarContenido(id, contenido, oferta.archivoOrigen, oferta.revisadas);
}

/**
 * Marca (o desmarca) un aviso como revisado.
 *
 * Lee y escribe la lista completa en vez de agregar un elemento a la columna: son
 * cinco o diez claves y así la regla —sin repetidos, sin perder las otras— vive en
 * una función pura y probada (`conLaMarca`) en vez de en un fragmento de SQL.
 *
 * No valida la clave contra los avisos actuales a propósito: los avisos del editor se
 * recalculan sobre lo que se está escribiendo, que todavía no está guardado, así que
 * una clave legítima puede no existir en lo guardado. Las que sobran se limpian al
 * guardar el contenido.
 */
export async function marcarRevisada(id: string, clave: string, revisada: boolean): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("ofertas_documentos")
    .select("revisadas")
    .eq("id", id)
    .maybeSingle();

  const previas = ((data?.revisadas as string[] | null) ?? []).filter((c) => typeof c === "string");
  const revisadas = conLaMarca(previas, clave, revisada);

  const { error } = await supabaseAdmin
    .from("ofertas_documentos")
    .update({ revisadas })
    .eq("id", id);
  if (error) throw new Error(`No se pudo marcar el aviso: ${error.message}`);
  return revisadas;
}

export async function marcarEmitida(id: string): Promise<void> {
  await supabaseAdmin
    .from("ofertas_documentos")
    .update({ estado: "emitida", actualizado_en: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Marca la oferta como emitida y anota qué se hizo con el PDF.
 *
 * Las dos cosas en un solo update: si el estado quedara emitido y el registro no, la
 * oferta diría "emitida" sin poder decir a quién se le mandó, que es justo el
 * agujero que este registro viene a tapar.
 */
export async function guardarEmision(id: string, emision: RegistroEmision): Promise<void> {
  const { error } = await supabaseAdmin
    .from("ofertas_documentos")
    .update({ estado: "emitida", emision, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`No se pudo registrar la emisión: ${error.message}`);
}

/**
 * Duplica una oferta: mismo contenido, documento nuevo en borrador.
 *
 * Existe porque los controles de este módulo se escribieron para detectar copias
 * hechas a mano —una sección de otra oferta, un aporte de otro mandante, el número
 * cambiado a medias—. Copiar de verdad ataca la causa en vez del síntoma.
 *
 * Se copia el contenido (con las tres reglas de `contenidoDuplicado`), el maestro y
 * el logo del cliente, y se COPIAN los archivos de las imágenes: compartirlos haría
 * que borrar una oferta rompiera la otra. Lo que no se copia es la emisión: un
 * duplicado nace en borrador y no ha sido emitido nunca.
 */
export async function duplicarOferta(id: string, creadoPorUsuarioId: string): Promise<string | null> {
  const oferta = await obtenerOferta(id);
  if (!oferta) return null;

  const contenido = contenidoDuplicado(oferta.contenido, new Date());
  const imagenes = await duplicarImagenes(oferta.imagenes);
  const inconsistencias = detectarInconsistencias(contenido, calcularTotales(contenido), "");

  const { data, error } = await supabaseAdmin
    .from("ofertas_documentos")
    .insert({
      nombre: nombreDe(contenido),
      numero_oferta: contenido.identificacion.numeroOferta,
      cliente: contenido.identificacion.cliente,
      faena: contenido.identificacion.faena,
      empresa: oferta.empresa,
      contenido,
      inconsistencias,
      estado: "borrador",
      // De dónde salió, con el número de la original: es lo que después explica por
      // qué dos ofertas se parecen tanto.
      archivo_origen: `Duplicada de ${oferta.numeroOferta ?? oferta.nombre}`,
      maestro_id: oferta.maestroId,
      logo_cliente_ruta: oferta.logoClienteRuta,
      logo_cliente_nombre: oferta.logoClienteNombre,
      imagenes,
      // El ID del usuario, no su correo: la columna es uuid.
      creado_por: creadoPorUsuarioId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`No se pudo duplicar la oferta: ${error?.message}`);
  return data.id as string;
}

export async function eliminarOferta(id: string): Promise<void> {
  await supabaseAdmin.from("ofertas_documentos").delete().eq("id", id);
}
