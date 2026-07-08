import Link from "next/link";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { obtenerIcono } from "@/lib/iconos";
import { clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import TarjetaMetrica from "@/components/TarjetaMetrica";

export default async function DashboardPage() {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return null; // el layout ya redirige antes de llegar aquí

  const todasLasApps = await listarAplicaciones();
  const apps =
    usuario.rol === "admin"
      ? todasLasApps
      : todasLasApps.filter((app) => usuario.aplicacionIds.includes(app.id));

  const activas = apps.filter((a) => a.estado === "activa").length;
  const enDesarrollo = apps.filter((a) => a.estado === "en_desarrollo").length;
  const mantenimiento = apps.filter((a) => a.estado === "mantenimiento").length;
  const primerNombre = usuario.nombre?.split(" ")[0];

  return (
    <div>
      <span className="etiqueta-seccion">Resumen</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-tinta/60">
        Hola{primerNombre ? `, ${primerNombre}` : ""}. Este es el estado general de tus
        herramientas — encuéntralas también en el panel de la izquierda.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TarjetaMetrica etiqueta="Aplicaciones" valor={apps.length} />
        <TarjetaMetrica etiqueta="Activas" valor={activas} color="teal" />
        <TarjetaMetrica etiqueta="En desarrollo" valor={enDesarrollo} color="naranjo" />
        <TarjetaMetrica etiqueta="Mantención" valor={mantenimiento} color="gris" />
      </div>

      <div className="mt-8">
        <span className="etiqueta-seccion">Detalle</span>
        <h2 className="mt-2 font-condensed text-lg font-bold uppercase text-tinta">
          Tus aplicaciones
        </h2>

        {apps.length === 0 ? (
          <p className="mt-4 text-sm text-tinta/60">
            Todavía no tienes aplicaciones asignadas. Pídele a un administrador que te dé
            acceso.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-borde bg-white">
            {apps.map((app, indice) => {
              const Icono = obtenerIcono(app.icono);
              const deshabilitada = app.estado === "mantenimiento";
              const href =
                app.tipo === "interna"
                  ? app.url
                  : app.url.startsWith("http")
                    ? app.url
                    : `https://${app.url}`;

              return (
                <div
                  key={app.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    indice > 0 ? "border-t border-borde" : ""
                  }`}
                >
                  <Icono size={18} stroke={1.75} className="text-tinta/60" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-tinta">{app.nombre}</p>
                    {app.descripcion && (
                      <p className="truncate text-xs text-tinta/50">{app.descripcion}</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${clasesInsigniaEstado(app.estado)}`}
                  >
                    {etiquetaEstado(app.estado)}
                  </span>
                  {!deshabilitada && (
                    <Link href={href} className="text-xs font-medium text-tinta/60 hover:text-naranjo">
                      Abrir
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
