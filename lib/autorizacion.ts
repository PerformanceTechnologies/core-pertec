import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "./usuarios";
import { obtenerAplicacionPorSlug } from "./aplicaciones";
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

// Para páginas nativas del core (como /reclutamiento) que dependen del
// mismo catálogo de aplicaciones: el admin siempre entra, un usuario normal
// solo si tiene esa app asignada — igual que las cartillas del catálogo.
export async function exigirAccesoApp(slug: string): Promise<UsuarioConAcceso> {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) redirect("/ingresar");
  if (usuario.rol === "admin") return usuario;

  const app = await obtenerAplicacionPorSlug(slug);
  if (!app || !usuario.aplicacionIds.includes(app.id)) redirect("/");
  return usuario;
}
