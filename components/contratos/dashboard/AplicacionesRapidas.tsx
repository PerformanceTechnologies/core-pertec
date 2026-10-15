import Link from "@/components/contratos/Enlace";
import {
  IconArrowRight,
  IconCar,
  IconFileText,
  IconFolder,
  IconId,
  IconPointFilled,
  IconReceipt2,
  IconTruck,
} from "@tabler/icons-react";
import { TARJETA } from "@/lib/contratos/estilos";
import type { Aplicacion } from "@/lib/contratos/tipos";

const ICONOS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "ti-file-text": IconFileText,
  "ti-id-badge-2": IconId,
  "ti-folder": IconFolder,
  "ti-truck": IconTruck,
  "ti-car": IconCar,
  "ti-receipt-2": IconReceipt2,
};

/**
 * Los accesos a las aplicaciones, ahora al pie del tablero.
 *
 * Eran lo único del panel; con el dashboard pasan a ser un atajo y no la pantalla entera. El
 * menú lateral sigue teniéndolas todas, así que esta fila es de una línea y no repite las
 * descripciones largas.
 */
export default function AplicacionesRapidas({ apps }: { apps: Aplicacion[] }) {
  if (apps.length === 0) return null;

  return (
    <section aria-label="Tus aplicaciones">
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gris">
        <span className="h-[2px] w-3 rounded-full bg-cian" />
        Tus aplicaciones
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {apps.map((app) => {
          const Icono = ICONOS[app.icono] ?? IconPointFilled;
          const enMantencion = app.estado === "mantenimiento";
          return (
            <li key={app.id}>
              <Link
                href={app.url}
                className={`${TARJETA} group flex items-center gap-3 p-3 transition hover:border-cian ${
                  enMantencion ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cian-lavado text-azul">
                  <Icono size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-azul">{app.nombre}</span>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-gris-suave">
                    {enMantencion ? "En mantención" : "Abrir"}
                  </span>
                </span>
                {!enMantencion && (
                  <IconArrowRight size={14} className="shrink-0 text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-cian" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
