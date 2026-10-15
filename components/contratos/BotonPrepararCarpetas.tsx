"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconFolderPlus } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { prepararCarpetasAction } from "@/app/(protegido)/contratos/acciones-contratos";

/** Crea las carpetas de SharePoint de un contrato que nació sin ellas (o las completa). */
export default function BotonPrepararCarpetas({ slug }: { slug: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            const r = await prepararCarpetasAction(slug);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-naranjo px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:cursor-progress disabled:opacity-60"
      >
        {pendiente ? <RuedaCarga className="h-4 w-4" /> : <IconFolderPlus size={16} />}
        Crear carpetas en SharePoint
      </button>
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
    </div>
  );
}
