import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { olvidarDashboard } from "./memoria-dashboard";
import { idDelContrato } from "./contrato-actual";

/**
 * Cuántos documentos de vehículos requieren atención, para la insignia del menú.
 *
 * Es el hermano de alertasPendientes() de Acreditación Personas, y se pide por lo mismo en CADA
 * página protegida: por eso es un conteo en la base (una vista, no la flota entera) y se recuerda
 * un minuto. Un minuto de desfase es aceptable porque es un aviso, no un permiso.
 */
/** Una entrada por contrato: con una sola, abrir otro contrato mostraba las alertas del anterior. */
const memorias = new Map<string, { valor: number; hasta: number }>();

const VIGENCIA_MS = 60_000;

/**
 * NUNCA lanza: la insignia es un adorno del menú, y el menú está en todas las páginas. Si la vista
 * no existe (migración 0024 sin correr) o Supabase no responde, devuelve lo último que supo, o
 * cero — no puede tumbar el panel entero.
 */
export async function alertasDeVehiculosPendientes(): Promise<number> {
  const ahora = Date.now();
  const contrato = await idDelContrato();
  const memoria = memorias.get(contrato);
  if (memoria && memoria.hasta > ahora) return memoria.valor;

  try {
    const { count, error } = await supabaseAdmin
      .from("ct_vehiculos_alertas_v")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);

    memorias.set(contrato, { valor: count ?? 0, hasta: ahora + VIGENCIA_MS });
    return count ?? 0;
  } catch (e) {
    console.error(
      `[vehiculos] No se pudo contar las alertas del menú: ${e instanceof Error ? e.message : e}`,
    );
    // Se recuerda el fallo por poco rato: sin esto, con la base caída cada página reintentaría la
    // consulta y sumaría su espera.
    const valor = memoria?.valor ?? 0;
    memorias.set(contrato, { valor, hasta: ahora + 10_000 });
    return valor;
  }
}

/** Descarta lo recordado: la próxima página lo vuelve a pedir. También el tablero de la portada. */
export function olvidarAlertasDeVehiculos(): void {
  memorias.clear();
  olvidarDashboard();
}
