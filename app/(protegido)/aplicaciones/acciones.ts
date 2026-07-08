"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/autorizacion";
import { crearAplicacion, actualizarAplicacion, eliminarAplicacion } from "@/lib/aplicaciones";
import type { ColorApp, EstadoApp, TipoApp } from "@/lib/tipos";

function leerDatosFormulario(form: FormData) {
  return {
    nombre: String(form.get("nombre") ?? ""),
    url: String(form.get("url") ?? ""),
    tipo: String(form.get("tipo") ?? "externa") as TipoApp,
    icono: String(form.get("icono") ?? "apps"),
    color: String(form.get("color") ?? "naranjo") as ColorApp,
    descripcion: String(form.get("descripcion") ?? ""),
    estado: String(form.get("estado") ?? "activa") as EstadoApp,
    orden: Number(form.get("orden") ?? 0),
  };
}

export async function crearAplicacionAction(form: FormData) {
  await exigirAdmin();
  await crearAplicacion(leerDatosFormulario(form));
  revalidatePath("/aplicaciones");
  revalidatePath("/");
}

export async function actualizarAplicacionAction(id: string, form: FormData) {
  await exigirAdmin();
  await actualizarAplicacion(id, leerDatosFormulario(form));
  revalidatePath("/aplicaciones");
  revalidatePath("/");
  redirect("/aplicaciones");
}

export async function eliminarAplicacionAction(form: FormData) {
  await exigirAdmin();
  const id = String(form.get("id"));
  await eliminarAplicacion(id);
  revalidatePath("/aplicaciones");
  revalidatePath("/");
}
