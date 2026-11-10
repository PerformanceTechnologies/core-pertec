"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconReceipt } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { moverGastosAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { pesos } from "@/lib/rendidor/fondos-modelo";

const fechaCorta = (f: string | null) =>
  f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Sin fecha";

/** Dentro de un informe: traer gastos ya subidos en «Mis gastos». */
export default function AgregarMisGastos({
  bolsaId,
  informeId,
  gastos,
}: {
  bolsaId: string;
  informeId: string;
  gastos: { id: string; proveedor: string; fecha: string | null; total: number }[];
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [elegidos, setElegidos] = useState<string[]>(() => gastos.map((g) => g.id));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const total = gastos.filter((g) => elegidos.includes(g.id)).reduce((s, g) => s + g.total, 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-500/[0.06] px-4 py-3 text-left transition hover:bg-amber-500/10"
      >
        <IconReceipt size={20} className="shrink-0 text-amber-600" />
        <span className="flex-1 text-sm text-tinta">
          <b>Tienes {gastos.length} gasto{gastos.length === 1 ? "" : "s"} en «Mis gastos»</b> por {pesos(gastos.reduce((s, g) => s + g.total, 0))}. Agrégalos a este informe.
        </span>
        <span className="text-sm font-bold text-naranjo">Agregar →</span>
      </button>
      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Agregar mis gastos" descripcion="Elige cuáles pasan a este informe." ancho="max-w-lg">
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
          {gastos.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={elegidos.includes(g.id)}
                  onChange={(e) => setElegidos((xs) => (e.target.checked ? [...xs, g.id] : xs.filter((x) => x !== g.id)))}
                  className="h-4 w-4 accent-[var(--color-naranjo)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tinta">{g.proveedor?.trim() || "Sin proveedor"}</span>
                  <span className="block text-[11px] text-gris">{fechaCorta(g.fecha)}</span>
                </span>
                <span className="font-condensed text-lg font-bold tabular-nums">{pesos(g.total)}</span>
              </label>
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={!elegidos.length || pendiente}
            onClick={() =>
              iniciar(async () => {
                setError(null);
                const r = await moverGastosAction(bolsaId, informeId, elegidos);
                if (!r.ok) return setError(r.error);
                setAbierta(false);
                router.refresh();
              })
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-naranjo px-5 text-sm font-bold text-white disabled:opacity-40"
          >
            {pendiente && <IconLoader2 size={16} className="animate-spin" />} Agregar {elegidos.length} ({pesos(total)})
          </button>
        </div>
      </VentanaModal>
    </>
  );
}
