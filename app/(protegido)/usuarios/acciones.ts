"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { exigirAdmin } from "@/lib/autorizacion";
import { crearUsuario, actualizarUsuario, eliminarUsuario } from "@/lib/usuarios";
import { reemplazarSubpanelesFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { reemplazarEmpresas } from "@/lib/empresas";
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
// ninguna app, asi que los subpaneles de Finanzas se guardan como un paso
// aparte, despues de crear/actualizar el usuario.
function leerSubpanelesFinanzas(form: FormData): string[] {
  return form.getAll("subpaneles_finanzas").map(String);
}

// Las empresas en las que la persona se puede parar. Mismo patrón: un paso
// aparte, porque lib/usuarios.ts no conoce el concepto de empresa.
//
// Sin ninguna marcada NO queda sin acceso: ve la empresa de por omisión. Ver
// empresasPermitidas en lib/empresas-modelo.ts, donde está el porqué.
function leerEmpresas(form: FormData): string[] {
  return form.getAll("empresas").map(String);
}

/** El motivo de la falla, para mostrarlo en el formulario en vez de la pantalla blanca de error. */
function motivo(e: unknown): string {
  unstable_rethrow(e); // un redirect no es una falla
  return (e instanceof Error ? e.message : String(e)).replace(/^\[\w+\]\s*/, "").slice(0, 300);
}

export async function crearUsuarioAction(form: FormData) {
  await exigirAdmin();
  try {
    await crearUsuarioYAccesos(form);
  } catch (e) {
    redirect(`/usuarios?error=${encodeURIComponent(motivo(e))}`);
  }
  revalidatePath("/usuarios");
}

async function crearUsuarioYAccesos(form: FormData) {
  const usuario = await crearUsuario({
    correo: String(form.get("correo") ?? ""),
    nombre: String(form.get("nombre") ?? ""),
    rol: String(form.get("rol") ?? "usuario") as Rol,
    aplicacionIds: form.getAll("aplicaciones").map(String),
    rolesExtra: leerRolesExtra(form),
    invitado: form.get("tipo") === "invitado",
  });
  await reemplazarSubpanelesFinanzas(usuario.id, leerSubpanelesFinanzas(form));
  await reemplazarEmpresas(usuario.id, leerEmpresas(form));
}

export async function actualizarUsuarioAction(id: string, form: FormData) {
  await exigirAdmin();
  try {
    await actualizarUsuario(id, {
      nombre: String(form.get("nombre") ?? ""),
      rol: String(form.get("rol") ?? "usuario") as Rol,
      activo: form.get("activo") === "on",
      aplicacionIds: form.getAll("aplicaciones").map(String),
      rolesExtra: leerRolesExtra(form),
      // Solo se toca si el formulario trae el campo (con la columna ya creada).
      // Sin tocar la columna cuando no cambia nada (así el formulario sirve aunque falte su SQL).
      invitado: form.get("tipo") === "invitado" ? true : form.get("tipoPrevio") === "invitado" ? false : undefined,
    });
    await reemplazarSubpanelesFinanzas(id, leerSubpanelesFinanzas(form));
    await reemplazarEmpresas(id, leerEmpresas(form));
  } catch (e) {
    // De vuelta al formulario, con el motivo a la vista. Lo que alcanzó a guardarse queda guardado.
    redirect(`/usuarios/${id}?error=${encodeURIComponent(motivo(e))}`);
  }
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
