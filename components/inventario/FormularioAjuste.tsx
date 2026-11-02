"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAdjustments, IconArrowRight } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { ajustarAction } from "@/app/(protegido)/inventario/acciones";
import { formatearCantidad, type Lote, type Ubicacion } from "@/lib/inventario-modelo";

type ProductoMin = { id: string; nombre: string };
type Stock = Record<string, { aMano: number; disponible: number }>;

export default function FormularioAjuste({
  producto,
  productos,
  ubicaciones,
  lotes = [],
  stock,
}: {
  producto?: ProductoMin;
  productos?: ProductoMin[];
  ubicaciones: Ubicacion[];
  lotes?: Lote[];
  /** Si viene, se muestra cuánto hay hoy y la diferencia antes de aplicar. */
  stock?: Stock;
}) {
  const [productoId, setProductoId] = useState(producto?.id ?? "");
  const [ubicacionId, setUbicacionId] = useState(ubicaciones.find((u) => u.tipo === "interna")?.id ?? "");
  const [loteId, setLoteId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const internas = ubicaciones.filter((u) => u.tipo === "interna");

  // El conteo por lote no se puede comparar con el total de la ubicación: ahí no se adelanta la diferencia.
  const hoy = stock && productoId && ubicacionId && !loteId ? stock[`${productoId}|${ubicacionId}`]?.aMano ?? 0 : null;
  const diferencia = hoy !== null && cantidad !== "" ? Number(cantidad) - hoy : null;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    if (!productoId || !ubicacionId || cantidad === "") {
      setMensaje({ tono: "error", texto: "Completa producto, ubicación y cantidad contada." });
      return;
    }
    iniciar(async () => {
      const r = await ajustarAction({
        productoId,
        ubicacionId,
        loteId: loteId || null,
        cantidadContada: Number(cantidad),
      });
      if (r.ok) {
        setMensaje({ tono: "ok", texto: r.mensaje ?? "Ajuste aplicado." });
        setCantidad("");
        router.refresh();
      } else {
        setMensaje({ tono: "error", texto: r.error });
      }
    });
  }

  const numero = (n: number) => (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-naranjo text-[11px] font-bold text-white">{n}</span>
  );
  const nDonde = producto ? 1 : 2;
  const nCantidad = nDonde + (lotes.length > 0 ? 2 : 1);

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!producto && (
        <label className="flex items-start gap-3">
          {numero(1)}
          <span className="block flex-1">
            <span className="mb-1 block text-xs font-semibold text-gris">¿Qué producto contaste?</span>
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={CAMPO} required>
              <option value="">— Elige —</option>
              {(productos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </span>
        </label>
      )}
      <label className="flex items-start gap-3">
        {numero(nDonde)}
        <span className="block flex-1">
          <span className="mb-1 block text-xs font-semibold text-gris">¿Dónde?</span>
          <select value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className={CAMPO} required>
            {internas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </span>
      </label>
      {lotes.length > 0 && (
        <label className="flex items-start gap-3">
          {numero(nDonde + 1)}
          <span className="block flex-1">
            <span className="mb-1 block text-xs font-semibold text-gris">Lote / serie (opcional)</span>
            <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className={CAMPO}>
              <option value="">— Sin lote —</option>
              {lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </span>
        </label>
      )}
      <label className="flex items-start gap-3">
        {numero(nCantidad)}
        <span className="block flex-1">
          <span className="mb-1 block text-xs font-semibold text-gris">¿Cuánto hay físicamente?</span>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} type="number" min="0" step="0.001" className={CAMPO} placeholder="0" required />
        </span>
      </label>

      {/* Lo que va a pasar, antes de aplicarlo. */}
      {hoy !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-borde/20 px-4 py-3 text-sm">
          <span>
            <span className="block text-[11px] text-gris">Sistema hoy</span>
            <span className="font-bold tabular-nums text-tinta">{formatearCantidad(hoy)}</span>
          </span>
          <IconArrowRight size={16} className="text-gris-suave" />
          <span>
            <span className="block text-[11px] text-gris">Contado</span>
            <span className="font-bold tabular-nums text-tinta">{cantidad === "" ? "—" : formatearCantidad(Number(cantidad))}</span>
          </span>
          {diferencia !== null && (
            <span
              className={`ml-auto rounded-full px-3 py-1 text-xs font-bold tabular-nums ${
                diferencia === 0 ? "bg-borde/60 text-gris" : diferencia > 0 ? "bg-emerald-500/12 text-emerald-700" : "bg-rose-500/12 text-rose-700"
              }`}
            >
              {diferencia === 0 ? "Sin diferencia" : `${diferencia > 0 ? "+" : ""}${formatearCantidad(diferencia)}`}
            </span>
          )}
        </div>
      )}

      {mensaje && (
        <p className={`rounded-lg px-3 py-2 text-sm ${mensaje.tono === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
          {mensaje.texto}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente || diferencia === 0}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:opacity-60"
      >
        <IconAdjustments size={16} /> {pendiente ? "Aplicando…" : "Aplicar ajuste"}
      </button>
      <p className="text-xs text-gris-suave">
        El sistema calcula la diferencia con lo que hay hoy y la mueve contra la ubicación «Ajustes de inventario».
      </p>
    </form>
  );
}
