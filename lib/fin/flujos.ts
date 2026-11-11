import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "../supabase-admin";
import { listarUsuarios } from "../usuarios";
import { obtenerAplicacionPorSlug } from "../aplicaciones";
import { SLUG_APP_FIN, esAdminFin, type ContextoFin } from "./datos";
import { ROLES_FLUJO, SOLO_ADMIN_SIN_ASIGNAR, type PuedeFlujo, type RolFlujo } from "./flujos-modelo";

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
  const admin = await esAdminFin(ctx.usuario);
  return Object.fromEntries(
    ROLES_FLUJO.map((r) => {
      const asignados = mapa.get(r) ?? [];
      return [r, admin || (asignados.length === 0 && !SOLO_ADMIN_SIN_ASIGNAR.includes(r)) || asignados.includes(ctx.usuario.id)];
    }),
  ) as PuedeFlujo;
}

/**
 * Corta la acción si el usuario no tiene el rol. Con `solicitante`, además impide aprobar lo propio,
 * salvo que sea la única persona asignada (o el admin global): así nadie queda sin poder avanzar.
 */
export async function exigirRol(ctx: ContextoFin, rol: RolFlujo, opciones: { solicitante?: string | null; accion?: string } = {}): Promise<void> {
  if (await esAdminFin(ctx.usuario)) return;
  const asignados = (await asignacionesDeEmpresa(ctx.empresa.id)).get(rol) ?? [];
  if (asignados.length === 0) return;
  if (!asignados.includes(ctx.usuario.id)) {
    throw new Error(`No tienes asignado este paso${opciones.accion ? ` (${opciones.accion})` : ""}. Pídele al administrador que te sume en «Permisos de flujos».`);
  }
  const propio = opciones.solicitante && opciones.solicitante.toLowerCase() === ctx.usuario.correo.toLowerCase();
  if (propio && asignados.length > 1) throw new Error("No puedes aprobar ni visar tu propia solicitud: lo hace otra de las personas asignadas.");
}

/**
 * Pasos que ya eran solo del administrador de finanzas (aprobar, visar, rechazar, anular documentos):
 * pueden hacerlos el administrador de finanzas o quien esté asignado a alguno de los roles. Si los roles
 * no tienen a nadie, queda la regla anterior: solo administradores de finanzas.
 * Con `solicitante`, quien pidió la compra no la aprueba ni la visa él mismo salvo que sea el único asignado.
 */
export async function exigirRolOAdminFin(ctx: ContextoFin, roles: RolFlujo[], opciones: { solicitante?: string | null; accion?: string } = {}): Promise<void> {
  if (await esAdminFin(ctx.usuario)) return;
  const mapa = await asignacionesDeEmpresa(ctx.empresa.id);
  const mios = roles.filter((r) => (mapa.get(r) ?? []).includes(ctx.usuario.id));
  if (mios.length === 0) {
    throw new Error(`Este paso${opciones.accion ? ` (${opciones.accion})` : ""} es de los administradores de finanzas o de las personas asignadas en «Permisos de flujos».`);
  }
  const propio = opciones.solicitante && opciones.solicitante.toLowerCase() === ctx.usuario.correo.toLowerCase();
  if (propio && mios.some((r) => (mapa.get(r) ?? []).length > 1)) throw new Error("No puedes aprobar ni visar tu propia solicitud: lo hace otra de las personas asignadas.");
}
