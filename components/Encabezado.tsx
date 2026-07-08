import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import type { Rol } from "@/lib/tipos";

export default function Encabezado({
  correo,
  rol,
}: {
  correo: string;
  rol: Rol;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-borde bg-crema/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        <div className="flex items-center gap-4">
          <Image
            src="/logo-pertec.png"
            alt="Performance Technologies — PERTEC"
            width={220}
            height={170}
            className="h-10 w-auto object-contain"
            priority
          />
          <Link
            href="/"
            className="font-condensed text-lg font-bold uppercase text-tinta"
          >
            Core PERTEC
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {rol === "admin" && (
            <nav className="flex items-center gap-2">
              <Link
                href="/usuarios"
                className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
              >
                Usuarios
              </Link>
              <Link
                href="/aplicaciones"
                className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
              >
                Aplicaciones
              </Link>
            </nav>
          )}

          <span className="hidden text-sm text-tinta/60 sm:inline">
            {correo}
            <span className="ml-2 rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-teal">
              {rol === "admin" ? "Administrador" : "Usuario"}
            </span>
          </span>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/ingresar" });
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
