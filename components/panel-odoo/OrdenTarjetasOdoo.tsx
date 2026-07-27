import { IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import type { ModuloVisiblePanelOdoo } from "@/lib/panel-odoo/modulos-usuario";
import { NOMBRES_MODULO } from "@/lib/panel-odoo/orden-modulos";
import { moverModuloOrdenAction } from "@/app/(protegido)/panel-odoo/acciones";

// Mismo patron de botones subir/bajar que /aplicaciones (ver
// moverAplicacionAction) -- sin drag-and-drop porque no hay ninguna libreria
// de ese tipo instalada en el proyecto, y esto ya resuelve el caso con menos
// codigo y sin JS extra en el cliente (son Server Actions puras). Vive
// dentro del modal de BotonOrdenarTarjetas, no tiene chrome propio.
export default function OrdenTarjetasOdoo({ orden }: { orden: ModuloVisiblePanelOdoo[] }) {
  return (
    <div>
      <p className="text-xs text-tinta/50">
        Define en qué orden aparecen las tarjetas para todos los usuarios del Panel Odoo.
      </p>
      <div className="mt-3 divide-y divide-borde">
        {orden.map((modulo, indice) => (
          <div key={modulo} className="flex items-center justify-between py-2">
            <span className="text-sm text-tinta">{NOMBRES_MODULO[modulo]}</span>
            <div className="flex items-center gap-1">
              <form action={moverModuloOrdenAction}>
                <input type="hidden" name="modulo" value={modulo} />
                <input type="hidden" name="direccion" value="arriba" />
                <button
                  type="submit"
                  disabled={indice === 0}
                  aria-label={`Subir ${NOMBRES_MODULO[modulo]}`}
                  className="rounded p-1 text-tinta/40 transition hover:bg-tinta/5 hover:text-naranjo disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-tinta/40"
                >
                  <IconChevronUp size={16} stroke={2} />
                </button>
              </form>
              <form action={moverModuloOrdenAction}>
                <input type="hidden" name="modulo" value={modulo} />
                <input type="hidden" name="direccion" value="abajo" />
                <button
                  type="submit"
                  disabled={indice === orden.length - 1}
                  aria-label={`Bajar ${NOMBRES_MODULO[modulo]}`}
                  className="rounded p-1 text-tinta/40 transition hover:bg-tinta/5 hover:text-naranjo disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-tinta/40"
                >
                  <IconChevronDown size={16} stroke={2} />
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
