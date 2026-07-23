"use client";

import { useState, useTransition } from "react";
import { money } from "@/lib/cotizador/formato";
import { actualizarUfUtmAction } from "@/app/(protegido)/cotizador/parametros/acciones";

export default function BotonActualizarIndicadores() {
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciarTransicion(async () => {
            setMensaje(null);
            try {
              const r = await actualizarUfUtmAction();
              if (!r.actualizado) {
                setMensaje({ texto: r.motivo ?? "No se pudo actualizar.", error: true });
                return;
              }
              setMensaje({
                texto: `UF ${money(r.ufNueva!)} · UTM ${money(r.utmNueva!)} (mindicador.cl)`,
              });
            } catch (e) {
              setMensaje({ texto: e instanceof Error ? e.message : "Error al consultar mindicador.cl", error: true });
            }
          })
        }
        className="rounded-md border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
      >
        {pendiente ? "Consultando mindicador.cl…" : "↻ Actualizar UF/UTM ahora"}
      </button>
      {mensaje && (
        <span className={`text-xs ${mensaje.error ? "text-red-600" : "text-teal"}`}>{mensaje.texto}</span>
      )}
    </div>
  );
}
