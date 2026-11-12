"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import PanelRendicion from "@/components/rendidor/PanelRendicion";
import { CAMPO } from "@/lib/estilos";
import { moverGastosAction } from "@/app/(protegido)/rendir-gastos/acciones";
import type { Rendicion } from "@/lib/rendidor/tipos";
import type { ProveedorOpcion, ProyectoOpcion } from "@/lib/rendidor/proveedores";
import { ETIQUETA_ESTADO_GASTO, TONO_ESTADO_GASTO, esFactura, type EstadoGasto, type FilaMiGasto } from "@/lib/rendidor/mis-gastos-modelo";
import Link from "next/link";
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
  proveedores = [],
  enInformes = [],
  proyectos = [],
}: {
  bolsa: Rendicion;
  urlsRespaldo: Record<string, string>;
  informes: { id: string; titulo: string }[];
  proveedores?: ProveedorOpcion[];
  proyectos?: ProyectoOpcion[];
  /** Los gastos que ya están en un informe (en revisión o cerrados). */
  enInformes?: FilaMiGasto[];
}) {
  const router = useRouter();
  const [gastos, setGastos] = useState(bolsa.gastos);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [destino, setDestino] = useState(informes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  // El popup de ingreso: el panel queda montado siempre (solo se oculta) para que el
  // autoguardado termine aunque se cierre la ventana al instante.
  const [abierto, setAbierto] = useState(false);
  const [idsEdicion, setIdsEdicion] = useState<string[]>([]);
  // El portal solo existe en el navegador: useSyncExternalStore da false en el servidor y true acá.
  const montado = useSyncExternalStore(() => () => {}, () => true, () => false);
  const cerrarPopup = () => { setAbierto(false); setIdsEdicion([]); };
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && cerrarPopup();
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);
  const abrirNuevo = () => { setIdsEdicion([]); setAbierto(true); };
  const abrirEdicion = (id: string) => { setIdsEdicion([id]); setAbierto(true); };
  const [filtro, setFiltro] = useState<EstadoGasto | "todos">("todos");
  const vigentes = elegidos.filter((id) => gastos.some((g) => g.id === id));
  const total = gastos.filter((g) => vigentes.includes(g.id)).reduce((s, g) => s + (Number(g.total) || 0), 0);

  // Los borradores (sueltos, en la bolsa) más lo que ya está en informes: una sola lista.
  const filas: FilaMiGasto[] = [
    ...gastos.map((g) => ({
      id: g.id, fecha: g.fecha, proveedor: g.proveedor, numeroDocumento: g.numeroDocumento, categoria: g.categoria,
      tipoDocumento: g.tipoDocumento, total: Number(g.total) || 0, estado: "borrador" as EstadoGasto, informeId: null, informeTitulo: null, proyectoNombre: g.proyectoNombre ?? null, conciliado: false,
    })),
    ...enInformes,
  ].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const cuenta = (e: EstadoGasto) => filas.filter((f) => f.estado === e).length;
  const visibles = filas.filter((f) => filtro === "todos" || f.estado === filtro);
  return (
    <div className="space-y-5">
      {(
        <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-tinta">Todos mis gastos</h2>
              <p className="text-xs text-gris">Borrador → En informe → Cerrado (informe aprobado, queda por conciliar).</p>
            </div>
            <button type="button" onClick={abrirNuevo} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-sm font-bold text-white shadow-sm transition hover:bg-naranjo-suave">
              <IconPlus size={16} /> Agregar nuevo gasto
            </button>
            <div className="inline-flex flex-wrap rounded-lg border border-borde p-0.5 text-xs font-semibold">
              {([["todos", `Todos ${filas.length}`], ["borrador", `Borrador ${cuenta("borrador")}`], ["en_informe", `En informe ${cuenta("en_informe")}`], ["cerrado", `Cerrado ${cuenta("cerrado")}`]] as const).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-md px-2.5 py-1 transition ${filtro === k ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-borde">
            <div className="hidden grid-cols-[1.5rem_5.5rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_6.5rem_minmax(0,1.2fr)] items-center gap-3 border-b border-borde bg-tinta/[0.03] px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gris md:grid">
              <span /><span>Fecha</span><span>Proveedor</span><span>Categoría</span><span className="text-right">Total</span><span>Estado</span><span>Informe</span>
            </div>
            <ul className="divide-y divide-borde bg-superficie">
              {visibles.length === 0 && <li className="px-4 py-6 text-center text-sm text-gris">{filas.length === 0 ? "Aún no tienes gastos. Pulsa «Agregar nuevo gasto»." : "No hay gastos en este estado."}</li>}
              {visibles.map((f) => (
                <li key={f.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 py-1.5 md:grid-cols-[1.5rem_5.5rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_6.5rem_minmax(0,1.2fr)]">
                  {f.estado === "borrador" ? (
                    <input
                      type="checkbox"
                      aria-label="Elegir para pasar a un informe"
                      checked={vigentes.includes(f.id)}
                      onChange={(e) => setElegidos((xs) => (e.target.checked ? [...xs, f.id] : xs.filter((x) => x !== f.id)))}
                      className="h-4 w-4 accent-[var(--color-naranjo)]"
                    />
                  ) : <span />}
                  <span className="hidden text-xs tabular-nums text-gris md:block">{fechaCorta(f.fecha)}</span>
                  <span className="min-w-0">
                    {f.estado === "borrador" ? (
                      <button type="button" onClick={() => abrirEdicion(f.id)} className="block max-w-full truncate text-left text-sm font-semibold text-tinta hover:text-naranjo">{f.proveedor?.trim() || "Sin proveedor"}</button>
                    ) : (
                      <span className="block truncate text-sm font-semibold text-tinta">{f.proveedor?.trim() || "Sin proveedor"}</span>
                    )}
                    <span className="block text-[11px] text-gris md:hidden">{fechaCorta(f.fecha)}{f.categoria ? ` · ${f.categoria}` : ""}</span>
                    {esFactura(f.tipoDocumento) && <span className="text-[10px] font-semibold text-sky-700">Factura{f.numeroDocumento ? ` N° ${f.numeroDocumento}` : ""}</span>}
                  </span>
                  <span className="hidden min-w-0 text-xs text-gris md:block"><span className="block truncate">{f.categoria ?? "—"}</span>{f.proyectoNombre && <span className="block truncate text-[10px] text-gris-suave">{f.proyectoNombre}</span>}</span>
                  <span className="text-right font-condensed text-lg font-bold tabular-nums text-tinta">{pesos(f.total)}</span>
                  <span className="col-start-2 md:col-start-auto">
                    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONO_ESTADO_GASTO[f.estado]}`}>{ETIQUETA_ESTADO_GASTO[f.estado]}</span>
                    {f.estado === "cerrado" && (f.conciliado ? <span className="ml-1 text-[10px] font-semibold text-emerald-700">Conciliado</span> : <span className="ml-1 text-[10px] text-gris" title="Validado: falta conciliarlo">Por conciliar</span>)}
                  </span>
                  <span className="col-span-2 min-w-0 truncate text-xs md:col-span-1">
                    {f.informeId ? <Link href={`/rendir-gastos/${f.informeId}`} className="font-semibold text-naranjo hover:underline">{f.informeTitulo}</Link> : <span className="text-gris-suave">—</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {gastos.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setElegidos(vigentes.length === gastos.length ? [] : gastos.map((g) => g.id))} className="text-xs font-semibold text-naranjo">
                {vigentes.length === gastos.length ? "Quitar todos" : "Marcar todos los borradores"}
              </button>
              <span className="flex-1" />
              {informes.length === 0 ? (
                <span className="text-sm text-gris">No tienes informes abiertos: crea uno en «Mis informes» para asignarle gastos.</span>
              ) : (
                <>
                  <select value={destino} onChange={(e) => setDestino(e.target.value)} className={`${CAMPO} max-w-[16rem]`} aria-label="Informe de destino">
                    {informes.map((i) => (<option key={i.id} value={i.id}>{i.titulo}</option>))}
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
                    Asignar {vigentes.length || ""} a informe {vigentes.length ? `(${pesos(total)})` : ""}
                  </button>
                </>
              )}
            </div>
          )}
          {error && <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
        </section>
      )}

      {montado && createPortal(
        <div
          className={abierto ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/50 p-3 sm:p-6" : "hidden"}
          onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarPopup(); }}
        >
          <div role="dialog" aria-label="Agregar gasto" className="w-full max-w-4xl rounded-2xl border border-borde bg-crema p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-tinta">{idsEdicion.length && gastos.some((g) => idsEdicion.includes(g.id)) ? "Editar gasto" : "Agregar gasto"}</h2>
                <p className="text-xs text-gris">Ingrésalo a mano, o sube el documento y se lee solo. Queda en borrador y se guarda solo.</p>
              </div>
              <button type="button" onClick={cerrarPopup} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 text-xs font-bold text-tinta hover:border-naranjo/50">
                <IconX size={14} /> Listo
              </button>
            </div>
            <PanelRendicion
              proveedores={proveedores}
              proyectos={proyectos}
              key={bolsa.id}
              rendicionInicial={bolsa}
              urlsRespaldo={urlsRespaldo}
              editable
              puedeEnviar={false}
              alCambiarGastos={setGastos}
              modoPopup
              sinExcel
              soloIds={idsEdicion}
              alAgregarIds={(ids) => setIdsEdicion((prev) => [...prev, ...ids])}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
