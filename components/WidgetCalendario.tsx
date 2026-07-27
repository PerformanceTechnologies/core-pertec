import { IconCalendarEvent, IconPlugConnected } from "@tabler/icons-react";
import { auth } from "@/auth";
import { obtenerReunionesDelMes, hoyEnSantiago } from "@/lib/graph-calendario";
import CalendarioMensual from "@/components/CalendarioMensual";

export default async function WidgetCalendario() {
  const sesion = await auth();
  const hoy = hoyEnSantiago();
  const resultado = await obtenerReunionesDelMes(sesion?.accessToken, hoy.anio, hoy.mes);

  if (resultado.estado === "ok") {
    return (
      <CalendarioMensual anio={hoy.anio} mes={hoy.mes} hoyISO={hoy.iso} eventosPorDia={resultado.eventosPorDia} />
    );
  }

  return (
    <div className="max-w-sm rounded-xl border border-borde bg-white p-4">
      <div className="flex items-center gap-2 text-tinta/70">
        <IconCalendarEvent size={16} stroke={1.75} />
        <span className="text-xs font-semibold uppercase tracking-wide">Tu calendario</span>
      </div>

      {resultado.estado === "sin_permiso" && (
        <div className="mt-3 flex items-start gap-2.5 text-sm text-tinta/60">
          <IconPlugConnected size={16} stroke={1.75} className="mt-0.5 shrink-0 text-tinta/40" />
          <p>
            Conecta tu calendario de Microsoft 365 para verlo aquí. Cierra sesión y vuelve a entrar
            para autorizarlo.
          </p>
        </div>
      )}

      {resultado.estado === "error" && (
        <p className="mt-3 text-sm text-tinta/50">No se pudo cargar tu calendario en este momento.</p>
      )}
    </div>
  );
}
