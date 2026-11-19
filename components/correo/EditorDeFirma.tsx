"use client";

import { useActionState, useRef, useState } from "react";
import { IconCheck, IconLoader2, IconPhotoUp, IconTrash } from "@tabler/icons-react";
import { BOTON_C, BOTON_SUAVE_C } from "@/components/contactos/Visual";
import type { EstadoFirma } from "@/app/(protegido)/firma-correo/acciones";

/**
 * Subir la firma como imagen, con la vista previa de cómo queda al final del correo. Se envía al
 * elegir el archivo: no hay un paso de «guardar» que se olvide.
 */
export default function EditorDeFirma({
  actual,
  guardar,
}: {
  /** La firma guardada, como data URL para mostrarla, o null. */
  actual: string | null;
  guardar: (previo: EstadoFirma, form: FormData) => Promise<EstadoFirma>;
}) {
  const [estado, accion, guardando] = useActionState(guardar, null);
  const [previa, setPrevia] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const mostrada = previa ?? actual;


  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form ref={formulario} action={accion} className="space-y-3">
        <span className="block text-xs font-semibold text-gris">Tu firma (imagen)</span>
        <label className={`${BOTON_C} cursor-pointer`}>
          {guardando ? <IconLoader2 size={16} className="animate-spin" /> : <IconPhotoUp size={16} />}
          {actual ? "Cambiar imagen" : "Subir imagen"}
          <input
            type="file"
            name="imagen"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={guardando}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setPrevia(URL.createObjectURL(f));
              formulario.current?.requestSubmit();
            }}
          />
        </label>
        <p className="text-xs leading-snug text-gris">
          PNG o JPG, hasta 1 MB. El Core la achica a un máximo de 600 × 240 px para que el correo no pese. Lo ideal es una imagen ancha y con fondo blanco o transparente.
        </p>
        {estado?.ok && !guardando && <p className="inline-flex items-center gap-1 text-sm font-semibold text-ok"><IconCheck size={16} /> Guardada</p>}
        {estado?.error && <p role="alert" className="text-sm font-medium text-alerta">{estado.error}</p>}
      </form>

      <div>
        <span className="mb-1 block text-xs font-semibold text-gris">Así se ve al final de tus correos</span>
        <div className="overflow-hidden rounded-2xl border border-borde bg-white p-4 text-[14px] leading-relaxed text-[#171411]">
          <p className="mb-3">Estimado/a, adjunto la cotización solicitada.</p>
          <p className="mb-1 text-[#8c8578]">…</p>
          {mostrada ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa de un data URL o un blob local
            <img src={mostrada} alt="Tu firma" className="mt-2 block h-auto w-full max-w-[600px] object-contain object-left" />
          ) : (
            <p className="mt-2 text-[13px] italic text-[#8c8578]">Sin firma</p>
          )}
        </div>
        {actual && (
          <form action={accion} className="mt-3">
            <input type="hidden" name="quitar" value="1" />
            <button type="submit" disabled={guardando} className={BOTON_SUAVE_C}>
              <IconTrash size={16} /> Quitar firma
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
