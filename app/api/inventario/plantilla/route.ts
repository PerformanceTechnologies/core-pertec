import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { plantilla } from "@/lib/inventario-importacion";

export const runtime = "nodejs";

/** La planilla de carga masiva, con las bodegas, categorías y unidades actuales en sus listas. */
export async function GET() {
  const acceso = await verificarAccesoAppApi("inventario");
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const archivo = await plantilla();
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-inventario.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
