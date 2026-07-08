"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/autorizacion";
import { crearUsuario, actualizarUsuario, eliminarUsuario } from "@/lib/usuarios";
import type { Rol } from "@/lib/tipos";

export async function crearUsuarioAction(form: FormData) {
  await exigirAdmin();
  await crearUsuario({
    correo: String(form.get("correo") ?? ""),
    nombre: String(form.get("nombre") ?? ""),
    rol: String(form.get("rol") ?? "usuario") as Rol,
    aplicacionIds: form.getAll("aplicaciones").map(String),
  });
  revalidatePath("/usuarios");
}

export async function actualizarUsuarioAction(id: string, form: FormData) {
  await exigirAdmin();
  await actualizarUsuario(id, {
    nombre: String(form.get("nombre") ?? ""),
    rol: String(form.get("rol") ?? "usuario") as Rol,
    activo: form.get("activo") === "on",
    aplicacionIds: form.getAll("aplicaciones").map(String),
  });
  revalidatePath("/usuarios");
  revalidatePath("/");
  redirect("/usuarios");
}

export async function eliminarUsuarioAction(form: FormData) {
  const admin = await exigirAdmin();
  const id = String(form.get("id"));
  if (id === admin.id) return; // nadie se puede autoeliminar por accidente
  await eliminarUsuario(id);
  revalidatePath("/usuarios");
}
