import Link from "next/link";
import {
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconLayoutDashboard,
  IconLayoutNavbar,
  IconPencil,
  IconPlayerPause,
  type Icon,
} from "@tabler/icons-react";
import { estaPausada } from "@/lib/apps-pausadas";
import { clasesInsigniaColor, clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import { obtenerIcono } from "@/lib/iconos";
import { iconoDeModulo } from "@/lib/iconos-menu";
import type { GrupoDelCatalogo } from "@/lib/menu-modelo";
import { TARJETA } from "@/lib/estilos";
import BotonEliminar from "@/components/BotonEliminar";

const CELDA = "px-4 py-3 align-middle";
const CABECERA = "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-tinta/65";
const BOTON_ORDEN =
  "grid h-9 w-9 place-items-center rounded-lg text-tinta/50 transition hover:bg-tinta/5 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-tinta/50";

/** El ícono de un grupo: el de su módulo, o uno propio para los grupos que no son módulos. */
function iconoDeGrupo(slug: string): Icon {
  if (slug === "en-pausa") return IconPlayerPause;
  if (slug === "fuera-del-menu") return IconLayoutNavbar;
  return iconoDeModulo(slug);
}

function IconoDelGrupo({ icono: Icono }: { icono: Icon }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-naranjo/10 text-naranjo">
      <Icono size={18} stroke={1.75} aria-hidden />
    </span>
  );
}

function FichaDeApp({ icono: Icono, clases }: { icono: Icon; clases: string }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${clases}`}>
      <Icono size={18} stroke={1.75} aria-hidden />
    </span>
  );
}

/**
 * El catálogo de aplicaciones tal como se ve el menú: una tabla por módulo. Solo dibuja; qué
 * grupos y con qué filtros lo resuelve la página (ver agruparCatalogo).
 */
export default function CatalogoDeAplicaciones({
  grupos,
  usuariosPorApp,
  eliminar,
  mover,
}: {
  grupos: GrupoDelCatalogo[];
  /** aplicacion_id → personas con la app asignada; null si no se pudo contar (la columna muestra «—»). */
  usuariosPorApp: ReadonlyMap<string, number> | null;
  eliminar: (form: FormData) => void;
  mover: (form: FormData) => void;
}) {
  return (
    <div className="space-y-8">
      {grupos.map((grupo) => {
        // El orden de la tabla solo manda en «Otras» (ver menu-modelo.ts): en los módulos lo fija el
        // menú, y unas flechas que no cambian nada mienten.
        const conOrden = grupo.slug === "otras";
        const idsDelGrupo = grupo.apps.map((a) => a.id).join(",");
        return (
          <section key={grupo.slug} aria-labelledby={`grupo-${grupo.slug}`}>
            <div className="mb-3 flex items-start gap-3">
              <IconoDelGrupo icono={iconoDeGrupo(grupo.slug)} />
              <div className="min-w-0">
                <h2
                  id={`grupo-${grupo.slug}`}
                  className="font-condensed text-lg font-bold uppercase leading-tight tracking-wide text-tinta"
                >
                  {grupo.titulo}
                  <span className="ml-2 align-middle text-xs font-semibold normal-case tracking-normal text-tinta/55">
                    {grupo.apps.length === 1 ? "1 aplicación" : `${grupo.apps.length} aplicaciones`}
                  </span>
                </h2>
                <p className="text-xs text-tinta/60">{grupo.nota}</p>
              </div>
            </div>

            <div className={`${TARJETA} overflow-x-auto`}>
              <table className="w-full min-w-[840px] table-fixed text-left text-sm">
                <caption className="sr-only">Aplicaciones de {grupo.titulo}</caption>
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[20%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[26%]" />
                </colgroup>
                <thead className="border-b border-borde bg-crema/60">
                  <tr>
                    <th scope="col" className={CABECERA}>Aplicación</th>
                    <th scope="col" className={CABECERA}>Destino</th>
                    <th scope="col" className={CABECERA}>Estado</th>
                    <th scope="col" className={CABECERA}>Acceso</th>
                    <th scope="col" className={`${CABECERA} text-right`}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {grupo.apps.map((app, indice) => {
                    const interna = app.tipo === "interna";
                    const asignados = usuariosPorApp?.get(app.id) ?? 0;
                    return (
                      <tr key={app.id} className="transition hover:bg-tinta/[0.02]">
                        <td className={CELDA}>
                          <div className="flex items-center gap-3">
                            <FichaDeApp icono={obtenerIcono(app.icono)} clases={clasesInsigniaColor(app.color)} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-tinta">{app.nombre}</p>
                              {app.descripcion && (
                                <p className="truncate text-xs text-tinta/60" title={app.descripcion}>
                                  {app.descripcion}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={CELDA}>
                          <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-tinta/65">
                            {interna ? (
                              <IconLayoutDashboard size={13} stroke={2} aria-hidden />
                            ) : (
                              <IconExternalLink size={13} stroke={2} aria-hidden />
                            )}
                            {interna ? "Interna" : "Externa"}
                          </p>
                          <p className="truncate font-mono text-xs text-tinta/70" title={app.url}>
                            {app.url}
                          </p>
                        </td>
                        <td className={CELDA}>
                          <div className="flex flex-wrap gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${clasesInsigniaEstado(app.estado)}`}>
                              {etiquetaEstado(app.estado)}
                            </span>
                            {estaPausada(app.slug) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-tinta/10 px-2 py-0.5 text-[11px] font-semibold text-tinta/70">
                                <IconPlayerPause size={11} stroke={2.2} aria-hidden /> En pausa
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`${CELDA} text-xs text-tinta/70`}>
                          {usuariosPorApp === null ? (
                            <span aria-label="No disponible">—</span>
                          ) : (
                            <>
                              <span className="font-semibold text-tinta">{asignados}</span> {asignados === 1 ? "persona" : "personas"}
                            </>
                          )}
                        </td>
                        <td className={CELDA}>
                          <div className="flex items-center justify-end gap-2">
                            {conOrden && (
                              <div className="mr-1 flex items-center">
                                <form action={mover}>
                                  <input type="hidden" name="id" value={app.id} />
                                  <input type="hidden" name="direccion" value="arriba" />
                                  <input type="hidden" name="entre" value={idsDelGrupo} />
                                  <button type="submit" disabled={indice === 0} aria-label={`Subir ${app.nombre}`} className={BOTON_ORDEN}>
                                    <IconChevronUp size={16} stroke={2} aria-hidden />
                                  </button>
                                </form>
                                <form action={mover}>
                                  <input type="hidden" name="id" value={app.id} />
                                  <input type="hidden" name="direccion" value="abajo" />
                                  <input type="hidden" name="entre" value={idsDelGrupo} />
                                  <button
                                    type="submit"
                                    disabled={indice === grupo.apps.length - 1}
                                    aria-label={`Bajar ${app.nombre}`}
                                    className={BOTON_ORDEN}
                                  >
                                    <IconChevronDown size={16} stroke={2} aria-hidden />
                                  </button>
                                </form>
                              </div>
                            )}
                            <Link
                              href={`/aplicaciones/${app.id}`}
                              aria-label={`Editar ${app.nombre}`}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-borde px-3 text-xs font-semibold text-tinta/75 transition hover:border-naranjo/40 hover:bg-naranjo/10 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                            >
                              <IconPencil size={14} stroke={2} aria-hidden /> Editar
                            </Link>
                            <BotonEliminar
                              accion={eliminar}
                              id={app.id}
                              nombre={app.nombre}
                              mensajeConfirmacion={`¿Eliminar "${app.nombre}" del catálogo?`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
