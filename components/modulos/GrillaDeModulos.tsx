import Link from "next/link";
import { IconArrowUpRight } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import { iconoDeModulo } from "@/lib/iconos-menu";
import { rutaDeModulo, type GrupoDelMenu } from "@/lib/menu-modelo";
import { clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import type { Aplicacion } from "@/lib/tipos";

const TARJETA =
  "group flex h-full items-center gap-3.5 rounded-xl border border-borde bg-white p-4 transition hover:-translate-y-0.5 hover:border-naranjo/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";
const FICHA = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-naranjo/10 text-naranjo";
const TITULO = "truncate font-condensed text-base font-bold uppercase leading-tight tracking-wide text-tinta";
const FLECHA =
  "shrink-0 text-tinta/25 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-naranjo";

/**
 * Lo que se ve en el Inicio: los MÓDULOS principales como tarjetas y, a continuación, las
 * aplicaciones sueltas (las que no cuelgan de ningún módulo, ver appsSueltasDelInicio).
 *
 * Una tarjeta por MÓDULO (Finanzas, CRM, Contratos…), no por cada aplicación que cuelga de
 * él: las aplicaciones —los submódulos— se ven al entrar al módulo, en su propia página
 * (ver VistaDeModulo). Así el Inicio es la puerta de entrada y no repite todo el menú.
 */
export default function GrillaDeModulos({
  grupos,
  sueltas = [],
}: {
  grupos: GrupoDelMenu[];
  sueltas?: Aplicacion[];
}) {
  return (
    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {grupos.map((grupo) => {
        const Icono = iconoDeModulo(grupo.slug);
        // Los «próximamente» no cuentan: todavía no se pueden abrir.
        const submodulos = grupo.items.filter((i) => i.tipo !== "pronto").length;
        return (
          <li key={grupo.slug}>
            <Link href={rutaDeModulo(grupo.slug)} className={TARJETA}>
              <div className={FICHA}>
                <Icono size={20} stroke={1.75} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className={TITULO}>{grupo.titulo}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-tinta/50">{grupo.descripcion}</p>
                <p className="mt-1.5 text-[11px] font-medium text-tinta/40">
                  {submodulos === 1 ? "1 submódulo" : `${submodulos} submódulos`}
                </p>
              </div>
              <IconArrowUpRight size={18} stroke={1.75} aria-hidden className={FLECHA} />
            </Link>
          </li>
        );
      })}

      {sueltas.map((app) => {
        const Icono = obtenerIcono(app.icono);
        const enMantencion = app.estado === "mantenimiento";
        const contenido = (
          <>
            <div className={enMantencion ? FICHA.replace("bg-naranjo/10 text-naranjo", "bg-gris/10 text-gris") : FICHA}>
              <Icono size={20} stroke={1.75} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className={TITULO}>{app.nombre}</p>
                {app.estado !== "activa" && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${clasesInsigniaEstado(app.estado)}`}
                  >
                    {etiquetaEstado(app.estado)}
                  </span>
                )}
              </div>
              {app.descripcion && (
                <p className="mt-0.5 line-clamp-2 text-xs text-tinta/50">{app.descripcion}</p>
              )}
              <p className="mt-1.5 text-[11px] font-medium text-tinta/40">Aplicación</p>
            </div>
          </>
        );
        return (
          <li key={app.id}>
            {enMantencion ? (
              <div className="flex h-full cursor-not-allowed items-center gap-3.5 rounded-xl border border-borde bg-white/60 p-4 opacity-60">
                {contenido}
              </div>
            ) : (
              <Link href={app.url} className={TARJETA}>
                {contenido}
                <IconArrowUpRight size={18} stroke={1.75} aria-hidden className={FLECHA} />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
