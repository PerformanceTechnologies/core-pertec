import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { puedeVerApp } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import type { UsuarioConAcceso } from "@/lib/tipos";

// Las herramientas con las que el modelo contesta preguntas sobre los datos del
// core ("¿cuánto le facturamos a SALFA este año?").
//
// ── La decisión de diseño que importa ───────────────────────────────────────
//
// El modelo NO escribe SQL. Elige una herramienta de esta lista y sus
// parámetros; la consulta la escribe este archivo. Con SQL generado bastaría un
// prompt torcido —o una razón social que venga con comillas— para leer una tabla
// que esa persona no puede ver. Acá lo peor que puede pasar es que elija la
// herramienta equivocada y devuelva una respuesta inútil.
//
// `strict: true` completa la reja del lado del esquema: la API garantiza que los
// argumentos validen contra el JSON Schema, así que no llegan campos de más ni
// tipos raros.
//
// ── Permisos ────────────────────────────────────────────────────────────────
//
// CADA herramienta vuelve a preguntar si esta persona puede ver esa app, con el
// mismo criterio que lib/autorizacion.ts. No alcanza con filtrar la lista de
// herramientas que se le ofrece al modelo: si mañana alguien agrega una y se
// olvida de filtrarla, el chequeo de acá la ataja igual. Es la misma razón por
// la que el core revalida el usuario en cada carga de página en vez de confiar
// en la sesión.

/** Cuántas filas puede devolver una herramienta. Tope duro, no sugerencia. */
const TOPE_FILAS = 50;

export interface ResultadoHerramienta {
  /** Lo que se le devuelve al modelo. Texto plano, corto y sin HTML. */
  texto: string;
  /** Cuántas filas se miraron, para el pie de la respuesta. */
  filas: number;
}

interface Herramienta {
  definicion: Anthropic.Tool;
  /** El slug de la app que hay que tener para usarla. */
  app: string;
  ejecutar: (
    args: Record<string, unknown>,
    usuario: UsuarioConAcceso,
  ) => Promise<ResultadoHerramienta>;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

/**
 * Limpia el texto de búsqueda antes de meterlo en un filtro .or()/.ilike() de Supabase. Esos
 * filtros se arman como texto (`col.ilike.%valor%`), y una coma, un paréntesis o un asterisco en el
 * valor podría cerrar el patrón e inyectar otra condición. Como el valor lo propone el modelo (que
 * puede venir influido por datos de la base), se quitan esos caracteres y se acota el largo.
 */
function limpiarTexto(valor: string): string {
  return valor.replace(/[,()*\\%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Un período "2026" o "2026-09" a su rango de fechas. Null si no se entiende. */
function rangoDePeriodo(periodo?: string): { desde: string; hasta: string } | null {
  if (!periodo) return null;
  if (/^\d{4}$/.test(periodo)) return { desde: `${periodo}-01-01`, hasta: `${periodo}-12-31` };
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    const [a, m] = periodo.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, "0")}` };
  }
  return null;
}

// ── Facturas del SII ────────────────────────────────────────────────────────

const buscarFacturas: Herramienta = {
  app: "finanzas",
  definicion: {
    name: "buscar_facturas",
    description:
      "Busca facturas de compra o de venta registradas en el SII. Sirve para preguntas como " +
      "'qué le facturamos a SALFA', 'facturas reclamadas de septiembre' o 'compras del mes pasado'. " +
      "Devuelve el detalle de cada factura y el total. El período va como 'AAAA' o 'AAAA-MM'.",
    input_schema: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          description: "Parte del RUT o de la razón social del cliente o proveedor. Opcional.",
        },
        tipo: { type: "string", enum: ["compra", "venta", "ambos"] },
        estado: {
          type: "string",
          enum: ["todos", "registro", "aceptado", "pendiente", "no_incluir", "reclamado"],
        },
        periodo: { type: "string", description: "'AAAA' o 'AAAA-MM'. Opcional." },
      },
      required: ["tipo", "estado"],
      additionalProperties: false,
    },
    strict: true,
  } as Anthropic.Tool,
  async ejecutar(args, usuario) {
    if (!(await usuarioPuedeVerSubpanelFinanzas(usuario.id, "sii")) && usuario.rol !== "admin") {
      return { texto: "Esta persona no tiene acceso al subpanel del SII.", filas: 0 };
    }
    let q = supabaseAdmin
      .from("facturas_sii")
      .select("tipo_documento, rut, razon_social, folio, fecha_docto, monto_total, estado")
      .order("fecha_docto", { ascending: false })
      .limit(TOPE_FILAS);

    const tipo = String(args.tipo);
    if (tipo !== "ambos") q = q.eq("tipo_documento", tipo);
    const estado = String(args.estado);
    if (estado !== "todos") q = q.eq("estado", estado);
    if (typeof args.texto === "string" && args.texto.trim()) {
      const t = limpiarTexto(args.texto);
      // or() con ilike: el modelo pasa "SALFA" y tiene que encontrar por nombre
      // o por RUT sin que él tenga que saber cuál de los dos le dieron.
      if (t) q = q.or(`razon_social.ilike.%${t}%,rut.ilike.%${t}%`);
    }
    const rango = rangoDePeriodo(typeof args.periodo === "string" ? args.periodo : undefined);
    if (rango) q = q.gte("fecha_docto", rango.desde).lte("fecha_docto", rango.hasta);

    const { data, error } = await q;
    if (error) return { texto: `No se pudo consultar: ${error.message}`, filas: 0 };
    const filas = data ?? [];
    if (filas.length === 0) return { texto: "Sin facturas que cumplan esos criterios.", filas: 0 };

    const total = filas.reduce((a, f) => a + Number(f.monto_total ?? 0), 0);
    const detalle = filas
      .map(
        (f) =>
          `${f.tipo_documento} · folio ${f.folio} · ${f.fecha_docto} · ${f.razon_social ?? f.rut} · ` +
          `${money(Number(f.monto_total ?? 0))} · ${f.estado}`,
      )
      .join("\n");
    return {
      texto: `${filas.length} factura(s), total ${money(total)}${filas.length === TOPE_FILAS ? " (tope de 50 alcanzado, puede haber más)" : ""}:\n${detalle}`,
      filas: filas.length,
    };
  },
};

const TODAS: Herramienta[] = [buscarFacturas];

/**
 * Las herramientas que ESTA persona puede usar.
 *
 * Se filtran antes de ofrecérselas al modelo —no tiene sentido que sepa que
 * existe una herramienta que no va a poder usar— pero el chequeo real está
 * adentro de cada `ejecutar`. Esto es comodidad; aquello es la reja.
 */
export async function herramientasPara(usuario: UsuarioConAcceso): Promise<Anthropic.Tool[]> {
  const permitidas = await Promise.all(
    TODAS.map(async (h) => ((await puedeVerApp(usuario, h.app)) ? h.definicion : null)),
  );
  return permitidas.filter((d): d is Anthropic.Tool => d !== null);
}

/**
 * Corre una herramienta por nombre, revalidando el permiso.
 *
 * Un nombre que no existe no es un error del sistema: es el modelo pidiendo algo
 * que no hay. Se le contesta eso mismo para que corrija en la vuelta siguiente,
 * en vez de tirar una excepción que corta la conversación.
 */
export async function ejecutarHerramienta(
  nombre: string,
  args: Record<string, unknown>,
  usuario: UsuarioConAcceso,
): Promise<ResultadoHerramienta> {
  const h = TODAS.find((x) => x.definicion.name === nombre);
  if (!h) return { texto: `No existe una herramienta llamada "${nombre}".`, filas: 0 };
  if (!(await puedeVerApp(usuario, h.app))) {
    return { texto: "Esta persona no tiene acceso a ese módulo.", filas: 0 };
  }
  return h.ejecutar(args, usuario);
}
