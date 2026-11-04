"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react";
import { guardarCotizacionAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { clp } from "@/lib/fin/reglas";
import { lineaNeta, totalesCotizacion, type LineaCotizacion } from "@/lib/fin/modelo";
import { BOTON, CAMPO, Campo, ComboContacto, type OpcionContacto } from "./ui";

export interface DatosEditor {
  id: string | null;
  titulo: string;
  clienteId: string | null;
  oportunidadId: string | null;
  proyectoId: string | null;
  tipo: string;
  fecha: string;
  validezDias: number;
  condicionPagoDias: number | null;
  requiereOc: boolean;
  requiereEdp: boolean;
  requiereHes: boolean;
  notas: string | null;
  lineas: LineaCotizacion[];
}

const NUEVA: LineaCotizacion = { productoId: null, descripcion: "", cantidad: 1, unidad: "un", precioUnitario: 0, descuentoPct: 0, exento: false, meses: null };

/**
 * Cotización en una sola pantalla: cliente (hereda condición y requisitos OC/EDP/HES de su
 * perfil), tipo, líneas (texto libre o producto de Inventario; en arriendo, tarifa × meses) y
 * totales en vivo. Guardar = borrador.
 */
export default function EditorCotizacion({ inicial, clientes, perfiles, productos, proyectos, oportunidades, tasaIva }: {
  inicial: DatosEditor;
  clientes: OpcionContacto[];
  perfiles: Record<string, { condicion: number | null; oc: boolean; edp: boolean; hes: boolean }>;
  productos: { id: string; nombre: string; precio: number; unidad: string | null }[];
  proyectos: { id: string; nombre: string }[];
  oportunidades: { id: string; nombre: string }[];
  tasaIva: number;
}) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const t = totalesCotizacion(d.lineas, tasaIva);
  const cambiarLinea = (i: number, cambio: Partial<LineaCotizacion>) => setD((x) => ({ ...x, lineas: x.lineas.map((l, k) => (k === i ? { ...l, ...cambio } : l)) }));
  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  const arriendo = d.tipo === "arriendo";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-2xl border border-borde bg-superficie p-5 lg:grid-cols-3">
        <Campo etiqueta="Título *" className="lg:col-span-2"><input value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} className={CAMPO} placeholder="Mantención mensual de chancadores" /></Campo>
        <Campo etiqueta="Tipo">
          <select value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })} className={CAMPO}><option value="servicio">Servicio</option><option value="arriendo">Arriendo</option><option value="venta">Venta</option></select>
        </Campo>
        <Campo etiqueta="Cliente">
          <ComboContacto
            name="_cliente"
            opciones={clientes}
            inicial={d.clienteId}
            alCambiar={(id) => {
              const p = id ? perfiles[id] : undefined;
              setD((x) => ({ ...x, clienteId: id, ...(p ? { condicionPagoDias: p.condicion, requiereOc: p.oc, requiereEdp: p.edp, requiereHes: p.hes } : {}) }));
            }}
          />
        </Campo>
        <Campo etiqueta="Proyecto" ayuda="Vacío = se crea al aceptar">
          <select value={d.proyectoId ?? ""} onChange={(e) => setD({ ...d, proyectoId: e.target.value || null })} className={CAMPO}><option value="">Crear al aceptar</option>{proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        </Campo>
        <Campo etiqueta="Oportunidad">
          <select value={d.oportunidadId ?? ""} onChange={(e) => setD({ ...d, oportunidadId: e.target.value || null })} className={CAMPO}><option value="">—</option>{oportunidades.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
        </Campo>
        <Campo etiqueta="Fecha"><input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} className={CAMPO} /></Campo>
        <Campo etiqueta="Validez (días)"><input value={d.validezDias} onChange={(e) => setD({ ...d, validezDias: num(e.target.value) })} className={CAMPO} /></Campo>
        <Campo etiqueta="Condición de pago (días)" ayuda="Hereda del cliente"><input value={d.condicionPagoDias ?? ""} onChange={(e) => setD({ ...d, condicionPagoDias: e.target.value ? num(e.target.value) : null })} className={CAMPO} /></Campo>
        <div className="flex flex-wrap items-center gap-4 text-sm lg:col-span-3">
          <span className="text-xs font-semibold text-gris">El cliente exige para facturar:</span>
          {([["requiereOc", "OC"], ["requiereEdp", "EDP aprobado"], ["requiereHes", "HES"]] as const).map(([k, et]) => (
            <label key={k} className="inline-flex items-center gap-2"><input type="checkbox" checked={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.checked })} /> {et}</label>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
              <th className="px-3 py-2.5">Descripción</th>
              <th className="px-2 py-2.5 text-right">Cant.</th>
              <th className="px-2 py-2.5">Unidad</th>
              <th className="px-2 py-2.5 text-right">{arriendo ? "Tarifa mensual" : "Precio unit."}</th>
              {arriendo && <th className="px-2 py-2.5 text-right">Meses</th>}
              <th className="px-2 py-2.5 text-right">Desc. %</th>
              <th className="px-2 py-2.5 text-center">Exento</th>
              <th className="px-3 py-2.5 text-right">Neto</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {d.lineas.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <input value={l.descripcion} onChange={(e) => cambiarLinea(i, { descripcion: e.target.value })} className={CAMPO} placeholder="Descripción del servicio o producto" />
                  {productos.length > 0 && (
                    <select
                      value={l.productoId ?? ""}
                      onChange={(e) => {
                        const p = productos.find((x) => x.id === e.target.value);
                        cambiarLinea(i, p ? { productoId: p.id, descripcion: l.descripcion || p.nombre, precioUnitario: l.precioUnitario || p.precio, unidad: p.unidad ?? l.unidad } : { productoId: null });
                      }}
                      className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-gris hover:border-borde"
                    >
                      <option value="">Sin producto de Inventario</option>
                      {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-2 py-2"><input value={l.cantidad} onChange={(e) => cambiarLinea(i, { cantidad: num(e.target.value) })} className={`${CAMPO} w-20 text-right`} /></td>
                <td className="px-2 py-2"><input value={l.unidad ?? ""} onChange={(e) => cambiarLinea(i, { unidad: e.target.value })} className={`${CAMPO} w-20`} /></td>
                <td className="px-2 py-2"><input value={l.precioUnitario} onChange={(e) => cambiarLinea(i, { precioUnitario: num(e.target.value) })} className={`${CAMPO} w-32 text-right`} /></td>
                {arriendo && <td className="px-2 py-2"><input value={l.meses ?? ""} onChange={(e) => cambiarLinea(i, { meses: e.target.value ? num(e.target.value) : null })} className={`${CAMPO} w-16 text-right`} /></td>}
                <td className="px-2 py-2"><input value={l.descuentoPct ? Math.round(l.descuentoPct * 1000) / 10 : ""} onChange={(e) => cambiarLinea(i, { descuentoPct: num(e.target.value) / 100 })} className={`${CAMPO} w-16 text-right`} placeholder="0" /></td>
                <td className="px-2 py-2 text-center"><input type="checkbox" checked={l.exento} onChange={(e) => cambiarLinea(i, { exento: e.target.checked })} /></td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{clp(lineaNeta(l))}</td>
                <td className="px-2"><button type="button" onClick={() => setD({ ...d, lineas: d.lineas.filter((_, k) => k !== i) })} className="rounded p-1 text-gris hover:bg-rose-500/10 hover:text-rose-600" aria-label="Quitar línea"><IconTrash size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-borde px-3 py-3">
          <button type="button" onClick={() => setD({ ...d, lineas: [...d.lineas, { ...NUEVA, meses: arriendo ? 1 : null }] })} className="inline-flex items-center gap-1 text-xs font-semibold text-naranjo hover:underline"><IconPlus size={14} /> Agregar línea</button>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
            <dt className="text-gris">Neto afecto</dt><dd className="text-right tabular-nums">{clp(t.neto)}</dd>
            {t.exento > 0 && <><dt className="text-gris">Exento</dt><dd className="text-right tabular-nums">{clp(t.exento)}</dd></>}
            <dt className="text-gris">IVA {Math.round(tasaIva * 100)}%</dt><dd className="text-right tabular-nums">{clp(t.iva)}</dd>
            <dt className="font-bold text-tinta">Total</dt><dd className="text-right font-condensed text-xl font-bold tabular-nums text-tinta">{clp(t.total)}</dd>
          </dl>
        </div>
      </div>

      <Campo etiqueta="Notas y condiciones"><textarea value={d.notas ?? ""} onChange={(e) => setD({ ...d, notas: e.target.value })} rows={3} className={CAMPO} /></Campo>

      {error && <p className="rounded-lg border-l-[3px] border-rose-500 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={pendiente}
          className={BOTON}
          onClick={() =>
            iniciar(async () => {
              setError(null);
              const r = await guardarCotizacionAction(d.id, JSON.stringify(d));
              if (!r.ok) return setError(r.error);
              router.push(`/gestion-financiera/comercial/cotizaciones/${r.id}`);
              router.refresh();
            })
          }
        >
          {pendiente && <IconLoader2 size={14} className="animate-spin" />} Guardar borrador
        </button>
      </div>
    </div>
  );
}
