import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "./usuarios";
import { obtenerAplicacionPorSlug } from "./aplicaciones";
import type { UsuarioConAcceso } from "./tipos";

export interface AccesoApiDenegado {
  usuario: null;
  status: 401 | 403;
  error: string;
}

export interface AccesoApiConcedido {
  usuario: UsuarioConAcceso;
  status: null;
  error: null;
}

// Se llama tanto en las páginas de administración como en cada Server Action
// de esas páginas: oculta la navegación no alcanza, porque una Server Action
// se puede invocar directo sin pasar por la UI.
export async function exigirAdmin(): Promise<UsuarioConAcceso> {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario || usuario.rol !== "admin") redirect("/");
  return usuario;
}

/**
 * Si esta persona puede ver esa app. Sin redirigir y sin armar una respuesta HTTP.
 *
 * Es la MISMA regla que exigirAccesoApp y verificarAccesoAppApi —el admin entra
 * siempre, el resto solo con la app asignada— pero devolviendo un booleano, para
 * los sitios que no son ni una página ni un route handler: el resumen diario, que
 * decide qué pendientes mencionarle a alguien, y las herramientas de consulta.
 *
 * Existe para que esa regla esté escrita UNA vez. Antes cada lugar la repetía, y
 * una copia que se olvida de mirar el rol o la lista de apps no falla ruidosamente:
 * deja pasar datos de un módulo que esa persona no tiene.
 */
export async function puedeVerApp(usuario: UsuarioConAcceso, slug: string): Promise<boolean> {
  if (usuario.rol === "admin") return true;
  const app = await obtenerAplicacionPorSlug(slug);
  return Boolean(app && usuario.aplicacionIds.includes(app.id));
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

// Misma verificación que exigirAccesoApp, pero para Route Handlers: en vez
// de redirigir devuelve un resultado que la ruta traduce a un status HTTP.
export async function verificarAccesoAppApi(slug: string): Promise<AccesoApiDenegado | AccesoApiConcedido> {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return { usuario: null, status: 401, error: "No autorizado" };
  if (usuario.rol === "admin") return { usuario, status: null, error: null };

  const app = await obtenerAplicacionPorSlug(slug);
  if (!app || !usuario.aplicacionIds.includes(app.id)) {
    return { usuario: null, status: 403, error: "No autorizado" };
  }
  return { usuario, status: null, error: null };
}
