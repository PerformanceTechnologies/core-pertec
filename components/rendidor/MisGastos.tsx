"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconLoader2 } from "@tabler/icons-react";
import PanelRendicion from "@/components/rendidor/PanelRendicion";
import { CAMPO } from "@/lib/estilos";
import { moverGastosAction } from "@/app/(protegido)/rendir-gastos/acciones";
import type { Rendicion } from "@/lib/rendidor/tipos";
import { pesos } from "@/lib/rendidor/fondos-modelo";

const fechaCorta = (f: string | null) =>
  f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Sin fecha";

/**
 * «Mis gastos»: se suben y se leen solos (el mismo panel de los informes) y después se eligen
 * para pasarlos a un informe abierto.
 */
export default function MisGastos({
  bolsa,
  urlsRespaldo,
  informes,
}: {
  bolsa: Rendicion;
  urlsRespaldo: Record<string, string>;
  informes: { id: string; titulo: string }[];
}) {
  const router = useRouter();
  const [gastos, setGastos] = useState(bolsa.gastos);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [destino, setDestino] = useState(informes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const vigentes = elegidos.filter((id) => gastos.some((g) => g.id === id));
  const total = gastos.filter((g) => vigentes.includes(g.id)).reduce((s, g) => s + (Number(g.total) || 0), 0);

  return (
    <div className="space-y-5">
      <PanelRendicion key={bolsa.id} rendicionInicial={bolsa} urlsRespaldo={urlsRespaldo} editable puedeEnviar={false} alCambiarGastos={setGastos} />

      {gastos.length > 0 && (
        <section className="rounded-2xl border border-naranjo/30 bg-naranjo/[0.04] p-4 sm:p-5">
          <h2 className="text-base font-bold text-tinta">Pasar gastos a un informe</h2>
          <p className="mt-0.5 text-xs text-gris">Marca los gastos que vas a rendir y elige el informe. Si no tienes uno abierto, créalo en «Mis informes».</p>
          <ul className="mt-3 divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
            {gastos.map((g) => (
              <li key={g.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={vigentes.includes(g.id)}
                    onChange={(e) => setElegidos((xs) => (e.target.checked ? [...xs, g.id] : xs.filter((x) => x !== g.id)))}
                    className="h-4 w-4 accent-[var(--color-naranjo)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tinta">{g.proveedor?.trim() || "Sin proveedor"}</span>
                    <span className="block text-[11px] text-gris">{fechaCorta(g.fecha)}{g.categoria ? ` · ${g.categoria}` : ""}</span>
                  </span>
                  <span className="font-condensed text-lg font-bold tabular-nums text-tinta">{pesos(Number(g.total) || 0)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setElegidos(vigentes.length === gastos.length ? [] : gastos.map((g) => g.id))} className="text-xs font-semibold text-naranjo">
              {vigentes.length === gastos.length ? "Quitar todos" : "Marcar todos"}
            </button>
            <span className="flex-1" />
            {informes.length === 0 ? (
              <span className="text-sm text-gris">No tienes informes abiertos.</span>
            ) : (
              <>
                <select value={destino} onChange={(e) => setDestino(e.target.value)} className={`${CAMPO} max-w-[16rem]`} aria-label="Informe de destino">
                  {informes.map((i) => (
                    <option key={i.id} value={i.id}>{i.titulo}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!vigentes.length || !destino || pendiente}
                  onClick={() =>
                    iniciar(async () => {
                      setError(null);
                      const r = await moverGastosAction(bolsa.id, destino, vigentes);
                      if (!r.ok) return setError(r.error);
                      router.push(`/rendir-gastos/${destino}`);
                    })
                  }
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-sm font-bold text-white shadow-sm disabled:opacity-40"
                >
                  {pendiente ? <IconLoader2 size={15} className="animate-spin" /> : <IconArrowRight size={15} />}
                  Pasar {vigentes.length || ""} {vigentes.length ? `(${pesos(total)})` : ""}
                </button>
              </>
            )}
          </div>
          {error && <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
        </section>
      )}
    </div>
  );
}
