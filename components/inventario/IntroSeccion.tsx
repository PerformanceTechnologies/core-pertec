import Link from "next/link";
import type { Icon } from "@tabler/icons-react";
import { TARJETA } from "@/lib/estilos";

/**
 * Cabecera de cada menú del Inventario: qué es esta pantalla, en una línea, y la
 * acción principal a mano. Así nadie tiene que adivinar para qué sirve cada pestaña.
 */
export default function IntroSeccion({
  Icono,
  tono,
  titulo,
  bajada,
  accion,
  compacto = false,
  hijosALaDerecha = false,
  children,
}: {
  Icono: Icon;
  tono: string;
  titulo: string;
  bajada: string;
  accion?: { href: string; texto: string; Icono?: Icon };
  /** Versión baja: icono chico y el contenido extra a la derecha del título, en vez de debajo. */
  compacto?: boolean;
  /** Solo con `compacto`: el contenido extra va a la derecha del título (botones) en vez de debajo de la bajada (pistas). */
  hijosALaDerecha?: boolean;
  /** Contenido extra bajo la bajada: pistas, contadores, filtros. */
  children?: React.ReactNode;
}) {
  if (compacto) {
    return (
      <header className={`${TARJETA} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tono}`}>
          <Icono size={20} stroke={1.75} />
        </span>
        <div className="min-w-[16rem] flex-1">
          <h2 className="text-base font-extrabold leading-tight tracking-tight text-tinta">{titulo}</h2>
          <p className="text-xs text-gris">{bajada}</p>
          {children && !hijosALaDerecha && <div className="mt-1.5">{children}</div>}
        </div>
        {children && hijosALaDerecha && children}
        {accion && (
          <Link
            href={accion.href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-naranjo px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
          >
            {accion.Icono && <accion.Icono size={16} />} {accion.texto}
          </Link>
        )}
      </header>
    );
  }
  return (
    <header className={`${TARJETA} flex flex-wrap items-start gap-4 p-5`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tono}`}>
        <Icono size={24} stroke={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-extrabold tracking-tight text-tinta">{titulo}</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-gris">{bajada}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
      {accion && (
        <Link
          href={accion.href}
          className="inline-flex items-center gap-1.5 self-center rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
        >
          {accion.Icono && <accion.Icono size={16} />} {accion.texto}
        </Link>
      )}
    </header>
  );
}

/** Una pista numerada de «cómo funciona», para poner dentro de IntroSeccion. */
export function Pistas({ items }: { items: string[] }) {
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gris">
      {items.map((t, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-naranjo/12 text-[10px] font-bold text-naranjo">{i + 1}</span>
          {t}
        </li>
      ))}
    </ol>
  );
}
