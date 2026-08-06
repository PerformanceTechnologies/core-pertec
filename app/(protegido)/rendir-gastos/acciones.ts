"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { crearRendicion, eliminarRendicion, obtenerRendicion } from "@/lib/rendidor/datos";
import { obtenerEmpleado } from "@/lib/rendidor/odoo";

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

export async function eliminarRendicionAction(id: string) {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const rendicion = await obtenerRendicion(id);
  if (!rendicion) return;
  if (rendicion.creadoPor !== usuario.id && usuario.rol !== "admin") {
    throw new Error("No autorizado");
  }
  await eliminarRendicion(id);
  revalidatePath("/rendir-gastos");
}
