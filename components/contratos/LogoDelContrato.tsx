"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBuildingFactory2, IconPhotoEdit, IconTrash } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { reducirImagen } from "./reducirImagen";
import { guardarLogoAction } from "@/app/(protegido)/contratos/acciones-contratos";

/**
 * El logo de la empresa del contrato, y —para quien puede configurar— cambiarlo o quitarlo.
 *
 * Sin logo se ve el ícono de faena en su recuadro, el mismo de la lista de contratos.
 */
export default function LogoDelContrato({
  slug,
  url,
  nombre,
  editable,
  tamano = 56,
}: {
  slug: string;
  url: string | null;
  nombre: string;
  editable: boolean;
  tamano?: number;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar(logo: string | null) {
    iniciar(async () => {
      setError(null);
      const r = await guardarLogoAction(slug, logo);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    try {
      guardar(await reducirImagen(archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la imagen.");
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-borde bg-superficie"
        style={{ width: tamano, height: tamano }}
      >
        {pendiente ? (
          <RuedaCarga className="h-5 w-5 text-naranjo" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen chica servida por el propio core, sin nada que optimizar
          <img src={url} alt={`Logo de ${nombre}`} className="h-full w-full object-contain p-1.5" />
        ) : (
          <IconBuildingFactory2 size={Math.round(tamano * 0.42)} className="text-naranjo" aria-hidden />
        )}
      </span>

      {editable && (
        <div className="flex flex-col items-start gap-1">
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void elegir(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={pendiente}
            onClick={() => entrada.current?.click()}
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gris transition hover:text-naranjo disabled:opacity-50"
          >
            <IconPhotoEdit size={14} />
            {url ? "Cambiar logo" : "Agregar logo"}
          </button>
          {url && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => window.confirm("¿Quitar el logo de este contrato?") && guardar(null)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gris/80 transition hover:text-red-600 disabled:opacity-50"
            >
              <IconTrash size={13} />
              Quitar
            </button>
          )}
          {error && <span className="text-[11px] font-semibold text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
