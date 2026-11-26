import { NextResponse } from "next/server";
import { contextoFinApi, exigirDeEmpresa } from "@/lib/fin/datos";
import { exigirRol } from "@/lib/fin/flujos";
import { crearEnlaceOc, urlEnlaceOc } from "@/lib/fin/oc-enlace";

export const runtime = "nodejs";

/**
 * Un enlace de confirmación de la OC SIN mandar correo: para pasárselo al proveedor por otro medio (WhatsApp, su
 * portal) o para probar. Deja sin efecto los enlaces anteriores sin responder (el proveedor responde la última versión).
 * Mismo permiso que enviar la OC.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  try {
    await exigirRol(ctx, "compras_visador", { accion: "generar el enlace de confirmación de la OC" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado" }, { status: 403 });
  }
  let compra;
  try {
    compra = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
  } catch {
    return NextResponse.json({ error: "No se encontró la solicitud." }, { status: 404 });
  }
  if (!compra.formato_oc) return NextResponse.json({ error: "Esta compra es anterior al formato de OC." }, { status: 409 });
  if (compra.estado_override) return NextResponse.json({ error: "La solicitud está anulada." }, { status: 409 });
  if (!compra.oc_numero) return NextResponse.json({ error: "El enlace se genera después de visar la OC." }, { status: 409 });
  if (compra.oc_respuesta) return NextResponse.json({ error: "El proveedor ya respondió esta OC." }, { status: 409 });
  try {
    const codigo = await crearEnlaceOc(ctx.empresa.id, id, ctx.usuario.correo);
    return NextResponse.json({ url: urlEnlaceOc(new URL(request.url).origin, codigo) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear el enlace." }, { status: 500 });
  }
}
