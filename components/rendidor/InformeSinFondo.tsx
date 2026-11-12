"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconWallet } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { asociarFondoAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { pesos } from "@/lib/rendidor/fondos-modelo";

/** Un informe creado sin fondo: queda en borrador hasta asociarlo a uno de los fondos activos de quien rinde. */
export default function InformeSinFondo({ informeId, fondos, puedeAsociar }: { informeId: string; fondos: { id: string; codigo: string; saldo: number }[]; puedeAsociar: boolean }) {
  const router = useRouter();
  const [fondoId, setFondoId] = useState(fondos[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="rounded-2xl border border-sky-300/60 bg-sky-500/[0.06] px-5 py-4 text-sm text-sky-800 dark:text-sky-300">
      <div className="flex flex-wrap items-center gap-3">
        <IconWallet size={20} className="shrink-0" />
        <p className="min-w-[12rem] flex-1">
          <b>Informe sin fondo.</b> Queda en borrador: puedes agregarle gastos, editarlo o eliminarlo. Para enviarlo a revisión, asócialo a uno de tus fondos activos.
        </p>
        {puedeAsociar && fondos.length > 0 && (
          <>
            <select value={fondoId} onChange={(e) => setFondoId(e.target.value)} className={`${CAMPO} max-w-[15rem]`} aria-label="Fondo">
              {fondos.map((f) => (<option key={f.id} value={f.id}>{f.codigo} · saldo {pesos(f.saldo)}</option>))}
            </select>
            <button
              type="button"
              disabled={!fondoId || pendiente}
              onClick={() =>
                iniciar(async () => {
                  setError(null);
                  const r = await asociarFondoAction(informeId, fondoId);
                  if (!r.ok) return setError(r.error);
                  router.refresh();
                })
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-naranjo px-4 text-sm font-bold text-white shadow-sm disabled:opacity-40"
            >
              {pendiente && <IconLoader2 size={15} className="animate-spin" />} Asociar fondo
            </button>
          </>
        )}
        {puedeAsociar && fondos.length === 0 && <span className="text-xs">No tienes un fondo activo: pídelo con «Solicitar fondo».</span>}
      </div>
      {error && <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
