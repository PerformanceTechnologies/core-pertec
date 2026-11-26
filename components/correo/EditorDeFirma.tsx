"use client";

import { useActionState, useRef, useState } from "react";
import { IconCheck, IconDeviceFloppy, IconLoader2, IconPhotoUp, IconTrash } from "@tabler/icons-react";
import { BOTON_C, BOTON_SUAVE_C } from "@/components/contactos/Visual";
import type { EstadoFirma } from "@/app/(protegido)/firma-correo/acciones";

/** Largo máximo del texto (el mismo tope que exige el servidor, LARGO_MAX_TEXTO en lib/firma-correo.ts). */
const LARGO_MAX_TEXTO = 600;

/**
 * La firma: un texto (nombre, cargo, teléfono…) y/o una imagen, con la vista previa de cómo queda al final
 * del correo. La imagen se envía al elegir el archivo; el texto, con «Guardar texto».
 */
export default function EditorDeFirma({
  actual,
  textoActual = "",
  guardar,
  guardarTexto,
}: {
  /** La imagen guardada, como data URL para mostrarla, o null. */
  actual: string | null;
  /** El texto guardado («» = sin texto). */
  textoActual?: string;
  guardar: (previo: EstadoFirma, form: FormData) => Promise<EstadoFirma>;
  guardarTexto: (previo: EstadoFirma, form: FormData) => Promise<EstadoFirma>;
}) {
  const [estado, accion, guardando] = useActionState(guardar, null);
  const [estadoTexto, accionTexto, guardandoTexto] = useActionState(guardarTexto, null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [texto, setTexto] = useState(textoActual);
  const formulario = useRef<HTMLFormElement>(null);
  const mostrada = previa ?? actual;
  const textoCambiado = texto.trim() !== textoActual.trim();


  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
      <form action={accionTexto} className="space-y-2">
        <label htmlFor="firma-texto" className="block text-xs font-semibold text-gris">Texto de tu firma</label>
        <textarea
          id="firma-texto"
          name="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={LARGO_MAX_TEXTO}
          rows={5}
          placeholder={"Nombre Apellido\nCargo · Performance Technologies\n+56 9 1234 5678"}
          className="w-full resize-y rounded-xl border border-transparent bg-tinta/[0.05] px-3 py-2 text-sm leading-relaxed text-tinta placeholder:text-gris-suave transition focus:border-cian/60 focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-cian/15"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={guardandoTexto || !textoCambiado} className={BOTON_SUAVE_C}>
            {guardandoTexto ? <IconLoader2 size={16} className="animate-spin" /> : <IconDeviceFloppy size={16} />} Guardar texto
          </button>
          <span className="text-[11px] tabular-nums text-gris-suave">{texto.length}/{LARGO_MAX_TEXTO}</span>
          {estadoTexto?.ok && !guardandoTexto && !textoCambiado && <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok"><IconCheck size={16} /> Guardado</span>}
        </div>
        <p className="text-xs leading-snug text-gris">Va al final del correo, sobre la imagen si también tienes. Cada línea queda como la escribas. Déjalo vacío y guarda para quitarlo.</p>
        {estadoTexto?.error && <p role="alert" className="text-sm font-medium text-alerta">{estadoTexto.error}</p>}
      </form>

      <form ref={formulario} action={accion} className="space-y-3">
        <span className="block text-xs font-semibold text-gris">Imagen de tu firma (opcional)</span>
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
      </div>

      <div>
        <span className="mb-1 block text-xs font-semibold text-gris">Así se ve al final de tus correos</span>
        <div className="overflow-hidden rounded-2xl border border-borde bg-white p-4 text-[14px] leading-relaxed text-[#171411]">
          <p className="mb-3">Estimado/a, adjunto la cotización solicitada.</p>
          <p className="mb-1 text-[#8c8578]">…</p>
          {texto.trim() && <TextoDeFirma texto={texto} />}
          {mostrada && (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa de un data URL o un blob local
            <img src={mostrada} alt="Tu firma" className="mt-2 block h-auto w-full max-w-[600px] object-contain object-left" />
          )}
          {!mostrada && !texto.trim() && <p className="mt-2 text-[13px] italic text-[#8c8578]">Sin firma</p>}
        </div>
        {actual && (
          <form action={accion} className="mt-3">
            <input type="hidden" name="quitar" value="1" />
            <button type="submit" disabled={guardando} className={BOTON_SUAVE_C}>
              <IconTrash size={16} /> Quitar imagen
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** El texto de la firma como sale en el correo (ver firmaHtml en lib/ofertas/correo-html.ts): el nombre en negrita, con sangría. */
export function TextoDeFirma({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r\n?/g, "\n").trim().split("\n");
  return (
    <div className="mt-4 pl-4 font-[Arial,Helvetica,sans-serif] text-[14px] leading-[1.6] text-[#171411]">
      {lineas.map((l, i) => (i === 0 ? <b key={i} className="block text-[15px]">{l}</b> : <span key={i} className="block min-h-[1.6em]">{l}</span>))}
    </div>
  );
}
