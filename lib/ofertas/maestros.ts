import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanearEstilo, ESTILO_PERTEC, type EstiloMaestro } from "./estilo";
import type { Empresa } from "@/lib/cotizador/empresas";

/**
 * Los maestros de formato guardados.
 *
 * El archivo original va a un bucket privado —es un documento comercial, con
 * precios y nombres de clientes adentro— y se guarda como respaldo y referencia
 * visual: NO se lee en cada oferta. Lo que se aplica al imprimir son los tokens de
 * `estilo`, que se leyeron una vez.
 *
 * Esa separación es la que hace que el resultado no varíe: si el formato saliera
 * de interpretar el archivo en cada emisión, dos ofertas del mismo maestro podrían
 * salir distintas.
 */

const BUCKET = "ofertas-maestros";

export interface MaestroOferta {
  id: string;
  nombre: string;
  empresa: Empresa | null;
  estilo: EstiloMaestro;
  descartados: string[];
  archivoRuta: string | null;
  archivoNombre: string | null;
  predeterminado: boolean;
  creadoEn: string;
}

interface Fila {
  id: string;
  nombre: string;
  empresa: Empresa | null;
  estilo: unknown;
  descartados: string[] | null;
  archivo_ruta: string | null;
  archivo_nombre: string | null;
  predeterminado: boolean;
  creado_en: string;
}

const COLUMNAS = `id, nombre, empresa, estilo, descartados, archivo_ruta, archivo_nombre, predeterminado, creado_en`;

function filaAMaestro(f: Fila): MaestroOferta {
  // Se sanea también al LEER, no solo al guardar: si mañana alguien edita el jsonb
  // a mano o cambia el tipo de un token, un valor inválido no puede llegar al CSS.
  const { estilo } = sanearEstilo(f.estilo);
  return {
    id: f.id,
    nombre: f.nombre,
    empresa: f.empresa,
    estilo,
    descartados: f.descartados ?? [],
    archivoRuta: f.archivo_ruta,
    archivoNombre: f.archivo_nombre,
    predeterminado: f.predeterminado,
    creadoEn: f.creado_en,
  };
}

export async function listarMaestros(): Promise<MaestroOferta[]> {
  const { data } = await supabaseAdmin
    .from("ofertas_maestros")
    .select(COLUMNAS)
    .order("predeterminado", { ascending: false })
    .order("creado_en", { ascending: false });

  return ((data ?? []) as unknown as Fila[]).map(filaAMaestro);
}

export async function obtenerMaestro(id: string): Promise<MaestroOferta | null> {
  const { data } = await supabaseAdmin.from("ofertas_maestros").select(COLUMNAS).eq("id", id).maybeSingle();
  return data ? filaAMaestro(data as unknown as Fila) : null;
}

/**
 * El estilo con que hay que imprimir una oferta.
 *
 * Cae en cascada: el maestro que la oferta eligió, si no el predeterminado, si no
 * el de PERTEC. Nunca falla — una oferta sin maestro imprime igual que antes de
 * que los maestros existieran.
 */
export async function estiloParaOferta(maestroId: string | null): Promise<EstiloMaestro> {
  if (maestroId) {
    const elegido = await obtenerMaestro(maestroId);
    if (elegido) return elegido.estilo;
  }

  const { data } = await supabaseAdmin
    .from("ofertas_maestros")
    .select(COLUMNAS)
    .eq("predeterminado", true)
    .maybeSingle();

  return data ? filaAMaestro(data as unknown as Fila).estilo : ESTILO_PERTEC;
}

/** Guarda el archivo del maestro y devuelve su ruta en el bucket. */
export async function subirArchivoMaestro(contenido: Buffer, nombreArchivo: string): Promise<string> {
  const extension = nombreArchivo.toLowerCase().split(".").pop() || "bin";
  // Nombre de uuid y no el original: los nombres reales traen espacios, tildes y
  // paréntesis, y dos maestros distintos pueden llamarse igual.
  const ruta = `${randomUUID()}.${extension}`;

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(ruta, contenido, { upsert: false });

  if (error) throw new Error(`No se pudo guardar el archivo del maestro: ${error.message}`);
  return ruta;
}

/** Una URL firmada y corta para mirar el archivo original. */
export async function urlArchivoMaestro(ruta: string, segundos = 300): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ruta, segundos);
  return data?.signedUrl ?? null;
}

export async function crearMaestro(datos: {
  nombre: string;
  empresa: Empresa | null;
  estilo: EstiloMaestro;
  descartados: string[];
  archivoRuta: string | null;
  archivoNombre: string | null;
  creadoPor: string;
}): Promise<string> {
  // El primero que entra queda predeterminado: si no, subir un maestro y no ver
  // ningún cambio se lee como que no funcionó.
  const { count } = await supabaseAdmin.from("ofertas_maestros").select("id", { count: "exact", head: true });

  const { data, error } = await supabaseAdmin
    .from("ofertas_maestros")
    .insert({
      nombre: datos.nombre,
      empresa: datos.empresa,
      estilo: datos.estilo,
      descartados: datos.descartados,
      archivo_ruta: datos.archivoRuta,
      archivo_nombre: datos.archivoNombre,
      predeterminado: (count ?? 0) === 0,
      creado_por: datos.creadoPor,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`No se pudo guardar el maestro: ${error?.message}`);
  return data.id as string;
}

/** Cambia los tokens de un maestro, saneando lo que llegue. */
export async function actualizarEstiloMaestro(
  id: string,
  nombre: string,
  estiloParcial: unknown,
): Promise<string[]> {
  const { estilo, descartados } = sanearEstilo(estiloParcial);

  const { error } = await supabaseAdmin
    .from("ofertas_maestros")
    .update({ nombre, estilo, descartados, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No se pudo guardar el maestro: ${error.message}`);
  return descartados;
}

/**
 * Marca un maestro como el predeterminado.
 *
 * Se baja el anterior primero porque hay un índice único parcial que impide dos:
 * al revés, el update fallaría por conflicto.
 */
export async function marcarPredeterminado(id: string): Promise<void> {
  await supabaseAdmin.from("ofertas_maestros").update({ predeterminado: false }).eq("predeterminado", true);
  await supabaseAdmin.from("ofertas_maestros").update({ predeterminado: true }).eq("id", id);
}

export async function eliminarMaestro(id: string): Promise<void> {
  const maestro = await obtenerMaestro(id);
  // El archivo primero: si se borra la fila y falla el archivo, queda un archivo
  // huérfano sin nada que lo nombre.
  if (maestro?.archivoRuta) {
    await supabaseAdmin.storage.from(BUCKET).remove([maestro.archivoRuta]);
  }
  await supabaseAdmin.from("ofertas_maestros").delete().eq("id", id);
}
