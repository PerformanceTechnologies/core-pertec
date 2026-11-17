import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { contextoDeEmpresa } from "@/lib/empresas";
import { cifrar } from "@/lib/cifrado";
import {
  COOKIE_FLUJO,
  VIDA_FLUJO_SEG,
  nuevoEstado,
  nuevoPkce,
  origenPublico,
  urlDeInicio,
  type PaqueteFlujo,
} from "@/lib/correo-empresa-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ida a Microsoft para conectar la cuenta de una empresa (Zeus) solo para enviar.
 *
 * Se revisa acá Y en la vuelta que la persona pueda pararse en esa empresa y que la
 * empresa envíe desde su propio correo: la cookie del flujo es del navegador y no se cree.
 */
export async function GET(request: NextRequest) {
  const origen = origenPublico(request);
  const aPagina = (q: Record<string, string>) => NextResponse.redirect(`${origen}/correo-empresa?${new URLSearchParams(q)}`);

  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) return NextResponse.redirect(`${origen}/ingresar`);

  const empresaId = request.nextUrl.searchParams.get("empresa") ?? "";
  const pestana = request.nextUrl.searchParams.get("pestana") === "1";
  const { permitidas } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const empresa = permitidas.find((e) => e.id === empresaId);
  if (!empresa?.correoPropio) return aPagina({ error: "empresa" });

  const redirectUri = `${origen}/api/correo-empresa/callback`;
  const estado = nuevoEstado();
  const { verificador, desafio } = nuevoPkce();

  let destino: string;
  try {
    destino = urlDeInicio({ redirectUri, estado, desafio, dominio: empresa.correoDominio });
  } catch (e) {
    console.error("[correo-empresa] sin configuración de la app:", e instanceof Error ? e.message : e);
    return aPagina({ error: "config" });
  }

  const paquete: PaqueteFlujo = { estado, verificador, empresaId: empresa.id, usuarioId: usuario.id, redirectUri, pestana, vence: Date.now() + VIDA_FLUJO_SEG * 1000 };
  const respuesta = NextResponse.redirect(destino);
  respuesta.cookies.set(COOKIE_FLUJO, cifrar(JSON.stringify(paquete)), {
    httpOnly: true,
    secure: origen.startsWith("https://"),
    // lax y no strict: la vuelta es una navegación desde login.microsoftonline.com, y con
    // strict el navegador no mandaría la cookie.
    sameSite: "lax",
    path: "/api/correo-empresa",
    maxAge: VIDA_FLUJO_SEG,
  });
  return respuesta;
}
