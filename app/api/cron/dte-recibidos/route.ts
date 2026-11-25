import { NextRequest, NextResponse } from "next/server";
import { bearerCoincide } from "@/lib/cron-bearer";
import { sincronizarRecibidosAutomatico } from "@/lib/fin/dte/servicio";

export const maxDuration = 300;

/**
 * Una vez al día: trae de SimpleFactura los documentos recibidos de los últimos 30 días para cada empresa con su cuenta
 * cargada (Administración › Integraciones). Sin cuenta, no hace nada. Protegido con CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || !bearerCoincide(request.headers.get("authorization"), secreto)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const resultado = await sincronizarRecibidosAutomatico();
  return NextResponse.json({ ok: true, resultado });
}
