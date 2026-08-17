import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { obtenerCorreosRecientes } from "@/lib/graph-correo";
import { hoyEnSantiago, obtenerReunionesProximas } from "@/lib/graph-calendario";
import { generarResumen } from "./generar";
import {
  VERSION_RESUMEN,
  type EstadoResumen,
  type ResumenDiario,
  type ResumenGuardado,
  type ResumenModelo,
} from "./tipos";
import type { CorreoResumen } from "@/lib/graph-correo";
import type { ReunionCalendario } from "@/lib/graph-calendario";

/**
 * El resumen del día: lo lee de la caché o lo genera.
 *
 * La caché es por (usuario, fecha) y existe por dos razones. Una es plata: sin
 * ella cada F5 de /mi-dia dispara una llamada al modelo sobre 60 correos. La
 * otra es coherencia: el correo de las 7:30 y la página tienen que mostrar el
 * MISMO resumen, no dos generaciones distintas del mismo día.
 */

export async function leerResumenGuardado(usuarioId: string, fecha: string): Promise<ResumenGuardado | null> {
  const { data } = await supabaseAdmin
    .from("resumen_diario")
    .select("fecha, resumen, generado_en, enviado_en")
    .eq("usuario_id", usuarioId)
    .eq("fecha", fecha)
    .maybeSingle();

  if (!data) return null;
  const resumen = data.resumen as ResumenDiario;
  return {
    fecha: data.fecha as string,
    resumen,
    generadoEn: data.generado_en as string,
    enviadoEn: (data.enviado_en as string | null) ?? null,
    // Las filas guardadas antes de que existiera el campo no tienen version:
    // quedan no vigentes, que es exactamente lo que corresponde.
    vigente: resumen?.version === VERSION_RESUMEN,
  };
}

async function guardar(usuarioId: string, fecha: string, resumen: ResumenDiario): Promise<ResumenGuardado> {
  const generadoEn = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("resumen_diario")
    .upsert(
      { usuario_id: usuarioId, fecha, resumen, generado_en: generadoEn },
      { onConflict: "usuario_id,fecha" },
    );
  if (error) throw new Error(error.message);
  return { fecha, resumen, generadoEn, enviadoEn: null, vigente: true };
}

export async function marcarEnviado(usuarioId: string, fecha: string): Promise<void> {
  await supabaseAdmin
    .from("resumen_diario")
    .update({ enviado_en: new Date().toISOString() })
    .eq("usuario_id", usuarioId)
    .eq("fecha", fecha);
}

interface OpcionesResumen {
  usuarioId: string;
  nombre: string;
  /** Necesario para distinguir el correo dirigido a la persona del que le llega en copia. */
  correo: string;
  /**
   * Token de la sesión activa, si hay. Cuando la persona abre /mi-dia se usa
   * este y no se toca la credencial guardada: es un token que ya está en la
   * mano, fresco, y evita un canje contra Entra por cada visita.
   *
   * El cron no tiene sesión, así que pasa undefined y cae al token guardado.
   */
  accessTokenSesion?: string;
}

/**
 * Devuelve el resumen de hoy, generándolo si hace falta.
 *
 * Nunca lanza por un problema de permisos o de Graph: devuelve el estado para
 * que la página muestre "conectá tu cuenta" o el motivo del error. Sí puede
 * lanzar si falta ANTHROPIC_API_KEY o si la base falla, que son errores de
 * configuración y conviene que se vean.
 */
export async function obtenerResumenDeHoy(opciones: OpcionesResumen): Promise<EstadoResumen> {
  const { usuarioId, nombre, correo, accessTokenSesion } = opciones;
  const hoy = hoyEnSantiago();

  // Solo sirve si se generó con la versión actual del formato: si no, la página
  // mostraría campos que ese resumen no tiene.
  const guardado = await leerResumenGuardado(usuarioId, hoy.iso);
  if (guardado?.vigente) return { estado: "ok", datos: guardado };

  let accessToken = accessTokenSesion;
  if (!accessToken) {
    const resultado = await accessTokenDeUsuario(usuarioId);
    if (resultado.estado === "sin_credencial") return { estado: "sin_permiso" };
    if (resultado.estado === "rechazado") {
      return { estado: "error", motivo: `Microsoft rechazó el acceso: ${resultado.motivo}` };
    }
    accessToken = resultado.accessToken;
  }

  // Correo y calendario son independientes: en paralelo, y así el tiempo de
  // pared es el del más lento y no la suma de los dos.
  const [correos, reuniones] = await Promise.all([
    obtenerCorreosRecientes(accessToken, correo),
    // Dos días además de hoy: alcanza para que el resumen avise de algo que se
    // viene sin convertirse en una agenda de la semana.
    obtenerReunionesProximas(accessToken, 2),
  ]);

  // Sin correo no hay resumen que valga la pena: el calendario solo ya lo
  // muestra el widget del dashboard.
  if (correos.estado === "sin_permiso") return { estado: "sin_permiso" };
  if (correos.estado === "error") return { estado: "error", motivo: correos.motivo };

  const listaReuniones = reuniones.estado === "ok" ? reuniones.reuniones : [];
  const delModelo = await generarResumen(
    nombre,
    correos.correos,
    listaReuniones,
    hoy.iso,
    correos.conteos.horas,
  );

  // Los conteos y los enlaces se pegan acá y no se le piden al modelo: los dos
  // son datos exactos, y eso es justo lo que un modelo hace mal.
  const resumen: ResumenDiario = {
    ...conDatosReales(delModelo, correos.correos, listaReuniones),
    conteos: correos.conteos,
    reunionesTotales: listaReuniones.length,
    version: VERSION_RESUMEN,
  };

  return { estado: "ok", datos: await guardar(usuarioId, hoy.iso, resumen) };
}

/**
 * Cambia los índices que devolvió el modelo por los datos reales del mensaje y
 * del evento: el enlace a Outlook, el extracto del cuerpo, los asistentes.
 *
 * El modelo nunca ve una URL ni copia un extracto: dice "esto es el correo [7]" y
 * acá se busca el 7 en la lista que se le pasó. Así un índice inventado o fuera de
 * rango termina en campos nulos —la fila no es clickeable y no muestra popover— en
 * vez de mandar a la persona a un mensaje equivocado o mostrarle un extracto que
 * el modelo se imaginó.
 *
 * El índice del prompt empieza en 1, de ahí el -1.
 */
function conDatosReales(
  delModelo: ResumenModelo,
  correos: CorreoResumen[],
  reuniones: ReunionCalendario[],
): Omit<ResumenModelo, "reuniones" | "correosDestacados"> &
  Pick<ResumenDiario, "reuniones" | "correosDestacados"> {
  return {
    ...delModelo,
    correosDestacados: delModelo.correosDestacados.map(({ indice, ...resto }) => {
      const real = correos[indice - 1];
      return {
        ...resto,
        enlace: real?.enlace ?? null,
        correoDe: real?.correoDe || null,
        extracto: real?.extracto || null,
        leido: real ? real.leido : null,
        marcado: real ? real.marcado : null,
        tieneAdjuntos: real ? real.tieneAdjuntos : null,
        destinatarios: real ? real.destinatarios : null,
      };
    }),
    reuniones: delModelo.reuniones.map(({ indice, ...resto }) => {
      const real = reuniones[indice - 1];
      return {
        ...resto,
        enlace: real?.enlace ?? null,
        // Del evento real, igual que el fin: ver el comentario de `inicio` en
        // ReunionResumida.
        inicio: real?.inicio ?? null,
        fin: real?.fin ?? null,
        lugar: real?.ubicacion ?? null,
        esTeams: Boolean(real?.enlaceTeams),
        organizador: real?.organizador ?? null,
        // Tope de 12: un "todos los de operaciones" con 40 personas no cabe en un
        // popover y tampoco informa.
        asistentes: (real?.asistentes ?? []).slice(0, 12),
      };
    }),
  };
}

export interface DestinatarioResumen {
  id: string;
  nombre: string;
  correo: string;
}

export interface DestinatariosDelCron {
  /** Tienen la app asignada Y credencial guardada: a estos se les manda. */
  listos: DestinatarioResumen[];
  /** Tienen la app asignada pero nunca iniciaron sesión: no se les puede mandar. */
  sinCredencial: string[];
}

/**
 * Los usuarios a los que el cron les manda el resumen.
 *
 * Requiere la app ASIGNADA, sin excepción para los admin. Antes los admin
 * entraban por su rol, y eso hacía que quitarle "Mi Día" a un admin no lo diera
 * de baja del correo: seguía llegándole sin ninguna forma de pararlo desde la
 * UI. Recibir un correo diario con el contenido de tu bandeja tiene que ser algo
 * que se activa y se desactiva de un solo lugar.
 *
 * (Ver la página del módulo es otra cosa: ahí exigirAccesoApp sí deja pasar a los
 * admin, como en el resto del core.)
 *
 * Los que tienen la app pero no credencial se devuelven aparte en vez de
 * descartarse en silencio: son gente que DEBERÍA estar recibiendo el resumen y no
 * lo recibe, y la única forma de notarlo era que alguien reclamara.
 */
export async function destinatariosDelCron(slugApp: string): Promise<DestinatariosDelCron> {
  const { data: app } = await supabaseAdmin
    .from("aplicaciones")
    .select("id")
    .eq("slug", slugApp)
    .maybeSingle();
  if (!app?.id) return { listos: [], sinCredencial: [] };

  const [{ data: asignaciones }, { data: credenciales }] = await Promise.all([
    supabaseAdmin.from("usuario_aplicaciones").select("usuario_id").eq("aplicacion_id", app.id),
    // Solo las credenciales sanas: una con error es un token que Microsoft ya
    // rechazó, y reintentarlo cada mañana solo llena los logs.
    supabaseAdmin.from("graph_credenciales").select("usuario_id").is("error", null),
  ]);

  const asignados = new Set((asignaciones ?? []).map((a) => a.usuario_id as string));
  if (asignados.size === 0) return { listos: [], sinCredencial: [] };

  const conCredencial = new Set((credenciales ?? []).map((c) => c.usuario_id as string));

  const { data: usuarios } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, correo")
    .eq("activo", true);

  const listos: DestinatarioResumen[] = [];
  const sinCredencial: string[] = [];

  for (const u of usuarios ?? []) {
    const id = u.id as string;
    if (!asignados.has(id)) continue;
    const correo = u.correo as string;
    if (conCredencial.has(id)) {
      listos.push({ id, nombre: (u.nombre as string) ?? correo, correo });
    } else {
      sinCredencial.push(correo);
    }
  }

  return { listos, sinCredencial };
}
