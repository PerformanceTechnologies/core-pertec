"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconLoader2, IconPaperclip, IconSearch } from "@tabler/icons-react";
import VisorComprobante, { type Comprobante } from "@/components/rendidor/VisorComprobante";
import { CAMPO } from "@/lib/estilos";
import { respaldoDeGastoAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { pesos } from "@/lib/rendidor/fondos-modelo";
import { ETIQUETA_ESTADO_GASTO, TONO_ESTADO_GASTO, type EstadoGasto, type FilaGastoAdmin } from "@/lib/rendidor/mis-gastos-modelo";

const fechaCorta = (f: string | null) =>
  f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Sin fecha";
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COLS = "md:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_6rem_minmax(9rem,auto)_minmax(0,1fr)_1.75rem]";

/** Todos los gastos de todas las personas, en lista, con filtros y el documento en un popup. */
export default function TodosLosGastos({ filas }: { filas: FilaGastoAdmin[] }) {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoGasto | "todos">("todos");
  const [persona, setPersona] = useState("");
  const [viendo, setViendo] = useState<Comprobante | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const personas = useMemo(() => [...new Set(filas.map((f) => f.quien))].sort((a, b) => a.localeCompare(b, "es")), [filas]);
  const cuenta = (e: EstadoGasto) => filas.filter((f) => f.estado === e).length;
  const visibles = useMemo(() => {
    const t = plano(q.trim());
    return filas.filter(
      (f) =>
        (estado === "todos" || f.estado === estado) &&
        (!persona || f.quien === persona) &&
        (!t || plano(`${f.proveedor} ${f.numeroDocumento ?? ""} ${f.categoria ?? ""} ${f.quien} ${f.informeTitulo ?? ""} ${f.proyectoNombre ?? ""}`).includes(t)),
    );
  }, [filas, q, estado, persona]);
  const total = visibles.reduce((s, f) => s + f.total, 0);

  const ver = async (f: FilaGastoAdmin) => {
    setAbriendo(f.id);
    setError(null);
    const r = await respaldoDeGastoAction(f.rendicionId, f.id);
    setAbriendo(null);
    if (!r.ok) return setError(r.error);
    setViendo({ url: r.url, nombre: r.nombre, esPdf: r.esPdf });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[12rem] flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-suave" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor, folio, persona, informe…" className={`${CAMPO} pl-8`} />
        </span>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} className={`${CAMPO} max-w-[14rem]`} aria-label="Persona">
          <option value="">Todas las personas</option>
          {personas.map((p) => (<option key={p} value={p}>{p}</option>))}
        </select>
        <div className="inline-flex flex-wrap rounded-lg border border-borde p-0.5 text-xs font-semibold">
          {([["todos", `Todos ${filas.length}`], ["borrador", `Borrador ${cuenta("borrador")}`], ["en_informe", `En informe ${cuenta("en_informe")}`], ["cerrado", `Cerrado ${cuenta("cerrado")}`]] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setEstado(k)} className={`rounded-md px-2.5 py-1 transition ${estado === k ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>{t}</button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-gris">{visibles.length} {visibles.length === 1 ? "gasto" : "gastos"} · {pesos(total)}</p>
      {error && <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="mt-2 overflow-hidden rounded-lg border border-borde">
        <div className={`hidden ${COLS} items-center gap-2.5 border-b border-borde bg-tinta/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gris md:grid`}>
          <span>Fecha</span><span>Persona</span><span>Proveedor</span><span>Categoría</span><span className="text-right">Total</span><span>Estado</span><span>Informe</span><span />
        </div>
        <ul className="divide-y divide-borde bg-superficie">
          {visibles.length === 0 && <li className="px-4 py-5 text-center text-sm text-gris">No hay gastos con ese filtro.</li>}
          {visibles.slice(0, 500).map((f) => (
            <li key={f.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-1 text-[13px] leading-tight ${COLS}`}>
              <span className="hidden text-xs tabular-nums text-gris md:block">{fechaCorta(f.fecha)}</span>
              <span className="hidden truncate text-xs text-tinta md:block">{f.quien}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-tinta">{f.proveedor?.trim() || "Sin proveedor"}{f.numeroDocumento ? <span className="ml-1.5 text-[11px] font-normal text-gris">N° {f.numeroDocumento}</span> : null}</span>
                <span className="block truncate text-[11px] text-gris md:hidden">{f.quien} · {fechaCorta(f.fecha)}</span>
              </span>
              <span className="hidden min-w-0 truncate text-xs text-gris md:block" title={f.proyectoNombre ?? undefined}>{f.categoria ?? "—"}{f.proyectoNombre ? ` · ${f.proyectoNombre}` : ""}</span>
              <span className="text-right font-semibold tabular-nums text-tinta">{pesos(f.total)}</span>
              <span className="hidden whitespace-nowrap md:block">
                <span className={`inline-flex rounded px-1.5 py-px text-[10.5px] font-semibold ${TONO_ESTADO_GASTO[f.estado]}`}>{ETIQUETA_ESTADO_GASTO[f.estado]}</span>
                {f.estado === "cerrado" && <span className={`ml-1 text-[10px] ${f.conciliado ? "font-semibold text-emerald-700" : "text-gris"}`}>{f.conciliado ? "Conciliado" : "Por conciliar"}</span>}
              </span>
              <span className="hidden min-w-0 truncate text-xs md:block">
                {f.informeId ? <Link href={`/rendir-gastos/${f.informeId}`} className="font-semibold text-naranjo hover:underline">{f.informeTitulo}</Link> : <span className="text-gris-suave">Mis gastos</span>}
              </span>
              <span className="flex justify-end">
                {f.respaldo && (
                  <button type="button" title="Ver documento" aria-label="Ver documento" onClick={() => ver(f)} className="grid h-6 w-6 place-items-center rounded text-gris-suave transition hover:bg-naranjo/10 hover:text-naranjo">
                    {abriendo === f.id ? <IconLoader2 size={14} className="animate-spin" /> : <IconPaperclip size={14} />}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {visibles.length > 500 && <p className="mt-2 text-xs text-gris">Se muestran los 500 más recientes: afina el filtro para ver el resto.</p>}
      {viendo && <VisorComprobante comprobante={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}
