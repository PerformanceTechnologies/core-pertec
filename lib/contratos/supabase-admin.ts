import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as clienteDePertec } from "@/lib/supabase-admin";
import { idDelContrato } from "./contrato-actual";

/**
 * El cliente de base de datos de Contratos: el de core-pertec, con el contrato puesto solo.
 *
 * Contratos viene de core-ih, que tenía un único contrato, y sus ~150 consultas no saben que ahora
 * hay varios. En vez de agregarle el filtro a cada una —y que alguna lo olvide—, en las tablas que
 * son de un contrato este cliente:
 *
 *  · al LEER, EDITAR o BORRAR agrega `contrato_id = <contrato de la dirección>`;
 *  · al INSERTAR (o upsert) le pone el `contrato_id` a cada fila.
 *
 * Así es imposible, por descuido, ver o tocar lo de otro contrato. El contrato sale de
 * contratoActual() (ver proxy.ts).
 *
 * Las tablas que cuelgan de otra (los documentos de una persona, las cotizaciones de una partida)
 * no se filtran: se llega a ellas por su padre, que sí lo está. Las que se identifican por el id
 * de un archivo de SharePoint tampoco: ese id no se repite entre contratos.
 *
 * Para lo que vive FUERA de un contrato —la lista de contratos, crear uno— se usa el cliente de
 * core-pertec directamente (@/lib/supabase-admin).
 */
const TABLAS_DE_CONTRATO = new Set([
  "ct_contratos_plazos",
  "ct_modulos_responsables",
  "ct_responsables_externos",
  "ct_acreditacion_tipos",
  "ct_acreditacion_cargos",
  "ct_acreditacion_personas",
  "ct_acreditacion_alertas_v",
  "ct_arranque_categorias",
  "ct_arranque_partidas",
  "ct_gastos_presupuesto",
  "ct_gastos_presupuesto_historial",
  "ct_gastos_aprobadores",
  "ct_vehiculos_contrato",
  "ct_vehiculos_tipos",
  "ct_vehiculos_categorias",
  "ct_vehiculos",
  "ct_vehiculos_alertas_v",
]);

/** Lo primero que se le pide a una consulta, que es lo que decide cómo se le pone el contrato. */
const LECTURAS_Y_CAMBIOS = new Set(["select", "update", "delete"]);
const ESCRITURAS = new Set(["insert", "upsert"]);

type Paso = [metodo: string, argumentos: unknown[]];

function conContrato(filas: unknown, contratoId: string): unknown {
  const poner = (f: unknown) => ({ ...(f as Record<string, unknown>), contrato_id: contratoId });
  return Array.isArray(filas) ? filas.map(poner) : poner(filas);
}

/**
 * Una consulta que se arma recién al esperarla.
 *
 * El constructor de Supabase es síncrono (`from().select().eq()…`) y el contrato hay que ir a
 * buscarlo: se anotan los pasos, y al `await` se resuelve el contrato, se arma la consulta real
 * con el filtro y se ejecuta. Para quien la escribe es igual a una consulta normal.
 */
function consultaConContrato(tabla: string): unknown {
  const pasos: Paso[] = [];

  async function ejecutar(): Promise<unknown> {
    const contratoId = await idDelContrato();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let consulta: any = clienteDePertec.from(tabla);
    pasos.forEach(([metodo, argumentos], i) => {
      if (i === 0 && ESCRITURAS.has(metodo)) {
        const [filas, ...resto] = argumentos;
        consulta = consulta[metodo](conContrato(filas, contratoId), ...resto);
        return;
      }
      consulta = consulta[metodo](...argumentos);
      if (i === 0 && LECTURAS_Y_CAMBIOS.has(metodo)) consulta = consulta.eq("contrato_id", contratoId);
    });
    return await consulta;
  }

  const proxy: unknown = new Proxy(
    {},
    {
      get(_objetivo, propiedad) {
        if (propiedad === "then") {
          return (alResolver: (v: unknown) => unknown, alFallar: (e: unknown) => unknown) =>
            ejecutar().then(alResolver, alFallar);
        }
        if (propiedad === "catch") return (alFallar: (e: unknown) => unknown) => ejecutar().catch(alFallar);
        if (propiedad === "finally") return (alTerminar: () => void) => ejecutar().finally(alTerminar);
        return (...argumentos: unknown[]) => {
          pasos.push([String(propiedad), argumentos]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

export const supabaseAdmin = new Proxy(clienteDePertec, {
  get(objetivo, propiedad, receptor) {
    if (propiedad === "from") {
      return (tabla: string) =>
        TABLAS_DE_CONTRATO.has(tabla) ? consultaConContrato(tabla) : objetivo.from(tabla);
    }
    return Reflect.get(objetivo, propiedad, receptor);
  },
}) as SupabaseClient;
