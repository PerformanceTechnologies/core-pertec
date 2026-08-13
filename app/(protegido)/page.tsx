import Link from "next/link";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { obtenerIcono } from "@/lib/iconos";
import { clasesInsigniaColor, clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import WidgetCalendario from "@/components/WidgetCalendario";
import AvanceDelDia from "@/components/mi-dia/AvanceDelDia";

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
  const apps =
    usuario.rol === "admin"
      ? todasLasApps
      : todasLasApps.filter((app) => usuario.aplicacionIds.includes(app.id));
  const primerNombre = usuario.nombre?.split(" ")[0];

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
      <AvanceDelDia usuario={usuario} />

      <div className="mt-8 lg:flex lg:items-start lg:gap-10">
        <div className="lg:w-[264px] lg:shrink-0">
          <span className="etiqueta-seccion">Hoy</span>
          <h2 className="mt-2 font-condensed text-lg font-bold uppercase text-tinta">Tu calendario</h2>
          <div className="mt-4">
            <WidgetCalendario />
          </div>
        </div>

        <div className="mt-10 lg:mt-0 lg:min-w-0 lg:flex-1">
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
    </div>
  );
}
