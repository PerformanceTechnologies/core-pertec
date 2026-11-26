"use client";

import { useActionState, useState } from "react";
import { IconCheck, IconLoader2, IconPencil } from "@tabler/icons-react";
import { responderOcAction, type EstadoRespuestaOc } from "@/app/oc/[token]/acciones";

const CAMPO = "w-full rounded-xl border border-transparent bg-tinta/[0.05] px-3 py-2 text-sm text-tinta placeholder:text-gris-suave transition focus:border-cian/60 focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-cian/15";

/**
 * El formulario del proveedor en la página del enlace de la OC: su nombre, un comentario y dos botones, confirmar o
 * pedir modificación (esta exige el comentario). Confirmar pregunta antes, porque no se deshace desde acá.
 */
export default function RespuestaOc({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState<EstadoRespuestaOc, FormData>(responderOcAction.bind(null, token), null);
  const [modo, setModo] = useState<"aceptada" | "modificacion">("aceptada");

  if (estado?.ok) {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-500/[0.08] px-4 py-3 text-sm font-medium text-tinta">
        <IconCheck size={18} className="mt-px shrink-0 text-ok" />
        {estado.respuesta === "aceptada" ? "¡Listo! Confirmaste la orden de compra. Ya le avisamos a quien te la envió." : "Listo, enviamos tu solicitud de modificación. Te van a enviar una versión corregida."}
      </p>
    );
  }

  return (
    <form
      action={accion}
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        // El botón que se apretó (su name/value «respuesta» viaja en el formulario): el estado de React aún no se actualizó.
        const elegido = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
        if (elegido === "modificacion" && !String(new FormData(e.currentTarget).get("comentario") ?? "").trim()) {
          e.preventDefault();
          setModo("modificacion");
          return;
        }
        if (elegido !== "modificacion" && !window.confirm("¿Confirmas la orden de compra tal como está?")) e.preventDefault();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-tinta/75">Tu nombre *</span>
        <input name="nombre" required maxLength={120} autoComplete="name" placeholder="Nombre y apellido" className={CAMPO} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-tinta/75">{modo === "modificacion" ? "¿Qué hay que modificar? *" : "Comentario (opcional)"}</span>
        <textarea
          name="comentario"
          maxLength={2000}
          rows={modo === "modificacion" ? 4 : 2}
          placeholder={modo === "modificacion" ? "Ej.: el precio del ítem 2 es $120.000; el plazo de entrega es de 10 días hábiles." : "Ej.: despachamos el lunes."}
          className={`${CAMPO} resize-y`}
        />
      </label>
      {modo === "modificacion" && <p className="text-xs text-gris">Escribe qué hay que modificar y vuelve a apretar «Pedir modificación».</p>}
      {estado?.error && <p role="alert" className="text-sm font-medium text-alerta">{estado.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="respuesta"
          value="aceptada"
          onClick={() => setModo("aceptada")}
          disabled={enviando}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-naranjo px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-naranjo-suave disabled:opacity-60"
        >
          {enviando && modo === "aceptada" ? <IconLoader2 size={16} className="animate-spin" /> : <IconCheck size={16} />} Confirmar orden de compra
        </button>
        <button
          type="submit"
          name="respuesta"
          value="modificacion"
          onClick={() => setModo("modificacion")}
          disabled={enviando}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-tinta/[0.06] px-5 text-sm font-semibold text-tinta transition hover:bg-tinta/[0.1] disabled:opacity-60"
        >
          {enviando && modo === "modificacion" ? <IconLoader2 size={16} className="animate-spin" /> : <IconPencil size={16} />} Pedir modificación
        </button>
      </div>
    </form>
  );
}
