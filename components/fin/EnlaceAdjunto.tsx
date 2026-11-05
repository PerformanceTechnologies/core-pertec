"use client";

import { IconFile } from "@tabler/icons-react";
import { avisar } from "./dialogos";
import { enlaceAdjuntoAction } from "@/app/(protegido)/gestion-financiera/acciones-tesoreria";

/** Abre un respaldo con un enlace firmado de un minuto (el bucket es privado por empresa). */
export default function EnlaceAdjunto({ id, nombre }: { id: string; nombre: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const r = await enlaceAdjuntoAction(id);
        if (r.ok) window.open(r.url, "_blank", "noopener");
        else avisar(r.error);
      }}
      className="inline-flex max-w-full items-center gap-1.5 truncate text-left text-tinta hover:text-naranjo"
    >
      <IconFile size={14} className="shrink-0 text-gris" /> {nombre}
    </button>
  );
}
