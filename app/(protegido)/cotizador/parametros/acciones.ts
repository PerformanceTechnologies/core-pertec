"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/autorizacion";
import {
  crearSetParametros,
  actualizarSetParametros,
  eliminarSetParametros,
  type DatosSetParametros,
} from "@/lib/parametros-legales";
import type { TaxBracket } from "@/lib/cotizador/motor/types";

// Editar/crear un set no afecta cotizaciones ya creadas (cada una guarda su
// propio parametros_snapshot congelado) — ver lib/parametros-legales.ts.

function num(form: FormData, campo: string): number {
  return Number(form.get(campo) ?? 0);
}

function leerDatos(form: FormData): DatosSetParametros {
  let tramos: TaxBracket[];
  try {
    tramos = JSON.parse(String(form.get("tramos") ?? "[]"));
  } catch {
    throw new Error("Los tramos de impuesto no son un JSON válido.");
  }

  return {
    nombre: String(form.get("nombre") ?? ""),
    vigenteDesde: String(form.get("vigenteDesde") ?? ""),
    valores: {
      uf: num(form, "uf"),
      utm: num(form, "utm"),
      ingresoMinimo: num(form, "ingresoMinimo"),
      topeImponibleAfpUF: num(form, "topeImponibleAfpUF"),
      topeImponibleCesantiaUF: num(form, "topeImponibleCesantiaUF"),
      tasaAfp: num(form, "tasaAfp"),
      tasaSaludLegal: num(form, "tasaSaludLegal"),
      tasaSisEmpleador: num(form, "tasaSisEmpleador"),
      tasaCesantiaTrabIndefinido: num(form, "tasaCesantiaTrabIndefinido"),
      tasaCesantiaEmpIndefinido: num(form, "tasaCesantiaEmpIndefinido"),
      tasaCesantiaTrabPlazoFijo: num(form, "tasaCesantiaTrabPlazoFijo"),
      tasaCesantiaEmpPlazoFijo: num(form, "tasaCesantiaEmpPlazoFijo"),
      tasaMutualBase: num(form, "tasaMutualBase"),
      aporteReformaPrevisionalEmp: num(form, "aporteReformaPrevisionalEmp"),
      topeGratificacionImmAnual: num(form, "topeGratificacionImmAnual"),
      taxBrackets: tramos,
    },
  };
}

export async function crearSetParametrosAction(form: FormData) {
  await exigirAdmin();
  await crearSetParametros(leerDatos(form));
  revalidatePath("/cotizador/parametros");
  redirect("/cotizador/parametros");
}

export async function actualizarSetParametrosAction(id: string, form: FormData) {
  await exigirAdmin();
  await actualizarSetParametros(id, leerDatos(form));
  revalidatePath("/cotizador/parametros");
  revalidatePath(`/cotizador/parametros/${id}`);
  redirect("/cotizador/parametros");
}

export async function eliminarSetParametrosAction(form: FormData) {
  await exigirAdmin();
  const id = String(form.get("id"));
  await eliminarSetParametros(id);
  revalidatePath("/cotizador/parametros");
}
