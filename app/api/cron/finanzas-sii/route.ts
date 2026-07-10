import { NextRequest, NextResponse } from "next/server";
import { extraerFacturasSii } from "@/lib/sii-rcv";
import { guardarFacturasSii, registrarEjecucion } from "@/lib/finanzas";
import { enviarCorreoSoporte } from "@/lib/notificaciones";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Protegido por CRON_SECRET: Vercel Cron envia automaticamente
// "Authorization: Bearer <CRON_SECRET>" cuando esa variable de entorno
// existe. Tambien se puede invocar a mano (ej. para la carga inicial) con
// ese mismo header.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cargaInicial = request.nextUrl.searchParams.get("cargaInicial") === "true";

  const creds = {
    rutRepresentante: process.env.SII_RUT_REPRESENTANTE ?? "",
    claveTributaria: process.env.SII_CLAVE_TRIBUTARIA ?? "",
    rutEmpresa: process.env.SII_RUT_EMPRESA ?? "",
  };
  if (!creds.rutRepresentante || !creds.claveTributaria || !creds.rutEmpresa) {
    const mensaje = "Faltan SII_RUT_REPRESENTANTE/SII_CLAVE_TRIBUTARIA/SII_RUT_EMPRESA en el entorno.";
    await registrarEjecucion(false, 0, mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }

  try {
    const filas = await extraerFacturasSii(creds, { cargaInicial, ventanaDias: 7 });
    const nuevas = await guardarFacturasSii(filas);
    await registrarEjecucion(true, nuevas);
    return NextResponse.json({ ok: true, documentos: filas.length, nuevos: nuevas });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await registrarEjecucion(false, 0, mensaje).catch(() => {});
    await enviarCorreoSoporte(
      "Panel Finanzas: fallo la actualizacion diaria de facturas SII",
      `La corrida automatica de hoy no pudo actualizar las facturas del SII.\n\nError: ${mensaje}\n\nRevisa el dashboard en core.pertec.cl/finanzas y, si persiste, corre el scraper localmente para diagnosticar.`
    ).catch(() => {});
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
