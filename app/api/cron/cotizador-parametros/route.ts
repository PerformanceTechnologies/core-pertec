import { bearerCoincide } from "@/lib/cron-bearer";
import { NextRequest, NextResponse } from "next/server";
import { obtenerUfUtmVigentes } from "@/lib/cotizador/indicadores-mindicador";
import { atrasosUfUtm, hoyEnChile } from "@/lib/cotizador/desfase-indicadores";
import { actualizarUfUtmVigente } from "@/lib/parametros-legales";
import { enviarCorreoSoporte } from "@/lib/notificaciones";

export const maxDuration = 30;

// Protegido por CRON_SECRET, mismo patrón que los demás cron de este repo
// (ver app/api/cron/finanzas-sii/route.ts): Vercel Cron envía
// "Authorization: Bearer <CRON_SECRET>" automáticamente. También se puede
// invocar a mano con ese mismo header (ej. para probar el flujo).
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return bearerCoincide(request.headers.get("authorization"), secreto);
}

// Actualiza SOLO uf/utm del set de parámetros legales vigente con los
// valores del día publicados en mindicador.cl — no toca ninguna otra tasa
// (esas se fijan por ley/decreto y no tienen una fuente "de hoy" real, se
// siguen editando a mano en /cotizador/parametros). No crea un set nuevo ni
// afecta cotizaciones ya creadas (usan su propio parametros_snapshot).
//
// Corre dos veces al dia (ver vercel.json): a las 03:00 y, con `?ultimo=1`, a las 09:30. La
// fuente puede publicar el dia nuevo despues de las 03:00; si el primer pase la alcanza
// atrasada, el segundo la corrige. Si en el ultimo pase la UF o la UTM siguen atrasadas
// respecto de hoy, avisa a soporte (antes el cron terminaba «bien» y el cotizador quedaba con
// la UF de ayer sin que nadie se enterara).
export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { uf, utm, fechaUf, fechaUtm } = await obtenerUfUtmVigentes();
    const resultado = await actualizarUfUtmVigente(uf, utm);

    if (!resultado.actualizado) {
      console.error("[cron cotizador-parametros]", resultado.motivo);
      return NextResponse.json({ ok: false, motivo: resultado.motivo }, { status: 500 });
    }

    // Se guarda igual lo que haya (es lo mas nuevo que tiene la fuente), pero se avisa si no es de hoy.
    const atrasos = atrasosUfUtm(fechaUf, fechaUtm, hoyEnChile());
    if (atrasos.length) {
      console.warn("[cron cotizador-parametros] la fuente trae datos atrasados:", atrasos.join("; "));
      if (request.nextUrl.searchParams.get("ultimo") === "1") {
        await enviarCorreoSoporte(
          "Cotizador: la UF/UTM de la fuente viene atrasada",
          `La ultima corrida automatica del dia guardo la UF y la UTM de los parametros legales del cotizador, pero la fuente (findic.cl) las trae atrasadas:

${atrasos.map((a) => `- ${a}`).join("\n")}

Valores guardados: UF ${resultado.ufNueva}, UTM ${resultado.utmNueva}.

Si el cotizador tiene que usar el valor de hoy, edita uf/utm a mano en core.pertec.cl/cotizador/parametros o vuelve a intentarlo mas tarde con el boton de actualizar de esa pagina.`
        ).catch((errCorreo) => console.error("[cron cotizador-parametros] fallo al enviar alerta de atraso:", errCorreo));
      }
    }

    return NextResponse.json({
      ok: true,
      setId: resultado.setId,
      uf: { anterior: resultado.ufAnterior, nueva: resultado.ufNueva, fecha: fechaUf },
      utm: { anterior: resultado.utmAnterior, nueva: resultado.utmNueva, fecha: fechaUtm },
      atrasos,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("[cron cotizador-parametros]", mensaje);

    // Este cron corre 1x/dia y ya agoto los reintentos hacia mindicador.cl, asi
    // que cada falla llega como maximo una vez al dia (no hay tabla de
    // ejecuciones para exigir dos fallas seguidas). Si no se
    // avisa, UF/UTM quedan desactualizadas y nadie se entera hasta cotizar.
    await enviarCorreoSoporte(
      "Cotizador: fallo la actualizacion diaria de UF/UTM",
      `La corrida automatica de hoy no pudo actualizar la UF y la UTM de los parametros legales del cotizador.

Error: ${mensaje}

Los valores vigentes quedan como estaban; si persiste, edita uf/utm a mano en core.pertec.cl/cotizador/parametros.`
    ).catch((errCorreo) => console.error("[cron cotizador-parametros] fallo al enviar alerta:", errCorreo));

    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
