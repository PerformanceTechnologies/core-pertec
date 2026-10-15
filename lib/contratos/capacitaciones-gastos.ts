import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import {
  crearCategoria,
  crearPartida,
  actualizarPartida,
  eliminarPartida,
  listarCategorias,
  obtenerPartida,
  type DatosDePartida,
} from "./arranque";
import { etiquetaDeEstadoDePartida } from "./arranque-modelo";
import { eliminarElemento, listarArchivosDeCarpeta } from "./sharepoint";
import {
  CATEGORIA_DE_GASTO,
  categoriaParaFactura,
  descripcionDeGasto,
  estadoDeGastoDeFactura,
  notaDeOrigen,
  unirNotas,
  type FacturaDeCurso,
} from "./capacitaciones-modelo";
import type { CursoPersona } from "./acreditacion-modelo";

// La factura de un curso o examen es un gasto de verdad: una línea de Gastos de arranque, en su
// categoría, con su carpeta en SharePoint. Este archivo es el único que sabe cómo se arma esa línea;
// las acciones de Acreditación lo llaman y no tocan Gastos por su cuenta.

type Fila = Record<string, unknown>;

/** Lo que se anota de la factura. El monto es NETO, como todo el presupuesto de Gastos. */
export interface DatosDeFactura {
  /** El N° de factura. */
  referencia: string;
  proveedor: string;
  /** La fecha de la factura, o null. */
  fecha: string | null;
  monto: number;
  pagada: boolean;
  notas: string | null;
}

/**
 * Las facturas de estos gastos, por id de línea.
 *
 * Lee de la línea y no de una copia: si alguien corrige el monto o el estado desde Gastos, la ficha
 * de la persona lo dice igual. Las líneas que ya no existen simplemente no aparecen.
 */
export async function listarFacturas(partidaIds: string[]): Promise<Map<string, FacturaDeCurso>> {
  const facturas = new Map<string, FacturaDeCurso>();
  const ids = [...new Set(partidaIds)];

  // De a 200: la lista viaja en la URL de la consulta y una nómina grande la haría demasiado larga.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("ct_arranque_partidas")
      .select(
        "id, numero, referencia, proveedor, fecha, estado, monto_real, monto_comprometido, monto_presupuestado, carpeta_item_id, carpeta_url",
      )
      .eq("modulo", "gastos")
      .in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);

    for (const f of (data ?? []) as Fila[]) {
      const estado = f.estado as string;
      const pagada = estado === "pagado";
      const monto =
        f.monto_real !== null && f.monto_real !== undefined && pagada
          ? Number(f.monto_real)
          : f.monto_comprometido !== null && f.monto_comprometido !== undefined
            ? Number(f.monto_comprometido)
            : f.monto_real !== null && f.monto_real !== undefined
              ? Number(f.monto_real)
              : null;
      facturas.set(f.id as string, {
        partidaId: f.id as string,
        numero: f.numero as number,
        referencia: (f.referencia as string) ?? null,
        proveedor: (f.proveedor as string) ?? null,
        fecha: (f.fecha as string) ?? null,
        monto,
        pagada,
        anulada: estado === "anulado",
        estadoEtiqueta: etiquetaDeEstadoDePartida("gastos", estado),
        carpetaItemId: (f.carpeta_item_id as string) ?? null,
        carpetaUrl: (f.carpeta_url as string) ?? null,
      });
    }
  }
  return facturas;
}

/** La categoría de Gastos que corresponde al tipo: la existente, o la crea si alguien la borró. */
async function categoriaDeGastos(tipo: CursoPersona["tipo"]): Promise<string> {
  const buscar = async () => categoriaParaFactura(tipo, await listarCategorias("gastos", { incluirInactivas: true }));

  const existente = await buscar();
  if (existente) return existente.id;

  await crearCategoria("gastos", CATEGORIA_DE_GASTO[tipo]);
  const creada = await buscar();
  if (!creada) throw new Error("No se pudo preparar la categoría de Gastos para esta factura.");
  return creada.id;
}

/**
 * Crea o actualiza la línea de Gastos de este curso o examen. Devuelve su id.
 *
 * Al actualizar se parte de lo que la línea ya tiene (presupuesto, responsable, vínculo con
 * Logística, notas que alguien escribió en Gastos…) y solo se pisa lo que la factura dice: editar
 * la factura desde Acreditación no puede borrar lo que se trabajó en Gastos.
 */
export async function guardarGastoDeFactura(opciones: {
  curso: CursoPersona;
  persona: { nombre: string; rut: string };
  datos: DatosDeFactura;
  /** La línea que ya tiene, si ya había una factura. */
  partidaId: string | null;
  creadoPor: string;
}): Promise<string> {
  const { curso, persona, datos, partidaId, creadoPor } = opciones;

  const categoriaId = await categoriaDeGastos(curso.tipo);
  const existente = partidaId ? await obtenerPartida(partidaId) : null;
  if (partidaId && (!existente || existente.modulo !== "gastos")) {
    throw new Error("El gasto de esta factura ya no existe: vuelve a registrarla.");
  }

  const estado = estadoDeGastoDeFactura(datos.pagada);
  const nota = notaDeOrigen(curso, persona);

  const base: DatosDePartida = {
    categoriaId,
    descripcion: descripcionDeGasto(curso, persona.nombre),
    proveedor: datos.proveedor,
    referencia: datos.referencia,
    estado,
    fecha: datos.fecha,
    // El estimado no aplica a algo ya facturado; si la línea traía uno, se conserva.
    montoPresupuestado: existente?.montoPresupuestado ?? null,
    // Pagada: el monto es lo PAGADO y cuenta como pagado. Por pagar: es un compromiso.
    montoReal: datos.pagada ? datos.monto : null,
    montoComprometido: datos.monto,
    cantidad: existente?.cantidad ?? 1,
    modalidad: "compra_directa",
    partidaVinculadaId: existente?.partidaVinculadaId ?? null,
    // Las notas de quien trabaje la línea en Gastos se respetan; la de origen se agrega una vez.
    notas: unirNotas(existente?.notas ?? null, datos.notas, nota),
    responsableId: existente?.responsableId ?? null,
    responsableExternoId: existente?.responsableExternoId ?? null,
  };

  if (existente) {
    await actualizarPartida(existente.id, base);
    return existente.id;
  }
  return await crearPartida("gastos", base, creadoPor);
}

/**
 * Elimina la línea de Gastos de una factura, con su carpeta en SharePoint.
 *
 * SharePoint primero y la línea después, igual que al eliminar una partida desde Gastos: si la
 * carpeta fallara y la línea ya no estuviera, nadie sabría de cuál era. La carpeta va a la papelera
 * del sitio; la línea no se recupera.
 */
export async function quitarGastoDeFactura(partidaId: string): Promise<void> {
  const partida = await obtenerPartida(partidaId);
  if (!partida || partida.modulo !== "gastos") return;
  if (partida.carpetaItemId) await eliminarElemento(partida.carpetaItemId);
  await eliminarPartida(partidaId);
}

/** De qué curso o examen nació una línea de Gastos, o null si no nació de ninguno. */
export interface OrigenDeGasto {
  personaId: string;
  persona: string;
  curso: string;
  tipo: CursoPersona["tipo"];
  /** El plazo de pago de la factura en días, si se anotó. */
  plazoDePagoDias: number | null;
}

/**
 * Nunca lanza: es un dato de cortesía en la ficha del gasto. Si la columna aún no existe (migración
 * 0030 sin correr) o la base no responde, la ficha se ve igual, sin el aviso de origen.
 */
export async function origenDeGasto(partidaId: string): Promise<OrigenDeGasto | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ct_acreditacion_cursos")
      .select("curso, tipo, persona_id, factura_plazo_dias, ct_acreditacion_personas(nombre)")
      .eq("partida_gasto_id", partidaId)
      .maybeSingle();
    if (error || !data) return null;

    const f = data as Fila;
    const rel = f.ct_acreditacion_personas as { nombre?: string } | { nombre?: string }[] | null;
    return {
      personaId: f.persona_id as string,
      persona: (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? "Persona",
      curso: f.curso as string,
      tipo: f.tipo as CursoPersona["tipo"],
      plazoDePagoDias: (f.factura_plazo_dias as number) ?? null,
    };
  } catch {
    return null;
  }
}

/** Un archivo de la carpeta de una factura. */
export interface ArchivoDeFacturaLeido {
  id: string;
  nombre: string;
  url: string;
}

/**
 * Las facturas de una persona con los archivos de la carpeta de cada una, para su ficha.
 *
 * NUNCA lanza: la ficha se ve igual si Gastos o SharePoint no responden, y `errorDeArchivos` dice
 * que no se pudo leer en vez de mostrar «sin archivos», que sería mentira.
 */
export async function leerFacturasConArchivos(
  partidaIds: string[],
  conectado: boolean,
): Promise<{
  facturas: Record<string, FacturaDeCurso>;
  archivos: Record<string, ArchivoDeFacturaLeido[]>;
  errorDeArchivos: boolean;
}> {
  let facturas: Map<string, FacturaDeCurso>;
  try {
    facturas = await listarFacturas(partidaIds);
  } catch (e) {
    console.error("[acreditacion] No se pudieron leer las facturas de los cursos:", e);
    return { facturas: {}, archivos: {}, errorDeArchivos: false };
  }

  const lecturas = conectado
    ? await Promise.all(
        [...facturas.values()]
          .filter((fa) => fa.carpetaItemId)
          .map(async (fa) => {
            try {
              const lista = await listarArchivosDeCarpeta(fa.carpetaItemId as string);
              return {
                id: fa.partidaId,
                archivos: lista.map((a) => ({ id: a.id, nombre: a.nombre, url: a.webUrl })),
                fallo: false,
              };
            } catch (e) {
              console.error(`[acreditacion] No se pudieron leer los archivos de la factura ${fa.partidaId}:`, e);
              return { id: fa.partidaId, archivos: [] as ArchivoDeFacturaLeido[], fallo: true };
            }
          }),
      )
    : [];

  return {
    facturas: Object.fromEntries(facturas),
    archivos: Object.fromEntries(lecturas.map((l) => [l.id, l.archivos])),
    errorDeArchivos: lecturas.some((l) => l.fallo),
  };
}
