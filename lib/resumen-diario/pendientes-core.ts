import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";

// Lo que cada persona tiene pendiente DENTRO del core, para que el resumen
// diario lo diga junto con el correo y la agenda.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
//
// De diez usuarios activos, cuatro no entran hace más de un mes. Mientras
// tanto hay rendiciones a medio armar, ofertas en borrador y tareas vencidas
// que solo se ven abriendo esa tarjeta y expandiéndola. El core es bueno
// cuando lo abrís; el problema es que hay que abrirlo.
//
// El resumen diario ya llega al buzón de cada persona todas las mañanas. Esto
// le suma lo suyo del core, que es el único canal que hoy sale a buscarla.
//
// ── Qué NO hace ─────────────────────────────────────────────────────────────
//
// No decide qué es urgente: junta hechos exactos y se los pasa al modelo, que
// elige cuáles vale la pena mencionar y por qué. Es la misma división que ya
// usa el resto del resumen (ver el comentario de ResumenModelo en tipos.ts):
// los datos exactos los pone el servidor, el juicio lo pone el modelo.

/** Un pendiente concreto, con sus datos exactos. El modelo nunca los escribe. */
export interface PendienteCore {
  /** El módulo donde se resuelve. Es lo que se muestra como origen. */
  modulo: "Rendir Gastos" | "Ofertas Técnicas" | "Cotizador" | "Proyectos" | "Herramientas Finanzas";
  titulo: string;
  /** Una línea de contexto: el cliente, el monto, la etapa. */
  detalle: string;
  /** Días desde que existe o desde que venció. Null si no aplica. */
  antiguedadDias: number | null;
  /** A dónde ir a resolverlo. Ruta interna, nunca una URL armada por el modelo. */
  enlace: string;
}

const DIA = 24 * 60 * 60 * 1000;

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DIA));
}

/**
 * Los pendientes de UNA persona, de todos los módulos a los que tiene acceso.
 *
 * Cada fuente va en su propio try: que Odoo no responda no puede dejar a alguien
 * sin ver su rendición a medio cargar. Una fuente que falla aporta cero
 * pendientes y el resto entra igual.
 *
 * El orden importa poco —el modelo prioriza— pero se devuelven de más viejo a
 * más nuevo, que es el orden en el que suelen doler.
 */
export async function reunirPendientesDelCore(usuario: {
  id: string;
  nombre: string;
}): Promise<PendienteCore[]> {
  const fuentes = await Promise.all([
    rendicionesSinCerrar(usuario.id),
    ofertasEnBorrador(usuario.id),
    cotizacionesEnBorrador(usuario.id),
    tareasQueLeTocan(usuario.nombre),
    facturasReclamadas(usuario.id),
  ]);

  return fuentes
    .flat()
    .sort((a, b) => (b.antiguedadDias ?? 0) - (a.antiguedadDias ?? 0));
}

/** Una fuente que falla no puede tumbar el resumen entero. */
async function aSalvo<T>(que: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[resumen-diario] No se pudieron leer los pendientes de ${que}:`, e);
    return [];
  }
}

function rendicionesSinCerrar(usuarioId: string): Promise<PendienteCore[]> {
  return aSalvo("Rendir Gastos", async () => {
    const { data } = await supabaseAdmin
      .from("rendiciones")
      .select("id, titulo_rendicion, monto_asignado, creado_en")
      .eq("creado_por", usuarioId)
      .eq("estado", "borrador");

    return (data ?? []).map((r) => ({
      modulo: "Rendir Gastos" as const,
      titulo: (r.titulo_rendicion as string) || "Rendición sin título",
      detalle:
        r.monto_asignado && Number(r.monto_asignado) > 0
          ? `Fondo asignado de ${Math.round(Number(r.monto_asignado)).toLocaleString("es-CL")}, sin cargar a Odoo`
          : "Todavía sin cargar a Odoo",
      antiguedadDias: diasDesde(r.creado_en as string),
      enlace: `/rendir-gastos/${r.id as string}`,
    }));
  });
}

function ofertasEnBorrador(usuarioId: string): Promise<PendienteCore[]> {
  return aSalvo("Ofertas Técnicas", async () => {
    const { data } = await supabaseAdmin
      .from("ofertas_documentos")
      .select("id, contenido, creado_en")
      .eq("creado_por", usuarioId)
      .neq("estado", "emitida");

    return (data ?? []).map((o) => {
      // El título vive dentro del JSON de la oferta. Si no está, no se inventa:
      // se dice que no tiene, que es información igual de útil.
      const contenido = (o.contenido ?? {}) as { titulo?: string; cliente?: string };
      return {
        modulo: "Ofertas Técnicas" as const,
        titulo: contenido.titulo?.trim() || "Oferta sin título",
        detalle: contenido.cliente?.trim()
          ? `Para ${contenido.cliente.trim()}, sin emitir`
          : "Sin emitir",
        antiguedadDias: diasDesde(o.creado_en as string),
        enlace: `/ofertas/${o.id as string}`,
      };
    });
  });
}

function cotizacionesEnBorrador(usuarioId: string): Promise<PendienteCore[]> {
  return aSalvo("Cotizador", async () => {
    const { data } = await supabaseAdmin
      .from("cotizaciones")
      .select("id, nombre, creado_en")
      .eq("creado_por", usuarioId)
      .eq("estado", "borrador");

    return (data ?? []).map((c) => ({
      modulo: "Cotizador" as const,
      titulo: (c.nombre as string) || "Cotización sin nombre",
      detalle: "En borrador",
      antiguedadDias: diasDesde(c.creado_en as string),
      enlace: `/cotizador/${c.id as string}`,
    }));
  });
}

/**
 * Las tareas de Odoo asignadas a esta persona que están vencidas.
 *
 * El cruce va por NOMBRE y no por id, porque es lo único que hay: la caché
 * guarda `asignados` como el texto que arma Odoo con los nombres de los
 * responsables (ver lib/panel-odoo/sincronizar-proyectos.ts). Calza para la
 * gente cargada en los dos lados —"Hugo Antivil", "Rafael Aldea"— y no calza
 * para el texto libre que alguien escribe a mano ("Raul y equipo"). Eso último
 * simplemente no genera pendiente: es preferible no avisar que avisarle a la
 * persona equivocada.
 */
function tareasQueLeTocan(nombre: string): Promise<PendienteCore[]> {
  return aSalvo("Proyectos", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data } = await supabaseAdmin
      .from("panel_odoo_tareas")
      .select("odoo_id, nombre, proyecto_nombre, fecha_limite, asignados, etapa")
      .eq("completado", false)
      .not("estado", "in", "(1_done,1_canceled)")
      .lt("fecha_limite", hoy)
      .ilike("asignados", `%${nombre}%`);

    return (data ?? []).map((t) => ({
      modulo: "Proyectos" as const,
      titulo: t.nombre as string,
      detalle: `${(t.proyecto_nombre as string) ?? "Sin proyecto"}${t.etapa ? ` · ${t.etapa as string}` : ""}, con el plazo cumplido`,
      antiguedadDias: diasDesde(t.fecha_limite as string),
      enlace: "/panel-odoo",
    }));
  });
}

/**
 * Las ventas reclamadas por el cliente, para quien tenga acceso a ese subpanel.
 *
 * No son "de" nadie —no hay dueño en la tabla— así que el criterio es el
 * permiso: quien puede VER el subpanel del SII es quien puede hacer algo con
 * una factura reclamada. Sin esa comprobación, el resumen le contaría a toda la
 * empresa qué clientes están rechazando facturas.
 */
function facturasReclamadas(usuarioId: string): Promise<PendienteCore[]> {
  return aSalvo("Herramientas Finanzas", async () => {
    if (!(await usuarioPuedeVerSubpanelFinanzas(usuarioId, "sii"))) return [];

    const { data } = await supabaseAdmin
      .from("facturas_sii")
      .select("folio, razon_social, monto_total, fecha_docto")
      .eq("tipo_documento", "venta")
      .eq("estado", "reclamado")
      .order("fecha_docto", { ascending: true });

    return (data ?? []).map((f) => ({
      modulo: "Herramientas Finanzas" as const,
      titulo: `Factura ${f.folio as number} reclamada`,
      detalle: `${(f.razon_social as string) ?? "Sin razón social"} · ${Math.round(Number(f.monto_total ?? 0)).toLocaleString("es-CL")}`,
      antiguedadDias: diasDesde(f.fecha_docto as string),
      enlace: "/finanzas/sii",
    }));
  });
}

/**
 * Los pendientes, numerados, tal como los ve el modelo.
 *
 * Numerados desde 1 y sin el enlace: el modelo dice "el [3] importa por esto" y
 * el servidor vuelve a pegar los datos exactos por índice, igual que con los
 * correos y las reuniones. Así un índice inventado termina en una fila sin
 * enlace, no en mandar a alguien a la rendición de otro.
 */
export function bloquePendientes(pendientes: PendienteCore[]): string {
  if (pendientes.length === 0) return "(sin pendientes en el core)";
  return pendientes
    .map((p, i) => {
      const antiguedad =
        p.antiguedadDias === null
          ? ""
          : ` — hace ${p.antiguedadDias} día${p.antiguedadDias === 1 ? "" : "s"}`;
      return `[${i + 1}] ${p.modulo}: ${p.titulo}. ${p.detalle}${antiguedad}`;
    })
    .join("\n");
}
