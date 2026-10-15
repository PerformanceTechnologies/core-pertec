"use client";

import { useRef, useState } from "react";
import { IconBuildingFactory2, IconPhotoPlus } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import { reducirImagen } from "./reducirImagen";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import { crearContratoAction } from "@/app/(protegido)/contratos/acciones-contratos";

const ETIQUETA = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris";

/**
 * Lo mínimo para abrir un contrato: el nombre, y lo que lo identifica.
 *
 * El nombre es también el de su carpeta en SharePoint (CONTRATOS/<nombre>), por eso es lo único
 * obligatorio. Lo demás se puede completar después desde la configuración del contrato.
 */
export default function FormularioContratoNuevo() {
  const { estado, enviar, pendiente } = useFormulario(crearContratoAction);
  const [logo, setLogo] = useState<string | null>(null);
  const [errorDeLogo, setErrorDeLogo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function elegirLogo(archivo: File | undefined) {
    if (!archivo) return;
    try {
      setErrorDeLogo(null);
      setLogo(await reducirImagen(archivo));
    } catch (e) {
      setErrorDeLogo(e instanceof Error ? e.message : "No se pudo leer la imagen.");
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Nombre del contrato</span>
        <input
          name="nombre"
          required
          maxLength={120}
          placeholder="Ej.: Servicio de mantención Planta Ventanas"
          className={CAMPO}
        />
        <span className="mt-1 block text-[11px] text-gris">
          Es también el nombre de su carpeta en SharePoint. No puede llevar &quot; * : &lt; &gt; ? | / \
        </span>
      </label>

      <div className="sm:col-span-2">
        <span className={ETIQUETA}>Logo de la empresa (opcional)</span>
        <div className="flex items-center gap-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-borde bg-superficie">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local, sin nada que optimizar
              <img src={logo} alt="Vista previa del logo" className="h-full w-full object-contain p-1.5" />
            ) : (
              <IconBuildingFactory2 size={26} className="text-naranjo" aria-hidden />
            )}
          </span>
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void elegirLogo(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gris transition hover:border-naranjo/50 hover:text-naranjo"
          >
            <IconPhotoPlus size={15} />
            {logo ? "Cambiar imagen" : "Elegir imagen"}
          </button>
          {logo && (
            <button type="button" onClick={() => setLogo(null)} className="text-xs text-gris hover:text-red-600">
              Quitar
            </button>
          )}
        </div>
        {errorDeLogo && <span className="mt-1 block text-[11px] font-semibold text-red-600">{errorDeLogo}</span>}
        <input type="hidden" name="logo" value={logo ?? ""} />
      </div>

      <label>
        <span className={ETIQUETA}>Cliente / mandante</span>
        <input name="cliente" maxLength={120} placeholder="Ej.: CODELCO DCH" className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>N.º de contrato</span>
        <input name="numero" maxLength={60} placeholder="Ej.: 4600032681" className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>Fecha de inicio</span>
        <input name="fecha_inicio" type="date" className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>Administrador de contrato</span>
        <input name="administrador" maxLength={120} className={CAMPO} />
      </label>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <BotonGuardar pendiente={pendiente} cargando="Creando el contrato y sus carpetas…">
          Crear contrato
        </BotonGuardar>
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}
