import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { contextoDeEmpresa } from "@/lib/empresas";
import { estadoRemitente } from "@/lib/correo-empresa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Desde qué cuenta va a salir un correo enviado ahora, en la empresa activa. Lo muestra la ventana de envío. */
export async function GET() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  return NextResponse.json(await estadoRemitente(usuario, activa), { headers: { "Cache-Control": "no-store" } });
}
