"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene la pantalla al día sin recargar: cada pocos segundos pide los datos de nuevo (solo con la
 * pestaña a la vista) y al volver a ella. Muestra la hora de la última actualización.
 */
export default function EnVivo({ cadaSegundos = 15 }: { cadaSegundos?: number }) {
  const router = useRouter();
  const [hora, setHora] = useState<string | null>(null);

  useEffect(() => {
    const ahora = () => new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Santiago" });
    const refrescar = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setHora(ahora());
    };
    const t = window.setInterval(refrescar, cadaSegundos * 1000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [router, cadaSegundos]);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700" aria-live="off">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      En vivo{hora ? ` · ${hora}` : ""}
    </span>
  );
}
