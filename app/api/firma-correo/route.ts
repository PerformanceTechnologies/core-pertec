import { NextResponse } from "next/server";
import { sesionDeLaPeticion } from "@/lib/sesion-de-la-peticion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { firmaDe } from "@/lib/firma-correo";

export const runtime = "nodejs";

/** La imagen de la firma de quien está en sesión (solo la propia), para mostrarla en la ventana de envío. */
export async function GET() {
  const usuario = await obtenerUsuarioActivo((await sesionDeLaPeticion())?.user?.email);
  if (!usuario) return new NextResponse(null, { status: 401 });
  const png = await firmaDe(usuario);
  if (!png) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(png, "base64"), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
