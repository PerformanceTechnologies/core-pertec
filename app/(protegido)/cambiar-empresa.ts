"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { empresaIdsDeUsuario, listarEmpresas } from "@/lib/empresas";
import { COOKIE_EMPRESA, empresasPermitidas, puedeVerEmpresa } from "@/lib/empresas-modelo";

const UN_ANIO = 60 * 60 * 24 * 365;

/**
 * Cambia la empresa en la que está parada la persona.
 *
 * Vuelve a resolver los permisos acá adentro en vez de confiar en lo que mande
 * el formulario: una Server Action se invoca por HTTP directo, así que el slug
 * que llega es tan poco de fiar como la cookie que va a escribir. Si la persona
 * no tiene esa empresa, no se escribe nada y la pantalla sigue donde estaba.
 */
export async function cambiarEmpresaAction(slug: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.email) return;

  const usuario = await obtenerUsuarioActivo(session.user.email);
  if (!usuario) return;

  const [todas, asignadas] = await Promise.all([
    listarEmpresas(),
    empresaIdsDeUsuario(usuario.id),
  ]);
  const permitidas = empresasPermitidas(todas, asignadas, usuario.rol);
  if (!puedeVerEmpresa(slug, permitidas)) return;

  const galletas = await cookies();
  galletas.set(COOKIE_EMPRESA, slug, {
    maxAge: UN_ANIO,
    path: "/",
    sameSite: "lax",
    httpOnly: false, // la lee el servidor; no guarda nada secreto, solo cuál empresa se está mirando
  });

  // Todo el árbol protegido depende de la empresa activa.
  revalidatePath("/", "layout");
}
