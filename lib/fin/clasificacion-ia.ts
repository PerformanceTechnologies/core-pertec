import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rutComparable, type ReglaCategoria } from "./reglas";
import {
  glosaComparable,
  iaAplicableSola,
  sugerenciaDeIa,
  sugerirClasificacion,
  type CategoriaLista,
  type Clasificado,
  type Subcategoria,
  type SugerenciaIa,
} from "./clasificacion";

// -----------------------------------------------------------------------------
//  Clasificación con IA (solo servidor): Claude propone categoría y subcategoría para los movimientos del banco que ni
//  las reglas ni los movimientos anteriores reconocen. Lo que decide con qué (sugerir, aplicar sola, medir el acierto)
//  vive en clasificacion.ts; acá solo se arma el pedido, se llama a Claude y se guarda la respuesta.
//
//  · Se envía lo mínimo: fecha, glosa, monto, RUT de la contraparte y, como ejemplos, cómo clasificó Finanzas movimientos
//    parecidos. Nada de saldos ni de personas.
//  · Cada movimiento se revisa UNA vez (ia_revisado_en), aunque la IA no se atreva a sugerir: no se paga dos veces.
//  · Las nóminas no se mandan: su glosa es igual para remuneraciones y proveedores, ni la IA lo puede saber.
//  · Solo se aplica sola si Finanzas lo activó (flags.ia_auto) y la seguridad alcanza su umbral (flags.ia_umbral).
// -----------------------------------------------------------------------------

const MODELO = "claude-opus-5-5";
const POR_LLAMADA = 25;
const EJEMPLOS = 80;

export interface ResultadoIa {
  revisados: number;
  sugeridos: number;
  aplicados: number;
  mensaje?: string;
}

export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY);

const INSTRUCCIONES = `Eres analista de Tesorería en una empresa chilena de servicios industriales (mantención, arriendo de equipos, proyectos en faenas mineras). Clasificas movimientos de la cuenta corriente con la lista de categorías de Finanzas.

Cómo decidir:
- Usa solo los códigos de la lista. Un cargo (monto negativo) solo puede ir a categorías de gasto o a Financiamiento / Traspasos Internos; un abono (monto positivo), solo a ingresos o a Financiamiento / Traspasos Internos.
- Los ejemplos son clasificaciones reales de Finanzas: si un movimiento se parece a un ejemplo (mismo comercio, mismo RUT, misma glosa), clasifícalo igual. Mandan sobre tu intuición.
- Glosas típicas de bancos chilenos: «TRANSF. DE <RUT> <nombre>» es una transferencia recibida; «TRANSF. A …» o «PAGO A …», una enviada; «PAGO BDP SII», «TGR» o «F29» son impuestos; «PREVIRED», leyes sociales; «COM.» o «COMISION», comisiones bancarias; «PAGO TARJETA», traspaso por pago de tarjeta de crédito; «ABONO OP. FACTORING», anticipo de factoring (Financiamiento).
- La confianza es qué tan seguro estás, de 0 a 1. Usa 0,9 o más solo cuando el comercio o el tipo de pago deja claro el tipo de gasto. Si no sabes qué es (una transferencia a una persona sin contexto, una glosa genérica), deja el código vacío y confianza 0: es mejor que Tesorería pregunte a que quede mal clasificado.
- El motivo va en español, en una frase corta, y dice qué viste («es una estación de combustible», «mismo RUT que los pagos de arriendo de grúa»).`;

const ESQUEMA = {
  type: "object",
  properties: {
    resultados: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "El id del movimiento, tal como viene." },
          codigo: { type: "string", description: "Código de la lista (S12, C3…). Vacío si no se puede saber." },
          confianza: { type: "number", description: "De 0 a 1." },
          motivo: { type: "string", description: "Una frase corta en español." },
        },
        required: ["id", "codigo", "confianza", "motivo"],
        additionalProperties: false,
      },
    },
  },
  required: ["resultados"],
  additionalProperties: false,
} as const;

type Fila = {
  id: string;
  cuenta_id: string;
  fecha: string;
  glosa: string;
  monto: number | string;
  contraparte_rut: string | null;
  categoria_id: string | null;
  subcategoria_id: string | null;
  proyecto_id: string | null;
  ia_revisado_en: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function leer(empresaId: string) {
  const [cR, sR, rR, mR, pR] = await Promise.all([
    supabaseAdmin.from("fin_categorias").select("*").eq("empresa_id", empresaId),
    supabaseAdmin.from("fin_subcategorias").select("*").eq("empresa_id", empresaId).order("orden"),
    supabaseAdmin.from("fin_reglas").select("*").eq("empresa_id", empresaId),
    supabaseAdmin
      .from("fin_movimientos")
      .select("id, cuenta_id, fecha, glosa, monto, contraparte_rut, categoria_id, subcategoria_id, proyecto_id, ia_revisado_en")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .limit(5000),
    supabaseAdmin.from("fin_parametros").select("flags").eq("empresa_id", empresaId).maybeSingle(),
  ]);
  for (const r of [cR, sR, rR, mR]) if (r.error) throw new Error(`No se pudieron leer los datos para la IA: ${r.error.message}`);
  const categorias: CategoriaLista[] = (cR.data ?? []).map((c: any) => ({
    id: c.id, nombre: c.nombre, sentido: c.sentido, requiereProyecto: c.requiere_proyecto, afectaResultado: c.afecta_resultado ?? true,
    cuentaContable: c.cuenta_contable, orden: c.orden, activa: c.activa,
  }));
  const subcategorias: Subcategoria[] = (sR.data ?? []).map((x: any) => ({
    id: x.id, categoriaId: x.categoria_id, nombre: x.nombre, cuentaContable: x.cuenta_contable, orden: x.orden, activa: x.activa,
  }));
  const reglas: ReglaCategoria[] = (rR.data ?? []).map((r: any) => ({
    id: r.id, cuentaId: r.cuenta_id, patron: r.patron ?? "", contraparteRut: r.contraparte_rut ?? null, montoMin: r.monto_min === null ? null : Number(r.monto_min),
    montoMax: r.monto_max === null ? null : Number(r.monto_max), categoriaId: r.categoria_id, subcategoriaId: r.subcategoria_id ?? null, proyectoId: r.proyecto_id,
    prioridad: r.prioridad, activa: r.activa,
  }));
  const flags = ((pR.data as { flags?: Record<string, unknown> } | null)?.flags ?? {}) as Record<string, unknown>;
  return { categorias, subcategorias, reglas, movimientos: (mR.data ?? []) as Fila[], flags };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** La lista maestra con códigos cortos (S1, S2… para subcategorías; C1… para categorías sin subcategorías). */
function catalogo(categorias: CategoriaLista[], subcategorias: Subcategoria[]) {
  const porCodigo = new Map<string, { categoriaId: string; subcategoriaId: string | null }>();
  const lineas: string[] = [];
  let s = 0;
  let c = 0;
  for (const cat of categorias.filter((x) => x.activa).sort((a, b) => a.orden - b.orden)) {
    const tipo = cat.sentido === "ingreso" ? "ingreso" : cat.sentido === "egreso" ? "gasto" : "entrada o salida, no es ingreso ni gasto";
    const subs = subcategorias.filter((x) => x.activa && x.categoriaId === cat.id).sort((a, b) => a.orden - b.orden);
    if (subs.length === 0) {
      c++;
      porCodigo.set(`C${c}`, { categoriaId: cat.id, subcategoriaId: null });
      lineas.push(`C${c} = ${cat.nombre} (${tipo})`);
      continue;
    }
    lineas.push(`${cat.nombre} (${tipo}${cat.requiereProyecto ? ", gastos de proyectos y faenas" : ""}):`);
    for (const sub of subs) {
      s++;
      porCodigo.set(`S${s}`, { categoriaId: cat.id, subcategoriaId: sub.id });
      lineas.push(`  S${s} = ${sub.nombre}`);
    }
  }
  return { porCodigo, texto: lineas.join("\n") };
}

const esNomina = (glosa: string) => /^\s*n[oó]mina/i.test(glosa);
const pesos = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

/**
 * Revisa con IA los movimientos sin clasificar de una empresa que nadie más reconoce, guarda la sugerencia y, si
 * Finanzas lo activó, aplica las de seguridad alta. Devuelve cuántos revisó, sugirió y aplicó.
 */
export async function clasificarConIa(empresaId: string, opciones: { limite?: number } = {}): Promise<ResultadoIa> {
  if (!iaConfigurada()) return { revisados: 0, sugeridos: 0, aplicados: 0, mensaje: "La IA no está configurada (falta ANTHROPIC_API_KEY)." };
  const { categorias, subcategorias, reglas, movimientos, flags } = await leer(empresaId);
  if (subcategorias.length === 0) return { revisados: 0, sugeridos: 0, aplicados: 0, mensaje: "Falta la lista maestra de categorías." };

  const activa = new Set(categorias.filter((c) => c.activa).map((c) => c.id));
  const conSub = new Set(subcategorias.filter((x) => x.activa).map((x) => x.categoriaId));
  const clasificados: Clasificado[] = movimientos
    .filter((m) => m.categoria_id && activa.has(m.categoria_id) && (!conSub.has(m.categoria_id) || m.subcategoria_id))
    .map((m) => ({
      id: m.id, fecha: m.fecha, glosa: m.glosa, monto: Number(m.monto), contraparteRut: m.contraparte_rut, categoriaId: m.categoria_id!,
      subcategoriaId: m.subcategoria_id, proyectoId: m.proyecto_id,
    }));
  // Pendientes: sin clasificar, nunca revisados por la IA, que no sean nómina y que nada más reconozca.
  const pendientes = movimientos
    .filter((m) => !m.categoria_id && !m.ia_revisado_en && !esNomina(m.glosa))
    .filter((m) => !sugerirClasificacion({ id: m.id, glosa: m.glosa, monto: Number(m.monto), cuentaId: m.cuenta_id, contraparteRut: m.contraparte_rut }, reglas, clasificados))
    .slice(0, opciones.limite ?? 100);
  if (pendientes.length === 0) return { revisados: 0, sugeridos: 0, aplicados: 0 };

  const { porCodigo, texto: lista } = catalogo(categorias, subcategorias);
  const codigoDe = new Map([...porCodigo].map(([k, v]) => [`${v.categoriaId}|${v.subcategoriaId ?? ""}`, k]));
  // Ejemplos: lo clasificado más reciente, uno por tipo de glosa, para que la IA aprenda cómo clasifica Finanzas.
  const vistos = new Set<string>();
  const ejemplos = clasificados
    .filter((m) => {
      const k = `${glosaComparable(m.glosa) || m.glosa}|${rutComparable(m.contraparteRut)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return codigoDe.has(`${m.categoriaId}|${m.subcategoriaId ?? ""}`);
    })
    .slice(0, EJEMPLOS)
    .map((m) => `${m.glosa} | ${pesos(m.monto)}${m.contraparteRut ? ` | RUT ${m.contraparteRut}` : ""} → ${codigoDe.get(`${m.categoriaId}|${m.subcategoriaId ?? ""}`)}`);

  const sistema = `${INSTRUCCIONES}\n\nLISTA DE CATEGORÍAS (usa solo estos códigos):\n${lista}\n\nEJEMPLOS YA CLASIFICADOS POR FINANZAS (glosa | monto | RUT → código):\n${ejemplos.length ? ejemplos.join("\n") : "(todavía no hay ejemplos)"}`;
  const client = new Anthropic();
  const auto = flags.ia_auto === true;
  const umbral = typeof flags.ia_umbral === "number" ? flags.ia_umbral : 0.95;
  const ahora = new Date().toISOString();
  let sugeridos = 0;
  let aplicados = 0;
  let revisados = 0;

  for (let i = 0; i < pendientes.length; i += POR_LLAMADA) {
    const lote = pendientes.slice(i, i + POR_LLAMADA);
    const pedido = lote.map((m) => ({ id: m.id, fecha: m.fecha, glosa: m.glosa, monto: Number(m.monto), rut: m.contraparte_rut ?? "" }));
    let respuesta;
    try {
      respuesta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // La lista y los ejemplos no cambian entre lotes: se cachean.
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
        messages: [{ role: "user", content: `Clasifica estos movimientos del banco:\n${JSON.stringify(pedido)}` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return { revisados, sugeridos, aplicados, mensaje: "La IA está ocupada: se seguirá en la próxima corrida." };
      if (e instanceof Anthropic.APIError) return { revisados, sugeridos, aplicados, mensaje: `La IA respondió con un error (${e.status}). Se reintentará en la próxima corrida.` };
      throw e;
    }
    if (respuesta.stop_reason === "refusal" || respuesta.stop_reason === "max_tokens") continue;
    const bloque = respuesta.content.find((b) => b.type === "text");
    let resultados: { id: string; codigo: string; confianza: number; motivo: string }[] = [];
    try {
      resultados = bloque && bloque.type === "text" ? JSON.parse(bloque.text).resultados ?? [] : [];
    } catch {
      continue;
    }
    const porId = new Map(resultados.map((r) => [r.id, r]));
    for (const m of lote) {
      const r = porId.get(m.id);
      const destino = r?.codigo ? porCodigo.get(r.codigo.trim().toUpperCase()) : undefined;
      const ia: SugerenciaIa | null =
        destino && r
          ? { categoria_id: destino.categoriaId, subcategoria_id: destino.subcategoriaId, confianza: Math.max(0, Math.min(1, Number(r.confianza) || 0)), motivo: String(r.motivo ?? "").slice(0, 200), modelo: respuesta.model, en: ahora }
          : null;
      // Descarta lo que no calza con el sentido del monto (un cargo como «Servicios»).
      const valida = ia ? sugerenciaDeIa(ia, Number(m.monto), categorias, subcategorias) : null;
      const aplicar = auto && iaAplicableSola(valida, umbral, categorias);
      const cambios: Record<string, unknown> = { sugerencia_ia: valida ? ia : null, ia_revisado_en: ahora };
      if (aplicar && valida) {
        Object.assign(cambios, { categoria_id: valida.categoriaId, subcategoria_id: valida.subcategoriaId, clasificado_por: "ia", tiene_respaldo: true, actualizado_en: ahora });
      }
      // Solo si sigue sin clasificar: alguien pudo clasificarlo mientras la IA pensaba.
      const { error } = await supabaseAdmin.from("fin_movimientos").update(cambios).eq("id", m.id).eq("empresa_id", empresaId).is("categoria_id", null);
      if (error) throw new Error(`No se pudo guardar la sugerencia de la IA: ${error.message}`);
      revisados++;
      if (valida) sugeridos++;
      if (aplicar) aplicados++;
    }
  }
  return { revisados, sugeridos, aplicados };
}

/** Para el cron: revisa las tres empresas con Finanzas. Un error en una no detiene a las demás. */
export async function clasificarConIaTodas(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("empresas").select("id, slug").in("slug", ["pertec", "zeus", "performance-service"]);
  const resumen: string[] = [];
  for (const e of (data ?? []) as { id: string; slug: string }[]) {
    try {
      const r = await clasificarConIa(e.id);
      if (r.revisados || r.mensaje) resumen.push(`${e.slug}: IA revisó ${r.revisados}, sugirió ${r.sugeridos}, aplicó ${r.aplicados}${r.mensaje ? ` (${r.mensaje})` : ""}`);
    } catch (err) {
      resumen.push(`${e.slug}: la IA falló (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return resumen;
}
