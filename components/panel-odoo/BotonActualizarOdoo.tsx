"use client";

import { useState, useTransition } from "react";
import { sincronizarAhoraAction } from "@/app/(protegido)/panel-odoo/acciones";

export default function BotonActualizarOdoo() {
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
              const resultados = await sincronizarAhoraAction();
              const fallidos = resultados.filter((r) => !r.exito);
              if (fallidos.length > 0) {
                setMensaje({
                  texto: `Falló: ${fallidos.map((f) => f.modulo).join(", ")}`,
                  error: true,
                });
                return;
              }
              const total = resultados.reduce((acc, r) => acc + (r.registros ?? 0), 0);
              setMensaje({ texto: `Actualizado — ${total} registros sincronizados.` });
            } catch (e) {
              setMensaje({ texto: e instanceof Error ? e.message : "Error al sincronizar con Odoo.", error: true });
            }
          })
        }
        className="rounded-md border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
      >
        {pendiente ? "Sincronizando con Odoo…" : "↻ Actualizar ahora"}
      </button>
      {mensaje && (
        <span className={`text-xs ${mensaje.error ? "text-red-600" : "text-teal"}`}>{mensaje.texto}</span>
      )}
    </div>
  );
}
