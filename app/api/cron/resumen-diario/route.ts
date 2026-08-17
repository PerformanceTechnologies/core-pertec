import { NextRequest, NextResponse } from "next/server";
import { horaEnSantiago, hoyEnSantiago } from "@/lib/graph-calendario";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { enviarResumenPorCorreo } from "@/lib/graph-correo";
import { armarCorreoHtml } from "@/lib/resumen-diario/correo-html";
import {
  destinatariosDelCron,
  leerResumenGuardado,
  marcarEnviado,
  obtenerResumenDeHoy,
} from "@/lib/resumen-diario/datos";

// Generar el resumen es una llamada al modelo por persona sobre 60 correos, más
// dos consultas a Graph. Con pocas personas cabe de sobra; el tope alto es para
// no cortar a la mitad si mañana son diez.
export const maxDuration = 300;

export const SLUG_APP = "mi-dia";

// Ventana horaria local en la que tiene sentido mandar un resumen de la mañana.
//
// El cron está agendado VARIAS veces al día (ver vercel.json): así, si alguien
// recién queda habilitado a media mañana —le asignaron la app, o guardó su
// credencial al iniciar sesión— recibe su resumen ese mismo día en vez de esperar
// al siguiente. El reenvío lo impide enviado_en, así que las corridas de más no
// mandan nada dos veces: son dos consultas y siguen de largo.
//
// Son entradas separadas y no un rango horario ("30 10-19 * * 1-5") porque el plan
// Hobby de Vercel exige que cada expresión corra como máximo una vez al día: un
// rango hace FALLAR EL DEPLOY, no la ejecución. Y su precisión es por hora (±59
// min), así que la hora exacta de cada corrida es aproximada — otra razón para que
// la decisión de mandar o no dependa de esta ventana y no del horario agendado.
//
// El tope de las 15:00 es a propósito: un "resumen de la mañana" que llega a las
// siete de la tarde ya no sirve de nada, y es mejor que le llegue mañana temprano.
const HORA_MINIMA_CHILE = 7;
const HORA_MAXIMA_CHILE = 15;

// Mismo patrón que los demás cron del repo: Vercel manda
// "Authorization: Bearer <CRON_SECRET>". También sirve para invocarlo a mano y
// probar el flujo sin esperar a la mañana siguiente.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

function fechaLegible(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/**
 * Genera el resumen del día de cada persona y se lo manda a su propio correo.
 *
 * Actúa con el refresh token que cada uno dejó guardado al loguearse, así que
 * lee exactamente el buzón de esa persona y le escribe a esa misma dirección —
 * nunca a otra. No usa permisos de aplicación, que darían acceso a todos los
 * buzones del tenant.
 *
 * Una persona que falla no corta a las demás: cada una va en su propio try y el
 * resultado se reporta por separado.
 */
export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Chile cambia de huso dos veces al año y los crons de Vercel corren en UTC
  // fijo, así que ninguna hora UTC es "las 7:30 de Chile" todo el año. Por eso el
  // cron se dispara cada hora y acá se descartan las que localmente no
  // corresponden, en vez de intentar calzar una hora exacta.
  //
  // Invocado a mano (sin el header de Vercel no se llega hasta acá, pero con el
  // CRON_SECRET sí), `?ahora=1` saltea la guarda para poder probar a cualquier
  // hora.
  const hora = horaEnSantiago();
  const forzarHora = request.nextUrl.searchParams.get("ahora") === "1";
  if (!forzarHora && (hora < HORA_MINIMA_CHILE || hora >= HORA_MAXIMA_CHILE)) {
    return NextResponse.json({
      ok: true,
      omitido:
        `En Chile son las ${hora}:00, fuera de la ventana de ${HORA_MINIMA_CHILE} a ` +
        `${HORA_MAXIMA_CHILE}. No se manda nada.`,
    });
  }

  const hoy = hoyEnSantiago();
  const { listos, sinCredencial } = await destinatariosDelCron(SLUG_APP);

  const resultados: { correo: string; ok: boolean; detalle: string }[] = [];

  for (const persona of listos) {
    try {
      // Si ya se envió hoy, no se manda de nuevo. Protege del caso en que Vercel
      // reintente la ejecución o alguien invoque la ruta a mano dos veces.
      const previo = await leerResumenGuardado(persona.id, hoy.iso);
      if (previo?.enviadoEn) {
        resultados.push({ correo: persona.correo, ok: true, detalle: "ya enviado hoy" });
        continue;
      }

      const estado = await obtenerResumenDeHoy({
        usuarioId: persona.id,
        nombre: persona.nombre,
        correo: persona.correo,
      });
      if (estado.estado !== "ok") {
        resultados.push({
          correo: persona.correo,
          ok: false,
          detalle: estado.estado === "sin_permiso" ? "sin permiso de correo" : estado.motivo,
        });
        continue;
      }

      // Token nuevo para enviar: el de obtenerResumenDeHoy quedó dentro de esa
      // función, y de todos modos el canje es barato al lado de la generación.
      const token = await accessTokenDeUsuario(persona.id);
      if (token.estado !== "ok") {
        resultados.push({ correo: persona.correo, ok: false, detalle: `sin token para enviar` });
        continue;
      }

      await enviarResumenPorCorreo(
        token.accessToken,
        // El destinatario es la propia persona, siempre. No hay lista
        // configurable a propósito: un resumen de bandeja de entrada no puede
        // terminar en el buzón de otro por un error de configuración.
        persona.correo,
        // "Tu día" y no "Mi día": el asunto lo escribe el sistema hablándole a la
        // persona. Adentro de la app el módulo se sigue llamando Mi Día.
        `Tu día · ${fechaLegible(hoy.iso)}`,
        // El correo es solo un aviso con un botón al core; el resumen no viaja
        // en él. Se genera igual antes de mandarlo —y de ahí el `estado` de más
        // arriba— porque así, cuando la persona hace clic, la página ya lo tiene
        // en caché y abre al instante en vez de esperar la llamada al modelo.
        armarCorreoHtml(persona.nombre, fechaLegible(hoy.iso)),
      );

      await marcarEnviado(persona.id, hoy.iso);
      resultados.push({ correo: persona.correo, ok: true, detalle: "enviado" });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      console.error(`[cron resumen-diario] Falló para ${persona.correo}: ${detalle}`);
      resultados.push({ correo: persona.correo, ok: false, detalle });
    }
  }

  return NextResponse.json({
    ok: resultados.every((r) => r.ok),
    fecha: hoy.iso,
    destinatarios: listos.length,
    resultados,
    // Gente con la app asignada que no recibe nada porque nunca inició sesión
    // desde que existe el guardado de credenciales. Va en la respuesta para que
    // se vea en el log del cron y no haya que ir a preguntarle a la base.
    sinCredencial,
  });
}
