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
  children,
}: {
  Icono: Icon;
  tono: string;
  titulo: string;
  bajada: string;
  accion?: { href: string; texto: string; Icono?: Icon };
  /** Contenido extra bajo la bajada: pistas, contadores, filtros. */
  children?: React.ReactNode;
}) {
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
