"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { responderRecibidoAction } from "@/app/(protegido)/gestion-financiera/acciones-dte";
import { avisar, confirmar, pedirTexto } from "@/components/fin/dialogos";

const RECLAMOS = [
  { codigo: "RCD", texto: "Reclamar el contenido", ayuda: "La factura tiene errores (montos, descripción, datos) o no corresponde.", pregunta: "¿Qué está mal en el documento?" },
  { codigo: "RFP", texto: "Falta parcial de mercaderías", ayuda: "Llegó solo una parte de lo facturado.", pregunta: "¿Qué faltó?" },
  { codigo: "RFT", texto: "Falta total de mercaderías", ayuda: "No llegó nada de lo facturado.", pregunta: "¿Qué no llegó?" },
] as const;

const BOTON = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50";

/** Las dos respuestas al SII de un documento recibido: Aceptar o Reclamar (con sus tres tipos de reclamo). */
export default function RespuestaSii({ id, folio, proveedor }: { id: string; folio: string; proveedor: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const responder = (accion: string, motivo: string) =>
    iniciar(async () => {
      const r = await responderRecibidoAction(id, accion, motivo);
      if (!r.ok) return avisar(r.error);
      avisar(r.mensaje ?? "Listo.", "ok");
      router.refresh();
    });
  return (
    <span className="inline-flex max-w-[17rem] flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pendiente}
        className={`${BOTON} bg-emerald-500/12 text-ok hover:bg-emerald-500/20`}
        onClick={async () => {
          if (await confirmar({ titulo: `¿Aceptar la factura ${folio} de ${proveedor} ante el SII?`, ayuda: "La respuesta queda registrada en el SII y no se puede cambiar después.", boton: "Aceptar" })) responder("ACD", "");
        }}
      >
        {pendiente ? <IconLoader2 size={13} className="animate-spin" /> : null} Aceptar
      </button>
      <button type="button" disabled={pendiente} className={`${BOTON} bg-rose-500/10 text-alerta hover:bg-rose-500/20`} onClick={() => setMenu((x) => !x)} aria-expanded={menu}>
        Reclamar <IconChevronDown size={13} className={menu ? "rotate-180" : ""} />
      </button>
      {menu && (
        <span className="mt-1 block w-full min-w-60 rounded-xl border border-borde bg-superficie p-1 shadow-sm">
          {RECLAMOS.map((r) => (
            <button
              key={r.codigo}
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-tinta/[0.05]"
              onClick={async () => {
                setMenu(false);
                const motivo = await pedirTexto({ titulo: `${r.texto} · factura ${folio}`, ayuda: `${r.pregunta} El reclamo se envía al SII y no se puede cambiar después.`, boton: "Enviar reclamo", placeholder: "Motivo del reclamo" });
                if (motivo && motivo.trim()) responder(r.codigo, motivo);
              }}
            >
              <span className="block text-[13px] font-semibold text-tinta">{r.texto}</span>
              <span className="block text-[11px] text-gris">{r.ayuda}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
