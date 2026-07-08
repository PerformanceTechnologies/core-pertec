import Link from "next/link";
import { obtenerIcono } from "@/lib/iconos";
import { clasesInsigniaColor, clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import type { Aplicacion } from "@/lib/tipos";

export default function CartillaApp({ app }: { app: Aplicacion }) {
  const Icono = obtenerIcono(app.icono);
  const deshabilitada = app.estado === "mantenimiento";
  const href = app.url.startsWith("http") ? app.url : `https://${app.url}`;

  const contenido = (
    <>
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${clasesInsigniaColor(app.color)}`}
      >
        <Icono size={20} stroke={1.75} aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold text-tinta">{app.nombre}</p>
      {app.descripcion && (
        <p className="mt-0.5 line-clamp-2 text-xs text-tinta/55">{app.descripcion}</p>
      )}
      <span
        className={`mt-3 inline-block w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${clasesInsigniaEstado(app.estado)}`}
      >
        {etiquetaEstado(app.estado)}
      </span>
    </>
  );

  if (deshabilitada) {
    return (
      <div className="flex cursor-not-allowed flex-col rounded-xl border border-borde bg-white/60 p-4 opacity-60">
        {contenido}
      </div>
    );
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl border border-borde bg-white p-4 transition hover:border-naranjo/40 hover:shadow-sm"
    >
      {contenido}
    </Link>
  );
}
