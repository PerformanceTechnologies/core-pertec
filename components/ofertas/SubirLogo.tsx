"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import RuedaCarga from "@/components/RuedaCarga";
import { FORMATOS_LOGO } from "@/lib/ofertas/logo";

/**
 * Un hueco de logo: el de una empresa emisora o el del cliente de una oferta.
 *
 * La vista previa va sobre blanco a propósito, no sobre un fondo de cuadros. La
 * celda del encabezado del documento es clara, así que un logo blanco con fondo
 * transparente ahí no se ve — y si acá tampoco se ve, eso es información
 * verdadera, no un defecto de la pantalla.
 *
 * Sube por fetch y no con un form: el archivo se normaliza en el servidor y lo que
 * interesa mostrar de vuelta es el resultado, no recargar la página a ciegas.
 */
export default function SubirLogo({
  destino,
  clave,
  titulo,
  nota,
  nombreActual,
  urlActual,
  deshabilitado = false,
}: {
  destino: "empresa" | "cliente";
  /** El nombre de la empresa, o el id de la oferta. */
  clave: string;
  titulo: string;
  nota?: string;
  nombreActual: string | null;
  urlActual: string | null;
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = async (archivo: File) => {
    setCargando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.set("archivo", archivo);
      cuerpo.set("destino", destino);
      cuerpo.set("clave", clave);
      const respuesta = await fetch("/api/ofertas/logos", { method: "POST", body: cuerpo });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo subir el logo.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el logo.");
    } finally {
      setCargando(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const quitar = async () => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch(
        `/api/ofertas/logos?destino=${destino}&clave=${encodeURIComponent(clave)}`,
        { method: "DELETE" },
      );
      if (!respuesta.ok) {
        const datos = await respuesta.json();
        throw new Error(datos.error ?? "No se pudo quitar el logo.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el logo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="rounded-xl border border-borde bg-crema/40 p-4">
      <p className="font-condensed text-sm font-bold uppercase tracking-wide text-tinta">{titulo}</p>
      {nota && <p className="mt-0.5 text-[11px] text-pretty text-tinta/45">{nota}</p>}

      <div className="mt-3 flex items-center gap-4">
        {/* Sin next/image: es un archivo de un bucket privado y una URL firmada,
            así que no tiene por qué pasar por el optimizador ni quedar cacheado
            en un CDN. */}
        <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded-lg border border-borde bg-white p-1.5">
          {urlActual ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlActual} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-tinta/30">Sin logo</span>
          )}
        </div>

        <div className="min-w-0">
          {nombreActual && <p className="truncate text-[11px] text-tinta/55">{nombreActual}</p>}
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={cargando || deshabilitado}
              className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
            >
              {cargando && <RuedaCarga />}
              {urlActual ? "Reemplazar" : "Subir logo"}
            </button>
            {urlActual && !deshabilitado && (
              <button
                type="button"
                onClick={quitar}
                disabled={cargando}
                className="text-[11px] font-medium text-tinta/40 transition-colors hover:text-red-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={entrada}
        type="file"
        accept={FORMATOS_LOGO}
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void subir(archivo);
        }}
      />

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
