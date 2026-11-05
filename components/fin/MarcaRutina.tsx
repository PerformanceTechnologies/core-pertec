"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck } from "@tabler/icons-react";
import { avisar } from "./dialogos";
import { marcarRutinaAction } from "@/app/(protegido)/gestion-financiera/acciones-config";

export default function MarcaRutina({ tarea, periodo, hecha }: { tarea: string; periodo: string; hecha: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => iniciar(async () => { const r = await marcarRutinaAction(tarea, periodo, !hecha); if (!r.ok) avisar(r.error); else router.refresh(); })}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition ${hecha ? "border-emerald-500 bg-emerald-500 text-white" : "border-borde text-transparent hover:border-emerald-500 hover:text-emerald-500"} ${pendiente ? "opacity-50" : ""}`}
      aria-label={hecha ? "Marcar pendiente" : "Marcar hecha"}
    >
      <IconCheck size={15} stroke={3} />
    </button>
  );
}
