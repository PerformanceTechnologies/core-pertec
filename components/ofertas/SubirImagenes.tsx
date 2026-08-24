"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import RuedaCarga from "@/components/RuedaCarga";
import { FORMATOS_LOGO } from "@/lib/ofertas/logo";
import { avisoDeTamano, leerRespuesta } from "@/lib/subidas";

/**
 * Agregar imágenes al inventario de una oferta.
 *
 * Lo que trajo el borrador casi nunca es todo: una foto de faena sacada después, un
 * plano que llegó por correo, una firma escaneada. Acá se suman, y después se elige
 * su sección en la misma pantalla, igual que con las que venían del archivo.
 *
 * Van de a UNA por request y no todas juntas: el servidor corta el cuerpo alrededor
 * de los 4 MB, y tres fotos de teléfono lo pasan sin esfuerzo. De paso, si una falla
 * se sabe cuál, en vez de perder el lote entero.
 */
export default function SubirImagenes({ ofertaId }: { ofertaId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);

  const subir = async (archivos: File[]) => {
    if (archivos.length === 0) return;
    setCargando(true);
    setError(null);
    let subidas = 0;
    try {
      for (const archivo of archivos) {
        const grande = avisoDeTamano(archivo);
        if (grande) throw new Error(grande);

        setProgreso(archivos.length > 1 ? `${subidas + 1} de ${archivos.length}` : "");
        const cuerpo = new FormData();
        cuerpo.set("archivo", archivo);
        const respuesta = await fetch(`/api/ofertas/${ofertaId}/imagenes`, {
          method: "POST",
          body: cuerpo,
        });
        await leerRespuesta(respuesta);
        subidas += 1;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setCargando(false);
      setProgreso("");
      if (entrada.current) entrada.current.value = "";
      // Aunque una haya fallado: las anteriores ya están guardadas y tienen que
      // aparecer.
      if (subidas > 0) router.refresh();
    }
  };

  return (
    <div
      onDragOver={(evento) => {
        evento.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(evento) => {
        evento.preventDefault();
        setEncima(false);
        void subir([...evento.dataTransfer.files]);
      }}
      className={`flex h-full min-h-[9rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-center transition ${
        encima ? "border-naranjo bg-naranjo/[0.06]" : "border-borde bg-superficie/50"
      }`}
    >
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={cargando}
        className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo disabled:opacity-40"
      >
        {cargando ? <RuedaCarga /> : <span className="text-sm leading-none">+</span>}
        {cargando ? `Subiendo${progreso ? ` ${progreso}` : ""}…` : "Agregar imágenes"}
      </button>
      <p className="text-[10px] text-pretty text-tinta/40">
        o soltalas acá. Se agregan sin sección: elegí dónde va cada una.
      </p>

      <input
        ref={entrada}
        type="file"
        accept={FORMATOS_LOGO}
        multiple
        className="hidden"
        onChange={(evento) => void subir([...(evento.target.files ?? [])])}
      />

      {error && <p className="text-[10px] font-medium text-pretty text-red-600">{error}</p>}
    </div>
  );
}
