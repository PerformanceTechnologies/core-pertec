import Link from "next/link";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { obtenerIcono } from "@/lib/iconos";
import { clasesInsigniaColor, clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import WidgetCalendario from "@/components/WidgetCalendario";
import AvanceDelDia, { puedeVerResumenDelDia } from "@/components/mi-dia/AvanceDelDia";

const ZONA_HORARIA = "America/Santiago";

function fechaDeHoy(): string {
  const formateada = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return formateada.charAt(0).toUpperCase() + formateada.slice(1);
}

export default async function DashboardPage() {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return null; // el layout ya redirige antes de llegar aquí

  const todasLasApps = await listarAplicaciones();
  const apps = (
    usuario.rol === "admin"
      ? todasLasApps
      : todasLasApps.filter((app) => usuario.aplicacionIds.includes(app.id))
  )
    // Mi Día no va en la grilla: su resumen está destacado arriba con su propio
    // botón, y tener las dos cosas hace dudar de si llevan al mismo lado. Sigue
    // en el menú de la izquierda como todos los demás módulos.
    .filter((app) => app.slug !== "mi-dia");
  const primerNombre = usuario.nombre?.split(" ")[0];
  const veResumen = await puedeVerResumenDelDia(usuario);

  return (
    <div>
      <span className="etiqueta-seccion">{fechaDeHoy()}</span>
      <h1 className="mt-2 font-condensed text-4xl font-bold uppercase leading-none text-tinta sm:text-5xl">
        Hola{primerNombre ? `, ${primerNombre}` : ""}
      </h1>
      {/* En vez del párrafo que explicaba qué es el Dashboard y a qué hora
          entraste —que nadie necesita después de la primera vez— acá va el
          adelanto del resumen del día: lo único que a esta altura de la mañana
          hace falta saber antes de elegir a dónde entrar.

          Solo lee la caché; si no hay resumen de hoy, invita a abrir Mi Día. */}
      {/* El resumen y el calendario comparten fila: son las dos cosas que
          hablan de HOY, y una arriba de la otra dejaba el calendario a media
          página de distancia de su contexto. Las aplicaciones bajan a su propia
          franja, y de paso ganan el ancho completo para la grilla.

          items-start para que el calendario no se estire a la altura del
          resumen: es una tarjeta de alto fijo, estirada quedaba con un vacío
          abajo. */}
      <div className="mt-6 lg:flex lg:items-start lg:gap-6">
        {veResumen && (
          <div className="min-w-0 lg:flex-1">
            <AvanceDelDia usuario={usuario} />
          </div>
        )}

        {/* El rótulo "Hoy / Tu calendario" se fue: ocupaba unos 60px arriba del
            widget y dejaba al calendario arrancando bastante más abajo que la
            tarjeta del resumen, con la que ahora comparte fila. El widget ya
            trae su propio encabezado con el mes y el ícono, así que el rótulo
            era un segundo título para lo mismo.

            Queda como sr-only para que la estructura de encabezados de la
            página siga completa para un lector de pantalla.

            Sin resumen al lado (rol sin acceso a Mi Día) el calendario se queda
            en su ancho y a la izquierda. Las clases se eligen enteras y no se
            apilan dos anchos lg: cuál gana depende del orden en el CSS
            generado, no del orden en que se escriben acá. */}
        <div className={veResumen ? "mt-8 lg:mt-0 lg:w-[264px] lg:shrink-0" : "mt-8 lg:mt-0 lg:w-[264px]"}>
          <h2 className="sr-only">Tu calendario</h2>
          <WidgetCalendario />
        </div>
      </div>

      <div className="mt-10">
        <span className="etiqueta-seccion">Accesos</span>
        <h2 className="mt-2 font-condensed text-lg font-bold uppercase text-tinta">Tus aplicaciones</h2>

        {apps.length === 0 ? (
          <p className="mt-4 text-sm text-tinta/60">
            Todavía no tienes aplicaciones asignadas. Pídele a un administrador que te dé acceso.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {apps.map((app) => {
              const Icono = obtenerIcono(app.icono);
              const deshabilitada = app.estado === "mantenimiento";
              const href =
                app.tipo === "interna"
                  ? app.url
                  : app.url.startsWith("http")
                    ? app.url
                    : `https://${app.url}`;

              const contenido = (
                <>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${clasesInsigniaColor(app.color)}`}
                  >
                    <Icono size={20} stroke={1.75} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-tinta">{app.nombre}</p>
                      {app.estado !== "activa" && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${clasesInsigniaEstado(app.estado)}`}
                        >
                          {etiquetaEstado(app.estado)}
                        </span>
                      )}
                    </div>
                    {app.descripcion && (
                      <p className="mt-0.5 truncate text-xs text-tinta/50">{app.descripcion}</p>
                    )}
                  </div>
                </>
              );

              if (deshabilitada) {
                return (
                  <div
                    key={app.id}
                    className="flex cursor-not-allowed items-center gap-3.5 rounded-xl border border-borde bg-white/60 p-4 opacity-60"
                  >
                    {contenido}
                  </div>
                );
              }

              return (
                <Link
                  key={app.id}
                  href={href}
                  className="group flex items-center gap-3.5 rounded-xl border border-borde bg-white p-4 transition hover:-translate-y-0.5 hover:border-naranjo/30 hover:shadow-md"
                >
                  {contenido}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
