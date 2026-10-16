import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "./usuarios";
import { SinPermiso, puede, type Capacidad } from "./permisos";
import type { UsuarioConAcceso } from "./tipos";
import { enEsteContrato } from "./contrato-actual";

/**
 * Los guardias de Contratos.
 *
 * Mismas funciones que en core-ih, con una diferencia: los submódulos no se asignan por separado.
 * `exigirAccesoApp("acreditacion")` pide lo mismo que `exigirAccesoApp("contratos")`: tener la
 * app Contratos. El slug se sigue recibiendo para no tocar las decenas de llamadas que lo pasan.
 *
 * Las Server Actions llaman a estos guardias igual que las páginas: una acción es un endpoint, y se
 * puede invocar sin pasar por la pantalla que la muestra.
 */

/** La sesión resuelta contra la base, o afuera. */
export async function exigirSesion(): Promise<UsuarioConAcceso> {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) redirect("/ingresar");
  return usuario;
}

export async function exigirAdmin(): Promise<UsuarioConAcceso> {
  const usuario = await exigirSesion();
  if (usuario.rol !== "admin") redirect("/contratos");
  return usuario;
}

/** Que tenga la app Contratos. El slug del submódulo no cambia la respuesta (ver arriba). */
export async function exigirAccesoApp(_slug: string): Promise<UsuarioConAcceso> {
  const usuario = await exigirSesion();
  if (usuario.rol !== "admin" && usuario.aplicacionIds.length === 0) redirect("/");
  return usuario;
}

/** Para acciones: que tenga Contratos Y que su rol permita la capacidad. Si no, lanza. */
export async function exigirCapacidad(slug: string, capacidad: Capacidad): Promise<UsuarioConAcceso> {
  const usuario = await exigirAccesoApp(slug);
  if (!puede(usuario.rol, capacidad)) throw new SinPermiso();
  return usuario;
}

/** Lo mismo para páginas: lo que el rol no permite saca a la persona de la pantalla, sin error. */
export async function exigirCapacidadEnPagina(
  slug: string,
  capacidad: Capacidad,
  volverA: string,
): Promise<UsuarioConAcceso> {
  const usuario = await exigirAccesoApp(slug);
  if (!puede(usuario.rol, capacidad)) redirect(await enEsteContrato(volverA));
  return usuario;
}

export async function tieneAccesoAApp(usuario: UsuarioConAcceso, slug: string): Promise<boolean> {
  return usuario.rol === "admin" || usuario.aplicacionIds.includes(slug);
}

/**
 * Para las pantallas de FUERA de un contrato (la lista, crear uno): como exigirCapacidadEnPagina,
 * pero sin traducir la dirección de vuelta a un contrato, que ahí no hay.
 */
export async function exigirCapacidadFueraDeContrato(capacidad: Capacidad, volverA: string): Promise<UsuarioConAcceso> {
  const usuario = await exigirAccesoApp("contratos");
  if (!puede(usuario.rol, capacidad)) redirect(volverA);
  return usuario;
}

/**
 * Administrar los contratos mismos —crearlos, editarlos, su logo y sus carpetas— es solo para
 * administradores: los del core y quienes tengan rol Administrador en Contratos. Lo de ADENTRO de
 * cada contrato sigue los roles de siempre.
 */
export async function exigirAdminDeContratos(): Promise<UsuarioConAcceso> {
  const usuario = await exigirAccesoApp("contratos");
  if (usuario.rol !== "admin") throw new SinPermiso();
  return usuario;
}
