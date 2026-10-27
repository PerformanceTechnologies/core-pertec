"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/inventario", etiqueta: "Tablero", exacto: true },
  { href: "/inventario/productos", etiqueta: "Productos" },
  { href: "/inventario/operaciones", etiqueta: "Operaciones" },
  { href: "/inventario/ajustes", etiqueta: "Ajustes" },
  { href: "/inventario/reabastecimiento", etiqueta: "Reabastecimiento" },
  { href: "/inventario/valorizacion", etiqueta: "Valorización" },
  { href: "/inventario/ubicaciones", etiqueta: "Ubicaciones" },
  { href: "/inventario/configuracion", etiqueta: "Configuración" },
];

export default function NavInventario() {
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
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              on ? "bg-azul text-white" : "text-gris hover:bg-borde/60 hover:text-tinta"
            }`}
          >
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
