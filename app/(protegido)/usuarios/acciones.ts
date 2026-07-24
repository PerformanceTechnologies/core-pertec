"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/autorizacion";
import { crearUsuario, actualizarUsuario, eliminarUsuario } from "@/lib/usuarios";
import { reemplazarModulosOdoo } from "@/lib/panel-odoo/modulos-usuario";
import type { Rol } from "@/lib/tipos";

// Los selectores de rol interno (uno por app que lo soporte) llegan como
// campos "rol_extra_<aplicacionId>" — así no hace falta que esta Server
// Action conozca el catálogo de apps para leerlos.
function leerRolesExtra(form: FormData): Record<string, string> {
  const roles: Record<string, string> = {};
  for (const [clave, valor] of form.entries()) {
    if (clave.startsWith("rol_extra_") && typeof valor === "string" && valor) {
      roles[clave.replace("rol_extra_", "")] = valor;
    }
  }
  return roles;
}

// Igual que rolesExtra: lib/usuarios.ts no conoce conceptos especificos de
// ninguna app, asi que la visibilidad de modulos de Panel Odoo se guarda
// como un paso aparte, despues de crear/actualizar el usuario.
function leerModulosOdoo(form: FormData): string[] {
  return form.getAll("modulos_panel_odoo").map(String);
}

export async function crearUsuarioAction(form: FormData) {
  await exigirAdmin();
  const usuario = await crearUsuario({
    correo: String(form.get("correo") ?? ""),
    nombre: String(form.get("nombre") ?? ""),
    rol: String(form.get("rol") ?? "usuario") as Rol,
    aplicacionIds: form.getAll("aplicaciones").map(String),
    rolesExtra: leerRolesExtra(form),
  });
  await reemplazarModulosOdoo(usuario.id, leerModulosOdoo(form));
  revalidatePath("/usuarios");
}

export async function actualizarUsuarioAction(id: string, form: FormData) {
  await exigirAdmin();
  await actualizarUsuario(id, {
    nombre: String(form.get("nombre") ?? ""),
    rol: String(form.get("rol") ?? "usuario") as Rol,
    activo: form.get("activo") === "on",
    aplicacionIds: form.getAll("aplicaciones").map(String),
    rolesExtra: leerRolesExtra(form),
  });
  await reemplazarModulosOdoo(id, leerModulosOdoo(form));
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
