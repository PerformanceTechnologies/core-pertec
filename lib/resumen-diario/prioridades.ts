import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Las prioridades de Mi Día que alguien ya dio por hechas.
//
// ── El problema ─────────────────────────────────────────────────────────────
//
// Las tres prioridades del día las escribe el modelo cada mañana, mirando el
// correo, la agenda y los pendientes del core. Si una no se resuelve hoy, mañana
// vuelve a aparecer — correctamente, porque sigue pendiente. Pero hay un caso en
// que eso molesta: cuando la persona YA la atendió por fuera, o decidió que no la
// va a hacer. Ahí la prioridad reaparece todos los días y el bloque entero
// empieza a leerse como ruido.
//
// ── Las dos mitades ─────────────────────────────────────────────────────────
//
// 1. La clave normalizada filtra lo que se repite con pocas palabras de
//    diferencia. Es barato y exacto.
// 2. El texto original se le pasa al modelo para que NO vuelva a proponer lo
//    mismo. Es lo que agarra una reformulación de verdad, que ninguna
//    normalización va a reconocer.
//
// Ninguna de las dos alcanza sola. La clave no entiende sinónimos; el modelo,
// librado a sí mismo, igual repite.

/** Cuántos días se recuerda lo tachado. */
const DIAS_DE_MEMORIA = 30;

/**
 * Palabras que no distinguen una prioridad de otra.
 *
 * Están las vacías del español y además los verbos con que el modelo arranca casi
 * siempre ("gestionar el cobro…", "revisar la oferta…"): si quedaran, dos
 * prioridades sobre cosas distintas que empiezan igual se parecerían más de lo
 * que son.
 */
const VACIAS = new Set([
  "a", "al", "ante", "con", "de", "del", "el", "en", "entre", "entrega",
  "es", "esta", "este", "hacia", "hasta", "la", "las", "lo", "los", "mas",
  "para", "por", "que", "se", "segun", "sin", "sobre", "su", "sus", "un",
  "una", "unos", "unas", "y", "o", "u", "ya", "antes", "despues", "donde",
  // Verbos de apertura
  "gestionar", "revisar", "emitir", "enviar", "cerrar", "resolver", "hacer",
  "coordinar", "confirmar", "responder", "destrabar", "retomar", "avanzar",
  "completar", "terminar", "preparar", "subir", "cargar", "contactar",
]);

/**
 * El texto reducido a lo que lo identifica.
 *
 * Pura y exportada a propósito: es la única parte de esto que se puede medir sin
 * base de datos (ver scripts/probar-prioridades.mts).
 *
 * Saca tildes, signos y números —un "hace 49 días" cambia solo— deja las palabras
 * con peso, las ordena y las pega. El orden alfabético es lo que hace que
 * "cobrar las facturas de Salfa" y "las facturas de Salfa, cobrarlas" caigan en
 * la misma clave.
 */
export function normalizarPrioridad(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // El guion SOBREVIVE entre alfanuméricos. Sin esto "CT-6" y "CT-7" se
      // partían en "ct" (dos letras, descartada por corta) más un número (que se
      // descarta aparte), y las dos cotizaciones terminaban en la MISMA clave:
      // tachar una silenciaba la otra. Ese es el error grave de acá — no que algo
      // reaparezca, sino que desaparezca trabajo sin aviso.
      .replace(/(?<=[a-z0-9])-(?=[a-z0-9])/g, "\u0001")
      .replace(/[^a-z0-9\s\u0001]/g, " ")
      .replace(/\u0001/g, "-")
      .split(/\s+/)
      .map(sinPronombrePegado)
      // Fuera los números SUELTOS: son cantidades que cambian solas ("hace 49
      // días" es "hace 50" mañana). Un identificador como "ct-6" no es un número
      // suelto y se queda.
      .filter((p) => !/^\d+$/.test(p))
      // Dos caracteres y no tres: un código corto ("ct", "cv") distingue tanto
      // como una palabra larga.
      .filter((p) => p.length > 1 && !VACIAS.has(p))
      .sort()
      .join("-")
  );
}

/**
 * "emitirla" -> "emitir", "cobrarlas" -> "cobrar".
 *
 * El español pega el pronombre al infinitivo, y el modelo escribe las dos
 * formas: "Emitir la oferta" un día y "la oferta, emitirla" otro. Sin esto, la
 * misma prioridad daba dos claves distintas y reaparecía al día siguiente.
 *
 * Solo se corta si lo que queda es un verbo de la lista de VACIAS. Cortar a
 * ciegas rompería palabras legítimas —"salfa" terminada en "la" quedaría en
 * "saf"— y ahí el daño es el contrario y peor: dos prioridades distintas
 * cayendo en la misma clave.
 */
function sinPronombrePegado(palabra: string): string {
  for (const pronombre of ["las", "los", "les", "la", "lo", "le", "se"]) {
    if (palabra.endsWith(pronombre)) {
      const raiz = palabra.slice(0, -pronombre.length);
      if (VACIAS.has(raiz)) return raiz;
    }
  }
  return palabra;
}

export interface PrioridadDescartada {
  clave: string;
  texto: string;
}

/**
 * Lo que esta persona tachó en los últimos DIAS_DE_MEMORIA días.
 *
 * Con ventana y no para siempre: una prioridad que se descartó hace dos meses y
 * vuelve a aparecer probablemente sea una situación nueva, no la misma que se
 * ignoró. Y sin ventana, el bloque que se le pasa al modelo crecería sin techo.
 */
export async function prioridadesDescartadas(usuarioId: string): Promise<PrioridadDescartada[]> {
  const desde = new Date(Date.now() - DIAS_DE_MEMORIA * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("prioridades_descartadas")
    .select("clave, texto")
    .eq("usuario_id", usuarioId)
    .gte("descartada_en", desde)
    .order("descartada_en", { ascending: false });

  if (error) {
    // No se lanza: que esto falle no puede dejar a alguien sin su resumen. Lo
    // peor que pasa es que reaparezca algo que ya había tachado.
    console.error("[resumen-diario] No se pudieron leer las prioridades descartadas:", error);
    return [];
  }
  return (data ?? []) as PrioridadDescartada[];
}

export async function descartarPrioridad(usuarioId: string, texto: string): Promise<void> {
  const clave = normalizarPrioridad(texto);
  // Una prioridad que al normalizarse queda vacía no se puede reconocer después,
  // así que tacharla no serviría de nada.
  if (!clave) return;

  const { error } = await supabaseAdmin
    .from("prioridades_descartadas")
    .upsert({ usuario_id: usuarioId, clave, texto }, { onConflict: "usuario_id,clave" });
  if (error) throw new Error(`No se pudo tachar la prioridad: ${error.message}`);
}

export async function restaurarPrioridad(usuarioId: string, texto: string): Promise<void> {
  const clave = normalizarPrioridad(texto);
  if (!clave) return;
  const { error } = await supabaseAdmin
    .from("prioridades_descartadas")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("clave", clave);
  if (error) throw new Error(`No se pudo destachar la prioridad: ${error.message}`);
}

/**
 * Las que el modelo no debe volver a proponer, para el prompt.
 *
 * Se le pasa el TEXTO y no la clave: la clave es un amasijo de palabras ordenadas
 * alfabéticamente que no significa nada para nadie. Con el texto original el
 * modelo entiende de qué se trataba y puede evitar la idea, no la frase.
 */
export function bloqueDescartadas(descartadas: PrioridadDescartada[]): string {
  if (descartadas.length === 0) return "(ninguna)";
  // Tope: con muchas, el bloque empieza a competir por atención con el correo del
  // día, que es lo que de verdad hay que leer.
  return descartadas
    .slice(0, 15)
    .map((d) => `- ${d.texto}`)
    .join("\n");
}

/** Saca de la lista del modelo lo que ya estaba tachado. */
export function sinLasDescartadas(
  prioridades: string[],
  descartadas: PrioridadDescartada[],
): string[] {
  const claves = new Set(descartadas.map((d) => d.clave));
  return prioridades.filter((p) => !claves.has(normalizarPrioridad(p)));
}
