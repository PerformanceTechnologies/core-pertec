"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { crearRendicion, eliminarRendicion, obtenerRendicion } from "@/lib/rendidor/datos";
import { obtenerEmpleado } from "@/lib/rendidor/odoo";
import { borrarRespaldosDeRendicion } from "@/lib/rendidor/almacenamiento";

const SLUG_APP = "rendir-gastos";

// PASO 0 de la skill: los 3 datos iniciales (quién rinde, monto asignado,
// título), antes de analizar ningún comprobante.
export async function crearRendicionAction(form: FormData) {
  const usuario = await exigirAccesoApp(SLUG_APP);

  const tituloRendicion = String(form.get("tituloRendicion") ?? "").trim();
  const montoAsignado = Number(form.get("montoAsignado") ?? 0) || 0;
  const empresaCompanyId = Number(form.get("empresaCompanyId") ?? 1) || 1;
  const odooEmployeeId = Number(form.get("odooEmployeeId") ?? 0) || 0;

  if (!tituloRendicion) {
    throw new Error("El título de la rendición es obligatorio.");
  }
  if (!odooEmployeeId) {
    throw new Error("Hay que elegir a quién rinde, de la ficha de empleados de Odoo.");
  }

  // El NOMBRE se lee de Odoo por id, no se toma del formulario. Así el nombre
  // guardado es siempre el de la ficha del empleado — que es el que se usa en la
  // planilla y en el gasto — y además valida que el id exista de verdad.
  const empleado = await obtenerEmpleado(odooEmployeeId);
  if (!empleado) {
    throw new Error(`El empleado ${odooEmployeeId} no existe en Odoo.`);
  }

  const rendicion = await crearRendicion(
    {
      nombreQuienRinde: empleado.name,
      tituloRendicion,
      montoAsignado,
      empresaCompanyId,
      odooEmployeeId,
    },
    usuario.id,
  );

  revalidatePath("/rendir-gastos");
  redirect(`/rendir-gastos/${rendicion.id}`);
}

export type ResultadoBorrado = { ok: true } | { ok: false; error: string };

/**
 * Borra una rendición, en cualquier estado.
 *
 * Una rendición cargada TAMBIÉN se puede borrar, pero conviene tener claro qué
 * pasa y qué no: los hr.expense que se crearon en Odoo NO se borran — el wrapper
 * de Odoo del core es create-only — y con la rendición se va la única traza local
 * de cuáles fueron. Por eso la confirmación en la UI muestra los ids antes de
 * borrar, para poder anotarlos y limpiarlos a mano en Odoo si hace falta.
 *
 * Devuelve el resultado en vez de lanzar: una excepción en una Server Action
 * llega al cliente como un digest opaco, y acá el motivo del rechazo es
 * justamente lo que hay que mostrarle a quien rinde.
 */
export async function eliminarRendicionAction(id: string): Promise<ResultadoBorrado> {
  const usuario = await exigirAccesoApp(SLUG_APP);

  const rendicion = await obtenerRendicion(id);
  // Ya no existe: se trata como éxito para que un doble clic no muestre un
  // error sobre algo que efectivamente está borrado.
  if (!rendicion) return { ok: true };

  if (rendicion.creadoPor !== usuario.id && usuario.rol !== "admin") {
    return { ok: false, error: "No podés borrar una rendición de otra persona." };
  }

  // Queda en el log del servidor: es lo unico que sobrevive al borrado y sirve
  // para rastrear gastos huerfanos en Odoo despues.
  const idsOdoo = rendicion.gastos.map((g) => g.odooExpenseId).filter(Boolean);
  if (idsOdoo.length > 0) {
    console.warn(
      `[rendidor] Se borra la rendición "${rendicion.tituloRendicion}" (${id}), ya cargada. ` +
        `Los hr.expense ${idsOdoo.join(", ")} siguen en Odoo.`,
    );
  }

  // Los respaldos primero: si se borrara la fila antes, los archivos quedarian
  // huerfanos en el bucket sin nada que los referencie.
  await borrarRespaldosDeRendicion(id);

  await eliminarRendicion(id);
  revalidatePath("/rendir-gastos");
  return { ok: true };
}
