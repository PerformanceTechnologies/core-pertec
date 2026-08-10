import { auth } from "@/auth";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { obtenerResumenDeHoy } from "@/lib/resumen-diario/datos";
import { tieneCredencialGuardada } from "@/lib/graph-credenciales";
import type { ResumenGuardado, Urgencia } from "@/lib/resumen-diario/tipos";
import type { Dirigido } from "@/lib/graph-correo";

const SLUG_APP = "mi-dia";

export const dynamic = "force-dynamic";

/**
 * Sombra cálida, no negra.
 *
 * La paleta del core es cálida (crema #faf8f5 sobre tinta #171411) y una sombra
 * de negro puro al 10% encima de ese crema se ve gris sucio. Tintada con el
 * mismo tinta queda como una sombra de verdad. Dos capas: una de contacto de 1px
 * y una difusa y alta, que es lo que da la sensación de una sola fuente de luz.
 */
const SOMBRA = "shadow-[0_1px_2px_rgba(23,20,17,0.04),0_10px_28px_-14px_rgba(23,20,17,0.12)]";

/**
 * La urgencia, como barra en el borde izquierdo.
 *
 * Antes eran tres puntos de color, pero `media` (gris #8c8578) y `baja`
 * (gris-suave #b8b2a4) son prácticamente el mismo gris a 10px: la distinción no
 * se veía y el único indicio era un `title`, que nadie descubre. Ahora "alta"
 * lleva barra naranja y además dice la palabra; las otras dos no llevan barra,
 * porque su diferencia real no justifica un color propio.
 */
const BARRA_URGENCIA: Record<Urgencia, string> = {
  alta: "border-l-[3px] border-l-naranjo",
  media: "border-l-[3px] border-l-gris/40",
  baja: "",
};

const ETIQUETA_URGENCIA: Record<Urgencia, string | null> = {
  alta: "Urgente",
  media: null,
  baja: null,
};

const ETIQUETA_DIA: Record<string, string | null> = {
  hoy: "Hoy",
  manana: "Mañana",
  // "despues" no tiene etiqueta fija: se muestra la fecha, que informa más que
  // la palabra "después".
  despues: null,
};

// A quién iba dirigido. Se muestra solo cuando NO es "a mí": lo normal es que un
// correo que espera algo esté dirigido a la persona, así que marcar cada uno con
// "dirigido a ti" sería ruido; lo que informa es la excepción.
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
 * Encabezado de sección.
 *
 * En condensed y con peso, pero SIN mayúsculas. La página tenía cinco niveles de
 * texto en caja alta apilados —la etiqueta del módulo, el título, los títulos de
 * sección, los rótulos de la cinta y los badges— y cuando todo grita igual la
 * jerarquía se aplana. Las mayúsculas quedan reservadas para los dos extremos:
 * la etiqueta del módulo arriba y los badges de 10px.
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
    <section className="mt-8 first:mt-0">
      <div className="flex items-baseline gap-2 border-b border-borde pb-2">
        <h2 className="font-condensed text-xl font-bold tracking-tight text-tinta">{titulo}</h2>
        {cuenta !== undefined && cuenta > 0 && (
          <span className="font-condensed text-xl font-bold tabular-nums text-tinta/25">{cuenta}</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-borde px-4 py-6 text-center text-sm text-pretty text-tinta/45">
      {children}
    </p>
  );
}

/**
 * La fila de una lista, opcionalmente enlazada a Outlook.
 *
 * Radio menor que el de los contenedores (`rounded-lg` contra `rounded-2xl`): el
 * radio uniforme en todo hacía que las filas y la caja que las agrupa se leyeran
 * como el mismo nivel.
 *
 * Con `enlace` la fila entera es clickeable y abre el correo o la cita en Outlook
 * Web, y ahí el realce al pasar el mouse es honesto. Sin `enlace` —porque el
 * modelo no pudo ubicar el mensaje— la fila se ve igual pero sin cursor de mano
 * ni realce: prometer una navegación que no existe es peor que no ofrecerla.
 */
function Fila({
  children,
  enlace,
  titulo,
  acento = "",
  tenue = false,
}: {
  children: React.ReactNode;
  enlace?: string | null;
  /** Para el title del enlace: "Abrir en Outlook: <asunto>". */
  titulo?: string;
  acento?: string;
  tenue?: boolean;
}) {
  const base = `block rounded-lg border px-4 py-3 transition-colors duration-200 ${acento} ${
    tenue ? "border-dashed border-borde bg-transparent" : `border-borde bg-superficie ${SOMBRA}`
  }`;

  if (!enlace) return <li className={base}>{children}</li>;

  return (
    <li>
      <a
        href={enlace}
        // Se abre en otra pestaña porque el resumen es una lista de la que se van
        // atendiendo cosas: reemplazar la página obligaría a volver y recargarla.
        // noreferrer además de noopener: sin él, Outlook recibiría la URL del core
        // como referente.
        target="_blank"
        rel="noopener noreferrer"
        title={titulo ? `Abrir en Outlook: ${titulo}` : "Abrir en Outlook"}
        className={`${base} ${
          tenue ? "hover:bg-crema/50" : "hover:border-naranjo/40 hover:bg-crema/40"
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo`}
      >
        {children}
      </a>
    </li>
  );
}

/** Badge chico. Es el único lugar donde las mayúsculas siguen teniendo sentido. */
function Badge({ tono, children }: { tono: "naranjo" | "gris"; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
        tono === "naranjo" ? "bg-naranjo/10 text-naranjo" : "bg-gris/10 text-gris"
      }`}
    >
      {children}
    </span>
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
    // El <main> del core no tiene tope de ancho, así que en un monitor de 1900px
    // la prosa de este módulo se estiraba a todo lo largo. Esta página es de
    // lectura, no una tabla: necesita un límite.
    <div className="max-w-[1500px]">
      <header>
        <span className="etiqueta-seccion">Mi día</span>
        {/* El título es la fecha y es lo que ubica todo lo demás: merece tamaño
            de display y tracking cerrado, no el text-2xl de un subtítulo. */}
        <h1 className="mt-2 font-condensed text-4xl font-bold leading-none tracking-tight text-tinta sm:text-5xl">
          {fechaLarga(hoy.iso)}
        </h1>
        <p className="mt-3 max-w-[62ch] text-[15px] text-pretty text-tinta/60">
          Resumen de tu correo de los últimos días y de las reuniones de hoy y los próximos. Cada fila abre el
          mensaje o la cita en Outlook.
        </p>
      </header>

      {estado.estado === "sin_permiso" && (
        <div className="mt-6 rounded-2xl border border-naranjo/25 bg-naranjo/5 px-5 py-4">
          <p className="font-condensed text-lg font-bold tracking-tight text-naranjo">
            Falta conectar tu correo
          </p>
          <p className="mt-1 max-w-[70ch] text-sm text-pretty text-tinta/70">
            El core todavía no tiene permiso para leer tu buzón. Cierra sesión y vuelve a entrar: Microsoft
            solicitará el permiso de correo. Si no aparece, es que falta el consentimiento del administrador
            del tenant para <code className="font-mono text-xs">Mail.Read</code>.
          </p>
        </div>
      )}

      {estado.estado === "error" && (
        <div className="mt-6 rounded-2xl border border-red-600/25 bg-red-600/5 px-5 py-4">
          <p className="font-condensed text-lg font-bold tracking-tight text-red-600">
            No se pudo armar el resumen
          </p>
          <p className="mt-1 max-w-[70ch] text-sm text-pretty text-tinta/70">{estado.motivo}</p>
        </div>
      )}

      {/* El dashboard puede funcionar perfecto con el token de la sesión y aun
          así no haber credencial guardada, y en ese caso el correo de la mañana
          NO se manda. Sin este aviso eso es invisible hasta que alguien nota que
          nunca le llegó nada. */}
      {estado.estado === "ok" && !credencialGuardada && (
        <p className="mt-6 max-w-[80ch] rounded-lg border-l-[3px] border-naranjo bg-naranjo/[0.06] px-4 py-3 text-xs text-pretty text-naranjo">
          El resumen se muestra aquí, pero el <strong>envío automático de la mañana no está activo</strong>:
          no hay credencial guardada para tu cuenta. Suele ser que falta{" "}
          <code className="font-mono">TOKEN_CIFRADO_KEY</code> en el entorno, o que no se ha vuelto a iniciar
          sesión después de configurarla. En los logs del servidor aparece como{" "}
          <code className="font-mono">[auth] No se pudo guardar el refresh token</code>.
        </p>
      )}

      {estado.estado === "ok" && <ResumenCompleto datos={estado.datos} />}
    </div>
  );
}

function ResumenCompleto({ datos }: { datos: ResumenGuardado }) {
  const r = datos.resumen;

  return (
    <>
      {/* Los números del período. Se mantiene la cinta de cuatro segmentos con
          los tintes del Cotizador y Rendir Gastos —es la convención de la casa—
          pero los rótulos van en caja normal: en mayúsculas competían con el
          título de la página y con los de sección. */}
      <dl className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-borde sm:grid-cols-4">
        <Cifra etiqueta="Correos" valor={r.conteos.total} pie={`últimas ${r.conteos.horas} horas`} />
        <Cifra
          etiqueta="Sin leer"
          valor={r.conteos.sinLeer}
          pie={r.conteos.marcados > 0 ? `${r.conteos.marcados} con bandera` : "sin banderas"}
          resalte="naranjo"
        />
        <Cifra
          etiqueta="Dirigidos a ti"
          valor={r.conteos.aMi}
          pie={`${r.conteos.enCopia} en copia`}
          fondo="teal"
          resalte="teal"
        />
        <Cifra
          etiqueta="Reuniones"
          valor={r.reunionesTotales}
          pie="hoy y los próximos días"
          fondo="gris"
          ultima
        />
      </dl>

      {r.conteos.recortado && (
        <p className="mt-2 text-[11px] text-tinta/45">
          Se llegó al tope de mensajes: hay correo más viejo que no se analizó.
        </p>
      )}

      {/* Lo primero: panorama y las tres prioridades. Va a todo el ancho y antes
          de las dos columnas porque es lo único que alguien lee si está apurado. */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-naranjo/25 bg-naranjo/[0.05]">
        <p className="max-w-[75ch] px-6 pt-6 text-base leading-relaxed text-pretty text-tinta">
          {r.panorama}
        </p>
        <ol className="mt-5">
          {r.prioridades.map((prioridad, i) => (
            <li
              key={i}
              className="flex items-baseline gap-4 border-t border-naranjo/15 px-6 py-3.5 text-[15px] leading-6 text-pretty text-tinta"
            >
              {/* El número en condensed y grande, alineado por la línea base con
                  el texto: es un marcador de orden, no una viñeta decorativa. */}
              <span className="w-4 shrink-0 font-condensed text-xl font-bold leading-none tabular-nums text-naranjo">
                {i + 1}
              </span>
              <span>{prioridad}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Dos columnas: a la izquierda lo que requiere una acción, a la derecha la
          agenda y el contexto. Antes era una sola columna de listas apiladas, que
          en un monitor ancho dejaba media pantalla vacía y obligaba a bajar hasta
          el final para ver a qué hora es la primera reunión. */}
      <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <Seccion titulo="Requieren tu respuesta" cuenta={r.correosDestacados.length}>
            {r.correosDestacados.length === 0 ? (
              <Vacio>Ningún correo del período requiere una respuesta tuya.</Vacio>
            ) : (
              <ul className="flex flex-col gap-2">
                {r.correosDestacados.map((c, i) => (
                  <Fila key={i} enlace={c.enlace} titulo={c.asunto} acento={BARRA_URGENCIA[c.urgencia]}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="min-w-0 flex-1 truncate font-medium text-tinta" title={c.asunto}>
                        {c.asunto}
                      </p>
                      {ETIQUETA_URGENCIA[c.urgencia] && (
                        <Badge tono="naranjo">{ETIQUETA_URGENCIA[c.urgencia]}</Badge>
                      )}
                      {ETIQUETA_DIRIGIDO[c.dirigido] && (
                        <Badge tono="gris">{ETIQUETA_DIRIGIDO[c.dirigido]}</Badge>
                      )}
                    </div>
                    <p className="mt-1 max-w-[70ch] text-sm text-pretty text-tinta/70">{c.queEsperan}</p>
                    <p className="mt-1.5 text-[11px] text-tinta/35">
                      {c.de} · {c.cuando}
                    </p>
                  </Fila>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion titulo="Compromisos abiertos" cuenta={r.compromisos.length}>
            {r.compromisos.length === 0 ? (
              <Vacio>Sin compromisos propios pendientes en el correo del período.</Vacio>
            ) : (
              <ul className="flex flex-col gap-2">
                {r.compromisos.map((c, i) => (
                  <Fila key={i}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="max-w-[60ch] text-sm text-pretty text-tinta">{c.compromiso}</span>
                      <span className="shrink-0 text-xs text-tinta/45">
                        {c.aQuien}
                        {c.desde && <span className="text-tinta/30"> · {c.desde}</span>}
                      </span>
                    </div>
                  </Fila>
                ))}
              </ul>
            )}
          </Seccion>

          {r.temas.length > 0 && (
            <Seccion titulo="Estado de los temas" cuenta={r.temas.length}>
              <ul className="flex flex-col gap-2">
                {r.temas.map((t, i) => (
                  <Fila key={i}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium text-tinta">{t.tema}</p>
                      <span className="shrink-0 text-[11px] tabular-nums text-tinta/40">
                        {t.correos} correos
                      </span>
                    </div>
                    <p className="mt-1 max-w-[70ch] text-sm text-pretty text-tinta/70">{t.estado}</p>
                  </Fila>
                ))}
              </ul>
            </Seccion>
          )}
        </div>

        {/* La agenda es material de referencia, no de acción: <aside> es el
            elemento correcto y además lo hace saltable con un lector de pantalla. */}
        <aside>
          <Seccion titulo="Agenda" cuenta={r.reuniones.length}>
            {r.reuniones.length === 0 ? (
              <Vacio>Sin reuniones agendadas en los próximos días.</Vacio>
            ) : (
              <ol className="flex flex-col gap-2">
                {/* El nombre del item NO puede ser `r`: taparía al resumen y el
                    próximo que agregue un campo acá se lleva una sorpresa. */}
                {r.reuniones.map((m, i) => (
                  <Fila key={i} enlace={m.enlace} titulo={m.asunto}>
                    <div className="flex items-baseline gap-3">
                      {/* <time> con dateTime: es un dato horario y así lo puede
                          leer un lector de pantalla o un parser. */}
                      <time
                        dateTime={m.inicio}
                        className="font-condensed text-xl font-bold leading-none tabular-nums text-tinta"
                      >
                        {horaDeReunion(m.inicio)}
                      </time>
                      <span className="text-[11px] font-semibold text-tinta/40">
                        {ETIQUETA_DIA[m.dia] ?? fechaCorta(m.inicio)}
                      </span>
                      {!m.agendadaAntes && <Badge tono="naranjo">Recién agendada</Badge>}
                    </div>
                    <p className="mt-1.5 text-pretty font-medium text-tinta">{m.asunto}</p>
                    <p className="text-xs text-tinta/50">con {m.con}</p>
                    {m.preparacion && (
                      <p className="mt-2 rounded-md border-l-2 border-naranjo/60 bg-naranjo/[0.06] px-2.5 py-1.5 text-xs text-pretty text-naranjo">
                        {m.preparacion}
                      </p>
                    )}
                  </Fila>
                ))}
              </ol>
            )}
          </Seccion>

          {r.enCopia.length > 0 && (
            <Seccion titulo="Informativo" cuenta={r.enCopia.length}>
              <ul className="flex flex-col gap-2">
                {r.enCopia.map((c, i) => (
                  <Fila key={i} tenue>
                    <p className="truncate text-sm font-medium text-tinta/80" title={c.asunto}>
                      {c.asunto}
                    </p>
                    <p className="mt-0.5 text-sm text-pretty text-tinta/60">{c.porQueImporta}</p>
                    <p className="mt-1 text-[11px] text-tinta/35">{c.de}</p>
                  </Fila>
                ))}
              </ul>
            </Seccion>
          )}
        </aside>
      </div>

      <footer className="mt-12 border-t border-borde pt-4 text-[11px] text-pretty text-tinta/35">
        Generado a las {horaChile(datos.generadoEn)} · Es un resumen, no un reemplazo: revisa la bandeja antes
        de tomar una decisión importante.
        {datos.enviadoEn && " · Enviado por correo esta mañana."}
      </footer>
    </>
  );
}

const FONDO_CIFRA = {
  naranjo: "bg-naranjo/[0.06]",
  teal: "bg-teal/[0.06]",
  gris: "bg-gris/[0.08]",
} as const;

/**
 * Un segmento de la cinta de conteos.
 *
 * El fondo y el color de la cifra son decisiones separadas a propósito: el total
 * de correos es un dato neutro aunque su segmento tenga tinte naranjo, y solo
 * "sin leer" se resalta. Si el color del número siguiera al del fondo, los cuatro
 * quedarían resaltados y ninguno destacaría.
 */
function Cifra({
  etiqueta,
  valor,
  pie,
  fondo = "naranjo",
  resalte,
  ultima = false,
}: {
  etiqueta: string;
  valor: number;
  pie: string;
  fondo?: keyof typeof FONDO_CIFRA;
  resalte?: "naranjo" | "teal";
  ultima?: boolean;
}) {
  const color = resalte === "teal" ? "text-teal" : resalte === "naranjo" ? "text-naranjo" : "text-tinta";
  return (
    <div
      className={`border-b border-borde px-5 py-4 sm:border-b-0 ${ultima ? "" : "sm:border-r"} ${
        FONDO_CIFRA[fondo]
      }`}
    >
      <dt className="text-xs font-medium text-tinta/55">{etiqueta}</dt>
      {/* La cifra en tamaño de display: es el dato, no una nota al pie. */}
      <dd
        className={`mt-1 font-condensed text-3xl font-bold leading-none tracking-tight tabular-nums ${color}`}
      >
        {valor}
      </dd>
      <dd className="mt-1.5 text-[11px] text-tinta/45">{pie}</dd>
    </div>
  );
}
