import { NextRequest, NextResponse } from "next/server";
import { horaEnSantiago, hoyEnSantiago } from "@/lib/graph-calendario";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { enviarResumenPorCorreo } from "@/lib/graph-correo";
import { armarCorreoHtml } from "@/lib/resumen-diario/correo-html";
import { conTope, enTandas } from "@/lib/resumen-diario/tandas";
import {
  destinatariosDelCron,
  leerResumenGuardado,
  marcarEnviado,
  obtenerResumenDeHoy,
} from "@/lib/resumen-diario/datos";

// Generar el resumen es una llamada al modelo por persona sobre 60 correos, más
// dos consultas a Graph. El tope de la plataforma es lo que hay que respetar: por
// eso las personas van de a varias en paralelo y la corrida se corta sola antes de
// llegar acá (ver TOPE_DE_CORRIDA_MS).
export const maxDuration = 300;

// ── El compromiso: todos con su resumen antes de las 9 ─────────────────────
//
// Lo que hacía que no se cumpliera, medido sobre la propia tabla: las personas se
// procesaban una después de otra, y con 8 personas a 20–60 s cada una la corrida
// pasaba el tope de 300 s y la plataforma la mataba a mitad de camino. Los que
// faltaban esperaban el cron siguiente, dos horas después. El 28 de agosto una sola
// persona recibió temprano; las otras siete entre 09:41 y 12:20.
//
// Cuatro cosas sostienen el compromiso, y ninguna alcanza sola:
//
//  1. EN PARALELO, de a tres. La corrida dura lo que la persona más lenta, no la
//     suma: 8 personas son 3 vueltas de ~60 s, no 8 × 60. Tres y no ocho porque cada
//     llamada lleva sesenta correos adentro, y ocho a la vez es un pico de tokens por
//     minuto que se topa con el límite de tasa del modelo — y ahí falla todo junto,
//     que es peor que tardar un minuto más.
//  2. TOPE POR PERSONA. Una llamada colgada no puede consumir la corrida entera.
//  3. TOPE DE CORRIDA. Se deja de empezar gente cuando ya no hay tiempo, así la
//     función termina bien y REPORTA quién quedó, en vez de morir en silencio.
//  4. VARIOS INTENTOS ANTES DE LAS 9 (ver vercel.json). Es lo que cubre lo que este
//     código no controla: los crons de Vercel se disparan con hasta una hora de
//     atraso —en los datos, entre 6 y 52 minutos— y una corrida puede fallar entera.
//     Cada intento es idempotente: quien ya recibió, no recibe de nuevo.
const CONCURRENCIA = 3;
const TOPE_POR_PERSONA_MS = 100_000;
// Se corta antes que maxDuration para poder responder y dejar registro: si la
// plataforma mata la función, no queda ni el log de quién faltaba.
const TOPE_DE_CORRIDA_MS = 240_000;
// Un reintento en la misma corrida. Los errores de acá —429 del modelo, un tropiezo
// de Graph, el tope de arriba— son casi siempre pasajeros, y esperar al intento
// siguiente son 30 minutos. Con una pausa antes: si lo que falló fue el límite de
// tasa, reintentar en el mismo segundo vuelve a fallar.
const INTENTOS_POR_PERSONA = 2;
const PAUSA_ANTES_DE_REINTENTAR_MS = 5_000;
/** La hora local antes de la cual todos tienen que haber recibido su resumen. */
const HORA_COMPROMISO_CHILE = 9;

export const SLUG_APP = "mi-dia";

// Ventana horaria local en la que tiene sentido mandar un resumen de la mañana.
//
// El cron está agendado SIETE veces al día (ver vercel.json) y eso es a propósito:
//
//  - Las tres primeras (10:15, 10:35 y 10:55 UTC) son las que sostienen el
//    compromiso de las 9. La cuenta: Chile es UTC-4 en invierno y UTC-3 en verano,
//    así que la más tardía de las tres arranca a las 06:55 o a las 07:55 local; los
//    crons de Vercel se atrasan hasta una hora —en los datos de esta tabla, entre 6 y
//    52 minutos— y la corrida se corta sola a los 4 minutos. Peor caso: 07:55 + 0:59
//    + 0:04 = 08:58. Con tres intentos independientes, que fallen los tres es lo que
//    habría que explicar. Y hay un cuarto a las 11:30 UTC que en invierno también cae
//    antes de las 9.
//  - Las últimas son la red: si alguien recién queda habilitado a media mañana —le
//    asignaron la app, o guardó su credencial al iniciar sesión— recibe su resumen
//    ese mismo día en vez de esperar al siguiente.
//
// El reenvío lo impide enviado_en, así que los intentos de más no mandan nada dos
// veces: son dos consultas por persona y siguen de largo. Van con 20 minutos de
// separación, más que los 4 que puede durar una corrida, así que dos no se pisan.
//
// Son entradas separadas y no un rango horario ("15 10-17 * * *") porque el plan
// Hobby de Vercel exige que cada expresión corra como máximo una vez al día: un rango
// hace FALLAR EL DEPLOY, no la ejecución.
//
// El tope de las 15:00 es a propósito: un "resumen de la mañana" que llega a las
// siete de la tarde ya no sirve de nada, y es mejor que le llegue mañana temprano.
//
// Y va TODOS los días, sábado y domingo incluidos: no hay ninguna guarda de día de
// semana, ni acá ni en el agendado. La decisión es del usuario y tiene sentido —el
// correo del cliente no distingue el día— con una consecuencia que conviene saber: un
// fin de semana con la bandeja quieta genera igual el resumen (una llamada al modelo
// por persona) y manda un aviso que dirá poco. Si molesta, el arreglo es no mandar
// cuando no hay nada que contar, no volver a excluir el día.
// La corrida más temprana cae a las 06:00 en invierno (10:00 UTC), así que la ventana
// tiene que abrir antes de esa hora o esa corrida —la que da el margen— se descartaría
// a sí misma.
const HORA_MINIMA_CHILE = 6;
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

  // Chile cambia de huso dos veces al año y los crons de Vercel corren en UTC fijo,
  // así que ninguna hora UTC es "las 7:15 de Chile" todo el año: la misma entrada cae
  // a las 06:15 en invierno y a las 07:15 en verano. Por eso hay varias entradas y
  // acá se descartan las corridas que localmente no corresponden, en vez de intentar
  // calzar una hora exacta.
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
  const arranque = Date.now();
  const { listos, sinCredencial } = await destinatariosDelCron(SLUG_APP);

  const resultados: { correo: string; ok: boolean; detalle: string }[] = [];

  /** Le genera el resumen y se lo manda. Devuelve qué pasó, sin lanzar. */
  const atender = async (persona: (typeof listos)[number]): Promise<{ ok: boolean; detalle: string }> => {
    // Si ya se envió hoy, no se manda de nuevo. Es lo que hace que los intentos de
    // más no cuesten nada y que un reintento de la plataforma no duplique correos.
    const previo = await leerResumenGuardado(persona.id, hoy.iso);
    if (previo?.enviadoEn) return { ok: true, detalle: "ya enviado hoy" };

    // Con tope: una llamada al modelo colgada no puede quedarse con la corrida.
    const estado = await conTope(
      TOPE_POR_PERSONA_MS,
      obtenerResumenDeHoy({ usuarioId: persona.id, nombre: persona.nombre, correo: persona.correo }),
      `el resumen de ${persona.correo}`,
    );
    if (estado.estado !== "ok") {
      return {
        ok: false,
        detalle: estado.estado === "sin_permiso" ? "sin permiso de correo" : estado.motivo,
      };
    }

    // Token nuevo para enviar: el de obtenerResumenDeHoy quedó dentro de esa
    // función, y de todos modos el canje es barato al lado de la generación.
    const token = await accessTokenDeUsuario(persona.id);
    if (token.estado !== "ok") return { ok: false, detalle: "sin token para enviar" };

    // El envío va SIN tope, a propósito: mide un segundo en los datos, y un envío
    // abandonado por reloj podría terminar mandando un correo que esta corrida ya
    // dio por perdido —y entonces el próximo intento lo mandaría de nuevo—.
    await enviarResumenPorCorreo(
      token.accessToken,
      // El destinatario es la propia persona, siempre. No hay lista configurable a
      // propósito: un resumen de bandeja de entrada no puede terminar en el buzón de
      // otro por un error de configuración.
      persona.correo,
      // "Tu día" y no "Mi día": el asunto lo escribe el sistema hablándole a la
      // persona. Adentro de la app el módulo se sigue llamando Mi Día.
      `Tu día · ${fechaLegible(hoy.iso)}`,
      // El correo es solo un aviso con un botón al core; el resumen no viaja en él.
      // Se genera igual antes de mandarlo porque así, cuando la persona hace clic, la
      // página ya lo tiene en caché y abre al instante.
      armarCorreoHtml(persona.nombre, fechaLegible(hoy.iso)),
    );

    await marcarEnviado(persona.id, hoy.iso);
    return { ok: true, detalle: "enviado" };
  };

  /** Lo mismo, con un reintento: casi todo lo que falla acá es pasajero. */
  const atenderConReintento = async (persona: (typeof listos)[number]) => {
    let ultimo = "";
    for (let intento = 1; intento <= INTENTOS_POR_PERSONA; intento += 1) {
      try {
        const resultado = await atender(persona);
        if (resultado.ok) return resultado;
        ultimo = resultado.detalle;
        // "Sin permiso" y "sin token" no se arreglan reintentando: es una credencial
        // que Microsoft rechazó, y hay que volver a iniciar sesión.
        if (ultimo.startsWith("sin ")) return resultado;
      } catch (error) {
        ultimo = error instanceof Error ? error.message : String(error);
      }
      if (intento < INTENTOS_POR_PERSONA) {
        console.warn(`[cron resumen-diario] reintentando ${persona.correo}: ${ultimo}`);
        await new Promise((listo) => setTimeout(listo, PAUSA_ANTES_DE_REINTENTAR_MS));
      }
    }
    return { ok: false, detalle: ultimo };
  };

  // De a cuatro, y dejando de empezar gente cuando se acaba el presupuesto de la
  // corrida: los que no arrancaron quedan para el próximo intento, que es dentro de
  // media hora, con su resumen anotado como faltante en esta respuesta.
  const atendidos = await enTandas(listos, CONCURRENCIA, (persona) => atenderConReintento(persona), {
    seguir: () => Date.now() - arranque < TOPE_DE_CORRIDA_MS,
  });

  const faltantes: string[] = [];
  atendidos.forEach((resultado, i) => {
    const persona = listos[i];
    if (resultado === "no_empezado") {
      faltantes.push(persona.correo);
      resultados.push({ correo: persona.correo, ok: false, detalle: "sin tiempo en esta corrida" });
      return;
    }
    const detalle =
      resultado.estado === "ok"
        ? resultado.valor
        : { ok: false, detalle: resultado.error instanceof Error ? resultado.error.message : "falló" };
    if (!detalle.ok) faltantes.push(persona.correo);
    resultados.push({ correo: persona.correo, ...detalle });
  });

  // El compromiso, verificado y dicho en el log.
  //
  // Que quede gente sin resumen ANTES de las 9 es normal: el próximo intento la
  // toma. Que quede DESPUÉS de las 9 es la promesa incumplida, y tiene que gritar en
  // el log en vez de esconderse en un JSON que nadie lee.
  const aTiempo = hora < HORA_COMPROMISO_CHILE;
  if (faltantes.length > 0) {
    const mensaje =
      `[cron resumen-diario] ${faltantes.length} sin resumen a las ${hora}:00 de Chile: ` +
      faltantes.join(", ");
    if (aTiempo) console.warn(`${mensaje} — los toma el próximo intento`);
    else console.error(`${mensaje} — YA PASÓ LA HORA DEL COMPROMISO (${HORA_COMPROMISO_CHILE}:00)`);
  }

  return NextResponse.json({
    ok: resultados.every((r) => r.ok),
    fecha: hoy.iso,
    destinatarios: listos.length,
    // Cuánto tardó y quién quedó: es lo que hay que mirar cuando alguien dice que su
    // resumen no llegó.
    segundos: Math.round((Date.now() - arranque) / 1000),
    faltantes,
    dentroDelCompromiso: faltantes.length === 0 || aTiempo,
    resultados,
    // Gente con la app asignada que no recibe nada porque nunca inició sesión
    // desde que existe el guardado de credenciales. Va en la respuesta para que
    // se vea en el log del cron y no haya que ir a preguntarle a la base.
    sinCredencial,
  });
}
