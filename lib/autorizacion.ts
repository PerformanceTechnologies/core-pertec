import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "./usuarios";
import type { UsuarioConAcceso } from "./tipos";

// Se llama tanto en las páginas de administración como en cada Server Action
// de esas páginas: oculta la navegación no alcanza, porque una Server Action
// se puede invocar directo sin pasar por la UI.
export async function exigirAdmin(): Promise<UsuarioConAcceso> {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario || usuario.rol !== "admin") redirect("/");
  return usuario;
}
