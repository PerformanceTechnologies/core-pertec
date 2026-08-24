import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { exigirAccesoApp, verificarAccesoAppApi } from "@/lib/autorizacion";
import { calcularTotales, detectarInconsistencias } from "./verificar";
import type { Inconsistencia, OfertaCanonica, SeccionConImagenes } from "./tipos";
import type { Empresa } from "@/lib/cotizador/empresas";
import type { ImagenGuardada } from "./imagenes";
import { sinLaImagen } from "./normalizar";

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
  imagenes, creado_en, actualizado_en
`;

export interface OfertaResumen {
  id: string;
  nombre: string;
  numeroOferta: string | null;
  cliente: string | null;
  faena: string | null;
  empresa: Empresa;
  estado: "borrador" | "emitida";
  cantidadInconsistencias: number;
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
  actualizadoEn: string;
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
    maestroId: f.maestro_id,
    logoClienteRuta: f.logo_cliente_ruta,
    logoClienteNombre: f.logo_cliente_nombre,
    imagenes: f.imagenes ?? [],
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

export async function listarOfertas(): Promise<OfertaResumen[]> {
  const { data } = await supabaseAdmin
    .from("ofertas_documentos")
    .select(COLUMNAS)
    .order("actualizado_en", { ascending: false });

  return ((data ?? []) as unknown as Fila[]).map(filaAGuardada);
}

export async function obtenerOferta(id: string): Promise<OfertaGuardada | null> {
  const { data } = await supabaseAdmin.from("ofertas_documentos").select(COLUMNAS).eq("id", id).maybeSingle();

  return data ? filaAGuardada(data as unknown as Fila) : null;
}

/** Como `obtenerOferta`, pero redirige si no existe: para las páginas. */
export async function obtenerOfertaOSalir(id: string): Promise<OfertaGuardada> {
  const oferta = await obtenerOferta(id);
  if (!oferta) redirect("/ofertas");
  return oferta;
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
  creadoPor: string,
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
      creado_por: creadoPor,
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

  await guardarContenido(id, contenido, oferta.archivoOrigen);
}

export async function marcarEmitida(id: string): Promise<void> {
  await supabaseAdmin
    .from("ofertas_documentos")
    .update({ estado: "emitida", actualizado_en: new Date().toISOString() })
    .eq("id", id);
}

export async function eliminarOferta(id: string): Promise<void> {
  await supabaseAdmin.from("ofertas_documentos").delete().eq("id", id);
}
