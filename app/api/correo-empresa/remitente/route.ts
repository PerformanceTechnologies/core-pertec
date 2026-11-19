import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { contextoDeEmpresa } from "@/lib/empresas";
import { estadoRemitente } from "@/lib/correo-empresa";
import { firmaDe } from "@/lib/firma-correo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Desde qué cuenta va a salir un correo enviado ahora, en la empresa activa. Lo muestra la ventana de envío. */
export async function GET() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const [estado, firma] = await Promise.all([estadoRemitente(usuario, activa), firmaDe(usuario)]);
  // La firma va aparte del estado: la ventana de envío dice si sale con firma y deja editarla.
  return NextResponse.json({ ...estado, conFirma: Boolean(firma), invitado: usuario.tipo === "invitado" }, { headers: { "Cache-Control": "no-store" } });
}
