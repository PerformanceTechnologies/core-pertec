import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { contextoDeEmpresa, empresaIdsPorUsuario } from "./empresas";
import { SLUG_POR_OMISION, type Empresa } from "./empresas-modelo";
import { LARGO_MAXIMO_MURO, esReaccion, esRolMuro, permisoDeRol, type PermisoBorrar, type RolMuro, mencionesDe, type ReaccionesMuro, type MensajeMuro, type PersonaMuro } from "./muro-modelo";
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

// ---------- Reacciones --------------------------------------------------------------

// Los ids de los mensajes viajan en la URL de cada consulta (`in.(…)`): en tramos cortos para no
// pasarse del largo que aceptan Supabase y los proxys (400 UUID son unos 15 KB).
const IDS_POR_CONSULTA = 100;
// Máximo de filas que entrega Supabase por respuesta; si hay más, se piden por tramos.
const FILAS_POR_RESPUESTA = 1000;

type FilaReaccion = { mensaje_id: string; correo: string; emoji: string };

/** Todas las reacciones de estos mensajes (los pocos que caben en una consulta), o null si falla. */
async function filasDeReacciones(ids: string[]): Promise<FilaReaccion[] | null> {
  const filas: FilaReaccion[] = [];
  let total = Infinity;
  while (filas.length < total) {
    const { data, error, count } = await supabaseAdmin
      .from("muro_reacciones")
      .select("mensaje_id, correo, emoji", { count: "exact" })
      .in("mensaje_id", ids)
      // Con un orden fijo, los tramos no se pisan ni se saltan filas.
      .order("mensaje_id")
      .order("correo")
      .order("emoji")
      .range(filas.length, filas.length + FILAS_POR_RESPUESTA - 1);
    if (error) {
      console.error(`[muro] no se pudieron leer las reacciones: ${error.message}`);
      return null;
    }
    const tramo = (data ?? []) as FilaReaccion[];
    if (tramo.length === 0) break;
    filas.push(...tramo);
    total = count ?? filas.length;
  }
  return filas;
}

/**
 * Las reacciones de estos mensajes. Si no se pudieron leer (la tabla todavía no existe, falla la
 * red…) devuelve `null`, NO `{}`: «ninguna» y «no sé» son cosas distintas, y quien la usa tiene que
 * dejar en pantalla lo que ya tenía en vez de vaciarlo. Es todo o nada: un resultado a medias
 * también borraría reacciones.
 */
export async function reaccionesDe(ids: string[]): Promise<ReaccionesMuro | null> {
  const unicos = [...new Set(ids)];
  const tramos: string[][] = [];
  for (let i = 0; i < unicos.length; i += IDS_POR_CONSULTA) tramos.push(unicos.slice(i, i + IDS_POR_CONSULTA));
  const respuestas = await Promise.all(tramos.map(filasDeReacciones));
  const salida: ReaccionesMuro = {};
  for (const filas of respuestas) {
    if (!filas) return null;
    for (const r of filas) {
      if (!esReaccion(r.emoji)) continue;
      const m = (salida[r.mensaje_id] ??= {});
      (m[r.emoji] ??= []).push(String(r.correo));
    }
  }
  return salida;
}

/** Pone o saca una reacción de esta persona a un mensaje de su empresa. Devuelve las del mensaje (null si no se pudieron leer de vuelta). */
export async function alternarReaccion(usuario: UsuarioConAcceso, empresaId: string, mensajeId: string, emoji: string): Promise<ReaccionesMuro | null> {
  if (!esReaccion(emoji)) throw new Error("Esa reacción no existe.");
  const { data: m, error } = await supabaseAdmin.from(TABLA).select("id, eliminado").eq("id", mensajeId).eq("empresa_id", empresaId).maybeSingle();
  revienta("leer el mensaje", error);
  if (!m || m.eliminado) throw new Error("Ese mensaje ya no existe.");
  const correo = usuario.correo.toLowerCase();
  const { data: ya, error: e1 } = await supabaseAdmin.from("muro_reacciones").select("mensaje_id").eq("mensaje_id", mensajeId).eq("correo", correo).eq("emoji", emoji).maybeSingle();
  if (e1) throw new Error(/muro_reacciones/.test(e1.message) ? "Faltan las reacciones en la base: corre el SQL de reacciones del muro." : e1.message);
  const { error: e2 } = ya
    ? await supabaseAdmin.from("muro_reacciones").delete().eq("mensaje_id", mensajeId).eq("correo", correo).eq("emoji", emoji)
    : await supabaseAdmin.from("muro_reacciones").insert({ mensaje_id: mensajeId, correo, emoji });
  if (e2) throw new Error(`No se pudo guardar la reacción: ${e2.message}`);
  return reaccionesDe([mensajeId]);
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

// ---------- Roles -------------------------------------------------------------------

/** Los roles asignados en el muro de una empresa (correo → rol). Sin la tabla todavía: ninguno. */
export async function rolesDelMuro(empresaId: string): Promise<Record<string, RolMuro>> {
  const { data, error } = await supabaseAdmin.from("muro_roles").select("correo, rol").eq("empresa_id", empresaId);
  const salida: Record<string, RolMuro> = {};
  if (error) return salida;
  for (const r of data ?? []) if (esRolMuro(r.rol)) salida[String(r.correo).toLowerCase()] = r.rol;
  return salida;
}

/** Qué puede borrar esta persona en el muro de esa empresa. Los admin del Core, todo. */
export async function permisoDeBorrar(usuario: UsuarioConAcceso, empresaId: string): Promise<PermisoBorrar> {
  if (usuario.rol === "admin") return "todo";
  const { data, error } = await supabaseAdmin
    .from("muro_roles").select("rol").eq("empresa_id", empresaId).eq("correo", usuario.correo.toLowerCase()).maybeSingle();
  if (error || !data || !esRolMuro(data.rol)) return "propios";
  return permisoDeRol(data.rol);
}

/** Asigna un rol (solo admin del Core). «Miembro» es lo normal, así que se guarda borrando la fila. */
export async function asignarRol(usuario: UsuarioConAcceso, empresa: Empresa, correo: string, rol: string): Promise<void> {
  if (usuario.rol !== "admin") throw new Error("Solo un administrador puede cambiar los roles del Muro.");
  if (!esRolMuro(rol)) throw new Error("Ese rol no existe.");
  const c = correo.toLowerCase();
  if (!(await personasDeEmpresa(empresa)).some((p) => p.correo === c)) throw new Error("Esa persona no es de esta empresa.");
  const q = supabaseAdmin.from("muro_roles");
  const { error } = rol === "miembro"
    ? await q.delete().eq("empresa_id", empresa.id).eq("correo", c)
    : await q.upsert({ empresa_id: empresa.id, correo: c, rol, actualizado_en: new Date().toISOString() });
  if (error) throw new Error(/muro_roles/.test(error.message) ? "Faltan los roles en la base: corre el SQL de roles del muro." : `No se pudo guardar el rol: ${error.message}`);
}

/** Borra un mensaje según el rol de la persona en el muro. Queda marcado, no se pierde de la base. */
export async function borrarMensaje(usuario: UsuarioConAcceso, empresaId: string, id: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("autor_correo").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  revienta("leer el mensaje", error);
  if (!data) return;
  const permiso = await permisoDeBorrar(usuario, empresaId);
  const propio = String(data.autor_correo).toLowerCase() === usuario.correo.toLowerCase();
  if (permiso === "nada") throw new Error("Tu rol en el Muro no permite borrar mensajes.");
  if (permiso === "propios" && !propio) throw new Error("Solo puedes borrar tus propios mensajes.");
  const { error: e2 } = await supabaseAdmin.from(TABLA).update({ eliminado: true }).eq("id", id);
  revienta("borrar el mensaje", e2);
}
