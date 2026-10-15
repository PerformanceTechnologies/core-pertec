"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Pestana {
  etiqueta: string;
  /** Lo que va después de /contratos/<contrato>. Vacío = la portada. */
  ruta: string;
  insignia?: number;
}

/**
 * Los módulos del contrato, como pestañas bajo su nombre.
 *
 * En core-ih eran entradas de la barra lateral; acá la barra es la de core-pertec y lleva una sola
 * entrada, «Contratos», así que los módulos de cada contrato van dentro de él. Se desplazan de lado
 * en pantalla angosta en vez de partirse en varias filas.
 */
export default function PestanasDelContrato({ slug, pestanas }: { slug: string; pestanas: Pestana[] }) {
  const ruta = usePathname();
  const base = `/contratos/${slug}`;

  // Documentos generales vive dentro de la portada de SharePoint ([[...ruta]]): cuenta como activa
  // en cualquier carpeta de adentro. La portada, solo en su dirección exacta.
  const activa = (p: Pestana) => {
    const destino = `${base}${p.ruta}`;
    if (p.ruta === "") return ruta === base;
    return ruta === destino || ruta.startsWith(`${destino}/`);
  };

  return (
    <nav aria-label="Módulos del contrato" className="mt-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-borde">
        {pestanas.map((p) => {
          const esActiva = activa(p);
          return (
            <li key={p.ruta}>
              <Link
                href={`${base}${p.ruta}`}
                prefetch={false}
                aria-current={esActiva ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-xs font-bold uppercase tracking-wide transition ${
                  esActiva ? "border-naranjo text-naranjo" : "border-transparent text-gris hover:text-tinta"
                }`}
              >
                {p.etiqueta}
                {p.insignia ? (
                  <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{p.insignia}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
