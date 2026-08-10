import { auth } from "@/auth";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { obtenerResumenDeHoy } from "@/lib/resumen-diario/datos";
import { tieneCredencialGuardada } from "@/lib/graph-credenciales";
import type { ResumenGuardado, Urgencia } from "@/lib/resumen-diario/tipos";
import type { Dirigido } from "@/lib/graph-correo";

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

// A quién iba dirigido. Se muestra solo cuando NO es "a mí": lo normal es que un
// correo que espera algo esté dirigido a la persona, así que marcar cada uno con
// "para vos" sería ruido; lo que informa es la excepción.
const ETIQUETA_DIA: Record<string, string | null> = {
  hoy: "Hoy",
  manana: "Mañana",
  // "despues" no tiene etiqueta fija: se muestra la fecha, que informa más que
  // la palabra "después".
  despues: null,
};

const ETIQUETA_DIRIGIDO: Record<Dirigido, string | null> = {
  a_mi: null,
  en_copia: "En copia",
  lista: "Lista",
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

// "12 ago" para las reuniones que no son hoy ni mañana.
function fechaCorta(isoLocal: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${isoLocal.slice(0, 10)}T12:00:00Z`),
  );
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

  // El resumen y la credencial son independientes: van en paralelo.
  const [estado, credencialGuardada] = await Promise.all([
    obtenerResumenDeHoy({
      usuarioId: usuario.id,
      nombre: usuario.nombre ?? usuario.correo,
      correo: usuario.correo,
      // Con sesión abierta se usa el token que ya está en la mano: evita un canje
      // contra Entra en cada visita.
      accessTokenSesion: sesion?.accessToken,
    }),
    tieneCredencialGuardada(usuario.id),
  ]);

  return (
    <div>
      <span className="etiqueta-seccion">Mi día</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">{fechaLarga(hoy.iso)}</h1>
      <p className="mt-1 text-sm text-tinta/60">
        Tu correo de los últimos días y tus reuniones de hoy y los próximos, resumidos.
      </p>

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

      {/* El dashboard puede funcionar perfecto con el token de la sesión y aun
          así no haber credencial guardada, y en ese caso el correo de la mañana
          NO se manda. Sin este aviso eso es invisible hasta que alguien nota que
          nunca le llegó nada. */}
      {estado.estado === "ok" && !credencialGuardada && (
        <div className="mt-4 rounded-lg border border-naranjo/25 bg-naranjo/5 px-4 py-3 text-xs text-naranjo">
          El resumen se ve acá, pero el <strong>envío automático de la mañana no está activo</strong>: no hay
          credencial guardada para tu cuenta. Suele ser que falta{" "}
          <code className="font-mono">TOKEN_CIFRADO_KEY</code> en el entorno, o que no volviste a iniciar
          sesión después de configurarla. En los logs del servidor aparece como{" "}
          <code className="font-mono">[auth] No se pudo guardar el refresh token</code>.
        </div>
      )}

      {estado.estado === "ok" && <ResumenCompleto datos={estado.datos} />}
    </div>
  );
}

// El cuerpo del resumen en su propio componente: la pagina quedaba con cuatro
// niveles de anidacion y "r." repetido en cada linea.
function ResumenCompleto({ datos }: { datos: ResumenGuardado }) {
  const r = datos.resumen;
  return (
    <>
      {/* Panorama y prioridades juntos en la banda oscura: es lo único que
              alguien lee si está apurado, así que va primero y con el contraste
              más alto de la página. */}
      <div className="mt-6 overflow-hidden rounded-2xl bg-tinta">
        <p className="px-6 pt-5 text-[15px] leading-relaxed text-crema/85">{r.panorama}</p>
        <ol className="mt-4 border-t border-crema/10">
          {r.prioridades.map((prioridad, i) => (
            <li key={i} className="flex gap-3 border-b border-crema/10 px-6 py-3 last:border-b-0 text-crema">
              <span className="font-condensed text-lg font-bold leading-6 text-naranjo-suave">{i + 1}</span>
              <span className="text-sm leading-6">{prioridad}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Los números del período, contados por el servidor. Van acá y no en
              el panorama porque son un dato duro y el panorama es interpretación. */}
      <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-tinta/50">
        <div>
          <dt className="inline font-semibold text-tinta/70">{r.conteos.total}</dt>{" "}
          <dd className="inline">correos en {r.conteos.horas} h</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-tinta/70">{r.conteos.aMi}</dt>{" "}
          <dd className="inline">dirigidos a vos</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-tinta/70">{r.conteos.enCopia}</dt>{" "}
          <dd className="inline">en copia</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-naranjo">{r.conteos.sinLeer}</dt>{" "}
          <dd className="inline">sin leer</dd>
        </div>
        {r.conteos.marcados > 0 && (
          <div>
            <dt className="inline font-semibold text-tinta/70">{r.conteos.marcados}</dt>{" "}
            <dd className="inline">con bandera</dd>
          </div>
        )}
        <div>
          <dt className="inline font-semibold text-tinta/70">{r.reunionesTotales}</dt>{" "}
          <dd className="inline">reuniones en el rango</dd>
        </div>
        {r.conteos.recortado && (
          <div className="text-naranjo">
            <dd className="inline">se llegó al tope: hay correo más viejo que no se analizó</dd>
          </div>
        )}
      </dl>

      <Seccion titulo="Reuniones">
        {r.reuniones.length === 0 ? (
          <Vacio>Sin reuniones agendadas en los próximos días.</Vacio>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {/* El nombre del item NO puede ser `r`: taparía al resumen y el
                próximo que agregue un campo acá se lleva una sorpresa. */}
            {r.reuniones.map((m, i) => (
              <li
                key={i}
                className="flex gap-4 rounded-lg border border-borde bg-superficie px-4 py-3 transition hover:bg-crema/40"
              >
                <div className="w-16 shrink-0">
                  <div className="font-condensed text-base font-bold tabular-nums text-tinta">
                    {horaDeReunion(m.inicio)}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-tinta/40">
                    {ETIQUETA_DIA[m.dia] ?? fechaCorta(m.inicio)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-medium text-tinta">{m.asunto}</p>
                    {/* Una reunión metida el mismo día es la que descoloca la
                        jornada: se marca para que se note sin leer el panorama. */}
                    {!m.agendadaAntes && (
                      <span className="rounded-full bg-naranjo/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                        Recién agendada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-tinta/50">con {m.con}</p>
                  {m.preparacion && <p className="mt-1 text-xs text-naranjo">Preparar: {m.preparacion}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Esperan algo de vos">
        {r.correosDestacados.length === 0 ? (
          <Vacio>Nada en el correo está esperando algo de vos. Buen día para avanzar lo tuyo.</Vacio>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {r.correosDestacados.map((c, i) => (
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
                  {ETIQUETA_DIRIGIDO[c.dirigido] && (
                    <span className="shrink-0 rounded-full bg-gris/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gris">
                      {ETIQUETA_DIRIGIDO[c.dirigido]}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-tinta/45">{c.de}</span>
                </div>
                <p className="mt-1 pl-4 text-sm text-tinta/70">{c.queEsperan}</p>
                <p className="pl-4 text-[11px] text-tinta/35">{c.cuando}</p>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* Solo si hay algo: una sección vacía más es ruido, y estas dos son
          informativas, no accionables. */}
      {r.temas.length > 0 && (
        <Seccion titulo="En qué quedaron los temas">
          <ul className="flex flex-col gap-1.5">
            {r.temas.map((t, i) => (
              <li key={i} className="rounded-lg border border-borde bg-superficie px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-tinta">{t.tema}</p>
                  <span className="shrink-0 text-[11px] tabular-nums text-tinta/40">{t.correos} correos</span>
                </div>
                <p className="mt-0.5 text-sm text-tinta/70">{t.estado}</p>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {r.enCopia.length > 0 && (
        <Seccion titulo="Para saber, sin acción">
          <ul className="flex flex-col gap-1.5">
            {r.enCopia.map((c, i) => (
              <li key={i} className="rounded-lg border border-dashed border-borde px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-tinta/80" title={c.asunto}>
                    {c.asunto}
                  </p>
                  <span className="shrink-0 text-xs text-tinta/40">{c.de}</span>
                </div>
                <p className="mt-0.5 text-sm text-tinta/60">{c.porQueImporta}</p>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion titulo="Prometiste y sigue abierto">
        {r.compromisos.length === 0 ? (
          <Vacio>Sin compromisos propios abiertos en el correo del período.</Vacio>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {r.compromisos.map((c, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-4 rounded-lg border border-borde bg-superficie px-4 py-3"
              >
                <span className="text-sm text-tinta">{c.compromiso}</span>
                <span className="shrink-0 text-xs text-tinta/45">
                  {c.aQuien}
                  {c.desde && <span className="text-tinta/30"> · {c.desde}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <p className="mt-6 text-[11px] text-tinta/35">
        Generado a las {horaChile(datos.generadoEn)} · Es un resumen, no un reemplazo: revisá la bandeja antes
        de decidir algo importante.
        {datos.enviadoEn && " · Ya te llegó por correo esta mañana."}
      </p>
    </>
  );
}
