"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { borrarConexion } from "@/lib/correo-empresa";

/** Olvida la cuenta conectada de una empresa. Solo la propia: el usuario sale de la sesión, no del formulario. */
export async function desconectarCorreoAction(formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) redirect("/ingresar");
  const empresaId = String(formData.get("empresa") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(empresaId)) return;
  await borrarConexion(usuario.id, empresaId);
  revalidatePath("/correo-empresa");
}
