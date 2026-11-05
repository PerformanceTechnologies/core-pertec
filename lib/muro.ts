import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { crearNotificacion } from "./buzon";
import { contextoDeEmpresa, empresaIdsPorUsuario } from "./empresas";
import { SLUG_POR_OMISION, type Empresa } from "./empresas-modelo";
import { LARGO_MAXIMO_MURO, mencionesDe, textoPlano, type MensajeMuro, type PersonaMuro } from "./muro-modelo";
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
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function revienta(que: string, error: { message: string } | null): void {
  if (!error) return;
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

/** Los últimos mensajes (o los de antes de `antesDe`), del más viejo al más nuevo. */
export async function listarMensajes(empresaId: string, antesDe?: string): Promise<{ mensajes: MensajeMuro[]; hayMas: boolean }> {
  let q = supabaseAdmin.from(TABLA).select("*").eq("empresa_id", empresaId).eq("eliminado", false).order("creado_en", { ascending: false }).limit(POR_PAGINA + 1);
  if (antesDe) q = q.lt("creado_en", antesDe);
  const { data, error } = await q;
  revienta("leer el muro", error);
  const filas = data ?? [];
  return { mensajes: filas.slice(0, POR_PAGINA).map(aMensaje).reverse(), hayMas: filas.length > POR_PAGINA };
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
 * Publica un mensaje. Las menciones solo cuentan si son de personas de esa empresa; a cada una
 * le llega un aviso personal a la campana (menos a quien escribe).
 */
export async function publicarMensaje(usuario: UsuarioConAcceso, empresa: Empresa, texto: string): Promise<MensajeMuro> {
  const limpio = texto.replace(/\r\n/g, "\n").trim();
  if (!limpio) throw new Error("Escribe algo antes de enviar.");
  if (limpio.length > LARGO_MAXIMO_MURO) throw new Error(`El mensaje es muy largo (máximo ${LARGO_MAXIMO_MURO} caracteres).`);

  const personas = await personasDeEmpresa(empresa);
  const nombres = new Map(personas.map((p) => [p.correo, p.nombre]));
  const menciones = mencionesDe(limpio).filter((c) => nombres.has(c));

  const { data, error } = await supabaseAdmin
    .from(TABLA)
    .insert({ empresa_id: empresa.id, autor_correo: usuario.correo.toLowerCase(), autor_nombre: usuario.nombre, texto: limpio, menciones })
    .select("*")
    .single();
  revienta("publicar el mensaje", error);
  const mensaje = aMensaje(data);

  const yo = usuario.correo.toLowerCase();
  const plano = textoPlano(limpio, (c) => nombres.get(c) ?? c.split("@")[0]);
  await Promise.all(
    menciones
      .filter((c) => c !== yo)
      .map((destinatario) =>
        crearNotificacion({
          modulo: null,
          tipo: "mencion",
          titulo: `${usuario.nombre ?? usuario.correo} te mencionó en el Muro de ${empresa.nombre}`,
          cuerpo: plano.length > 160 ? `${plano.slice(0, 157)}…` : plano,
          enlace: `/muro#m-${mensaje.id}`,
          clave: `muro:${mensaje.id}:${destinatario}`,
          destinatario,
        }).catch(() => false),
      ),
  );
  return mensaje;
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
