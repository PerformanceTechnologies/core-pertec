"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/pagina-web", etiqueta: "Catálogo", exacto: true },
  { href: "/pagina-web/casos", etiqueta: "Casos de éxito" },
  { href: "/pagina-web/solicitudes", etiqueta: "Solicitudes" },
  { href: "/pagina-web/contacto", etiqueta: "Contacto" },
];

export default function NavPaginaWeb({ nuevas }: { nuevas: number }) {
  const ruta = usePathname();
  const activa = (href: string, exacto?: boolean) => (exacto ? ruta === href : ruta === href || ruta.startsWith(href + "/"));

  return (
    <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-borde pb-3">
      {PESTANAS.map((p) => {
        const on = activa(p.href, p.exacto);
        return (
          <Link
            key={p.href}
            href={p.href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              on ? "bg-azul text-white" : "text-gris hover:bg-borde/60 hover:text-tinta"
            }`}
          >
            {p.etiqueta}
            {p.href === "/pagina-web/solicitudes" && nuevas > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${on ? "bg-white/25 text-white" : "bg-naranjo text-white"}`}
                title={`${nuevas} sin revisar`}
              >
                {nuevas}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
