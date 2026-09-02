"use client";

import { useState, useTransition } from "react";
import { sincronizarSiiAction } from "@/app/(protegido)/finanzas/acciones";
import RuedaCarga from "@/components/RuedaCarga";

/**
 * Releer un período del SII sin pasar por el cron.
 *
 * La corrida diaria mira los últimos 15 días. Todo lo más viejo se quedó con el estado
 * que tenía el día que se leyó, así que cuando cambia cómo se deriva un estado hay que
 * poder decirle "releé agosto" sin ir a buscar el CRON_SECRET a una terminal.
 *
 * De a un período a propósito: el scraper abre un navegador, se loguea y baja un CSV por
 * sub-pestaña, así que son minutos y la función tiene tope. Tres períodos juntos se
 * cortan a la mitad.
 */

/** Los últimos seis meses, que es hasta donde llega el RCV que se consulta hoy. */
function ultimosPeriodos(cuantos = 6): { valor: string; rotulo: string }[] {
  const hoy = new Date();
  return Array.from({ length: cuantos }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      valor,
      rotulo: new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(d),
    };
  });
}

export default function BotonSincronizarSii() {
  const periodos = ultimosPeriodos();
  const [periodo, setPeriodo] = useState(periodos[0].valor);
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={periodo}
        onChange={(e) => setPeriodo(e.target.value)}
        disabled={pendiente}
        className="h-9 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:opacity-50"
      >
        {periodos.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.rotulo}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciarTransicion(async () => {
            setMensaje(null);
            try {
              const r = await sincronizarSiiAction(periodo);
              setMensaje({
                texto:
                  `Releído: ${r.documentos} documento(s).` +
                  (r.reclamos.length
                    ? ` ${r.reclamos.length} venta(s) reclamada(s) —folio ${r.reclamos.join(", ")}—, ` +
                      "avisadas por correo a Finanzas."
                    : " Ninguna venta reclamada."),
              });
            } catch (e) {
              setMensaje({
                texto: e instanceof Error ? e.message : "No se pudo consultar el SII.",
                error: true,
              });
            }
          })
        }
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-borde bg-superficie px-3 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo disabled:opacity-50"
      >
        {pendiente && <RuedaCarga />}
        {pendiente ? "Consultando al SII…" : "↻ Releer período"}
      </button>
      {/* Se dice cuánto tarda ANTES de apretar: son minutos y el botón parece colgado. */}
      <span className={`text-xs ${mensaje?.error ? "text-red-600" : "text-tinta/50"}`}>
        {mensaje
          ? mensaje.texto
          : pendiente
            ? "Abre el navegador del SII y baja los CSV: puede tardar un par de minutos."
            : "Trae el estado real de ese mes, incluidas las ventas reclamadas."}
      </span>
    </div>
  );
}
