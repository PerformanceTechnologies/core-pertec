import Link from "next/link";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerIcono } from "@/lib/iconos";
import { SUBPANELES_FINANZAS } from "@/lib/finanzas-subpaneles";

const SLUG_APP = "finanzas";

export default async function FinanzasPage() {
  await exigirAccesoApp(SLUG_APP);

  return (
    <div>
      <span className="etiqueta-seccion">Panel Finanzas</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Finanzas
      </h1>
      <p className="mt-1 text-sm text-tinta/60">
        Elige un área para ver el detalle.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SUBPANELES_FINANZAS.map((sp) => {
          const Icono = obtenerIcono(sp.icono);
          return (
            <Link
              key={sp.slug}
              href={sp.href}
              className="rounded-xl border border-borde bg-white p-5 transition hover:border-naranjo/40 hover:shadow-sm"
            >
              <Icono size={22} stroke={1.75} className="text-naranjo" aria-hidden />
              <p className="mt-3 font-condensed text-base font-bold uppercase text-tinta">
                {sp.nombre}
              </p>
              <p className="mt-1 text-xs text-tinta/55">{sp.descripcion}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
