import "server-only";
import { odooCampos, odooCreate, odooSearchRead } from "../panel-odoo/odoo-cliente";

/**
 * El "Fondo por Rendir" de Odoo (`hr.expense.advance`).
 *
 * Es donde se agrupan los gastos de una misma entrega de fondos: en Odoo, cada hr.expense
 * apunta a uno por `advance_id`, cuya etiqueta es literalmente "Fondo por Rendir". Uno
 * real se ve así:
 *
 *   FR/2026/00014 — Alexa Vasquez — Rendición de gastos en borrador ($ 685896)
 *
 * ── Por qué se preguntan los campos en vez de escribirlos ──────────────────
 *
 * hr.expense.advance es un modelo PROPIO de esta instancia: no está en la lista de
 * modelos que expone el MCP de Odoo, así que su esquema no se puede conocer al escribir
 * este archivo. Y armar un create adivinando nombres de campo es como se rompen las
 * integraciones: falla en producción, con un traceback de Python, y recién ahí se
 * descubre que el campo se llamaba `motivo` y no `description`.
 *
 * Así que se pregunta primero (odooCampos → fields_get) y se manda SOLO lo que existe y
 * se puede escribir. Cada dato se busca entre varios nombres posibles; el que no aparezca
 * simplemente no se envía, y Odoo completa lo que tenga por defecto.
 */

/** Un fondo, como lo necesita la pantalla: su id y cómo se llama. */
export interface FondoOdoo {
  id: number;
  nombre: string;
}

/** El modelo, en un solo lugar: se nombra en la búsqueda, en el create y en los errores. */
const MODELO = "hr.expense.advance";

/**
 * Los nombres posibles de cada dato, en orden de preferencia.
 *
 * El primero que exista en el modelo es el que se usa. No es adivinar: es preguntar y
 * quedarse con lo que hay.
 */
const NOMBRES = {
  empleado: ["employee_id"],
  empresa: ["company_id"],
  descripcion: ["description", "name", "motivo", "concepto", "reason"],
  monto: ["amount", "total_amount", "monto", "amount_total"],
  fecha: ["date", "date_start", "request_date"],
} as const;

/** El primer nombre de la lista que el modelo tenga y deje escribir. */
function cual(
  campos: Record<string, { type: string; readonly?: boolean }>,
  posibles: readonly string[],
  soloEscribibles = true,
): string | null {
  return (
    posibles.find((n) => campos[n] && (!soloEscribibles || campos[n].readonly !== true)) ?? null
  );
}

/**
 * Los fondos abiertos de un empleado, más recientes primero.
 *
 * Se filtra por empleado porque un fondo es de una persona: ofrecerle a alguien el fondo
 * de otro es ofrecerle cargar su gasto en la rendición ajena. Si el modelo no tuviera ese
 * campo, se devuelven los últimos sin filtrar antes que no devolver nada — pero se dice
 * en el log, porque un desplegable con fondos de todo el mundo es un dato a revisar.
 *
 * `display_name` y no un campo propio: lo tiene todo modelo de Odoo y ya viene armado con
 * el folio, la persona y el monto, que es exactamente lo que hay que leer para elegir.
 */
export async function listarFondos(employeeId: number, companyId: number): Promise<FondoOdoo[]> {
  const campos = await odooCampos(MODELO);
  // Para FILTRAR sirve cualquier campo, aunque sea de solo lectura.
  const campoEmpleado = cual(campos, NOMBRES.empleado, false);
  const campoEmpresa = cual(campos, NOMBRES.empresa, false);

  const dominio: unknown[] = [];
  if (campoEmpleado) dominio.push([campoEmpleado, "=", employeeId]);
  else console.warn(`[rendidor] ${MODELO} no tiene campo de empleado: los fondos van sin filtrar.`);
  if (campoEmpresa) dominio.push([campoEmpresa, "=", companyId]);

  const filas = await odooSearchRead<{ id: number; display_name: string }>(
    MODELO,
    dominio,
    ["id", "display_name"],
    { limit: 40, order: "id desc" },
  );
  return filas.map((f) => ({ id: f.id, nombre: f.display_name }));
}

/**
 * Crea un fondo y devuelve su id y su nombre ya armado por Odoo.
 *
 * El nombre NO se compone acá: se lee de vuelta con display_name. El folio (FR/2026/…) lo
 * pone una secuencia de Odoo, así que cualquier nombre que se armara de este lado sería
 * una copia que se desincroniza.
 */
export async function crearFondo(datos: {
  employeeId: number;
  companyId: number;
  descripcion: string;
  monto: number;
}): Promise<FondoOdoo> {
  const campos = await odooCampos(MODELO);

  const valores: Record<string, unknown> = {};
  const poner = (posibles: readonly string[], valor: unknown) => {
    const campo = cual(campos, posibles);
    if (campo) valores[campo] = valor;
  };
  poner(NOMBRES.empleado, datos.employeeId);
  poner(NOMBRES.empresa, datos.companyId);
  poner(NOMBRES.descripcion, datos.descripcion.trim());
  // El monto va solo si se declaró uno: un fondo con monto 0 puesto por el sistema es
  // peor que un fondo sin monto, porque parece un dato y no un hueco.
  if (datos.monto > 0) poner(NOMBRES.monto, datos.monto);
  poner(NOMBRES.fecha, new Date().toISOString().slice(0, 10));

  // Si no se pudo poner ni la descripción, algo cambió de fondo en el modelo y es mejor
  // decirlo que crear un registro vacío que después nadie identifica.
  if (cual(campos, NOMBRES.descripcion) === null) {
    throw new Error(
      `El modelo ${MODELO} de Odoo no tiene ninguno de los campos esperados para el nombre ` +
        `(${NOMBRES.descripcion.join(", ")}). Hay que revisar el modelo antes de crear fondos desde acá.`,
    );
  }

  const id = await odooCreate(MODELO, valores);
  const [creado] = await odooSearchRead<{ id: number; display_name: string }>(
    MODELO,
    [["id", "=", id]],
    ["id", "display_name"],
  );
  return { id, nombre: creado?.display_name ?? `Fondo ${id}` };
}
