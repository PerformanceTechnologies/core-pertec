import { NextRequest, NextResponse } from "next/server";
import { indexarFacturasVenta } from "@/lib/indexador-facturas-venta";
import { indexarFacturasCompra } from "@/lib/indexador-facturas-compra";
import { registrarEjecucionHistorico } from "@/lib/facturas-historicas";
import { credencialesGraphFacturasConfiguradas } from "@/lib/sharepoint-facturas";
import { enviarCorreoSoporte } from "@/lib/notificaciones";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Protegido por CRON_SECRET (mismo mecanismo que /api/cron/finanzas-sii).
// Vercel Cron llama dos veces al dia (una por tipo, ver vercel.json) sin
// parametros de anio/mes -> modo incremental (mes actual + anterior). Para
// la carga inicial del historico completo se llama a mano una vez por cada
// anio/mes con ?tipo=venta|compra&anio=YYYY&mes=M.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!credencialesGraphFacturasConfiguradas()) {
    const mensaje = "Faltan AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET/SHAREPOINT_FACTURAS_SITE_ID en el entorno.";
    await registrarEjecucionHistorico(false, 0, mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }

  const tipo = request.nextUrl.searchParams.get("tipo") === "compra" ? "compra" : "venta";
  const anioParam = request.nextUrl.searchParams.get("anio");
  const mesParam = request.nextUrl.searchParams.get("mes");
  const anio = anioParam ? Number(anioParam) : undefined;
  const mes = mesParam ? Number(mesParam) : undefined;

  try {
    const { nuevos, procesados } =
      tipo === "compra" ? await indexarFacturasCompra({ anio, mes }) : await indexarFacturasVenta({ anio, mes });
    await registrarEjecucionHistorico(true, nuevos);
    return NextResponse.json({ ok: true, tipo, procesados, nuevos });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await registrarEjecucionHistorico(false, 0, mensaje).catch(() => {});
    await enviarCorreoSoporte(
      "Panel Finanzas: fallo la indexacion de facturas historicas (SharePoint)",
      `La corrida automatica de hoy no pudo indexar las facturas de ${tipo} historicas.\n\nError: ${mensaje}\n\nRevisa el dashboard en core.pertec.cl/finanzas/facturas-historicas.`
    ).catch(() => {});
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
