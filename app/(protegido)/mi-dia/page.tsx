import { auth } from "@/auth";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { obtenerResumenDeHoy } from "@/lib/resumen-diario/datos";
import type { Urgencia } from "@/lib/resumen-diario/tipos";
import BotonEnviar from "@/components/BotonEnviar";
import { regenerarResumenAction } from "./acciones";

const SLUG_APP = "mi-dia";

export const dynamic = "force-dynamic";

const PUNTO_URGENCIA: Record<Urgencia, string> = {
  alta: "bg-naranjo",
  media: "bg-gris",
  baja: "bg-gris-suave",
};

const ETIQUETA_URGENCIA: Record<Urgencia, string> = {
  alta: "Urgente",
  media: "Puede esperar",
  baja: "Cuando puedas",
};

function fechaLarga(iso: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(new Date(`${iso}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// La hora de una reunión: el ISO ya viene en hora de Chile (Graph lo convierte
// por el header Prefer), así que se recorta en vez de reinterpretarlo como Date
// — construir un Date acá lo movería según la zona del servidor, que en
// producción es UTC.
function horaDeReunion(iso: string): string {
  return iso.slice(11, 16);
}

// La hora de "generado a las": ese timestamp SÍ es UTC (sale de toISOString()),
// así que hay que convertirlo. Recortarlo como el de arriba mostraría la hora de
// Greenwich, tres o cuatro horas adelantada.
function horaChile(isoUtc: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  }).format(new Date(isoUtc));
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tinta/40">{titulo}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-borde px-4 py-5 text-sm text-tinta/45">{children}</p>
  );
}

export default async function MiDiaPage() {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const sesion = await auth();
  const hoy = hoyEnSantiago();

  const estado = await obtenerResumenDeHoy({
    usuarioId: usuario.id,
    nombre: usuario.nombre ?? usuario.correo,
    // Con sesión abierta se usa el token que ya está en la mano: evita un canje
    // contra Entra en cada visita.
    accessTokenSesion: sesion?.accessToken,
  });

  return (
    <div>
      <span className="etiqueta-seccion">Mi día</span>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase text-tinta">{fechaLarga(hoy.iso)}</h1>
          <p className="mt-1 text-sm text-tinta/60">
            Tu correo de las últimas 24 horas y tus reuniones de hoy y mañana, resumidos.
          </p>
        </div>
        {estado.estado === "ok" && (
          <form action={regenerarResumenAction}>
            <BotonEnviar
              cargando="Actualizando..."
              className="h-9 rounded-lg border border-borde bg-superficie px-3 text-xs font-semibold uppercase tracking-wide text-tinta/70 transition hover:border-naranjo/50 hover:text-naranjo"
            >
              Actualizar
            </BotonEnviar>
          </form>
        )}
      </div>

      {estado.estado === "sin_permiso" && (
        <div className="mt-6 rounded-xl border border-naranjo/25 bg-naranjo/5 px-5 py-4">
          <p className="font-condensed text-base font-bold uppercase tracking-wide text-naranjo">
            Falta conectar tu correo
          </p>
          <p className="mt-1 text-sm text-tinta/70">
            El core todavía no tiene permiso para leer tu buzón. Cerrá sesión y volvé a entrar: Microsoft te
            va a pedir el permiso de correo. Si no aparece, es que falta el consentimiento del administrador
            del tenant para <code className="font-mono text-xs">Mail.Read</code>.
          </p>
        </div>
      )}

      {estado.estado === "error" && (
        <div className="mt-6 rounded-xl border border-red-600/25 bg-red-600/5 px-5 py-4">
          <p className="font-condensed text-base font-bold uppercase tracking-wide text-red-600">
            No se pudo armar el resumen
          </p>
          <p className="mt-1 text-sm text-tinta/70">{estado.motivo}</p>
        </div>
      )}

      {estado.estado === "ok" && (
        <>
          {/* Panorama y prioridades juntos en la banda oscura: es lo único que
              alguien lee si está apurado, así que va primero y con el contraste
              más alto de la página. */}
          <div className="mt-6 overflow-hidden rounded-2xl bg-tinta">
            <p className="px-6 pt-5 text-[15px] leading-relaxed text-crema/85">
              {estado.datos.resumen.panorama}
            </p>
            <ol className="mt-4 border-t border-crema/10">
              {estado.datos.resumen.prioridades.map((prioridad, i) => (
                <li
                  key={i}
                  className="flex gap-3 border-b border-crema/10 px-6 py-3 last:border-b-0 text-crema"
                >
                  <span className="font-condensed text-lg font-bold leading-6 text-naranjo-suave">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-6">{prioridad}</span>
                </li>
              ))}
            </ol>
          </div>

          <Seccion titulo="Reuniones">
            {estado.datos.resumen.reuniones.length === 0 ? (
              <Vacio>Sin reuniones hoy ni mañana.</Vacio>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {estado.datos.resumen.reuniones.map((r, i) => (
                  <li
                    key={i}
                    className="flex gap-4 rounded-lg border border-borde bg-superficie px-4 py-3 transition hover:bg-crema/40"
                  >
                    <div className="w-14 shrink-0">
                      <div className="font-condensed text-base font-bold tabular-nums text-tinta">
                        {horaDeReunion(r.inicio)}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-tinta/40">
                        {r.dia === "hoy" ? "Hoy" : "Mañana"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-tinta">{r.asunto}</p>
                      <p className="text-xs text-tinta/50">con {r.con}</p>
                      {r.preparacion && (
                        <p className="mt-1 text-xs text-naranjo">Preparar: {r.preparacion}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion titulo="Esperan algo de vos">
            {estado.datos.resumen.correosDestacados.length === 0 ? (
              <Vacio>Nada en la bandeja está esperando algo de vos. Buen día para avanzar lo tuyo.</Vacio>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {estado.datos.resumen.correosDestacados.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-borde bg-superficie px-4 py-3 transition hover:bg-crema/40"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_URGENCIA[c.urgencia]}`}
                        title={ETIQUETA_URGENCIA[c.urgencia]}
                      />
                      <p className="min-w-0 flex-1 truncate font-medium text-tinta" title={c.asunto}>
                        {c.asunto}
                      </p>
                      <span className="shrink-0 text-xs text-tinta/45">{c.de}</span>
                    </div>
                    <p className="mt-1 pl-4 text-sm text-tinta/70">{c.queEsperan}</p>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion titulo="Prometiste y sigue abierto">
            {estado.datos.resumen.compromisos.length === 0 ? (
              <Vacio>Sin compromisos propios abiertos en el correo de las últimas 24 horas.</Vacio>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {estado.datos.resumen.compromisos.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-4 rounded-lg border border-borde bg-superficie px-4 py-3"
                  >
                    <span className="text-sm text-tinta">{c.compromiso}</span>
                    <span className="shrink-0 text-xs text-tinta/45">{c.aQuien}</span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <p className="mt-6 text-[11px] text-tinta/35">
            Generado a las {horaChile(estado.datos.generadoEn)} · Es un resumen, no un reemplazo: revisá la
            bandeja antes de decidir algo importante.
            {estado.datos.enviadoEn && " · Ya te llegó por correo esta mañana."}
          </p>
        </>
      )}
    </div>
  );
}
