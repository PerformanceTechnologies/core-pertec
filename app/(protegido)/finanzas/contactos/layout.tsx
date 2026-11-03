import Link from "next/link";
import { IconAddressBook, IconChevronRight } from "@tabler/icons-react";
import { exigirAccesoContactos } from "@/lib/contactos";

export const dynamic = "force-dynamic";

export default async function LayoutContactos({ children }: { children: React.ReactNode }) {
  await exigirAccesoContactos();

  return (
    <div className="animar-entrada">
      <nav className="mb-2 flex items-center gap-1 text-xs text-gris" aria-label="Ruta">
        <Link href="/finanzas" className="transition hover:text-tinta">Finanzas</Link>
        <IconChevronRight size={12} />
        <span className="text-tinta">Contactos</span>
      </nav>
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconAddressBook size={23} stroke={1.75} />
        </span>
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Contactos</h1>
          <p className="text-sm text-gris">Clientes y proveedores con los datos que pide el SII para facturar</p>
        </div>
      </header>
      {children}
    </div>
  );
}
