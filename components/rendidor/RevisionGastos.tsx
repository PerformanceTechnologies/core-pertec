"use client";

import { useState, useTransition } from "react";
import { IconAlertTriangle, IconCheck, IconEye, IconFileSpreadsheet, IconLoader2, IconPaperclip, IconX } from "@tabler/icons-react";
import ConciliarGasto from "@/components/rendidor/ConciliarGasto";
import VentanaModal from "@/components/inventario/VentanaModal";
import VisorComprobante, { type Comprobante } from "@/components/rendidor/VisorComprobante";
import { CAMPO } from "@/lib/estilos";
import { desgloseDeGasto } from "@/lib/rendidor/iva";
import { revisarBoletaAction } from "@/app/(protegido)/rendir-gastos/acciones";
import { ETIQUETA_BOLETA, TONO_BOLETA, pesos, type EstadoBoleta } from "@/lib/rendidor/fondos-modelo";
import { TRATAMIENTO_DOCUMENTO, type GastoRendicion } from "@/lib/rendidor/tipos";

const fechaCorta = (f: string | null) =>
  f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Sin fecha";

const COLS = "md:grid-cols-[1.5rem_5.25rem_minmax(0,1.5fr)_minmax(0,1fr)_6rem_minmax(11rem,auto)_auto]";

/**
 * Lo que ve quien revisa un informe enviado: los gastos en lista (una línea cada uno), con el
 * documento en un popup, el detalle al pasar el mouse por el proveedor y los botones para aceptar,
 * observar o rechazar cada boleta. Aprobar o devolver el informe entero está arriba, en la cabecera.
 */
export default function RevisionGastos({
  informeId,
  gastos: iniciales,
  urlsRespaldo,
  puedeRevisarBoletas,
  validado = false,
  puedeConciliar = false,
}: {
  informeId: string;
  gastos: GastoRendicion[];
  urlsRespaldo: Record<string, string>;
  /** Informes con fondo: se revisa boleta por boleta. Los antiguos solo se leen. */
  puedeRevisarBoletas: boolean;
  /** Informe ya aprobado o cerrado: se muestra la conciliación de cada gasto. */
  validado?: boolean;
  puedeConciliar?: boolean;
}) {
  const [gastos, setGastos] = useState(iniciales);
  const [viendo, setViendo] = useState<Comprobante | null>(null);
  const [detalle, setDetalle] = useState<{ g: GastoRendicion; x: number; y: number; arriba: boolean } | null>(null);
  const [motivo, setMotivo] = useState<{ gastoId: string; estado: "observada" | "rechazada"; proveedor: string } | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const [generandoExcel, setGenerandoExcel] = useState(false);
  const descargarExcel = async () => {
    setGenerandoExcel(true);
    setError(null);
    try {
      const resp = await fetch(`/api/rendidor/${informeId}/excel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!resp.ok) {
        const c = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(c.error ?? "No se pudo generar la planilla.");
      }
      const blob = await resp.blob();
      const nombre = resp.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "rendicion.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar la planilla.");
    } finally {
      setGenerandoExcel(false);
    }
  };

  const estadoDe = (g: GastoRendicion): EstadoBoleta => g.revision?.estado ?? "cargada";
  const total = gastos.reduce((s, g) => s + (Number(g.total) || 0), 0);
  const cuenta = (e: EstadoBoleta) => gastos.filter((g) => estadoDe(g) === e).length;

  const marcar = (gastoId: string, estado: EstadoBoleta, m = "") => {
    setEnCurso(gastoId);
    setError(null);
    iniciar(async () => {
      const r = await revisarBoletaAction(informeId, gastoId, estado, m);
      setEnCurso(null);
      if (!r.ok) return setError(r.error);
      setGastos((prev) => prev.map((g) => (g.id === gastoId ? { ...g, revision: { estado, motivo: m || null } } : g)));
      setMotivo(null);
      setTexto("");
    });
  };

  const aceptarTodas = () =>
    iniciar(async () => {
      setError(null);
      for (const g of gastos.filter((x) => estadoDe(x) === "cargada")) {
        const r = await revisarBoletaAction(informeId, g.id, "aceptada", "");
        if (!r.ok) return setError(r.error);
        setGastos((prev) => prev.map((x) => (x.id === g.id ? { ...x, revision: { estado: "aceptada", motivo: null } } : x)));
      }
    });

  const mostrarDetalle = (g: GastoRendicion, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left), window.innerWidth - 340);
    const arriba = r.bottom + 280 > window.innerHeight;
    setDetalle({ g, x, y: arriba ? r.top - 6 : r.bottom + 6, arriba });
  };

  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-tinta">Gastos del informe</h2>
          <p className="text-xs text-gris">
            {gastos.length} {gastos.length === 1 ? "gasto" : "gastos"} · {pesos(total)}
            {puedeRevisarBoletas && ` · ${cuenta("aceptada")} aceptados, ${cuenta("cargada")} por revisar${cuenta("observada") ? `, ${cuenta("observada")} observados` : ""}${cuenta("rechazada") ? `, ${cuenta("rechazada")} rechazados` : ""}`}
          </p>
        </div>
        <button type="button" disabled={generandoExcel} onClick={descargarExcel} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 text-xs font-bold text-tinta transition hover:border-naranjo/50 disabled:opacity-50">
          {generandoExcel ? <IconLoader2 size={14} className="animate-spin" /> : <IconFileSpreadsheet size={14} />} Descargar Excel
        </button>
        {puedeRevisarBoletas && cuenta("cargada") > 0 && (
          <button type="button" disabled={pendiente} onClick={aceptarTodas} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50">
            {pendiente && !enCurso ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />} Aceptar las {cuenta("cargada")} por revisar
          </button>
        )}
      </div>
      {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="mt-3 rounded-lg border border-borde">
        <div className={`hidden ${COLS} items-center gap-2.5 border-b border-borde bg-tinta/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gris md:grid`}>
          <span>#</span><span>Fecha</span><span>Proveedor</span><span>Categoría</span><span className="text-right">Total</span><span>Estado</span><span className="text-right">Revisión</span>
        </div>
        <ul className="divide-y divide-borde">
          {gastos.map((g, i) => {
            const est = estadoDe(g);
            const url = urlsRespaldo[g.id];
            return (
              <li key={g.id} className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 px-3 py-1.5 text-[13px] leading-tight ${COLS}`}>
                <span className="text-[11px] tabular-nums text-gris-suave">{i + 1}</span>
                <span className="hidden text-xs tabular-nums text-gris md:block">{fechaCorta(g.fecha)}</span>
                <span className="min-w-0">
                  <button
                    type="button"
                    onMouseEnter={(e) => mostrarDetalle(g, e.currentTarget)}
                    onMouseLeave={() => setDetalle(null)}
                    onFocus={(e) => mostrarDetalle(g, e.currentTarget)}
                    onBlur={() => setDetalle(null)}
                    className="block max-w-full truncate text-left font-semibold text-tinta underline decoration-dotted decoration-gris-suave underline-offset-2 hover:text-naranjo"
                  >
                    {g.proveedor?.trim() || "Sin proveedor"}
                  </button>
                  <span className="block text-[11px] text-gris md:hidden">{fechaCorta(g.fecha)}{g.categoria ? ` · ${g.categoria}` : ""}</span>
                </span>
                <span className="hidden min-w-0 truncate text-xs text-gris md:block">{g.categoria ?? "—"}</span>
                <span className="text-right font-semibold tabular-nums text-tinta">{pesos(Number(g.total) || 0)}</span>
                <span className="hidden whitespace-nowrap md:block">
                  <span className={`inline-flex rounded px-1.5 py-px text-[10.5px] font-semibold ${TONO_BOLETA[est]}`}>{ETIQUETA_BOLETA[est]}</span>
                  {validado && est !== "rechazada" && est !== "observada" && (
                    <span className="ml-1.5 align-middle">
                      <ConciliarGasto
                        compacto
                        informeId={informeId}
                        gasto={g}
                        puedeConciliar={puedeConciliar}
                        alCambiar={(c) => setGastos((prev) => prev.map((x) => (x.id === g.id ? { ...x, conciliacion: c } : x)))}
                      />
                    </span>
                  )}
                  {g.duplicadoDe && <span className="ml-1 text-[10px] font-semibold text-rose-600" title={`Mismo RUT, folio y monto que en «${g.duplicadoDe.titulo}»`}>Duplicado</span>}
                </span>
                <span className="col-span-3 flex items-center justify-end gap-1 md:col-span-1">
                  <span className={`mr-1 rounded px-1.5 py-px text-[10px] font-semibold md:hidden ${TONO_BOLETA[est]}`}>{ETIQUETA_BOLETA[est]}</span>
                  <button
                    type="button"
                    disabled={!url}
                    onClick={() => url && setViendo({ url, nombre: g.archivoNombre || "documento", esPdf: g.archivoTipo === "application/pdf" || g.archivoNombre?.toLowerCase().endsWith(".pdf") })}
                    title={url ? "Ver documento" : "Sin documento"}
                    aria-label="Ver documento"
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-borde px-2 text-[11px] font-semibold text-tinta transition hover:border-naranjo/50 hover:text-naranjo disabled:opacity-35 disabled:hover:border-borde disabled:hover:text-tinta"
                  >
                    <IconPaperclip size={13} /> Documento
                  </button>
                  {puedeRevisarBoletas && (
                    <>
                      <button type="button" disabled={pendiente} onClick={() => marcar(g.id, "aceptada")} title="Aceptar" aria-label="Aceptar" className={`grid h-7 w-7 place-items-center rounded-md border transition disabled:opacity-50 ${est === "aceptada" ? "border-emerald-500 bg-emerald-500 text-white" : "border-borde text-emerald-600 hover:bg-emerald-500/10"}`}>
                        {enCurso === g.id ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />}
                      </button>
                      <button type="button" disabled={pendiente} onClick={() => { setTexto(""); setError(null); setMotivo({ gastoId: g.id, estado: "observada", proveedor: g.proveedor }); }} title="Observar (qué corregir)" aria-label="Observar" className={`grid h-7 w-7 place-items-center rounded-md border transition disabled:opacity-50 ${est === "observada" ? "border-amber-500 bg-amber-500 text-white" : "border-borde text-amber-600 hover:bg-amber-500/10"}`}>
                        <IconEye size={14} />
                      </button>
                      <button type="button" disabled={pendiente} onClick={() => { setTexto(""); setError(null); setMotivo({ gastoId: g.id, estado: "rechazada", proveedor: g.proveedor }); }} title="Rechazar" aria-label="Rechazar" className={`grid h-7 w-7 place-items-center rounded-md border transition disabled:opacity-50 ${est === "rechazada" ? "border-rose-500 bg-rose-500 text-white" : "border-borde text-rose-500 hover:bg-rose-500/10"}`}>
                        <IconX size={14} />
                      </button>
                    </>
                  )}
                </span>
                {g.revision?.motivo && est !== "aceptada" && (
                  <span className="col-span-3 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 md:col-start-3 md:col-span-5"><b>{ETIQUETA_BOLETA[est]}:</b> {g.revision.motivo}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* El mini popup del proveedor: sigue al mouse y no intercepta clics. */}
      {detalle && <DetalleGasto d={detalle} />}

      {viendo && <VisorComprobante comprobante={viendo} onCerrar={() => setViendo(null)} />}

      <VentanaModal
        abierta={Boolean(motivo)}
        alCerrar={() => !pendiente && setMotivo(null)}
        titulo={motivo?.estado === "observada" ? "Observar gasto" : "Rechazar gasto"}
        descripcion={`${motivo?.proveedor || "Gasto"}: ${motivo?.estado === "observada" ? "dile a quien rinde qué hay que corregir." : "explica por qué se rechaza."}`}
        ancho="max-w-md"
      >
        <div className="space-y-4">
          <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={500} placeholder={motivo?.estado === "observada" ? "Ej: falta el RUT del proveedor" : "Motivo"} className={CAMPO} />
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={pendiente} onClick={() => setMotivo(null)} className="inline-flex min-h-10 items-center rounded-lg border border-borde px-4 text-sm font-semibold text-gris hover:text-tinta">Cancelar</button>
            <button
              type="button"
              disabled={pendiente || !texto.trim()}
              onClick={() => motivo && marcar(motivo.gastoId, motivo.estado, texto.trim())}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-5 text-sm font-bold text-white disabled:opacity-40 ${motivo?.estado === "rechazada" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}
            >
              {pendiente && <IconLoader2 size={16} className="animate-spin" />} {motivo?.estado === "observada" ? "Observar" : "Rechazar"}
            </button>
          </div>
        </div>
      </VentanaModal>
    </section>
  );
}

function DetalleGasto({ d }: { d: { g: GastoRendicion; x: number; y: number; arriba: boolean } }) {
  const g = d.g;
  let neto = g.neto;
  let iva = g.iva;
  let especifico = 0;
  const avisos: string[] = [];
  try {
    const x = desgloseDeGasto(g);
    if (x) {
      neto = x.neto;
      iva = x.iva;
      especifico = x.impuestoEspecifico;
      avisos.push(...x.advertencias);
    }
  } catch {
    /* sin desglose */
  }
  const filas: [string, string | null][] = [
    ["RUT", g.rutProveedor],
    ["Documento", `${g.tipoDocumento ? TRATAMIENTO_DOCUMENTO[g.tipoDocumento].etiqueta : "Sin tipo"}${g.numeroDocumento ? ` N° ${g.numeroDocumento}` : ""}`],
    ["Fecha", fechaCorta(g.fecha)],
    ["Categoría", g.categoria],
    ["Proyecto", g.proyectoNombre ?? null],
    ["Detalle", g.detalle?.trim() || null],
  ];
  return (
    <div
      role="tooltip"
      style={{ left: d.x, top: d.y, transform: d.arriba ? "translateY(-100%)" : undefined }}
      className="pointer-events-none fixed z-[80] w-80 rounded-xl border border-borde bg-superficie p-3 text-xs shadow-[0_18px_40px_-14px_rgba(23,20,17,0.45)]"
    >
      <p className="text-sm font-bold text-tinta">{g.proveedor?.trim() || "Sin proveedor"}</p>
      <dl className="mt-1.5 space-y-0.5">
        {filas.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-16 shrink-0 text-gris">{k}</dt>
            <dd className="min-w-0 flex-1 text-tinta">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-tinta/[0.04] px-2.5 py-1.5 text-center">
        <div><p className="text-[10px] uppercase text-gris">Neto</p><p className="font-semibold tabular-nums text-tinta">{pesos(neto)}</p></div>
        <div><p className="text-[10px] uppercase text-gris">IVA</p><p className="font-semibold tabular-nums text-tinta">{pesos(iva)}</p></div>
        <div><p className="text-[10px] uppercase text-gris">Total</p><p className="font-bold tabular-nums text-tinta">{pesos(Number(g.total) || 0)}</p></div>
      </div>
      {especifico > 0 && <p className="mt-1.5 text-[11px] text-gris">Incluye impuesto específico al combustible: {pesos(especifico)} (sin IVA).</p>}
      {g.ivaManual && <p className="mt-1.5 text-[11px] text-gris">IVA marcado a mano: {g.ivaManual === "exento" ? "exento" : "afecto"}.</p>}
      {g.pendientes.length > 0 && <p className="mt-1.5 flex items-start gap-1 text-[11px] text-naranjo"><IconAlertTriangle size={12} className="mt-px shrink-0" /> Ilegible: {g.pendientes.join(", ")}</p>}
      {avisos.map((a) => <p key={a} className="mt-1.5 text-[11px] text-naranjo">{a}</p>)}
      {g.duplicadoDe && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">Posible duplicado de «{g.duplicadoDe.titulo}».</p>}
    </div>
  );
}
