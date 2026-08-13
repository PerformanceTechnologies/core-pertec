import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "../usuarios";
import { obtenerAplicacionPorSlug } from "../aplicaciones";
import type { UsuarioConAcceso } from "../tipos";
import { usuarioPuedeVerSubpanelFinanzas } from "../finanzas-subpaneles-usuario";

// Dos capas, como se acordo con el usuario: acceso al modulo Finanzas
// (exigirAccesoApp("finanzas")) MAS el permiso fino de este submodulo
// (usuario_finanzas_subpanel_acceso, ver lib/finanzas-subpaneles-usuario.ts)
// -- a diferencia de sii/facturas-historicas, "facturas-ih" deniega por
// defecto sin fila explicita, porque es informacion tributaria sensible de
// ambas empresas. El admin siempre pasa, igual que el resto del core.
async function tieneAcceso(): Promise<UsuarioConAcceso | null> {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return null;
  if (usuario.rol === "admin") return usuario;

  const app = await obtenerAplicacionPorSlug("finanzas");
  if (!app || !usuario.aplicacionIds.includes(app.id)) return null;
  if (!(await usuarioPuedeVerSubpanelFinanzas(usuario.id, "facturas-ih"))) return null;
  return usuario;
}

export async function exigirAccesoFinanzasIh(): Promise<UsuarioConAcceso> {
  const usuario = await tieneAcceso();
  if (!usuario) redirect("/finanzas");
  return usuario;
}

export async function verificarAccesoFinanzasIhApi(): Promise<
  { usuario: null; status: 401 | 403; error: string } | { usuario: UsuarioConAcceso; status: null; error: null }
> {
  const usuario = await tieneAcceso();
  if (!usuario) return { usuario: null, status: 403, error: "No autorizado" };
  return { usuario, status: null, error: null };
}
