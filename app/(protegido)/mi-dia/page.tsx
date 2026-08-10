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

/**
 * Encabezado de sección con el mismo tratamiento que el resto del core
 * (font-condensed en mayúsculas), no la etiqueta chica de 10px que tenía antes.
 * El contador al lado evita tener que contar las filas con la vista.
 */
function Seccion({
  titulo,
  cuenta,
  children,
}: {
  titulo: string;
  cuenta?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2">
        <h2 className="font-condensed text-lg font-bold uppercase tracking-wide text-tinta">{titulo}</h2>
        {cuenta !== undefined && cuenta > 0 && (
          <span className="rounded-full bg-tinta/5 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-tinta/45">
            {cuenta}
          </span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-borde px-4 py-6 text-center text-sm text-tinta/45">
      {children}
    </p>
  );
}

/** La tarjeta de una fila. Un solo lugar para el borde, el fondo y el hover. */
function Tarjeta({ children, tenue = false }: { children: React.ReactNode; tenue?: boolean }) {
  return (
    <li
      className={
        tenue
          ? "rounded-xl border border-dashed border-borde px-4 py-3"
          : "rounded-xl border border-borde bg-superficie px-4 py-3 shadow-sm transition hover:bg-crema/40"
      }
    >
      {children}
    </li>
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
      {/* Los números del período, en la misma cinta de segmentos con tintes
          naranjo / teal / gris que usa Rendir Gastos. Antes era una línea de
          texto suelta que no se leía como parte del módulo. */}
      <dl className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-borde sm:grid-cols-4">
        <div className="border-b border-borde bg-naranjo/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Correos</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums text-tinta">
            {r.conteos.total}
          </dd>
          <dd className="text-[11px] text-tinta/45">últimas {r.conteos.horas} horas</dd>
        </div>
        <div className="border-b border-borde bg-naranjo/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Sin leer</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums text-naranjo">
            {r.conteos.sinLeer}
          </dd>
          <dd className="text-[11px] text-tinta/45">
            {r.conteos.marcados > 0 ? `${r.conteos.marcados} con bandera` : "sin banderas"}
          </dd>
        </div>
        <div className="border-borde bg-teal/[0.06] px-5 py-4 sm:border-r">
          <dt className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Para vos</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums text-teal">{r.conteos.aMi}</dd>
          <dd className="text-[11px] text-tinta/45">{r.conteos.enCopia} en copia</dd>
        </div>
        <div className="bg-gris/[0.08] px-5 py-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Reuniones</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums text-tinta">
            {r.reunionesTotales}
          </dd>
          <dd className="text-[11px] text-tinta/45">hoy y los próximos días</dd>
        </div>
      </dl>

      {r.conteos.recortado && (
        <p className="mt-2 text-[11px] text-naranjo">
          Se llegó al tope de mensajes: hay correo más viejo que no se analizó.
        </p>
      )}

      {/* El panorama y las tres prioridades, en la tarjeta naranjo del core en
          vez de la banda oscura. Sigue siendo lo más destacado de la página
          —es lo único que alguien lee si está apurado— pero ahora con la misma
          paleta que el Cotizador y Rendir Gastos. */}
      <div className="mt-6 overflow-hidden rounded-xl border border-naranjo/20 bg-naranjo/[0.06]">
        <p className="px-5 pt-5 text-[15px] leading-relaxed text-tinta">{r.panorama}</p>
        <ol className="mt-4">
          {r.prioridades.map((prioridad, i) => (
            <li
              key={i}
              className="flex gap-3 border-t border-naranjo/15 px-5 py-3 text-sm leading-6 text-tinta"
            >
              <span className="font-condensed text-lg font-bold leading-6 text-naranjo">{i + 1}</span>
              <span>{prioridad}</span>
            </li>
          ))}
        </ol>
      </div>

      <Seccion titulo="Reuniones" cuenta={r.reuniones.length}>
        {r.reuniones.length === 0 ? (
          <Vacio>Sin reuniones agendadas en los próximos días.</Vacio>
        ) : (
          <ul className="flex flex-col gap-2">
            {/* El nombre del item NO puede ser `r`: taparía al resumen y el
                próximo que agregue un campo acá se lleva una sorpresa. */}
            {r.reuniones.map((m, i) => (
              <Tarjeta key={i}>
                <div className="flex gap-4">
                  {/* La hora en su propia columna de ancho fijo: alineadas una
                      debajo de otra se leen como una agenda. */}
                  <div className="w-16 shrink-0 border-r border-borde pr-3">
                    <div className="font-condensed text-lg font-bold tabular-nums leading-none text-tinta">
                      {horaDeReunion(m.inicio)}
                    </div>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-tinta/40">
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
                    <p className="mt-0.5 text-xs text-tinta/50">con {m.con}</p>
                    {m.preparacion && (
                      <p className="mt-1.5 rounded-md bg-naranjo/[0.07] px-2 py-1 text-xs text-naranjo">
                        Preparar: {m.preparacion}
                      </p>
                    )}
                  </div>
                </div>
              </Tarjeta>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Esperan algo de vos" cuenta={r.correosDestacados.length}>
        {r.correosDestacados.length === 0 ? (
          <Vacio>Nada en el correo está esperando algo de vos. Buen día para avanzar lo tuyo.</Vacio>
        ) : (
          <ul className="flex flex-col gap-2">
            {r.correosDestacados.map((c, i) => (
              <Tarjeta key={i}>
                <div className="flex items-start gap-3">
                  {/* El punto de urgencia arriba y alineado con la primera línea,
                      no centrado: con dos líneas de texto quedaba flotando. */}
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO_URGENCIA[c.urgencia]}`}
                    title={ETIQUETA_URGENCIA[c.urgencia]}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="min-w-0 flex-1 truncate font-medium text-tinta" title={c.asunto}>
                        {c.asunto}
                      </p>
                      {ETIQUETA_DIRIGIDO[c.dirigido] && (
                        <span className="shrink-0 rounded-full bg-gris/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gris">
                          {ETIQUETA_DIRIGIDO[c.dirigido]}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-tinta/70">{c.queEsperan}</p>
                    <p className="mt-1 text-[11px] text-tinta/35">
                      {c.de} · {c.cuando}
                    </p>
                  </div>
                </div>
              </Tarjeta>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Prometiste y sigue abierto" cuenta={r.compromisos.length}>
        {r.compromisos.length === 0 ? (
          <Vacio>Sin compromisos propios abiertos en el correo del período.</Vacio>
        ) : (
          <ul className="flex flex-col gap-2">
            {r.compromisos.map((c, i) => (
              <Tarjeta key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm text-tinta">{c.compromiso}</span>
                  <span className="shrink-0 text-xs text-tinta/45">
                    {c.aQuien}
                    {c.desde && <span className="text-tinta/30"> · {c.desde}</span>}
                  </span>
                </div>
              </Tarjeta>
            ))}
          </ul>
        )}
      </Seccion>

      {/* Las dos informativas van en dos columnas: son cortas, y apiladas
          alargaban la página sin necesidad. Cada una desaparece si está vacía —
          una sección vacía más sería ruido. */}
      {(r.temas.length > 0 || r.enCopia.length > 0) && (
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          {r.temas.length > 0 && (
            <Seccion titulo="En qué quedaron los temas" cuenta={r.temas.length}>
              <ul className="flex flex-col gap-2">
                {r.temas.map((t, i) => (
                  <Tarjeta key={i}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium text-tinta">{t.tema}</p>
                      <span className="shrink-0 text-[11px] tabular-nums text-tinta/40">
                        {t.correos} correos
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-tinta/70">{t.estado}</p>
                  </Tarjeta>
                ))}
              </ul>
            </Seccion>
          )}

          {r.enCopia.length > 0 && (
            <Seccion titulo="Para saber, sin acción" cuenta={r.enCopia.length}>
              <ul className="flex flex-col gap-2">
                {r.enCopia.map((c, i) => (
                  <Tarjeta key={i} tenue>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-tinta/80" title={c.asunto}>
                        {c.asunto}
                      </p>
                      <span className="shrink-0 text-xs text-tinta/40">{c.de}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-tinta/60">{c.porQueImporta}</p>
                  </Tarjeta>
                ))}
              </ul>
            </Seccion>
          )}
        </div>
      )}

      <p className="mt-8 border-t border-borde pt-4 text-[11px] text-tinta/35">
        Generado a las {horaChile(datos.generadoEn)} · Es un resumen, no un reemplazo: revisá la bandeja antes
        de decidir algo importante.
        {datos.enviadoEn && " · Ya te llegó por correo esta mañana."}
      </p>
    </>
  );
}
