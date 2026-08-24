import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { exigirAccesoApp, verificarAccesoAppApi } from "@/lib/autorizacion";
import { calcularTotales, detectarInconsistencias } from "./verificar";
import type { Inconsistencia, OfertaCanonica } from "./tipos";
import type { Empresa } from "@/lib/cotizador/empresas";
import type { ImagenGuardada } from "./imagenes";

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

export async function marcarEmitida(id: string): Promise<void> {
  await supabaseAdmin
    .from("ofertas_documentos")
    .update({ estado: "emitida", actualizado_en: new Date().toISOString() })
    .eq("id", id);
}

export async function eliminarOferta(id: string): Promise<void> {
  await supabaseAdmin.from("ofertas_documentos").delete().eq("id", id);
}
