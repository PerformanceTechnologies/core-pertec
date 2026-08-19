import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { calcularTotales, detectarInconsistencias } from "./verificar";
import type { Inconsistencia, OfertaCanonica } from "./tipos";
import type { Empresa } from "@/lib/cotizador/empresas";

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
  estado, archivo_origen, maestro_id, creado_en, actualizado_en
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
    archivoOrigen: f.archivo_origen,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  };
}

/** El guard del módulo: mismo mecanismo que el resto del core. */
export async function exigirAccesoOfertas() {
  return exigirAccesoApp("ofertas");
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

export async function marcarEmitida(id: string): Promise<void> {
  await supabaseAdmin
    .from("ofertas_documentos")
    .update({ estado: "emitida", actualizado_en: new Date().toISOString() })
    .eq("id", id);
}

export async function eliminarOferta(id: string): Promise<void> {
  await supabaseAdmin.from("ofertas_documentos").delete().eq("id", id);
}
