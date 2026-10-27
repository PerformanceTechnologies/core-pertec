"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import type { Resultado } from "@/app/(protegido)/inventario/acciones";

export type CampoDef = {
  name: string;
  etiqueta: string;
  tipo?: "text" | "number" | "select";
  requerido?: boolean;
  placeholder?: string;
  opciones?: { valor: string; etiqueta: string }[];
};

/**
 * Formulario en línea para crear una entidad simple de configuración. Recibe la
 * server action (que toma FormData y devuelve Resultado) y la lista de campos.
 */
export default function CreadorEntidad({
  accion,
  campos,
  textoBoton = "Agregar",
}: {
  accion: (fd: FormData) => Promise<Resultado>;
  campos: CampoDef[];
  textoBoton?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = await accion(fd);
      if (r.ok) {
        router.refresh();
        document.querySelectorAll<HTMLInputElement>("[data-limpiar]").forEach((el) => (el.value = ""));
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form action={enviar} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {campos.map((c) => (
          <label key={c.name} className="min-w-32 flex-1">
            <span className="mb-1 block text-xs font-semibold text-gris">{c.etiqueta}</span>
            {c.tipo === "select" ? (
              <select name={c.name} required={c.requerido} className={CAMPO}>
                {(c.opciones ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
              </select>
            ) : (
              <input name={c.name} type={c.tipo ?? "text"} required={c.requerido} placeholder={c.placeholder} data-limpiar className={CAMPO} />
            )}
          </label>
        ))}
        <button type="submit" disabled={pendiente} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-azul px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:opacity-60">
          <IconPlus size={16} /> {textoBoton}
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
