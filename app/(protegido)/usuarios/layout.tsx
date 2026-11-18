import Link from "next/link";
import { IconChevronRight, IconUsers } from "@tabler/icons-react";
import { exigirAdmin } from "@/lib/autorizacion";

export const dynamic = "force-dynamic";

/** Ruta y título de Usuarios, iguales en la lista, la ficha y el alta (como en Contactos). */
export default async function LayoutUsuarios({ children }: { children: React.ReactNode }) {
  await exigirAdmin();

  return (
    <div className="animar-entrada">
      <nav className="mb-2 flex items-center gap-1 text-xs text-gris" aria-label="Ruta">
        <Link href="/modulos/administracion" className="transition hover:text-tinta">Administración</Link>
        <IconChevronRight size={12} />
        <Link href="/usuarios" className="text-tinta transition hover:text-naranjo">Usuarios</Link>
      </nav>
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconUsers size={23} stroke={1.75} />
        </span>
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Usuarios</h1>
          <p className="text-sm text-gris">Quién entra al Core, a qué aplicaciones y en qué empresas</p>
        </div>
      </header>
      {children}
    </div>
  );
}
