"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconSearch } from "@tabler/icons-react";
import { conciliarDocumentosAction } from "@/app/(protegido)/gestion-financiera/acciones-tesoreria";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { BOTON, CAMPO } from "./ui";
import { avisar } from "./dialogos";

export interface DocPorConciliar {
  id: string;
  direccion: "emitido" | "recibido";
  tipo: string;
  folio: string;
  fecha: string;
  nombre: string | null;
  rut: string;
  monto: number;
}

/**
 * Elige uno o varios documentos «pagados, por conciliar» para ligarlos a un movimiento del banco. Primero los que
 * calzan con el monto; se busca por folio, nombre, RUT o monto.
 */
export default function ConciliarDocumentos({ movimiento, documentos, alOk }: { movimiento: { id: string; monto: number; fecha: string }; documentos: DocPorConciliar[]; alOk?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [pendiente, iniciar] = useTransition();
  const objetivo = Math.abs(movimiento.monto);
  const direccion = movimiento.monto > 0 ? "emitido" : "recibido";
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\./g, "");
    return documentos
      .filter((d) => d.direccion === direccion)
      .filter((d) => !t || `${d.folio} ${d.nombre ?? ""} ${d.rut} ${d.monto}`.toLowerCase().replace(/\./g, "").includes(t))
      .sort((a, b) => Number(b.monto === objetivo) - Number(a.monto === objetivo) || Math.abs(a.monto - objetivo) - Math.abs(b.monto - objetivo))
      .slice(0, 80);
  }, [documentos, direccion, q, objetivo]);
  const suma = documentos.filter((d) => elegidos.has(d.id)).reduce((s, d) => s + d.monto, 0);
  const alternar = (id: string) => setElegidos((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-3 text-sm">
      <p className="text-[12px] text-gris">
        {movimiento.monto > 0 ? "Abono" : "Cargo"} del {fechaCl(movimiento.fecha)} por <strong className="text-tinta">{clp(objetivo)}</strong>. Elige {movimiento.monto > 0 ? "las facturas emitidas que paga este cobro" : "las facturas recibidas que paga este cargo"}: se registra el {movimiento.monto > 0 ? "cobro" : "pago"} ligado al banco.
      </p>
      <label className="relative block">
        <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, nombre, RUT o monto…" className={`${CAMPO} pl-9`} autoFocus />
      </label>
      <div className="max-h-80 divide-y divide-borde overflow-y-auto rounded-xl border border-borde">
        {lista.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-gris">No hay documentos por conciliar que calcen.</p>}
        {lista.map((d) => (
          <label key={d.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${elegidos.has(d.id) ? "bg-naranjo/[0.06]" : "hover:bg-tinta/[0.03]"}`}>
            <input type="checkbox" checked={elegidos.has(d.id)} onChange={() => alternar(d.id)} />
            <span className="w-24 shrink-0 text-[12px] font-semibold text-tinta">{d.tipo} {d.folio}</span>
            <span className="w-20 shrink-0 text-[12px] text-gris">{fechaCl(d.fecha)}</span>
            <span className="min-w-0 flex-1 truncate text-[13px]">{d.nombre ?? d.rut}</span>
            <span className={`shrink-0 text-right font-semibold tabular-nums ${d.monto === objetivo ? "text-ok" : ""}`}>{clp(d.monto)}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 text-[13px]">
          Elegido: <strong>{clp(suma)}</strong>
          {elegidos.size > 0 && suma !== objetivo && <span className="text-aviso"> · diferencia {clp(objetivo - suma)}</span>}
        </span>
        <button
          type="button"
          disabled={pendiente || elegidos.size === 0}
          className={BOTON}
          onClick={() =>
            iniciar(async () => {
              const r = await conciliarDocumentosAction(movimiento.id, [...elegidos]);
              if (!r.ok) return avisar(r.error);
              if (r.mensaje && r.mensaje !== "Conciliado.") avisar(r.mensaje);
              router.refresh();
              alOk?.();
            })
          }
        >
          {pendiente && <IconLoader2 size={14} className="animate-spin" />} Conciliar {elegidos.size > 0 ? `(${elegidos.size})` : ""}
        </button>
      </div>
    </div>
  );
}
