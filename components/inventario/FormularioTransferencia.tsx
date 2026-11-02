"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconArrowRight, IconCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { CAMPO, TARJETA } from "@/lib/estilos";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { IconoClase } from "@/components/inventario/Visual";
import PasosAsistente from "@/components/inventario/PasosAsistente";
import { crearTransferenciaAction } from "@/app/(protegido)/inventario/acciones";
import {
  ETIQUETA_CLASE,
  formatearCantidad,
  type ClaseOperacion,
  type Lote,
  type TipoOperacion,
  type Ubicacion,
} from "@/lib/inventario-modelo";

type ProductoMin = { id: string; nombre: string; unidadAbrev: string };
type Linea = { productoId: string; cantidad: string; loteId: string; costo: string };
type Stock = Record<string, { aMano: number; disponible: number }>;

const LINEA_VACIA: Linea = { productoId: "", cantidad: "", loteId: "", costo: "" };

// Qué significa cada clase, dicho en simple, para la tarjeta del paso 1.
const AYUDA_CLASE: Record<ClaseOperacion, string> = {
  recepcion: "Llega mercadería de un proveedor y entra a bodega.",
  entrega: "Sale mercadería de bodega hacia un cliente o faena.",
  interna: "Mueves stock entre ubicaciones propias.",
  ajuste: "Corriges el stock tras un conteo.",
};

const PASOS = [
  { n: 1, t: "Qué vas a hacer", d: "Tipo de operación" },
  { n: 2, t: "Productos", d: "Qué y cuánto" },
  { n: 3, t: "Revisar y crear", d: "Confirma" },
];

export default function FormularioTransferencia({
  tipos,
  productos,
  ubicaciones,
  lotesPorProducto,
  stock,
  tipoInicial,
}: {
  tipos: TipoOperacion[];
  productos: ProductoMin[];
  ubicaciones: Ubicacion[];
  lotesPorProducto: Record<string, Lote[]>;
  stock: Stock;
  tipoInicial?: string;
}) {
  const [paso, setPaso] = useState(tipoInicial ? 2 : 1);
  const [tipoId, setTipoId] = useState(tipoInicial ?? "");
  const [contraparte, setContraparte] = useState("");
  const [nota, setNota] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_VACIA }]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [paso]);

  const tipo = useMemo(() => tipos.find((t) => t.id === tipoId), [tipos, tipoId]);
  const esRecepcion = tipo?.clase === "recepcion";
  const origenInterno = ubicaciones.find((u) => u.id === tipo?.ubicacionOrigenId)?.tipo === "interna";
  const nombreUbi = new Map(ubicaciones.map((u) => [u.id, u.nombre]));
  const producto = new Map(productos.map((p) => [p.id, p]));
  const etiquetaContraparte =
    tipo?.clase === "recepcion" ? "Proveedor" : tipo?.clase === "entrega" ? "Cliente / faena" : "Referencia";

  // Tipos agrupados por clase; la página ya los trae con la clase del atajo primero.
  const grupos = ([...new Set(tipos.map((t) => t.clase))] as ClaseOperacion[])
    .map((c) => ({ clase: c, tipos: tipos.filter((t) => t.clase === c) }))
    .filter((g) => g.tipos.length > 0);

  const disponibleEnOrigen = (productoId: string) =>
    tipo?.ubicacionOrigenId ? stock[`${productoId}|${tipo.ubicacionOrigenId}`]?.disponible ?? 0 : 0;

  function cambiarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor, ...(campo === "productoId" ? { loteId: "" } : {}) } : l)));
  }
  const agregar = () => setLineas((ls) => [...ls, { ...LINEA_VACIA }]);
  const quitar = (i: number) => setLineas((ls) => (ls.length === 1 ? [{ ...LINEA_VACIA }] : ls.filter((_, j) => j !== i)));

  const validas = lineas.filter((l) => l.productoId && Number(l.cantidad) > 0);
  const faltaStock = origenInterno ? validas.filter((l) => Number(l.cantidad) > disponibleEnOrigen(l.productoId)) : [];

  function elegirTipo(id: string) {
    setTipoId(id);
    setError(null);
    setPaso(2);
  }

  function aRevisar() {
    if (validas.length === 0) return setError("Agrega al menos un producto con su cantidad.");
    setError(null);
    setPaso(3);
  }

  function crear() {
    setError(null);
    const limpias = validas.map((l) => ({
      productoId: l.productoId, cantidad: Number(l.cantidad), loteId: l.loteId || null,
      costoUnitario: esRecepcion && l.costo !== "" ? Number(l.costo) : null,
    }));
    iniciar(async () => {
      const r = await crearTransferenciaAction({ tipoOperacionId: tipoId, contraparte: contraparte || null, nota: nota || null, lineas: limpias });
      if (r.ok && r.id) router.push(`/inventario/operaciones/${r.id}`);
      else if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <PasosAsistente
        etiqueta="Nueva operación"
        titulo="Registra un movimiento de stock"
        bajada="Elige qué vas a hacer, agrega los productos y revisa antes de crear. Nada se mueve hasta que valides la operación."
        pasos={PASOS}
        actual={paso}
        compacto={paso > 1}
        alVolver={(n) => setPaso(n)}
      />

      {/* Resumen del tipo elegido, para no perder de vista qué se está haciendo. */}
      {tipo && paso > 1 && (
        <div className={`${TARJETA} flex flex-wrap items-center gap-3 px-4 py-3`}>
          <IconoClase clase={tipo.clase} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-tinta">{tipo.nombre}</p>
            <p className="text-xs text-gris">
              {nombreUbi.get(tipo.ubicacionOrigenId ?? "") ?? "—"} <IconArrowRight size={12} className="inline" />{" "}
              {nombreUbi.get(tipo.ubicacionDestinoId ?? "") ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPaso(1)}
            className="rounded-lg border border-borde px-3 py-2 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
          >
            Cambiar tipo
          </button>
        </div>
      )}

      {/* ── Paso 1: tipo ── */}
      {paso === 1 && (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.clase}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gris">
                {ETIQUETA_CLASE[g.clase]} <span className="font-normal normal-case tracking-normal text-gris-suave">· {AYUDA_CLASE[g.clase]}</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.tipos.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => elegirTipo(t.id)}
                    className={`${TARJETA} group flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-naranjo/60 ${
                      t.id === tipoId ? "border-naranjo ring-2 ring-naranjo/20" : ""
                    }`}
                  >
                    <IconoClase clase={t.clase} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-tinta">{t.nombre}</span>
                      <span className="block truncate text-xs text-gris">
                        {nombreUbi.get(t.ubicacionOrigenId ?? "") ?? "—"} → {nombreUbi.get(t.ubicacionDestinoId ?? "") ?? "—"}
                      </span>
                    </span>
                    <IconArrowRight size={16} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Paso 2: productos ── */}
      {paso === 2 && tipo && (
        <section className={`${TARJETA} space-y-5 p-5`}>
          <label className="block max-w-md">
            <span className="mb-1 block text-xs font-semibold text-gris">{etiquetaContraparte} <span className="font-normal text-gris-suave">(opcional)</span></span>
            <input value={contraparte} onChange={(e) => setContraparte(e.target.value)} className={CAMPO} placeholder={esRecepcion ? "Ej: Proveedor SpA" : "Ej: Faena Calama"} />
          </label>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-gris">Productos</span>
            {lineas.map((l, i) => {
              const lotes = lotesPorProducto[l.productoId] ?? [];
              const disp = l.productoId && origenInterno ? disponibleEnOrigen(l.productoId) : null;
              const excede = disp !== null && Number(l.cantidad) > disp;
              return (
                <div key={i} className="rounded-xl border border-borde p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-borde/60 text-xs font-bold text-gris">{i + 1}</span>
                    <select value={l.productoId} onChange={(e) => cambiarLinea(i, "productoId", e.target.value)} className={`${CAMPO} min-w-48 flex-1`}>
                      <option value="">— Elige un producto —</option>
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
                      type="number" min="0" step="0.001" placeholder="Cantidad"
                      className={`${CAMPO} w-32 ${excede ? "border-amber-400" : ""}`}
                    />
                    {esRecepcion && (
                      <input
                        value={l.costo}
                        onChange={(e) => cambiarLinea(i, "costo", e.target.value)}
                        type="number" min="0" step="1" placeholder="Costo unit. $"
                        title="Costo de compra por unidad: actualiza el costo promedio del producto"
                        className={`${CAMPO} w-36`}
                      />
                    )}
                    <button type="button" onClick={() => quitar(i)} className="grid h-11 w-10 place-items-center rounded-lg text-gris-suave transition hover:text-rose-500" title="Quitar">
                      <IconTrash size={16} />
                    </button>
                  </div>
                  {disp !== null && (
                    <p className={`mt-2 pl-9 text-xs ${excede ? "font-semibold text-amber-600" : "text-gris"}`}>
                      Disponible en {nombreUbi.get(tipo.ubicacionOrigenId ?? "")}: {formatearCantidad(disp)} {producto.get(l.productoId)?.unidadAbrev}
                      {excede && " · no alcanza, quedará esperando stock"}
                    </p>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={agregar} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-cian hover:underline">
              <IconPlus size={16} /> Agregar otro producto
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gris">Nota <span className="font-normal text-gris-suave">(opcional)</span></span>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className={CAMPO} placeholder="Ej: guía de despacho 1234" />
          </label>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap justify-between gap-2 border-t border-borde pt-4">
            <button type="button" onClick={() => setPaso(1)} className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50">
              <IconArrowLeft size={15} /> Atrás
            </button>
            <button type="button" onClick={aRevisar} className="inline-flex items-center gap-1.5 rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave">
              Revisar <IconArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* ── Paso 3: revisar ── */}
      {paso === 3 && tipo && (
        <form action={crear} className={`${TARJETA} space-y-5 p-5`}>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-gris">Tipo</dt><dd className="font-semibold text-tinta">{tipo.nombre}</dd></div>
            <div><dt className="text-xs text-gris">{etiquetaContraparte}</dt><dd className="font-semibold text-tinta">{contraparte || "—"}</dd></div>
            <div><dt className="text-xs text-gris">Nota</dt><dd className="text-tinta">{nota || "—"}</dd></div>
          </dl>

          <div className="overflow-hidden rounded-xl border border-borde">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde bg-borde/30 text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5 text-right">Cantidad</th>
                  {esRecepcion && <th className="px-4 py-2.5 text-right">Costo unit.</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {validas.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-tinta">
                      {producto.get(l.productoId)?.nombre}
                      {l.loteId && <span className="ml-2 text-xs text-gris">Lote {lotesPorProducto[l.productoId]?.find((x) => x.id === l.loteId)?.nombre}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-tinta">
                      {formatearCantidad(Number(l.cantidad))} {producto.get(l.productoId)?.unidadAbrev}
                    </td>
                    {esRecepcion && <td className="px-4 py-2.5 text-right tabular-nums text-gris">{l.costo ? `$${Number(l.costo).toLocaleString("es-CL")}` : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {faltaStock.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {faltaStock.length === 1 ? "Un producto no tiene" : `${faltaStock.length} productos no tienen`} stock suficiente en el origen. La operación se crea igual y
              podrás validar lo que haya (el resto queda pendiente).
            </p>
          )}
          <p className="flex items-start gap-2 rounded-lg bg-azul/5 px-3 py-2 text-xs text-gris">
            <IconCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            Se crea como borrador. En la siguiente pantalla tocas «Validar» para mover el stock (o «Confirmar y reservar» si sale después).
          </p>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap justify-between gap-2 border-t border-borde pt-4">
            <button type="button" onClick={() => setPaso(2)} className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50">
              <IconArrowLeft size={15} /> Editar productos
            </button>
            <BotonGuardar pendiente={pendiente} cargando="Creando…">Crear operación</BotonGuardar>
          </div>
        </form>
      )}
    </div>
  );
}
