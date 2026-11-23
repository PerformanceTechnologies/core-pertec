import { bearerCoincide } from "@/lib/cron-bearer";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { emissoConfigurado } from "@/lib/fin/emisso";
import { sincronizarBancoItau } from "@/lib/fin/banco-emisso";
import { enviarCorreoSoporte } from "@/lib/notificaciones";
import { RUTA_FIN } from "@/lib/fin/datos";

/**
 * Banco automático: deja en Tesorería los movimientos y saldos de Itaú que Emisso Connect ya leyó.
 *
 * Una vez al día, a las 08:00 UTC (05:00 en Chile en verano, 04:00 en invierno: Vercel no cambia de horario).
 * El horario vive en vercel.json, que no admite comentarios, así que el porqué queda aquí:
 *
 *  · Esta ruta NO entra al banco: solo consulta lo que Emisso guardó. Emisso sincroniza Itaú solo (cadencia de
 *    4 h al 17-11-2026), así que a las 05:00 los datos tienen a lo más unas horas. Itaú publica los movimientos
 *    posteriores a las 14:00 recién al día hábil siguiente, de modo que de madrugada no se pierde nada.
 *  · Cada corrida gasta 5 o 6 llamadas de la cuota de Emisso (2.000 al mes): estado, movimientos de este mes y del
 *    anterior, saldos y las nóminas de pago masivo (50 por página: una o dos llamadas, más con el tiempo).
 *  · Si Itaú rechaza o bloquea la clave, NO se reintenta (Itaú bloquea tras varios intentos): se avisa a soporte.
 *
 * Protegido por CRON_SECRET, como los demás crons. A mano, con el mismo header:
 *   GET /api/cron/banco-emisso            → este mes y el anterior
 *   GET /api/cron/banco-emisso?todo=true  → todo lo que Emisso tenga guardado (la carga inicial)
 */
export const maxDuration = 120;

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return bearerCoincide(request.headers.get("authorization"), secreto);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!emissoConfigurado()) return NextResponse.json({ ok: true, omitido: "Emisso sin configurar (EMISSO_API_KEY / EMISSO_ITAU_CONEXION)." });

  const r = await sincronizarBancoItau({ todo: request.nextUrl.searchParams.get("todo") === "true" });
  if (r.nuevos > 0 || r.actualizados > 0 || r.saldos > 0) revalidatePath(RUTA_FIN, "layout");

  if (!r.ok || r.requierePersona || r.advertencias.length) {
    const lineas = [
      r.ok ? "La sincronización del banco Itaú corrió, pero hay algo que revisar." : "La sincronización del banco Itaú falló.",
      r.mensaje ? `\nError: ${r.mensaje}` : "",
      ...r.advertencias.map((a) => `· ${a}`),
      r.requierePersona
        ? "\nLa clave del usuario consultivo de Itaú necesita atención: entra a connect.emisso.ai › Conexiones y vuelve a vincularla. El Core no reintenta para no bloquearla."
        : "",
      `\nNuevos: ${r.nuevos} · actualizados: ${r.actualizados} · saldos: ${r.saldos} · nóminas: ${r.nominas} (ligadas ahora: ${r.nominasLigadas}) · datos de Emisso al: ${r.datosAl ?? "—"}`,
    ];
    await enviarCorreoSoporte("Core: revisar la sincronización del banco Itaú (Emisso)", lineas.filter(Boolean).join("\n")).catch((e) =>
      console.error("[cron banco-emisso] no se pudo avisar a soporte:", e),
    );
  }

  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
