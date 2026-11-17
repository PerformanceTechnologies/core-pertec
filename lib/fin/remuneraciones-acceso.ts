import "server-only";
import { asignacionesDeEmpresa } from "./flujos";
import { ROL_REMUNERACIONES } from "./flujos-modelo";
import { SLUG_EMPRESA_REMUNERACIONES } from "./remuneraciones-modelo";
import { contextoFin, type ContextoFin } from "./datos";

// -----------------------------------------------------------------------------
//  Quién ve las remuneraciones. Son sueldos de personas: el acceso es CERRADO por defecto.
//
//   · Solo Performance Technologies (el BUK de esa empresa); en cualquier otra, nadie, ni el admin.
//   · El administrador del Core entra siempre.
//   · El resto, solo si el administrador los asignó en «Permisos de flujos › Ver remuneraciones».
//
//  A diferencia de los roles de los flujos (rol sin nadie = cualquiera con la app), acá «sin nadie asignado» deja
//  entrar solo al admin. Esta función es la única que decide: la pestaña, la página y cada Server Action la llaman.
// -----------------------------------------------------------------------------

export async function puedeVerRemuneraciones(ctx: ContextoFin): Promise<boolean> {
  if (ctx.empresa.slug !== SLUG_EMPRESA_REMUNERACIONES) return false;
  if (ctx.usuario.rol === "admin") return true;
  const asignados = (await asignacionesDeEmpresa(ctx.empresa.id)).get(ROL_REMUNERACIONES) ?? [];
  return asignados.includes(ctx.usuario.id);
}

/** Para las Server Actions y la página: el contexto de Finanzas si, y solo si, puede ver remuneraciones. Si no, lanza. */
export async function exigirRemuneraciones(): Promise<ContextoFin> {
  const ctx = await contextoFin();
  if (!(await puedeVerRemuneraciones(ctx))) throw new Error("[fin] No tienes acceso a Remuneraciones. Pídele al administrador que te asigne en «Permisos de flujos».");
  return ctx;
}
