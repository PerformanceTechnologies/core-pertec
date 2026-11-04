"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconUpload, IconWand } from "@tabler/icons-react";
import { aceptarSugerenciasAction, categorizarMovimientoAction, conciliarMovimientoAction, reglaDesdeMovimientoAction } from "@/app/(protegido)/gestion-financiera/acciones-tesoreria";
import { clp, fechaCl } from "@/lib/fin/reglas";
import type { MovimientoVista } from "@/lib/fin/datos";
import { Chip } from "./piezas";
import { BOTON, BOTON_SEC, BotonAccion, CAMPO, Campo, ConVentana, FormAccion, SubirAdjunto } from "./ui";
import FormCobro, { type FacturaAbierta } from "./FormCobro";

interface Ref { id: string; nombre: string }

/** Subir la cartola de una cuenta (CSV o Excel). Detecta columnas y no duplica lo ya cargado. */
export function ImportarCartola({ cuentas }: { cuentas: Ref[] }) {
  const router = useRouter();
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? "");
  const [estado, setEstado] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  if (cuentas.length === 0) return <p className="text-xs text-gris">Crea primero tus cuentas en Configuración.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="rounded-lg border border-borde bg-superficie px-2.5 py-2 text-xs">
        {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <label className={`${BOTON} cursor-pointer ${subiendo ? "pointer-events-none opacity-60" : ""}`}>
        <IconUpload size={15} /> {subiendo ? "Importando…" : "Importar cartola"}
        <input
          type="file"
          accept=".csv,.xlsx,.txt"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setSubiendo(true);
            setEstado(null);
            const fd = new FormData();
            fd.set("archivo", f);
            fd.set("cuentaId", cuenta);
            const r = await fetch("/api/gestion-financiera/cartola", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "No se pudo subir." }));
            setSubiendo(false);
            e.target.value = "";
            if (r.error) setEstado(`⚠ ${r.error}`);
            else {
              setEstado(`✓ ${r.nuevas} movimiento(s) nuevos · ${r.duplicadas} ya estaban${r.omitidas ? ` · ${r.omitidas} fila(s) sin datos` : ""}`);
              router.refresh();
            }
          }}
        />
      </label>
      {estado && <span className={`text-xs ${estado.startsWith("⚠") ? "text-rose-600" : "text-emerald-700"}`}>{estado}</span>}
    </div>
  );
}

/**
 * La bandeja del banco diario: cada movimiento con su categoría sugerida (un clic), y al abrirlo,
 * categoría, proyecto, a quién preguntar, respaldo, «es un cobro / es un pago» y guardar regla.
 */
export default function BandejaBanco({ movimientos, categorias, proyectos, facturas, pagos, cuentasBanco, hoy }: {
  movimientos: MovimientoVista[];
  categorias: (Ref & { requiereProyecto: boolean })[];
  proyectos: Ref[];
  facturas: FacturaAbierta[];
  pagos: { id: string; numero: string; monto: number; proveedor: string | null; fecha: string | null }[];
  cuentasBanco: Ref[];
  hoy: string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const sugeridos = movimientos.filter((m) => m.sugerencia && !m.categoriaId);
  return (
    <div className="space-y-2">
      {sugeridos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/40 bg-violet-500/[0.06] px-4 py-2.5 text-sm">
          <IconWand size={17} className="text-violet-600" />
          <span className="flex-1 text-tinta">{sugeridos.length} movimiento(s) con categoría sugerida por tus reglas.</span>
          <BotonAccion accion={() => aceptarSugerenciasAction(sugeridos.map((m) => m.id))} className={BOTON}>Aceptar todas</BotonAccion>
        </div>
      )}
      <ul className="divide-y divide-borde rounded-xl border border-borde bg-superficie">
        {movimientos.map((m) => {
          const sug = m.sugerencia ? categorias.find((c) => c.id === m.sugerencia!.categoriaId) : null;
          const exactas = m.monto > 0 ? facturas.filter((f) => f.saldo === m.monto) : [];
          const pagosCalzan = m.monto < 0 ? pagos.filter((p) => p.monto === -m.monto) : [];
          return (
            <li key={m.id}>
              <button type="button" onClick={() => setAbierto(abierto === m.id ? null : m.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left transition hover:bg-tinta/[0.02]">
                <span className="w-20 text-xs tabular-nums text-gris">{fechaCl(m.fecha)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tinta">{m.glosa}</span>
                  <span className="block truncate text-[11px] text-gris">
                    {m.cuentaNombre}
                    {m.categoriaNombre && ` · ${m.categoriaNombre}`}
                    {m.proyectoNombre && ` · ${m.proyectoNombre}`}
                    {m.responsable && ` · preguntar a ${m.responsable}`}
                  </span>
                </span>
                {sug && !m.categoriaId && <Chip texto={`Sugerido: ${sug.nombre}`} tono="bg-violet-500/10 text-violet-700" />}
                {exactas.length > 0 && <Chip texto={`Calza con factura ${exactas[0].folio}`} tono="bg-emerald-500/10 text-emerald-700" />}
                {pagosCalzan.length > 0 && <Chip texto={`Calza con pago ${pagosCalzan[0].numero}`} tono="bg-emerald-500/10 text-emerald-700" />}
                <Chip
                  texto={m.escalar ? `Escalar · ${m.diasSinAclarar} días` : m.estado === "Por aclarar" ? `Por aclarar${m.diasSinAclarar ? ` · ${m.diasSinAclarar} d` : ""}` : m.estado}
                  tono={m.escalar ? "bg-rose-500/12 text-rose-700" : m.estado === "Por aclarar" ? "bg-amber-500/12 text-amber-700" : "bg-emerald-500/12 text-emerald-700"}
                />
                <span className={`w-28 text-right font-semibold tabular-nums ${m.monto < 0 ? "text-rose-600" : "text-emerald-700"}`}>{clp(m.monto)}</span>
                <IconChevronDown size={15} className={`text-gris transition ${abierto === m.id ? "rotate-180" : ""}`} />
              </button>
              {abierto === m.id && (
                <div className="grid gap-4 border-t border-borde bg-tinta/[0.015] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <FormAccion accion={categorizarMovimientoAction.bind(null, m.id)} textoBoton="Guardar" alOk={() => setAbierto(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo etiqueta="Categoría">
                        <select name="categoriaId" defaultValue={m.categoriaId ?? m.sugerencia?.categoriaId ?? ""} className={CAMPO}>
                          <option value="">—</option>
                          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.requiereProyecto ? " (pide proyecto)" : ""}</option>)}
                        </select>
                      </Campo>
                      <Campo etiqueta="Proyecto">
                        <select name="proyectoId" defaultValue={m.proyectoId ?? m.sugerencia?.proyectoId ?? ""} className={CAMPO}>
                          <option value="">—</option>
                          {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </Campo>
                      <Campo etiqueta="A quién preguntar"><input name="responsable" defaultValue={m.responsable ?? ""} placeholder="Titular de la tarjeta, JP…" className={CAMPO} /></Campo>
                      <Campo etiqueta="Documento relacionado"><input name="documentoRef" defaultValue={m.documentoRef ?? ""} placeholder="Factura, OC, nómina…" className={CAMPO} /></Campo>
                      <Campo etiqueta="Rendición (si el respaldo está en Rendir Gastos)"><input name="rendicionRef" placeholder="N° o nombre de la rendición" className={CAMPO} /></Campo>
                      <Campo etiqueta="Comentario"><input name="comentario" defaultValue={m.comentario ?? ""} className={CAMPO} /></Campo>
                    </div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tieneRespaldo" defaultChecked={m.tieneRespaldo} /> Tiene respaldo (boleta, factura o comprobante)</label>
                  </FormAccion>
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gris">Ligar a un documento</p>
                    {m.monto > 0 && (
                      <ConVentana boton="Es un cobro de…" titulo="Registrar cobro desde el banco" ancho="max-w-3xl" className={`${BOTON_SEC} w-full`}>
                        {(cerrar) => <FormCobro facturas={facturas} cuentas={cuentasBanco} hoy={hoy} alOk={cerrar} movimiento={{ id: m.id, fecha: m.fecha, monto: m.monto, cuentaId: m.cuentaId }} />}
                      </ConVentana>
                    )}
                    {m.monto < 0 && pagos.length > 0 && (
                      <select
                        className={CAMPO}
                        defaultValue=""
                        onChange={async (e) => {
                          if (!e.target.value) return;
                          const r = await conciliarMovimientoAction(m.id, "pago", e.target.value);
                          if (!r.ok) alert(r.error);
                          else window.location.reload();
                        }}
                      >
                        <option value="">Es el pago programado…</option>
                        {pagos.map((p) => <option key={p.id} value={p.id}>{p.numero} · {p.proveedor} · {clp(p.monto)}</option>)}
                      </select>
                    )}
                    <SubirAdjunto entidadTipo="movimiento" entidadId={m.id} tipo="comprobante" texto="Adjuntar respaldo" />
                    {m.categoriaId && (
                      <BotonAccion
                        accion={async () => {
                          const patron = prompt("¿Qué texto de la glosa reconoce este tipo de movimiento?", m.glosa.split(/\s+/).slice(0, 3).join(" "));
                          if (!patron) return { ok: true };
                          return reglaDesdeMovimientoAction(m.id, patron);
                        }}
                        className={`${BOTON_SEC} w-full`}
                      >
                        <IconWand size={14} /> Guardar como regla
                      </BotonAccion>
                    )}
                    {m.estado === "Por aclarar" && m.categoriaId && <BotonAccion accion={() => conciliarMovimientoAction(m.id, "otro", null)} className={`${BOTON_SEC} w-full`}>Conciliar sin documento</BotonAccion>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
