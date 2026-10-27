"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { crearTransferenciaAction } from "@/app/(protegido)/inventario/acciones";
import { ETIQUETA_CLASE, type Lote, type TipoOperacion, type Ubicacion } from "@/lib/inventario-modelo";

type ProductoMin = { id: string; nombre: string; unidadAbrev: string };
type Linea = { productoId: string; cantidad: string; loteId: string };

export default function FormularioTransferencia({
  tipos,
  productos,
  ubicaciones,
  lotesPorProducto,
}: {
  tipos: TipoOperacion[];
  productos: ProductoMin[];
  ubicaciones: Ubicacion[];
  lotesPorProducto: Record<string, Lote[]>;
}) {
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "");
  const [contraparte, setContraparte] = useState("");
  const [nota, setNota] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ productoId: "", cantidad: "", loteId: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const tipo = useMemo(() => tipos.find((t) => t.id === tipoId), [tipos, tipoId]);
  const nombreUbi = new Map(ubicaciones.map((u) => [u.id, u.nombre]));
  const etiquetaContraparte =
    tipo?.clase === "recepcion" ? "Proveedor" : tipo?.clase === "entrega" ? "Cliente / faena" : "Referencia";

  function cambiarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor, ...(campo === "productoId" ? { loteId: "" } : {}) } : l)));
  }
  const agregar = () => setLineas((ls) => [...ls, { productoId: "", cantidad: "", loteId: "" }]);
  const quitar = (i: number) => setLineas((ls) => (ls.length === 1 ? ls : ls.filter((_, j) => j !== i)));

  function enviar() {
    setError(null);
    const limpias = lineas
      .filter((l) => l.productoId && Number(l.cantidad) > 0)
      .map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad), loteId: l.loteId || null }));
    if (!tipoId) return setError("Elige un tipo de operación.");
    if (limpias.length === 0) return setError("Agrega al menos una línea con producto y cantidad.");

    iniciar(async () => {
      const r = await crearTransferenciaAction({ tipoOperacionId: tipoId, contraparte: contraparte || null, nota: nota || null, lineas: limpias });
      if (r.ok && r.id) router.push(`/inventario/operaciones/${r.id}`);
      else if (!r.ok) setError(r.error);
    });
  }

  return (
    <form action={enviar} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">Tipo de operación</span>
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={CAMPO}>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {ETIQUETA_CLASE[t.clase]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gris">{etiquetaContraparte}</span>
          <input value={contraparte} onChange={(e) => setContraparte(e.target.value)} className={CAMPO} placeholder="Opcional" />
        </label>
      </div>

      {tipo && (
        <p className="rounded-lg bg-azul/5 px-3 py-2 text-xs text-gris">
          Mueve de <strong className="text-tinta">{nombreUbi.get(tipo.ubicacionOrigenId ?? "") ?? "—"}</strong>
          {" "}a <strong className="text-tinta">{nombreUbi.get(tipo.ubicacionDestinoId ?? "") ?? "—"}</strong>
        </p>
      )}

      <div className="space-y-2">
        <span className="block text-xs font-semibold text-gris">Líneas</span>
        {lineas.map((l, i) => {
          const lotes = lotesPorProducto[l.productoId] ?? [];
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={l.productoId} onChange={(e) => cambiarLinea(i, "productoId", e.target.value)} className={`${CAMPO} min-w-48 flex-1`}>
                <option value="">— Producto —</option>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {lotes.length > 0 && (
                <select value={l.loteId} onChange={(e) => cambiarLinea(i, "loteId", e.target.value)} className={`${CAMPO} w-40`}>
                  <option value="">— Lote —</option>
                  {lotes.map((lo) => <option key={lo.id} value={lo.id}>{lo.nombre}</option>)}
                </select>
              )}
              <input
                value={l.cantidad}
                onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)}
                type="number" min="0" step="0.001" placeholder="Cant."
                className={`${CAMPO} w-28`}
              />
              <button type="button" onClick={() => quitar(i)} className="grid h-11 w-10 place-items-center rounded-lg text-gris-suave transition hover:text-rose-500" title="Quitar línea">
                <IconTrash size={16} />
              </button>
            </div>
          );
        })}
        <button type="button" onClick={agregar} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cian hover:underline">
          <IconPlus size={16} /> Agregar línea
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gris">Nota</span>
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className={CAMPO} placeholder="Opcional" />
      </label>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end">
        <BotonGuardar pendiente={pendiente} cargando="Creando…">Crear operación</BotonGuardar>
      </div>
    </form>
  );
}
