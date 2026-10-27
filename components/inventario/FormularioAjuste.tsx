"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAdjustments } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { ajustarAction } from "@/app/(protegido)/inventario/acciones";
import type { Lote, Ubicacion } from "@/lib/inventario-modelo";

type ProductoMin = { id: string; nombre: string };

export default function FormularioAjuste({
  producto,
  productos,
  ubicaciones,
  lotes = [],
}: {
  producto?: ProductoMin;
  productos?: ProductoMin[];
  ubicaciones: Ubicacion[];
  lotes?: Lote[];
}) {
  const [productoId, setProductoId] = useState(producto?.id ?? "");
  const [ubicacionId, setUbicacionId] = useState(ubicaciones[0]?.id ?? "");
  const [loteId, setLoteId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const internas = ubicaciones.filter((u) => u.tipo === "interna");

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

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {!producto && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Producto</span>
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={CAMPO} required>
              <option value="">— Elige —</option>
              {(productos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">Ubicación</span>
          <select value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className={CAMPO} required>
            {internas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        {lotes.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Lote / serie (opcional)</span>
            <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className={CAMPO}>
              <option value="">— Sin lote —</option>
              {lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">Cantidad contada</span>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} type="number" step="0.001" className={CAMPO} placeholder="0" required />
        </label>
      </div>

      {mensaje && (
        <p className={`rounded-lg px-3 py-2 text-sm ${mensaje.tono === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
          {mensaje.texto}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
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
