import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// El panel de proyectos (antes pertec.cl/panel) guarda su data en el
// Supabase de pertec-web, no en el de core-pertec: se decidió no migrarla
// para no arriesgar los datos reales de proyectos/objetivos ya cargados.
// Mismo patrón de instanciación perezosa que lib/supabase-admin.ts.
let cliente: SupabaseClient | null = null;

function obtenerCliente(): SupabaseClient {
  if (!cliente) {
    const url = process.env.PERTEC_WEB_SUPABASE_URL;
    const key = process.env.PERTEC_WEB_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Faltan PERTEC_WEB_SUPABASE_URL o PERTEC_WEB_SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
      );
    }
    cliente = createClient(url, key, { auth: { persistSession: false } });
  }
  return cliente;
}

export const pertecWebSupabase = new Proxy({} as SupabaseClient, {
  get(_objetivo, propiedad, receptor) {
    return Reflect.get(obtenerCliente(), propiedad, receptor);
  },
});
