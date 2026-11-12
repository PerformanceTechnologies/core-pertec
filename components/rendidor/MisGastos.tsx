"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconLoader2, IconPaperclip, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import VisorComprobante, { type Comprobante } from "@/components/rendidor/VisorComprobante";
import PanelRendicion from "@/components/rendidor/PanelRendicion";
import { CAMPO } from "@/lib/estilos";
import { moverGastosAction, respaldoDeGastoAction } from "@/app/(protegido)/rendir-gastos/acciones";
import type { Rendicion } from "@/lib/rendidor/tipos";
import type { ProveedorOpcion, ProyectoOpcion } from "@/lib/rendidor/proveedores";
import { textoRepetido, type Repetido } from "@/lib/rendidor/mis-gastos-modelo";
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
  repetidosIniciales = {},
}: {
  bolsa: Rendicion;
  urlsRespaldo: Record<string, string>;
  informes: { id: string; titulo: string }[];
  proveedores?: ProveedorOpcion[];
  proyectos?: ProyectoOpcion[];
  /** Los gastos que parecen repetidos, calculados al cargar la página. */
  repetidosIniciales?: Record<string, Repetido[]>;
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
  const cerrarPopup = () => { setAbierto(false); setIdsEdicion([]); panel.current?.reiniciar(); };
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
  // Para quitar un borrador desde el listado: lo hace el panel (que guarda solo).
  const panel = useRef<{ quitar: (id: string) => void; reiniciar: () => void; subir?: () => void } | null>(null);
  const [repetidos, setRepetidos] = useState(repetidosIniciales);
  const eliminarBorrador = (f: FilaMiGasto) => {
    if (confirm(`¿Eliminar el gasto de ${f.proveedor?.trim() || "este proveedor"} por ${pesos(f.total)}?`)) panel.current?.quitar(f.id);
  };
  // Ver el documento de un gasto en un popup.
  const [viendo, setViendo] = useState<Comprobante | null>(null);
  const [abriendoDoc, setAbriendoDoc] = useState<string | null>(null);
  const verDocumento = async (f: FilaMiGasto) => {
    setAbriendoDoc(f.id);
    const r = await respaldoDeGastoAction(f.informeId ?? bolsa.id, f.id);
    setAbriendoDoc(null);
    if (!r.ok) return setError(r.error);
    setViendo({ url: r.url, nombre: r.nombre, esPdf: r.esPdf });
  };
  const abrirNuevo = () => { panel.current?.reiniciar(); setIdsEdicion([]); setAbierto(true); };
  const abrirEdicion = (id: string) => { setIdsEdicion([id]); setAbierto(true); };
  // Atajo «Escanear gasto» (/rendir-gastos/gastos?escanear=1): abre el ingreso directo en la subida de fotos.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("escanear") !== "1") return;
    url.searchParams.delete("escanear");
    window.history.replaceState(null, "", url.toString());
    setTimeout(() => {
      setIdsEdicion([]);
      setAbierto(true);
      setTimeout(() => panel.current?.subir?.(), 0);
    }, 0);
  }, []);
  const [filtro, setFiltro] = useState<EstadoGasto | "todos">("todos");
  const vigentes = elegidos.filter((id) => gastos.some((g) => g.id === id));
  const total = gastos.filter((g) => vigentes.includes(g.id)).reduce((s, g) => s + (Number(g.total) || 0), 0);

  // Los borradores (sueltos, en la bolsa) más lo que ya está en informes: una sola lista.
  const filas: FilaMiGasto[] = [
    ...gastos.map((g) => ({
      id: g.id, fecha: g.fecha, proveedor: g.proveedor, numeroDocumento: g.numeroDocumento, categoria: g.categoria,
      tipoDocumento: g.tipoDocumento, total: Number(g.total) || 0, estado: "borrador" as EstadoGasto, informeId: null, informeTitulo: null, proyectoNombre: g.proyectoNombre ?? null, conciliado: false, respaldo: g.archivoPath ? { nombre: g.archivoNombre, tipo: g.archivoTipo } : null,
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
            <div className="flex basis-full justify-end">
            <div className="inline-flex flex-wrap rounded-lg border border-borde p-0.5 text-xs font-semibold">
              {([["todos", `Todos ${filas.length}`], ["borrador", `Borrador ${cuenta("borrador")}`], ["en_informe", `En informe ${cuenta("en_informe")}`], ["cerrado", `Cerrado ${cuenta("cerrado")}`]] as const).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-md px-2.5 py-1 transition ${filtro === k ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>{t}</button>
              ))}
            </div>
            </div>
          </div>
          <div className="mt-2 overflow-hidden rounded-lg border border-borde">
            <div className="hidden md:grid-cols-[1.25rem_4.5rem_minmax(0,1.5fr)_minmax(0,1fr)_5.5rem_6.5rem_minmax(0,1fr)_5.25rem] items-center gap-2.5 border-b border-borde bg-tinta/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gris md:grid">
              <span /><span>Fecha</span><span>Proveedor</span><span>Categoría</span><span className="text-right">Total</span><span>Estado</span><span>Informe</span><span />
            </div>
            <ul className="divide-y divide-borde bg-superficie">
              {visibles.length === 0 && <li className="px-4 py-4 text-center text-sm text-gris">{filas.length === 0 ? "Aún no tienes gastos. Pulsa «Agregar nuevo gasto»." : "No hay gastos en este estado."}</li>}
              {visibles.map((f) => (
                <li key={f.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 px-3 py-1 text-[13px] leading-tight md:grid-cols-[1.25rem_4.5rem_minmax(0,1.5fr)_minmax(0,1fr)_5.5rem_6.5rem_minmax(0,1fr)_5.25rem]">
                  {f.estado === "borrador" ? (
                    <input
                      type="checkbox"
                      aria-label="Elegir para pasar a un informe"
                      checked={vigentes.includes(f.id)}
                      onChange={(e) => setElegidos((xs) => (e.target.checked ? [...xs, f.id] : xs.filter((x) => x !== f.id)))}
                      className="h-3.5 w-3.5 accent-[var(--color-naranjo)]"
                    />
                  ) : <span />}
                  <span className="hidden text-xs tabular-nums text-gris md:block">{fechaCorta(f.fecha)}</span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate font-semibold text-tinta">{f.proveedor?.trim() || "Sin proveedor"}</span>
                    {(repetidos[f.id]?.length ?? 0) > 0 && <span className="shrink-0 rounded bg-rose-500/12 px-1 text-[10px] font-semibold text-rose-600" title={repetidos[f.id].map(textoRepetido).join("\n")}>Repetido</span>}
                    {esFactura(f.tipoDocumento) && <span className="shrink-0 text-[10px] font-semibold text-sky-700">Fact.{f.numeroDocumento ? ` ${f.numeroDocumento}` : ""}</span>}
                    <span className="shrink-0 text-[11px] text-gris md:hidden">{fechaCorta(f.fecha)}</span>
                  </span>
                  <span className="hidden min-w-0 truncate text-xs text-gris md:block" title={f.proyectoNombre ?? undefined}>{f.categoria ?? "—"}{f.proyectoNombre ? ` · ${f.proyectoNombre}` : ""}</span>
                  <span className="text-right font-semibold tabular-nums text-tinta">{pesos(f.total)}</span>
                  <span className="hidden whitespace-nowrap md:block">
                    <span className={`inline-flex rounded px-1.5 py-px text-[10.5px] font-semibold ${TONO_ESTADO_GASTO[f.estado]}`}>{ETIQUETA_ESTADO_GASTO[f.estado]}</span>
                    {f.estado === "cerrado" && <span className={`ml-1 text-[10px] ${f.conciliado ? "font-semibold text-emerald-700" : "text-gris"}`}>{f.conciliado ? "Conciliado" : "Por conciliar"}</span>}
                  </span>
                  <span className="hidden min-w-0 truncate text-xs md:block">
                    {f.informeId ? <Link href={`/rendir-gastos/${f.informeId}`} className="font-semibold text-naranjo hover:underline">{f.informeTitulo}</Link> : <span className="text-gris-suave">—</span>}
                  </span>
                  <span className="flex items-center justify-end gap-0.5">
                    <span className={`mr-1 rounded px-1.5 py-px text-[10px] font-semibold md:hidden ${TONO_ESTADO_GASTO[f.estado]}`}>{ETIQUETA_ESTADO_GASTO[f.estado]}</span>
                    {f.respaldo && (
                      <button type="button" title="Ver documento" aria-label="Ver documento" onClick={() => verDocumento(f)} className="grid h-6 w-6 place-items-center rounded text-gris-suave transition hover:bg-naranjo/10 hover:text-naranjo">
                        {abriendoDoc === f.id ? <IconLoader2 size={14} className="animate-spin" /> : <IconPaperclip size={14} />}
                      </button>
                    )}
                    {f.estado === "borrador" && (
                      <>
                        <button type="button" title="Editar" aria-label="Editar gasto" onClick={() => abrirEdicion(f.id)} className="grid h-6 w-6 place-items-center rounded text-gris-suave transition hover:bg-naranjo/10 hover:text-naranjo"><IconPencil size={14} /></button>
                        <button type="button" title="Eliminar" aria-label="Eliminar gasto" onClick={() => eliminarBorrador(f)} className="grid h-6 w-6 place-items-center rounded text-gris-suave transition hover:bg-rose-500/10 hover:text-rose-500"><IconTrash size={14} /></button>
                      </>
                    )}
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

      {viendo && <VisorComprobante comprobante={viendo} onCerrar={() => setViendo(null)} />}

      {montado && createPortal(
        <div
          className={abierto ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/50 p-3 sm:p-6" : "hidden"}
          onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarPopup(); }}
        >
          <div role="dialog" aria-label="Agregar gasto" className="w-full max-w-4xl rounded-2xl border border-borde bg-crema p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-tinta">{idsEdicion.length && gastos.some((g) => idsEdicion.includes(g.id)) ? "Editar gasto" : "Agregar gasto"}</h2>
                <p className="text-xs text-gris">Elige cómo ingresarlo. Queda en borrador.</p>
              </div>
              <button type="button" onClick={cerrarPopup} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 text-xs font-bold text-tinta hover:border-naranjo/50">
                <IconX size={14} /> Cerrar
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
              controlRef={panel}
              alCambiarRepetidos={(m) => setRepetidos((prev) => ({ ...prev, ...m }))}
              alGuardar={cerrarPopup}
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
