import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { urlSegura } from "./graph-correo";

// Mismo tenant que el resto de la app (RUTs/SII/CLP): todas las fechas que
// devuelve Graph se piden ya convertidas a esta zona horaria via el header
// Prefer, para no tener que convertir a mano en los componentes.
const ZONA_HORARIA = "America/Santiago";
const TOPE_EVENTOS = 250;

export interface ReunionCalendario {
  id: string;
  asunto: string;
  inicio: string;
  fin: string;
  todoElDia: boolean;
  ubicacion: string | null;
  enlaceTeams: string | null;
  // Solo los llena obtenerReunionesProximas, que es la que los pide a Graph: el
  // widget del calendario del dashboard no los necesita y traerlos para 250
  // eventos del mes seria peso al vacio.
  organizador?: string | null;
  asistentes?: string[];
  /**
   * Cuándo se creó la cita, no cuándo ocurre.
   *
   * Sirve para separar "esto lo agendaron hace dos semanas" de "esto lo metieron
   * anoche": lo segundo suele ser lo que descoloca el día y merece aparecer
   * destacado en el resumen.
   */
  creadaEn?: string | null;
  /** true si se agendó ANTES del día en que ocurre. Lo calcula el servidor. */
  agendadaAntes?: boolean;
  /** URL para abrir la cita en Outlook Web (webLink de Graph, ya validada). */
  enlace?: string | null;
}

// "Hoy" en hora de Chile, calculado sin depender de la zona horaria del
// servidor (que en producción suele ser UTC): usar el reloj local del
// proceso para decidir el mes/día de hoy correría el resultado varias horas
// cerca de la medianoche.
export function hoyEnSantiago(): { anio: number; mes: number; dia: number; iso: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const anio = valor("year");
  const mes = valor("month");
  const dia = valor("day");
  return { anio, mes, dia, iso: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` };
}

// La hora (0-23) que es ahora en Chile. La usa el cron del resumen diario para
// descartar el disparo que cae demasiado temprano: los crons de Vercel corren en
// UTC fijo y Chile cambia de huso dos veces al ano, asi que una sola hora UTC no
// puede ser "las 7:30" todo el ano.
export function horaEnSantiago(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA_HORARIA,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

export type ResultadoCalendarioMes =
  | { estado: "ok"; eventosPorDia: Record<string, ReunionCalendario[]> }
  | { estado: "sin_permiso" }
  | { estado: "error" };

interface EventoGraph {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string };
}

// Trae todas las reuniones de un mes, agrupadas por día ("YYYY-MM-DD").
// Se pide con 1 día de margen a cada lado y se filtra después por la fecha
// LOCAL que devuelve Graph (gracias al header Prefer de arriba): así no
// depende de la zona horaria del servidor para calcular dónde empieza y
// termina el mes en hora de Chile (los server components de Next suelen
// correr en UTC en producción).
export async function obtenerReunionesDelMes(
  accessToken: string | undefined,
  anio: number,
  mes: number, // 1-12
): Promise<ResultadoCalendarioMes> {
  if (!accessToken) return { estado: "sin_permiso" };

  try {
    const inicioUTC = new Date(Date.UTC(anio, mes - 1, 1));
    inicioUTC.setUTCDate(inicioUTC.getUTCDate() - 1);
    const finUTC = new Date(Date.UTC(anio, mes, 1));
    finUTC.setUTCDate(finUTC.getUTCDate() + 1);

    const cliente = Client.init({ authProvider: (done) => done(null, accessToken) });

    const respuesta = await cliente
      .api("/me/calendarView")
      .header("Prefer", `outlook.timezone="${ZONA_HORARIA}"`)
      .query({ startDateTime: inicioUTC.toISOString(), endDateTime: finUTC.toISOString() })
      .select("subject,start,end,location,onlineMeeting,isAllDay")
      .orderby("start/dateTime")
      .top(TOPE_EVENTOS)
      .get();

    const prefijoMes = `${anio}-${String(mes).padStart(2, "0")}`;
    const eventos: EventoGraph[] = respuesta.value ?? [];
    const eventosPorDia: Record<string, ReunionCalendario[]> = {};

    eventos
      .filter((evento) => evento.start?.dateTime && evento.end?.dateTime)
      .forEach((evento) => {
        const inicio = evento.start!.dateTime!;
        const fecha = inicio.slice(0, 10);
        if (!fecha.startsWith(prefijoMes)) return; // bleed del margen de 1 día

        const reunion: ReunionCalendario = {
          id: evento.id,
          asunto: evento.subject?.trim() || "(Sin título)",
          inicio,
          fin: evento.end!.dateTime!,
          todoElDia: Boolean(evento.isAllDay),
          ubicacion: evento.location?.displayName?.trim() || null,
          enlaceTeams: evento.onlineMeeting?.joinUrl ?? null,
        };

        (eventosPorDia[fecha] ??= []).push(reunion);
      });

    return { estado: "ok", eventosPorDia };
  } catch (error) {
    // 401/403 tipico cuando el usuario no dio el permiso de Calendario o el
    // tenant aun no lo tiene consentido -- se trata igual que "sin_permiso"
    // (invita a reconectar) en vez de mostrar un error crudo.
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 401 || status === 403) return { estado: "sin_permiso" };

    console.error("No fue posible obtener el calendario de Microsoft", error);
    return { estado: "error" };
  }
}

export type ResultadoReunionesRango =
  { estado: "ok"; reuniones: ReunionCalendario[] } | { estado: "sin_permiso" } | { estado: "error" };

/**
 * Las reuniones desde el arranque de HOY en Chile y por los próximos N días.
 *
 * Separada de obtenerReunionesDelMes porque el resumen diario necesita otra
 * cosa: una lista plana y ordenada de "lo que viene", no una grilla por día para
 * pintar un calendario. Reusar la del mes obligaba a reconstruir el rango a mano
 * en el llamador cuando hoy cae fin de mes, y ahí es fácil perder el día 1.
 *
 * Incluye asistentes, que el widget del calendario no necesita: el resumen tiene
 * que poder decir con quién es cada reunión.
 */
export async function obtenerReunionesProximas(
  accessToken: string | undefined,
  dias = 2,
): Promise<ResultadoReunionesRango> {
  if (!accessToken) return { estado: "sin_permiso" };

  try {
    const hoy = hoyEnSantiago();
    // El rango se arma sobre la fecha LOCAL de Chile y se le pide a Graph en esa
    // misma zona (header Prefer): así "hoy" empieza a las 00:00 de Santiago y no
    // a las 00:00 UTC, que en Chile son las 20:00 o 21:00 del día anterior.
    const inicio = `${hoy.iso}T00:00:00`;
    const fin = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + dias, 23, 59, 0))
      .toISOString()
      .slice(0, 19);

    const cliente = Client.init({ authProvider: (done) => done(null, accessToken) });

    const respuesta = await cliente
      .api("/me/calendarView")
      .header("Prefer", `outlook.timezone="${ZONA_HORARIA}"`)
      .query({ startDateTime: inicio, endDateTime: fin })
      .select("subject,start,end,location,onlineMeeting,isAllDay,attendees,organizer,createdDateTime,webLink")
      .orderby("start/dateTime")
      .top(TOPE_EVENTOS)
      .get();

    const eventos: (EventoGraph & {
      attendees?: { emailAddress?: { name?: string; address?: string } }[];
      organizer?: { emailAddress?: { name?: string } };
      createdDateTime?: string;
      webLink?: string;
    })[] = respuesta.value ?? [];

    const reuniones = eventos
      .filter((evento) => evento.start?.dateTime && evento.end?.dateTime)
      .map((evento) => ({
        id: evento.id,
        asunto: evento.subject?.trim() || "(Sin título)",
        inicio: evento.start!.dateTime!,
        fin: evento.end!.dateTime!,
        todoElDia: Boolean(evento.isAllDay),
        ubicacion: evento.location?.displayName?.trim() || null,
        enlaceTeams: evento.onlineMeeting?.joinUrl ?? null,
        organizador: evento.organizer?.emailAddress?.name?.trim() || null,
        asistentes: (evento.attendees ?? [])
          .map((a) => a.emailAddress?.name?.trim() || a.emailAddress?.address || "")
          .filter(Boolean),
        creadaEn: evento.createdDateTime ?? null,
        enlace: urlSegura(evento.webLink),
        // createdDateTime viene en UTC (no lo toca el header Prefer, que solo
        // aplica a start/end), y el inicio ya viene en hora de Chile. Comparar
        // los dos como fecha suelta serviria salvo cerca de la medianoche, asi
        // que se compara el dia local de cada uno.
        agendadaAntes: evento.createdDateTime
          ? new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(
              new Date(evento.createdDateTime),
            ) < evento.start!.dateTime!.slice(0, 10)
          : false,
      }));

    return { estado: "ok", reuniones };
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 401 || status === 403) return { estado: "sin_permiso" };
    console.error("No fue posible obtener las reuniones próximas de Microsoft", error);
    return { estado: "error" };
  }
}
