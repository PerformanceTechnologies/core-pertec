import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "../supabase-admin";
import { listarUsuarios } from "../usuarios";
import { obtenerAplicacionPorSlug } from "../aplicaciones";
import { SLUG_APP_FIN, type ContextoFin } from "./datos";
import { ROLES_FLUJO, type PuedeFlujo, type RolFlujo } from "./flujos-modelo";

// -----------------------------------------------------------------------------
//  Permisos de flujos.
//   · Rol con personas asignadas: solo ellas (y el admin global) pueden ejecutar el paso.
//   · Rol sin nadie: cualquiera con la app, como antes (no bloquea nada al desplegar).
//   · Varias personas por rol: basta con una (titular y suplentes).
//   · Si la tabla aún no existe (migración 0007 sin correr) todo sigue permitido.
// -----------------------------------------------------------------------------

export interface PersonaFlujo {
  id: string;
  nombre: string;
  correo: string;
}

/** usuario_id asignados por rol, de la empresa. Una vez por pedido. */
export const asignacionesDeEmpresa = cache(async (empresaId: string): Promise<Map<RolFlujo, string[]>> => {
  const salida = new Map<RolFlujo, string[]>();
  const { data, error } = await supabaseAdmin.from("fin_flujo_personas").select("rol, usuario_id").eq("empresa_id", empresaId).order("creado_en", { ascending: true });
  if (error) {
    console.error(`[fin] No se pudo leer fin_flujo_personas (¿se corrió supabase/fin/0007_flujo_personas.sql?): ${error.message}`);
    return salida;
  }
  for (const f of (data ?? []) as { rol: RolFlujo; usuario_id: string }[]) salida.set(f.rol, [...(salida.get(f.rol) ?? []), f.usuario_id]);
  return salida;
});

/** A quién se puede asignar: usuarios activos con la app Gestión financiera (los admin siempre entran). */
export async function candidatosDeFlujo(): Promise<PersonaFlujo[]> {
  const [usuarios, app] = await Promise.all([listarUsuarios(), obtenerAplicacionPorSlug(SLUG_APP_FIN)]);
  return usuarios
    .filter((u) => u.activo && (u.rol === "admin" || (app !== null && u.aplicacionIds.includes(app.id))))
    .map((u) => ({ id: u.id, nombre: u.nombre?.trim() || u.correo, correo: u.correo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Los permisos del usuario actual en todos los roles, para la interfaz. */
export async function permisosDeUsuario(ctx: ContextoFin): Promise<PuedeFlujo> {
  const mapa = await asignacionesDeEmpresa(ctx.empresa.id);
  return Object.fromEntries(
    ROLES_FLUJO.map((r) => {
      const asignados = mapa.get(r) ?? [];
      return [r, ctx.usuario.rol === "admin" || asignados.length === 0 || asignados.includes(ctx.usuario.id)];
    }),
  ) as PuedeFlujo;
}

/**
 * Corta la acción si el usuario no tiene el rol. Con `solicitante`, además impide aprobar lo propio,
 * salvo que sea la única persona asignada (o el admin global): así nadie queda sin poder avanzar.
 */
export async function exigirRol(ctx: ContextoFin, rol: RolFlujo, opciones: { solicitante?: string | null; accion?: string } = {}): Promise<void> {
  if (ctx.usuario.rol === "admin") return;
  const asignados = (await asignacionesDeEmpresa(ctx.empresa.id)).get(rol) ?? [];
  if (asignados.length === 0) return;
  if (!asignados.includes(ctx.usuario.id)) {
    throw new Error(`No tienes asignado este paso${opciones.accion ? ` (${opciones.accion})` : ""}. Pídele al administrador que te sume en «Permisos de flujos».`);
  }
  const propio = opciones.solicitante && opciones.solicitante.toLowerCase() === ctx.usuario.correo.toLowerCase();
  if (propio && asignados.length > 1) throw new Error("No puedes aprobar ni visar tu propia solicitud: lo hace otra de las personas asignadas.");
}

/** Para pasos que puede hacer cualquiera de varios roles (p. ej. rechazar: quien aprueba o quien visa). */
export async function exigirAlgunRol(ctx: ContextoFin, roles: RolFlujo[], accion?: string): Promise<void> {
  if (ctx.usuario.rol === "admin") return;
  const mapa = await asignacionesDeEmpresa(ctx.empresa.id);
  const configurados = roles.filter((r) => (mapa.get(r) ?? []).length > 0);
  if (configurados.length === 0) return;
  if (configurados.some((r) => (mapa.get(r) ?? []).includes(ctx.usuario.id))) return;
  throw new Error(`No tienes asignado este paso${accion ? ` (${accion})` : ""}. Pídele al administrador que te sume en «Permisos de flujos».`);
}
