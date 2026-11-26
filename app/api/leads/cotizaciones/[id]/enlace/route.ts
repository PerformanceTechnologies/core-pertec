import { NextResponse } from "next/server";
import { contextoLeadsApi, exigirDeEmpresa } from "@/lib/fin/datos";
import { crearEnlaceCotizacion, urlEnlaceCotizacion } from "@/lib/fin/cotizacion-enlace";

export const runtime = "nodejs";

/**
 * Un enlace de aceptación de la cotización SIN mandar correo: para pasárselo al cliente por otro medio o para probar.
 * Deja sin efecto los enlaces anteriores sin responder (el cliente responde la última versión).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoLeadsApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Cotización inválida" }, { status: 400 });
  let c;
  try {
    c = await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id);
  } catch {
    return NextResponse.json({ error: "No se encontró la cotización." }, { status: 404 });
  }
  if (!["borrador", "enviada"].includes(String(c.estado))) return NextResponse.json({ error: "Solo se genera el enlace de una cotización en borrador o enviada." }, { status: 409 });
  try {
    const codigo = await crearEnlaceCotizacion(ctx.empresa.id, id, ctx.usuario.correo);
    return NextResponse.json({ url: urlEnlaceCotizacion(new URL(request.url).origin, codigo) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear el enlace." }, { status: 500 });
  }
}
