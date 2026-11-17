"use client";

import { useEffect, useState } from "react";
import { IconAlertTriangle, IconBuilding, IconLoader2, IconPlugConnected } from "@tabler/icons-react";
import type { EstadoRemitente } from "@/lib/correo-empresa";

/**
 * «Sale desde …»: la línea de la ventana de envío que dice desde qué cuenta va a salir el
 * correo, y si hace falta conectar el correo de la empresa, el botón para hacerlo.
 *
 * La conexión se abre en una pestaña NUEVA para no perder lo que se escribió en la
 * ventana. Al volver a esta pestaña se pregunta de nuevo (evento focus), así que el
 * aviso desaparece solo apenas se conecta.
 *
 * `alCambiar(listo)` le avisa a la ventana si se puede enviar, para apagar el botón.
 */
export default function RemitenteCorreo({ quien = "el destinatario", alCambiar }: { quien?: string; alCambiar?: (listo: boolean) => void }) {
  const [estado, setEstado] = useState<EstadoRemitente | null>(null);
  const [esperando, setEsperando] = useState(false);

  useEffect(() => {
    let vigente = true;
    const consultar = () => {
      fetch("/api/correo-empresa/remitente", { cache: "no-store" })
        .then((x) => (x.ok ? (x.json() as Promise<EstadoRemitente>) : null))
        .catch(() => null)
        .then((r) => {
          if (!vigente || !r) return;
          setEstado(r);
          if (r.listo) setEsperando(false);
        });
    };
    consultar();
    window.addEventListener("focus", consultar);
    return () => {
      vigente = false;
      window.removeEventListener("focus", consultar);
    };
  }, []);

  useEffect(() => {
    if (estado) alCambiar?.(estado.listo);
  }, [estado, alCambiar]);

  if (!estado) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-gris">
        <IconLoader2 size={12} className="animate-spin" /> Revisando desde qué cuenta sale…
      </p>
    );
  }

  if (estado.modo === "personal") {
    return estado.listo ? (
      <p className="text-[11px] text-gris">
        Remitente: {estado.cuenta}. Quedará en tus enviados y, si {quien} responde, te llegará a ti.
      </p>
    ) : (
      <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-aviso">
        <IconAlertTriangle size={14} className="mt-px shrink-0" /> Tu cuenta de Microsoft no está conectada. Cierra sesión y vuelve a entrar al Core.
      </p>
    );
  }

  const conectar = () => {
    // Sin «noopener»: así la pestaña la abre un script y puede cerrarse sola al terminar.
    window.open(estado.conectar, "_blank");
    setEsperando(true);
  };

  if (estado.listo) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-xs text-tinta/80">
        <IconBuilding size={14} className="shrink-0 text-ok" />
        <span className="min-w-0 flex-1">
          Sale desde <b className="font-semibold text-tinta">{estado.cuenta}</b>, tu correo de {estado.empresa}. Queda en sus enviados y, si {quien} responde, te llega ahí.
        </span>
        <button type="button" onClick={conectar} className="font-semibold text-naranjo hover:underline">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-aviso">
      <p className="flex items-start gap-2">
        <IconAlertTriangle size={14} className="mt-px shrink-0" />
        <span>
          {estado.error
            ? `Tu conexión con el correo de ${estado.empresa} (${estado.cuenta}) venció o fue revocada. Vuelve a conectarla para enviar.`
            : `Los correos de ${estado.empresa} salen desde tu cuenta de ${estado.empresa}, no desde la de PERTEC. Conéctala una vez para poder enviar.`}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2 pl-[22px]">
        <button
          type="button"
          onClick={conectar}
          className="inline-flex items-center gap-1.5 rounded-full bg-naranjo px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-naranjo-suave"
        >
          <IconPlugConnected size={14} /> {estado.error ? "Volver a conectar" : `Conectar correo de ${estado.empresa}`}
        </button>
        {esperando && (
          <span className="inline-flex items-center gap-1.5 text-tinta/60">
            <IconLoader2 size={12} className="animate-spin" /> Termina en la otra pestaña y vuelve acá.
          </span>
        )}
      </div>
    </div>
  );
}
