import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import type { EstadoRendicion, GastoRendicion, Rendicion, ResumenRendicion } from "./tipos";

// Capa de datos de las rendiciones. Los gastos van como jsonb embebido porque
// se editan siempre en bloque desde la tabla de revision (el rendidor corrige
// varias filas y guarda), nunca de a uno.

interface FilaRendicion {
  id: string;
  nombre_quien_rinde: string;
  monto_asignado: number | string;
  titulo_rendicion: string;
  estado: EstadoRendicion;
  empresa_company_id: number;
  odoo_employee_id: number | null;
  gastos: GastoRendicion[];
  creado_por: string | null;
  creado_en: string;
}

interface FilaResumen {
  id: string;
  creado_por: string | null;
  nombre_quien_rinde: string;
  monto_asignado: number | string;
  titulo_rendicion: string;
  estado: EstadoRendicion;
  cantidad_gastos: number | string;
  total_gastos: number | string;
  odoo_expense_ids: number[] | null;
  creado_en: string;
}

const COLUMNAS = `
  id, nombre_quien_rinde, monto_asignado, titulo_rendicion, estado,
  empresa_company_id, odoo_employee_id, gastos, creado_por, creado_en
`;

function filaARendicion(fila: FilaRendicion): Rendicion {
  return {
    id: fila.id,
    nombreQuienRinde: fila.nombre_quien_rinde,
    montoAsignado: Number(fila.monto_asignado),
    tituloRendicion: fila.titulo_rendicion,
    estado: fila.estado,
    empresaCompanyId: fila.empresa_company_id,
    odooEmployeeId: fila.odoo_employee_id,
    gastos: fila.gastos ?? [],
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
  };
}

/**
 * Rendiciones para la pantalla de lista, mas recientes primero.
 *
 * Cada quien ve las suyas y un ADMIN ve todas. No es una comodidad: quien
 * administra tiene que poder revisar lo que rindio otra persona antes de que se
 * cargue a Odoo, y hasta ahora la unica forma era abrir la fila por su URL —el
 * detalle ya dejaba entrar a un admin (ver [id]/page.tsx), la lista no—.
 *
 * Lee de la vista `rendiciones_resumen`, que calcula la cantidad de gastos y el
 * total en Postgres. La lista solo muestra esos dos numeros, y traer el jsonb
 * `gastos` completo para calcularlos en JS movia cientos de KB por carga.
 */
export async function listarRendiciones(quien: {
  usuarioId: string;
  rol: string;
}): Promise<ResumenRendicion[]> {
  const consulta = supabaseAdmin
    .from("rendiciones_resumen")
    .select(
      `id, nombre_quien_rinde, monto_asignado, titulo_rendicion, estado,
       cantidad_gastos, total_gastos, odoo_expense_ids, creado_por, creado_en`,
    )
    .order("creado_en", { ascending: false });

  // El filtro va en la CONSULTA y no en el resultado: filtrar despues significa
  // traer las rendiciones de toda la empresa a la memoria del servidor para
  // descartarlas, y el dia que alguien lea `data` antes del filtro, se filtran.
  const { data, error } = await (quien.rol === "admin"
    ? consulta
    : consulta.eq("creado_por", quien.usuarioId));

  // Se propaga el error en vez de devolver [] en silencio: una lista vacia por
  // fallo de red es indistinguible de "no tienes rendiciones", y eso hace que
  // alguien empiece una rendicion de cero sobre una que ya existia.
  if (error) throw new Error(`No pudimos cargar las rendiciones: ${error.message}`);

  return ((data ?? []) as unknown as FilaResumen[]).map((f) => ({
    id: f.id,
    nombreQuienRinde: f.nombre_quien_rinde,
    montoAsignado: Number(f.monto_asignado),
    tituloRendicion: f.titulo_rendicion,
    estado: f.estado,
    cantidadGastos: Number(f.cantidad_gastos),
    totalGastos: Number(f.total_gastos),
    odooExpenseIds: f.odoo_expense_ids ?? [],
    esMia: f.creado_por === quien.usuarioId,
    creadoEn: f.creado_en,
  }));
}

export async function obtenerRendicion(id: string): Promise<Rendicion | null> {
  const { data, error } = await supabaseAdmin
    .from("rendiciones")
    .select(COLUMNAS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No pudimos cargar la rendición: ${error.message}`);
  return data ? filaARendicion(data as unknown as FilaRendicion) : null;
}

export interface DatosNuevaRendicion {
  nombreQuienRinde: string;
  montoAsignado: number;
  tituloRendicion: string;
  empresaCompanyId: number;
  // El empleado de Odoo se elige desde el inicio, asi que la carga a Odoo ya no
  // depende de que el nombre escrito a mano coincida con el de la ficha.
  odooEmployeeId: number;
}

/** PASO 0 de la skill: los 3 datos iniciales, antes de analizar nada. */
export async function crearRendicion(
  datos: DatosNuevaRendicion,
  usuarioId: string,
): Promise<Rendicion> {
  const { data, error } = await supabaseAdmin
    .from("rendiciones")
    .insert({
      nombre_quien_rinde: datos.nombreQuienRinde.trim(),
      monto_asignado: datos.montoAsignado,
      titulo_rendicion: datos.tituloRendicion.trim(),
      empresa_company_id: datos.empresaCompanyId,
      odoo_employee_id: datos.odooEmployeeId,
      creado_por: usuarioId,
      gastos: [],
    })
    .select(COLUMNAS)
    .single();

  if (error) throw new Error(`No pudimos crear la rendición: ${error.message}`);
  return filaARendicion(data as unknown as FilaRendicion);
}

/** Guarda los gastos corregidos desde la tabla de revisión. */
export async function guardarGastos(id: string, gastos: GastoRendicion[]): Promise<void> {
  const { error } = await supabaseAdmin
    .from("rendiciones")
    .update({ gastos, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No pudimos guardar los gastos: ${error.message}`);
}

/**
 * Marca la rendición como cargada y deja la trazabilidad: el empleado de Odoo y
 * los ids de hr.expense y res.partner de cada gasto.
 */
export async function marcarCargadaOdoo(
  id: string,
  odooEmployeeId: number,
  gastos: GastoRendicion[],
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("rendiciones")
    .update({
      estado: "cargada_odoo",
      odoo_employee_id: odooEmployeeId,
      gastos,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`No pudimos marcar la rendición como cargada: ${error.message}`);
}

export async function eliminarRendicion(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("rendiciones").delete().eq("id", id);
  if (error) throw new Error(`No pudimos eliminar la rendición: ${error.message}`);
}
