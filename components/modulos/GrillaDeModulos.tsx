import Link from "next/link";
import { IconArrowUpRight } from "@tabler/icons-react";
import { iconoDeModulo } from "@/lib/iconos-menu";
import { rutaDeModulo, type GrupoDelMenu } from "@/lib/menu-modelo";

const TARJETA =
  "group flex h-full items-center gap-3.5 rounded-xl border border-borde bg-white p-4 transition hover:-translate-y-0.5 hover:border-naranjo/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";
const FICHA = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-naranjo/10 text-naranjo";
const TITULO = "truncate font-condensed text-base font-bold uppercase leading-tight tracking-wide text-tinta";
const FLECHA =
  "shrink-0 text-tinta/25 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-naranjo";

/**
 * Lo que se ve en el Inicio: los MÓDULOS principales como tarjetas.
 *
 * Una tarjeta por MÓDULO (Finanzas, CRM, Contratos…), no por cada aplicación que cuelga de
 * él: las aplicaciones —los submódulos— se ven al entrar al módulo, en su propia página
 * (ver VistaDeModulo). Así el Inicio es la puerta de entrada y no repite todo el menú.
 */
/** Un módulo «directo» (Tareas) abre su pantalla; los demás, su portada con submódulos. */
function destinoDe(grupo: GrupoDelMenu): string {
  const primero = grupo.items[0];
  if (grupo.directo && primero?.tipo === "app") return primero.app.url;
  if (grupo.directo && primero?.tipo === "enlace") return primero.href;
  return rutaDeModulo(grupo.slug);
}

export default function GrillaDeModulos({ grupos }: { grupos: GrupoDelMenu[] }) {
  return (
    // Celular: 2 por fila, como íconos de app (ícono grande y nombre). Desde sm, la tarjeta con detalle.
    <ul className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
      {grupos.map((grupo) => {
        const Icono = iconoDeModulo(grupo.slug);
        // Los «próximamente» no cuentan: todavía no se pueden abrir.
        const submodulos = grupo.items.filter((i) => i.tipo !== "pronto").length;
        return (
          <li key={grupo.slug}>
            <Link
              href={destinoDe(grupo)}
              className="flex h-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-borde bg-superficie px-2 py-5 text-center shadow-[0_1px_2px_rgba(23,20,17,0.04),0_10px_28px_-14px_rgba(23,20,17,0.12)] transition active:scale-[0.98] sm:hidden"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-naranjo/10 text-naranjo">
                <Icono size={24} stroke={1.75} aria-hidden />
              </div>
              <span className="font-condensed text-[15px] font-bold uppercase leading-tight tracking-wide text-tinta">{grupo.titulo}</span>
            </Link>
            <Link href={destinoDe(grupo)} className={`${TARJETA} max-sm:!hidden`}>
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
    </ul>
  );
}
