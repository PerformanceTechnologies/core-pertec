import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Usa la service_role key: puentea RLS a propósito. Solo se importa desde
// Server Components, Server Actions o Route Handlers — "server-only" hace
// fallar el build si alguna vez se cuela en un bundle de cliente.
// Instanciación perezosa: así "next build" no falla si todavía no se ha
// configurado SUPABASE_SERVICE_ROLE_KEY (el error solo aparece al usar el
// cliente en tiempo de ejecución, con un mensaje claro de qué falta).
let cliente: SupabaseClient | null = null;

function obtenerCliente(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
      );
    }
    cliente = createClient(url, key, { auth: { persistSession: false } });
  }
  return cliente;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_objetivo, propiedad, receptor) {
    return Reflect.get(obtenerCliente(), propiedad, receptor);
  },
});
