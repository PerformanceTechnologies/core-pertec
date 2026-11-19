"use client";

import { useActionState, useState } from "react";
import { IconCheck, IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { BOTON_C, CAMPO_C } from "@/components/contactos/Visual";
import type { EstadoFirma } from "@/app/(protegido)/firma-correo/acciones";

/** La firma en texto plano, con la vista previa de cómo le llega al destinatario. */
export default function EditorDeFirma({
  inicial,
  maximo,
  guardar,
}: {
  inicial: string;
  maximo: number;
  guardar: (previo: EstadoFirma, form: FormData) => Promise<EstadoFirma>;
}) {
  const [texto, setTexto] = useState(inicial);
  const [estado, accion, guardando] = useActionState(guardar, null);

  return (
    <form action={accion} className="grid gap-5 lg:grid-cols-2">
      <div>
        <label htmlFor="firma" className="mb-1 block text-xs font-semibold text-gris">Tu firma</label>
        <textarea
          id="firma"
          name="firma"
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, maximo))}
          rows={8}
          placeholder={"Alex Oliva\nDesarrollador Full-Stack\nPerformance Technologies\n+56 9 1234 5678 · pertec.cl"}
          className={`${CAMPO_C} font-[inherit] leading-relaxed`}
        />
        <p className="mt-1 text-right text-[11px] text-gris-suave">{texto.length} / {maximo}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={guardando} className={BOTON_C}>
            {guardando ? <IconLoader2 size={16} className="animate-spin" /> : <IconDeviceFloppy size={16} />} Guardar firma
          </button>
          {estado?.ok && !guardando && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok"><IconCheck size={16} /> Guardada</span>
          )}
          {estado?.error && <span role="alert" className="text-sm font-medium text-alerta">{estado.error}</span>}
        </div>
        <p className="mt-2 text-xs text-gris">Déjala vacía y guarda para no usar firma.</p>
      </div>

      <div>
        <span className="mb-1 block text-xs font-semibold text-gris">Así se ve al final de tus correos</span>
        <div className="rounded-2xl border border-borde bg-white p-4 text-[14px] leading-relaxed text-[#171411]">
          <p className="mb-3">Estimado/a, adjunto la cotización solicitada.</p>
          <p className="mb-1 text-[#8c8578]">…</p>
          {texto.trim() ? (
            <div className="mt-2 whitespace-pre-line border-t border-[#e5e0d8] pt-2.5 text-[13px] text-[#5c564f]">{texto.trim()}</div>
          ) : (
            <p className="mt-2 border-t border-[#e5e0d8] pt-2.5 text-[13px] italic text-[#8c8578]">Sin firma</p>
          )}
        </div>
      </div>
    </form>
  );
}
