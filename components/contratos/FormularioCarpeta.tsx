"use client";

import { useState } from "react";
import { IconFolderPlus } from "@tabler/icons-react";
import BotonEnviar from "./BotonEnviar";
import { CAMPO } from "@/lib/contratos/estilos";

/**
 * Crear una carpeta, plegado hasta que se necesita.
 *
 * La acción principal de esta pantalla es navegar y subir; crear carpetas pasa
 * de vez en cuando. Un formulario siempre desplegado al final de cada carpeta
 * compite por atención con la lista, que es lo que la gente viene a ver.
 */
export default function FormularioCarpeta({
  seccion,
  rutaPadre,
  accion,
}: {
  seccion: string;
  rutaPadre: string;
  accion: (seccion: string, rutaPadre: string, form: FormData) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const crear = accion.bind(null, seccion, rutaPadre);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconFolderPlus size={15} />
        Nueva carpeta
      </button>
    );
  }

  return (
    <form action={crear} className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
      <label className="min-w-0 flex-1 sm:flex-none">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
          Nueva carpeta
        </span>
        <input
          type="text"
          name="nombre"
          required
          autoFocus
          maxLength={120}
          placeholder="Nombre de la carpeta"
          className={`${CAMPO} w-full sm:w-64`}
        />
      </label>
      <BotonEnviar
        cargando="Creando..."
        className="rounded-lg bg-azul px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave"
      >
        Crear
      </BotonEnviar>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="px-2 py-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta"
      >
        Cancelar
      </button>
    </form>
  );
}
