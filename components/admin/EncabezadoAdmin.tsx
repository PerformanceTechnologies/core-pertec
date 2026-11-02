import Link from "next/link";
import { IconShieldCog } from "@tabler/icons-react";

/**
 * El encabezado de las pantallas de Administración: ruta, título, una línea que explica para qué
 * sirve la pantalla y, a la derecha, su acción principal. Es el mismo en Usuarios, Aplicaciones y
 * en sus pantallas de edición, para que se sienta una sola herramienta.
 */
export default function EncabezadoAdmin({
  titulo,
  descripcion,
  rutaPadre,
  acciones,
}: {
  titulo: string;
  descripcion: string;
  /** En una pantalla de adentro («Editar»), la lista de la que cuelga: Usuarios / Editar. */
  rutaPadre?: { href: string; nombre: string };
  acciones?: React.ReactNode;
}) {
  return (
    <header>
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1.5 text-xs text-tinta/60">
        <Link href="/" className="transition hover:text-naranjo">
          Inicio
        </Link>
        <span aria-hidden>/</span>
        <Link href="/modulos/administracion" className="transition hover:text-naranjo">
          Administración
        </Link>
        {rutaPadre && (
          <>
            <span aria-hidden>/</span>
            <Link href={rutaPadre.href} className="transition hover:text-naranjo">
              {rutaPadre.nombre}
            </Link>
          </>
        )}
        <span aria-hidden>/</span>
        <span className="font-medium text-tinta/80">{titulo}</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
            <IconShieldCog size={24} stroke={1.7} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-condensed text-3xl font-bold uppercase leading-none tracking-tight text-tinta sm:text-4xl">
              {titulo}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-tinta/65">{descripcion}</p>
          </div>
        </div>
        {acciones}
      </div>
    </header>
  );
}
