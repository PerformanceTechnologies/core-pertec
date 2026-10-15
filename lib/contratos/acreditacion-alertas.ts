import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { olvidarDashboard } from "./memoria-dashboard";
import { idDelContrato } from "./contrato-actual";

/**
 * Cuántas cosas de Acreditación requieren atención, para la insignia del menú.
 *
 * Se pide en CADA página protegida, porque el menú está en todas. Por eso es un
 * conteo en la base (una vista, no la nómina entera) y por eso se recuerda un minuto:
 * la mayoría de las navegaciones la responden de memoria y no pagan el viaje
 * a Supabase.
 *
 * Un minuto de desfase es aceptable porque es un aviso, no un permiso: a diferencia
 * de quién tiene acceso (que se relee en cada carga, ver layout.tsx), un número
 * desactualizado por sesenta segundos no deja entrar a nadie que no deba.
 *
 * La memoria es de cada instancia del servidor, no compartida: otra instancia puede
 * tener su propio valor, de hasta un minuto de antigüedad. Para un contador está bien.
 *
 * Una entrada POR CONTRATO: con una sola, abrir otro contrato mostraba un minuto las alertas
 * del anterior.
 */
const memorias = new Map<string, { valor: number; hasta: number }>();

const VIGENCIA_MS = 60_000;

/**
 * NUNCA lanza: la insignia es un adorno del menú, y el menú está en todas las
 * páginas. Si la vista no existe (migración 0013 sin correr) o Supabase no responde,
 * devuelve lo último que supo, o cero — no puede tumbar el panel entero.
 */
export async function alertasPendientes(): Promise<number> {
  const ahora = Date.now();
  const contrato = await idDelContrato();
  const memoria = memorias.get(contrato);
  if (memoria && memoria.hasta > ahora) return memoria.valor;

  try {
    const { count, error } = await supabaseAdmin
      .from("ct_acreditacion_alertas_v")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);

    memorias.set(contrato, { valor: count ?? 0, hasta: ahora + VIGENCIA_MS });
    return count ?? 0;
  } catch (e) {
    console.error(
      `[acreditacion] No se pudo contar las alertas del menú: ${e instanceof Error ? e.message : e}`,
    );
    // Se recuerda el fallo por poco rato: sin esto, con la base caída cada página
    // reintentaría la consulta y sumaría su espera.
    const valor = memoria?.valor ?? 0;
    memorias.set(contrato, { valor, hasta: ahora + 10_000 });
    return valor;
  }
}

/**
 * El resumen de la tarjeta de Acreditación en la portada de Contratos, recordado 30 s.
 *
 * Calcularlo exige leer la nómina entera (personas, documentos, cursos), y la portada
 * de Contrato DCH es la pantalla a la que más se vuelve. Con esto, volver a ella no
 * repite esa lectura. Solo lo usa la tarjeta: las pantallas del módulo leen siempre de
 * la base, porque ahí un dato viejo se vería como un cambio que no se guardó.
 *
 * Es genérico en lo que guarda para no importar acá los tipos de la nómina.
 */
const tarjetas = new Map<string, { valor: unknown; hasta: number }>();

export async function resumenDeTarjeta<T>(calcular: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  const contrato = await idDelContrato();
  const tarjeta = tarjetas.get(contrato);
  if (tarjeta && tarjeta.hasta > ahora) return tarjeta.valor as T;

  const valor = await calcular();
  tarjetas.set(contrato, { valor, hasta: ahora + 30_000 });
  return valor;
}

/** Descarta lo recordado: la próxima página lo vuelve a pedir. */
export function olvidarAlertas(): void {
  memorias.clear();
  tarjetas.clear();
  // Todo cambio de Acreditación pasa por acá: el tablero de la portada también lo olvida.
  olvidarDashboard();
}
