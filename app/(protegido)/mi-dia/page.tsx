import { auth } from "@/auth";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { obtenerResumenDeHoy } from "@/lib/resumen-diario/datos";
import { tieneCredencialGuardada } from "@/lib/graph-credenciales";
import type { ResumenGuardado, Urgencia } from "@/lib/resumen-diario/tipos";
import type { UsuarioConAcceso } from "@/lib/tipos";
import type { Dirigido } from "@/lib/graph-correo";
import { SOMBRA_CALIDA } from "@/lib/estilos";

const SLUG_APP = "mi-dia";

export const dynamic = "force-dynamic";

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
  media: "Revisar",
  baja: null,
};

// El badge de "media" va en gris y no en naranjo: si los dos niveles se pintan
// igual, tener dos niveles no sirve de nada.
const TONO_URGENCIA: Record<Urgencia, "naranjo" | "gris"> = {
  alta: "naranjo",
  media: "gris",
  baja: "gris",
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

const DETALLE_DIRIGIDO: Record<Dirigido, string> = {
  a_mi: "dirigido a ti",
  en_copia: "solo en copia",
  lista: "por lista o regla",
};

/**
 * "1 h 30 min" entre dos ISO locales.
 *
 * Se resta sobre los minutos del día recortados del string, no construyendo dos
 * Date: los ISO vienen en hora de Chile sin offset, así que un `new Date()` los
 * interpretaría en la zona del servidor y la diferencia saldría igual, pero una
 * reunión que cruza la medianoche daría negativo. Con el ajuste de +24 h eso
 * queda cubierto.
 */
function duracion(inicio: string, fin: string): string {
  const minutos = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
  let total = minutos(fin) - minutos(inicio);
  if (total < 0) total += 24 * 60;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
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
    <section className="mt-10 first:mt-0">
      {/* Rótulo, una regla que ocupa lo que sobra, y el conteo al final. La regla
          es lo que hace que el rótulo se lea como un título de sección sin
          necesidad de tamaño ni de peso. */}
      <div className="flex items-center gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta/50">{titulo}</h2>
        <span className="h-px flex-1 bg-borde" />
        {cuenta !== undefined && (
          <span className="text-[11px] font-semibold tabular-nums text-tinta/30">
            {String(cuenta).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="mt-4">{children}</div>
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
  detalle,
}: {
  children: React.ReactNode;
  enlace?: string | null;
  /** Para el title del enlace: "Abrir en Outlook: <asunto>". */
  titulo?: string;
  acento?: string;
  tenue?: boolean;
  /** Contenido del popover que aparece al pasar el cursor. */
  detalle?: React.ReactNode;
}) {
  const base = `block rounded-lg border px-4 py-3 transition-colors duration-200 ${acento} ${
    tenue ? "border-dashed border-borde bg-transparent" : `border-borde bg-superficie ${SOMBRA_CALIDA}`
  }`;

  // `group relative` en el <li> y no en el enlace: el popover se posiciona contra
  // la fila completa, y así también funciona en las filas sin enlace.
  if (!enlace) {
    return (
      <li tabIndex={detalle ? 0 : undefined} className={`group relative outline-none ${base}`}>
        {children}
        {detalle && <Popover>{detalle}</Popover>}
      </li>
    );
  }

  return (
    <li className="group relative">
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
      {detalle && <Popover>{detalle}</Popover>}
    </li>
  );
}

/**
 * Popover de detalle al pasar el cursor.
 *
 * Solo CSS: un hijo posicionado que pasa de opacidad 0 a 1 con el hover del
 * contenedor. Sin estado ni efectos, así que la página sigue siendo un server
 * component y no manda un kilo de JavaScript para mostrar un recuadro.
 *
 * `group-focus-within` además del hover: sin eso el detalle sería inalcanzable
 * con teclado, y en una pantalla táctil —donde no hay cursor— tocar la fila al
 * menos le da el foco y lo muestra.
 *
 * `pointer-events-none` para que el popover no se coma el clic de la fila que
 * está debajo: varias de estas filas son enlaces a Outlook.
 *
 * OJO con el contenedor: un ancestro con overflow-hidden lo recorta. Por eso la
 * cinta de cifras dejó de usarlo y ahora redondea esquina por esquina.
 */
function Popover({
  children,
  alineado = "izquierda",
}: {
  children: React.ReactNode;
  /** A la derecha para los elementos del borde derecho, que si no se salen. */
  alineado?: "izquierda" | "derecha";
}) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full z-30 mt-2 w-64 max-w-[calc(100vw-3rem)] origin-top translate-y-1 rounded-lg border border-borde bg-superficie p-3 text-left text-[11px] leading-relaxed text-tinta/70 opacity-0 shadow-[0_4px_12px_rgba(23,20,17,0.08),0_16px_40px_-16px_rgba(23,20,17,0.25)] transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 ${
        alineado === "derecha" ? "right-0" : "left-0"
      }`}
    >
      {children}
    </span>
  );
}

/** Una línea etiqueta/valor dentro de un popover. */
function LineaDetalle({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <span className="mt-1.5 block first:mt-0">
      <span className="block text-[10px] font-medium text-tinta/40">{etiqueta}</span>
      <span className="block text-tinta/75">{children}</span>
    </span>
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

/**
 * Todo lo caro, en UNA promesa.
 *
 * Se comparte entre la banda de cifras y el cuerpo del resumen, que están en dos
 * límites de Suspense distintos. Si cada uno llamara por su cuenta, en una caché
 * vacía se generarían DOS resúmenes: dos llamadas al modelo sobre el mismo buzón,
 * y la segunda sobreescribiendo a la primera.
 */
async function cargarResumen(usuario: UsuarioConAcceso) {
  const sesion = await auth();
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
  return { estado, credencialGuardada };
}

type DatosResumen = Awaited<ReturnType<typeof cargarResumen>>;

export default async function MiDiaPage() {
  // Solo el guard, que son dos consultas rápidas.
  const usuario = await exigirAccesoApp(SLUG_APP);
  const hoy = hoyEnSantiago();

  // SIN await: la promesa se pasa a los dos hijos y cada uno la espera dentro de su
  // propio Suspense. Esperarla acá volvería a bloquear la página entera, que es lo
  // que hacía que la primera visita del día fueran 30 a 90 segundos de nada.
  const datos = cargarResumen(usuario);

  // "Lunes," / "10 de agosto" en dos líneas: la fecha es el título de la página y
  // partida en dos gana presencia sin necesidad de más tamaño.
  const [diaSemana, ...resto] = fechaLarga(hoy.iso).split(", ");

  return (
    // El <main> del core no tiene tope de ancho, así que en un monitor de 1900px
    // la prosa de este módulo se estiraba a todo lo largo. Esta página es de
    // lectura, no una tabla: necesita un límite.
    <div className="max-w-[1500px]">
      {/* La banda oscura reúne lo que antes eran tres bloques separados: el
          encabezado, la cinta de cifras y el "generado a las" del pie. Un solo
          bloque de contraste alto arriba y el resto de la página en claro. */}
      <header className="rounded-2xl bg-tinta px-6 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" />
              Mi día
            </span>
            <h1 className="mt-3 font-condensed text-4xl font-bold uppercase leading-[0.95] tracking-tight text-crema sm:text-5xl">
              {diaSemana},
              <br />
              {resto.join(", ")}
            </h1>
            <p className="mt-4 max-w-[52ch] text-sm text-pretty text-crema/50">
              Resumen de tu correo de los últimos días y de las reuniones de hoy y los próximos. Cada fila
              abre el mensaje o la cita en Outlook.
            </p>
          </div>

          <Cifras datos={datos} />
        </div>
      </header>

      <CuerpoResumen datos={datos} />
    </div>
  );
}

/** Las cuatro cifras del período, en la banda oscura. */
async function Cifras({ datos }: { datos: Promise<DatosResumen> }) {
  const { estado } = await datos;
  if (estado.estado !== "ok") return null;
  const r = estado.datos.resumen;

  return (
    <dl className="grid shrink-0 grid-cols-2 gap-y-5 rounded-xl border border-crema/10 px-5 py-4 sm:grid-cols-4 sm:gap-y-0 lg:min-w-[30rem]">
      <Cifra
        etiqueta="Correos"
        valor={r.conteos.total}
        pie={`últimas ${r.conteos.horas} horas`}
        detalle={
          <>
            <LineaDetalle etiqueta="De dónde salen">
              Todo lo que llegó a tu bandeja de entrada en las últimas {r.conteos.horas} horas. No incluye lo
              archivado ni lo enviado.
            </LineaDetalle>
            <LineaDetalle etiqueta="Cómo se reparten">
              {r.conteos.aMi} dirigidos a ti · {r.conteos.enCopia} en copia ·{" "}
              {r.conteos.total - r.conteos.aMi - r.conteos.enCopia} por lista o regla
            </LineaDetalle>
            {r.conteos.recortado && (
              <LineaDetalle etiqueta="Atención">
                Se llegó al tope de mensajes que se analizan, así que hay correo más viejo que no se revisó.
              </LineaDetalle>
            )}
          </>
        }
      />
      <Cifra
        etiqueta="Sin leer"
        valor={r.conteos.sinLeer}
        pie={r.conteos.marcados > 0 ? `${r.conteos.marcados} con bandera` : "sin banderas"}
        resalte="naranjo"
        detalle={
          <>
            <LineaDetalle etiqueta="Qué cuenta">
              Mensajes del período que siguen marcados como no leídos en Outlook.
            </LineaDetalle>
            <LineaDetalle etiqueta="No es lo mismo que pendiente">
              Un correo leído puede seguir requiriendo respuesta. Para eso está la lista de abajo.
            </LineaDetalle>
          </>
        }
      />
      <Cifra
        etiqueta="Dirigidos a ti"
        valor={r.conteos.aMi}
        pie={`${r.conteos.enCopia} en copia`}
        resalte="teal"
        detalle={
          <>
            <LineaDetalle etiqueta="Dirigidos a ti">
              Estás en el campo Para. Casi siempre esperan algo tuyo.
            </LineaDetalle>
            <LineaDetalle etiqueta="En copia">
              {r.conteos.enCopia} donde estás solo en CC: son para que estés al tanto, no para que respondas.
            </LineaDetalle>
          </>
        }
      />
      <Cifra
        etiqueta="Reuniones"
        valor={r.reunionesTotales}
        pie="hoy y los próximos días"
        ultima
        detalleAlineado="derecha"
        detalle={
          <>
            <LineaDetalle etiqueta="Qué abarca">
              Desde las 00:00 de hoy y por los dos días siguientes, en hora de Chile.
            </LineaDetalle>
            <LineaDetalle etiqueta="Cómo se reparten">
              {r.reuniones.filter((m) => m.dia === "hoy").length} hoy ·{" "}
              {r.reuniones.filter((m) => m.dia === "manana").length} mañana ·{" "}
              {r.reuniones.filter((m) => m.dia === "despues").length} más adelante
            </LineaDetalle>
          </>
        }
      />
    </dl>
  );
}

/** Hueco del mismo tamaño que las cifras, para que al llegar no salte nada. */
async function CuerpoResumen({ datos }: { datos: Promise<DatosResumen> }) {
  const { estado, credencialGuardada } = await datos;

  return (
    <>
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
          El resumen se muestra aquí, pero el{" "}
          <strong>envío automático de la mañana todavía no está activo</strong> para tu cuenta. Se activa solo
          la próxima vez que inicies sesión en el core; no tienes que hacer nada más. Si mañana no te llega,
          avísale a TI: puede faltar una variable de entorno del servidor.
        </p>
      )}

      {estado.estado === "ok" && <ResumenCompleto datos={estado.datos} />}
    </>
  );
}

function ResumenCompleto({ datos }: { datos: ResumenGuardado }) {
  const r = datos.resumen;

  return (
    <>
      {/* El panorama, como una cita: regla al costado y nada más. Antes era una
          tarjeta naranja que competía por atención con las prioridades de justo
          abajo, y las dos quedaban al mismo nivel siendo cosas distintas: esto es
          contexto, eso es la lista de qué hacer. */}
      <blockquote className="mt-10 border-l-2 border-naranjo pl-5">
        <p className="max-w-[70ch] text-[17px] leading-relaxed text-pretty text-tinta">{r.panorama}</p>
      </blockquote>

      <Seccion titulo="Prioridades del día" cuenta={r.prioridades.length}>
        {/* Tres tarjetas en fila en vez de una lista numerada: en fila se leen como
            tres cosas del día y no como un ranking del que solo importa la primera.
            El número grande da el orden sin necesidad de la lista. */}
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {r.prioridades.map((prioridad, i) => (
            <li key={i} className={`rounded-xl border border-borde bg-superficie p-5 ${SOMBRA_CALIDA}`}>
              <span className="font-condensed text-2xl font-bold leading-none tabular-nums text-naranjo">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-4 text-[15px] leading-relaxed text-pretty text-tinta">{prioridad}</p>
            </li>
          ))}
        </ol>
      </Seccion>

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
                  <Fila
                    key={i}
                    enlace={c.enlace}
                    titulo={c.asunto}
                    acento={BARRA_URGENCIA[c.urgencia]}
                    detalle={
                      <>
                        <LineaDetalle etiqueta="De">
                          {c.de}
                          {c.correoDe && ` · ${c.correoDe}`}
                        </LineaDetalle>
                        <LineaDetalle etiqueta="Cuándo llegó">{c.cuando}</LineaDetalle>
                        <LineaDetalle etiqueta="Estado">
                          {[
                            c.leido === null ? null : c.leido ? "Leído" : "Sin leer",
                            c.marcado ? "con bandera" : null,
                            c.tieneAdjuntos ? "con adjuntos" : null,
                            c.destinatarios && c.destinatarios > 1
                              ? `${c.destinatarios} destinatarios`
                              : null,
                            DETALLE_DIRIGIDO[c.dirigido],
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </LineaDetalle>
                        {c.extracto && (
                          <LineaDetalle etiqueta="Cómo empieza">
                            {/* Recortado a 220: el extracto de Graph llega hasta 700
                                y un popover con un párrafo entero deja de ser un
                                detalle al pasar y se vuelve otra cosa que leer. */}
                            {c.extracto.length > 220 ? `${c.extracto.slice(0, 220)}…` : c.extracto}
                          </LineaDetalle>
                        )}
                        {c.enlace && (
                          <span className="mt-2 block text-[10px] font-medium text-naranjo">
                            Clic para abrirlo en Outlook
                          </span>
                        )}
                      </>
                    }
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="min-w-0 flex-1 truncate font-medium text-tinta" title={c.asunto}>
                        {c.asunto}
                      </p>
                      {ETIQUETA_URGENCIA[c.urgencia] && (
                        <Badge tono={TONO_URGENCIA[c.urgencia]}>{ETIQUETA_URGENCIA[c.urgencia]}</Badge>
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
                  <Fila
                    key={i}
                    detalle={
                      <>
                        <LineaDetalle etiqueta="Correos del tema">
                          {t.correos} mensajes del período tratan este asunto.
                        </LineaDetalle>
                        <LineaDetalle etiqueta="Por qué se agrupa">
                          Varios correos sobre lo mismo son un asunto que avanzó, no varias cosas por leer.
                        </LineaDetalle>
                      </>
                    }
                  >
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
                  <Fila
                    key={i}
                    enlace={m.enlace}
                    titulo={m.asunto}
                    detalle={
                      <>
                        <LineaDetalle etiqueta="Horario">
                          {horaDeReunion(m.inicio)}
                          {m.fin && ` a ${horaDeReunion(m.fin)}`}
                          {m.fin && ` · ${duracion(m.inicio, m.fin)}`}
                        </LineaDetalle>
                        <LineaDetalle etiqueta="Dónde">
                          {m.lugar ?? (m.esTeams ? "Reunión de Teams" : "Sin lugar indicado")}
                        </LineaDetalle>
                        {m.organizador && <LineaDetalle etiqueta="Organiza">{m.organizador}</LineaDetalle>}
                        {m.asistentes.length > 0 && (
                          <LineaDetalle etiqueta={`Asistentes (${m.asistentes.length})`}>
                            {m.asistentes.join(", ")}
                          </LineaDetalle>
                        )}
                        {!m.agendadaAntes && (
                          <LineaDetalle etiqueta="Atención">
                            Se agendó el mismo día en que ocurre.
                          </LineaDetalle>
                        )}
                      </>
                    }
                  >
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

/**
 * Un segmento de las cifras de la banda oscura.
 *
 * La cifra en grande y el rótulo abajo, no al revés: el número es el dato y la
 * etiqueta solo lo nombra. Y solo dos de los cuatro llevan color —"sin leer" en
 * naranjo, "dirigidos a ti" en teal— porque si los cuatro se resaltan ninguno
 * destaca.
 */
function Cifra({
  etiqueta,
  valor,
  pie,
  resalte,
  ultima = false,
  detalle,
  detalleAlineado = "izquierda",
}: {
  etiqueta: string;
  valor: number;
  pie: string;
  resalte?: "naranjo" | "teal";
  ultima?: boolean;
  detalle?: React.ReactNode;
  detalleAlineado?: "izquierda" | "derecha";
}) {
  const color =
    resalte === "teal" ? "text-teal-suave" : resalte === "naranjo" ? "text-naranjo-suave" : "text-crema";
  return (
    <div
      tabIndex={detalle ? 0 : undefined}
      className={`group relative px-4 outline-none first:pl-0 last:pr-0 focus-visible:ring-1 focus-visible:ring-naranjo/60 ${
        ultima ? "" : "sm:border-r sm:border-crema/10"
      }`}
    >
      <dd className={`font-condensed text-3xl font-bold leading-none tracking-tight tabular-nums ${color}`}>
        {valor}
      </dd>
      <dt className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-crema/45">{etiqueta}</dt>
      <dd className="mt-1 text-[10px] leading-tight text-crema/30">{pie}</dd>
      {detalle && <Popover alineado={detalleAlineado}>{detalle}</Popover>}
    </div>
  );
}
