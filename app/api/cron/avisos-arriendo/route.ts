import { NextRequest, NextResponse } from "next/server";
import { bearerCoincide } from "@/lib/cron-bearer";
import { horaEnSantiago, hoyEnSantiago } from "@/lib/graph-calendario";
import { correrAvisosArriendo } from "@/lib/fin/avisos-arriendo";

export const maxDuration = 300;

// Los avisos salen a las 8:00 de Chile. Vercel agenda en UTC fijo y Chile cambia de huso (UTC-3 en verano, UTC-4 en
// invierno), así que hay entradas a las 11:05 y a las 12:05 UTC (ver vercel.json), más una de respaldo a las 14:05:
// las que caen antes de las 8 locales se descartan acá, y las de más no repiten nada (cada aviso se anota antes de
// enviarse). Con el atraso con que Vercel dispara los crons, un aviso puede llegar cerca de las 9:00.
const HORA_DESDE = 8;
const HORA_HASTA = 18;

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || !bearerCoincide(request.headers.get("authorization"), secreto)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const hora = horaEnSantiago();
  if (request.nextUrl.searchParams.get("ahora") !== "1" && (hora < HORA_DESDE || hora >= HORA_HASTA)) {
    return NextResponse.json({ ok: true, omitido: `En Chile son las ${hora}:00, fuera de la ventana de ${HORA_DESDE} a ${HORA_HASTA}.` });
  }
  try {
    const resultado = await correrAvisosArriendo(hoyEnSantiago().iso);
    for (const r of resultado) if (r.errores.length) console.error("[avisos-arriendo]", r.empresa, r.errores.slice(0, 20));
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error("[avisos-arriendo] la corrida falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
