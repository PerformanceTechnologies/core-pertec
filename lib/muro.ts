import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { contextoDeEmpresa, empresaIdsPorUsuario } from "./empresas";
import { SLUG_POR_OMISION, type Empresa } from "./empresas-modelo";
import { LARGO_MAXIMO_MURO, mencionesDe, type MensajeMuro, type PersonaMuro } from "./muro-modelo";
import type { UsuarioConAcceso } from "./tipos";

// -----------------------------------------------------------------------------
//  Muro: el chat general de cada empresa. Lo ve toda persona activa del Core que tenga
//  acceso a la empresa activa (no depende de una aplicación asignada).
// -----------------------------------------------------------------------------

const TABLA = "muro_mensajes";
const POR_PAGINA = 50;

/* eslint-disable @typescript-eslint/no-explicit-any */
const aMensaje = (r: any): MensajeMuro => ({
  id: r.id,
  autorCorreo: r.autor_correo,
  autorNombre: r.autor_nombre || String(r.autor_correo).split("@")[0],
  texto: r.texto,
  menciones: r.menciones ?? [],
  creadoEn: r.creado_en,
  respuestaA: r.respuesta_a ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function revienta(que: string, error: { message: string } | null): void {
  if (!error) return;
  if (/respuesta_a/.test(error.message)) throw new Error("Faltan las respuestas del Muro en la base: corre el SQL de respuestas del muro.");
  if (/muro_mensajes/.test(error.message)) throw new Error("Falta crear el Muro en la base: corre el SQL del muro.");
  throw new Error(`No se pudo ${que}: ${error.message}`);
}

/** La empresa activa de esta persona (la del selector de arriba). */
export async function empresaDelMuro(usuario: UsuarioConAcceso): Promise<Empresa | null> {
  return (await contextoDeEmpresa(usuario.id, usuario.rol)).activa;
}

/** Quién puede leer y ser mencionado en el muro de una empresa: las personas activas con acceso a ella. */
export async function personasDeEmpresa(empresa: Empresa): Promise<PersonaMuro[]> {
  const [{ data, error }, asignadas] = await Promise.all([
    supabaseAdmin.from("usuarios").select("id, correo, nombre, rol").eq("activo", true),
    empresaIdsPorUsuario(),
  ]);
  if (error) throw new Error(`No se pudieron leer las personas: ${error.message}`);
  return (data ?? [])
    .filter((u) => {
      if (u.rol === "admin") return true;
      const suyas = asignadas.get(u.id as string) ?? [];
      return suyas.length ? suyas.includes(empresa.id) : empresa.slug === SLUG_POR_OMISION;
    })
    .map((u) => ({ correo: String(u.correo).toLowerCase(), nombre: (u.nombre as string | null) || String(u.correo).split("@")[0] }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Las últimas publicaciones (o las de antes de `antesDe`), del más viejo al más nuevo, con todas
 * sus respuestas aparte (también de la más vieja a la más nueva).
 */
export async function listarMensajes(
  empresaId: string,
  antesDe?: string,
): Promise<{ mensajes: MensajeMuro[]; respuestas: MensajeMuro[]; hayMas: boolean }> {
  let q = supabaseAdmin
    .from(TABLA).select("*").eq("empresa_id", empresaId).eq("eliminado", false).is("respuesta_a", null)
    .order("creado_en", { ascending: false }).limit(POR_PAGINA + 1);
  if (antesDe) q = q.lt("creado_en", antesDe);
  const { data, error } = await q;
  revienta("leer el muro", error);
  const filas = data ?? [];
  const mensajes = filas.slice(0, POR_PAGINA).map(aMensaje).reverse();
  let respuestas: MensajeMuro[] = [];
  if (mensajes.length) {
    const r = await supabaseAdmin
      .from(TABLA).select("*").eq("eliminado", false).in("respuesta_a", mensajes.map((m) => m.id)).order("creado_en");
    revienta("leer las respuestas", r.error);
    respuestas = (r.data ?? []).map(aMensaje);
  }
  return { mensajes, respuestas, hayMas: filas.length > POR_PAGINA };
}

/** Lo nuevo desde `desde`, y los ids borrados en ese rato (para sacarlos de la pantalla). */
export async function mensajesDesde(empresaId: string, desde: string, visibles: string[]): Promise<{ nuevos: MensajeMuro[]; borrados: string[] }> {
  const [nuevos, borrados] = await Promise.all([
    supabaseAdmin.from(TABLA).select("*").eq("empresa_id", empresaId).eq("eliminado", false).gt("creado_en", desde).order("creado_en").limit(200),
    visibles.length
      ? supabaseAdmin.from(TABLA).select("id").eq("empresa_id", empresaId).eq("eliminado", true).in("id", visibles.slice(-200))
      : Promise.resolve({ data: [], error: null }),
  ]);
  revienta("leer el muro", nuevos.error);
  return { nuevos: (nuevos.data ?? []).map(aMensaje), borrados: (borrados.data ?? []).map((r: { id: string }) => r.id) };
}

/**
 * Publica un mensaje. Las menciones solo cuentan si son de personas de esa empresa.
 */
export async function publicarMensaje(
  usuario: UsuarioConAcceso,
  empresa: Empresa,
  texto: string,
  respuestaA: string | null = null,
): Promise<MensajeMuro> {
  const limpio = texto.replace(/\r\n/g, "\n").trim();
  if (!limpio) throw new Error("Escribe algo antes de enviar.");
  if (limpio.length > LARGO_MAXIMO_MURO) throw new Error(`El mensaje es muy largo (máximo ${LARGO_MAXIMO_MURO} caracteres).`);

  const personas = await personasDeEmpresa(empresa);
  const nombres = new Map(personas.map((p) => [p.correo, p.nombre]));
  const menciones = mencionesDe(limpio).filter((c) => nombres.has(c));

  // Una respuesta cuelga de una publicación de ESTA empresa que siga viva. Si se responde a una
  // respuesta, se cuelga de su publicación: hay un solo nivel.
  let publicacion: { id: string; autor_correo: string } | null = null;
  if (respuestaA) {
    const { data: padre, error: e } = await supabaseAdmin
      .from(TABLA).select("id, autor_correo, respuesta_a, eliminado").eq("id", respuestaA).eq("empresa_id", empresa.id).maybeSingle();
    revienta("leer la publicación", e);
    if (!padre || padre.eliminado) throw new Error("Esa publicación ya no existe.");
    if (padre.respuesta_a) {
      const { data: abuelo } = await supabaseAdmin.from(TABLA).select("id, autor_correo, eliminado").eq("id", padre.respuesta_a).maybeSingle();
      if (!abuelo || abuelo.eliminado) throw new Error("Esa publicación ya no existe.");
      publicacion = abuelo as { id: string; autor_correo: string };
    } else publicacion = padre as { id: string; autor_correo: string };
  }

  const { data, error } = await supabaseAdmin
    .from(TABLA)
    .insert({
      empresa_id: empresa.id,
      autor_correo: usuario.correo.toLowerCase(),
      autor_nombre: usuario.nombre,
      texto: limpio,
      menciones,
      ...(publicacion ? { respuesta_a: publicacion.id } : {}),
    })
    .select("*")
    .single();
  revienta("publicar el mensaje", error);
  const mensaje = aMensaje(data);

  // Sin avisos a la campana: lo del Muro se ve solo en el Muro (las menciones quedan marcadas
  // en naranjo y el botón «Muro» de arriba cuenta lo nuevo).
  return mensaje;
}

/** Cuántos mensajes de otros (publicaciones y respuestas) hay desde `desde`, hasta 99. */
export async function contarNuevos(empresaId: string, desde: string, yo: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(TABLA)
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("eliminado", false)
    .neq("autor_correo", yo.toLowerCase())
    .gt("creado_en", desde);
  if (error) return 0;
  return Math.min(count ?? 0, 99);
}

/** Borra un mensaje propio (o cualquiera, si es admin). Queda marcado, no se pierde de la base. */
export async function borrarMensaje(usuario: UsuarioConAcceso, empresaId: string, id: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("autor_correo").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  revienta("leer el mensaje", error);
  if (!data) return;
  if (String(data.autor_correo).toLowerCase() !== usuario.correo.toLowerCase() && usuario.rol !== "admin") {
    throw new Error("Solo puedes borrar tus propios mensajes.");
  }
  const { error: e2 } = await supabaseAdmin.from(TABLA).update({ eliminado: true }).eq("id", id);
  revienta("borrar el mensaje", e2);
}
