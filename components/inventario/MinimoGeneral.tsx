"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconCheck } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { guardarMinimoGeneralAction } from "@/app/(protegido)/inventario/acciones";

/** El aviso de stock bajo para todos los productos: un mínimo y hasta cuánto comprar. */
export default function MinimoGeneral({ minimo, maximo }: { minimo: number; maximo: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar(fd: FormData) {
    setMensaje(null);
    iniciar(async () => {
      const r = await guardarMinimoGeneralAction(fd);
      setMensaje(r.ok ? { ok: true, texto: "Guardado. Ya aplica a todos los productos." } : { ok: false, texto: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <form action={guardar} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-36">
          <span className="mb-1 block text-xs font-semibold text-gris">Avisar con menos de</span>
          <input name="minimo" type="number" min="0" step="1" defaultValue={minimo} className={CAMPO} />
        </label>
        <label className="w-36">
          <span className="mb-1 block text-xs font-semibold text-gris">Comprar hasta</span>
          <input name="maximo" type="number" min="0" step="1" defaultValue={maximo} className={CAMPO} />
        </label>
        <button type="submit" disabled={pendiente} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-naranjo-suave disabled:opacity-60">
          {pendiente ? "Guardando…" : <><IconBell size={16} /> Guardar aviso</>}
        </button>
      </div>
      <p className="text-xs text-gris">
        Con 0 no avisa. Un producto que tenga su propio mínimo en la ficha usa el suyo en vez de este.
      </p>
      {mensaje && (
        <p className={`flex items-center gap-1.5 text-sm ${mensaje.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {mensaje.ok && <IconCheck size={16} />} {mensaje.texto}
        </p>
      )}
    </form>
  );
}
