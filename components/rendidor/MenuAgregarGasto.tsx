"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconCloudUpload, IconListCheck, IconLoader2, IconPencilPlus } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { moverGastosAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { pesos } from "@/lib/rendidor/fondos-modelo";

export interface BorradorElegible {
  id: string;
  proveedor: string;
  fecha: string | null;
  categoria: string | null;
  total: number;
}

const fechaCorta = (f: string | null) =>
  f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Sin fecha";

/**
 * «Agregar gasto» dentro de un informe: se elige entre los gastos que ya están en borrador en «Mis
 * gastos», o se ingresa uno nuevo (a mano, o subiendo documentos que se leen solos).
 */
export default function MenuAgregarGasto({
  abierta,
  alCerrar,
  borradores,
  bolsaId,
  informeId,
  alIngresarManual,
  alSubirDocumentos,
}: {
  abierta: boolean;
  alCerrar: () => void;
  borradores: BorradorElegible[];
  bolsaId: string | null;
  informeId: string;
  alIngresarManual: () => void;
  alSubirDocumentos: () => void;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<"menu" | "borradores">("menu");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const total = borradores.filter((b) => elegidos.includes(b.id)).reduce((s, b) => s + b.total, 0);

  const cerrar = () => {
    setVista("menu");
    setElegidos([]);
    setError(null);
    alCerrar();
  };

  const opcion = "flex w-full items-start gap-3 rounded-2xl border border-borde bg-superficie p-4 text-left transition hover:border-naranjo/60 hover:bg-naranjo/[0.03] disabled:cursor-not-allowed disabled:opacity-50";
  const icono = "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-naranjo/10 text-naranjo";

  return (
    <VentanaModal abierta={abierta} alCerrar={cerrar} titulo="Agregar gasto al informe" descripcion={vista === "menu" ? "Elige de dónde viene el gasto." : "Marca los gastos en borrador que vas a rendir en este informe."} ancho="max-w-lg">
      {vista === "menu" ? (
        <div className="space-y-2.5">
          <button type="button" disabled={!bolsaId || borradores.length === 0} onClick={() => setVista("borradores")} className={opcion}>
            <span className={icono}><IconListCheck size={22} /></span>
            <span>
              <span className="block text-base font-bold text-tinta">Elegir de mis gastos en borrador</span>
              <span className="block text-xs text-gris">{borradores.length === 0 ? "No tienes gastos en borrador." : `Tienes ${borradores.length} por un total de ${pesos(borradores.reduce((s, b) => s + b.total, 0))}.`}</span>
            </span>
          </button>
          <button type="button" onClick={alIngresarManual} className={opcion}>
            <span className={icono}><IconPencilPlus size={22} /></span>
            <span>
              <span className="block text-base font-bold text-tinta">Ingresar un gasto a mano</span>
              <span className="block text-xs text-gris">Un gasto nuevo: proveedor, fecha, tipo, categoría y total.</span>
            </span>
          </button>
          <button type="button" onClick={alSubirDocumentos} className={opcion}>
            <span className={icono}><IconCloudUpload size={22} /></span>
            <span>
              <span className="block text-base font-bold text-tinta">Subir documentos</span>
              <span className="block text-xs text-gris">Se leen solos. Puedes subir uno o varios a la vez.</span>
            </span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => setVista("menu")} className="inline-flex items-center gap-1 text-xs font-semibold text-gris hover:text-tinta"><IconArrowLeft size={14} /> Volver</button>
          <ul className="max-h-72 divide-y divide-borde overflow-auto rounded-xl border border-borde">
            {borradores.map((b) => (
              <li key={b.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5">
                  <input type="checkbox" checked={elegidos.includes(b.id)} onChange={(e) => setElegidos((xs) => (e.target.checked ? [...xs, b.id] : xs.filter((x) => x !== b.id)))} className="h-4 w-4 accent-[var(--color-naranjo)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tinta">{b.proveedor?.trim() || "Sin proveedor"}</span>
                    <span className="block text-[11px] text-gris">{fechaCorta(b.fecha)}{b.categoria ? ` · ${b.categoria}` : ""}</span>
                  </span>
                  <span className="font-condensed text-base font-bold tabular-nums text-tinta">{pesos(b.total)}</span>
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setElegidos(elegidos.length === borradores.length ? [] : borradores.map((b) => b.id))} className="text-xs font-semibold text-naranjo">
              {elegidos.length === borradores.length ? "Quitar todos" : "Marcar todos"}
            </button>
            <button
              type="button"
              disabled={!elegidos.length || pendiente || !bolsaId}
              onClick={() =>
                iniciar(async () => {
                  setError(null);
                  const r = await moverGastosAction(bolsaId!, informeId, elegidos);
                  if (!r.ok) return setError(r.error);
                  cerrar();
                  router.refresh();
                })
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-naranjo px-5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
            >
              {pendiente && <IconLoader2 size={16} className="animate-spin" />} Agregar {elegidos.length || ""} {elegidos.length ? `(${pesos(total)})` : ""}
            </button>
          </div>
        </div>
      )}
    </VentanaModal>
  );
}
