import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";

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
  mes: number // 1-12
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
