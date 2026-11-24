"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconUpload, IconWand } from "@tabler/icons-react";
import { aceptarSugerenciasAction, categorizarMovimientoAction, conciliarMovimientoAction, reglaDesdeMovimientoAction } from "@/app/(protegido)/gestion-financiera/acciones-tesoreria";
import { clp, fechaCl } from "@/lib/fin/reglas";
import type { MovimientoVista } from "@/lib/fin/datos";
import { ETIQUETA_ORIGEN } from "@/lib/fin/clasificacion";
import { Chip } from "./piezas";
import SelectorClasificacion, { type OpcionCategoria, type OpcionSubcategoria } from "./SelectorClasificacion";
import { BOTON, BOTON_SEC, BotonAccion, CAMPO, Campo, ConVentana, FormAccion, SubirAdjunto } from "./ui";
import { avisar, pedirTexto } from "./dialogos";
import FormCobro, { type FacturaAbierta } from "./FormCobro";

interface Ref { id: string; nombre: string }

/** Subir la cartola de una cuenta (CSV o Excel). Detecta columnas y no duplica lo ya cargado. */
export function ImportarCartola({ cuentas }: { cuentas: Ref[] }) {
  const router = useRouter();
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? "");
  const [estado, setEstado] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  if (cuentas.length === 0) return <p className="text-xs text-gris">Para importar cartolas, crea primero tus cuentas en <Link href="/gestion-financiera/configuracion?ver=cuentas" className="font-semibold text-naranjo hover:underline">Configuración → Cuentas</Link>.</p>;
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
      {estado && <span className={`text-xs ${estado.startsWith("⚠") ? "text-alerta" : "text-ok"}`}>{estado}</span>}
    </div>
  );
}

/**
 * La bandeja del banco diario: cada movimiento con su clasificación sugerida (un clic), y al abrirlo, categoría y
 * subcategoría de la lista maestra, proyecto, a quién preguntar, respaldo, «es un cobro / es un pago» y guardar regla.
 */
export default function BandejaBanco({ movimientos, categorias, subcategorias, proyectos, facturas, pagos, cobros, cuentasBanco, hoy }: {
  movimientos: MovimientoVista[];
  categorias: OpcionCategoria[];
  subcategorias: OpcionSubcategoria[];
  proyectos: Ref[];
  facturas: FacturaAbierta[];
  pagos: { id: string; numero: string; monto: number; proveedor: string | null; fecha: string | null; hecho: boolean }[];
  cobros: { id: string; numero: string; monto: number; cliente: string | null; fecha: string }[];
  cuentasBanco: Ref[];
  hoy: string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const conSub = new Set(subcategorias.map((s) => s.categoriaId));
  const nombreCat = (id: string) => categorias.find((c) => c.id === id)?.nombre ?? "";
  const nombreSub = (id: string | null) => (id ? subcategorias.find((s) => s.id === id)?.nombre ?? null : null);
  // Solo las sugerencias completas se aceptan en bloque (con subcategoría si la categoría las tiene).
  const sugeridos = movimientos.filter((m) => m.sugerencia && !m.categoriaId && (!conSub.has(m.sugerencia.categoriaId) || m.sugerencia.subcategoriaId));
  return (
    <div className="space-y-2">
      {sugeridos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/40 bg-violet-500/[0.06] px-4 py-2.5 text-sm">
          <IconWand size={17} className="text-violet-600" />
          <span className="flex-1 text-tinta">
            {sugeridos.length} movimiento(s) con clasificación sugerida por tus reglas o por movimientos anteriores iguales. Revísalos y acéptalos de una.
          </span>
          <BotonAccion accion={() => aceptarSugerenciasAction(sugeridos.map((m) => m.id))} className={BOTON}>Aceptar todas</BotonAccion>
        </div>
      )}
      <ul className="divide-y divide-borde rounded-xl border border-borde bg-superficie">
        {movimientos.map((m) => {
          const sug = m.sugerencia && !m.categoriaId ? m.sugerencia : null;
          const textoSug = sug ? nombreSub(sug.subcategoriaId) ?? nombreCat(sug.categoriaId) : null;
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
                    {m.categoriaNombre && ` · ${m.categoriaNombre}${m.subcategoriaNombre ? ` › ${m.subcategoriaNombre}` : ""}`}
                    {m.faltaSubcategoria && " · falta la subcategoría"}
                    {m.clasificadoPor && m.clasificadoPor !== "manual" && ` · ${ETIQUETA_ORIGEN[m.clasificadoPor].toLowerCase()}`}
                    {m.proyectoNombre && ` · ${m.proyectoNombre}`}
                    {m.responsable && ` · preguntar a ${m.responsable}`}
                  </span>
                </span>
                {sug && textoSug && (
                  <span title={sug.motivo}>
                    <Chip texto={`Sugerido: ${textoSug}`} tono="bg-violet-500/10 text-violet-700" />
                  </span>
                )}
                {exactas.length > 0 && <Chip texto={`Calza con factura ${exactas[0].folio}`} tono="bg-emerald-500/10 text-ok" />}
                {pagosCalzan.length > 0 && <Chip texto={`Calza con pago ${pagosCalzan[0].numero}`} tono="bg-emerald-500/10 text-ok" />}
                <Chip
                  texto={m.escalar ? `Escalar · ${m.diasSinAclarar} días` : m.estado === "Por aclarar" ? `Por aclarar${m.diasSinAclarar ? ` · ${m.diasSinAclarar} d` : ""}` : m.estado}
                  tono={m.escalar ? "bg-rose-500/12 text-alerta" : m.estado === "Por aclarar" ? "bg-amber-500/12 text-aviso" : "bg-emerald-500/12 text-ok"}
                />
                <span className={`w-28 text-right font-semibold tabular-nums ${m.monto < 0 ? "text-alerta" : "text-ok"}`}>{clp(m.monto)}</span>
                <IconChevronDown size={15} className={`text-gris transition ${abierto === m.id ? "rotate-180" : ""}`} />
              </button>
              {abierto === m.id && (
                <div className="grid gap-4 border-t border-borde bg-tinta/[0.015] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <FormAccion accion={categorizarMovimientoAction.bind(null, m.id)} textoBoton="Guardar" alOk={() => setAbierto(null)}>
                    {sug && <p className="text-xs text-violet-700">Sugerencia: {sug.motivo}. Ya viene elegida abajo: revísala y guarda.</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectorClasificacion
                        monto={m.monto}
                        categorias={categorias}
                        subcategorias={subcategorias}
                        categoriaInicial={m.categoriaId ?? sug?.categoriaId ?? null}
                        subcategoriaInicial={m.categoriaId ? m.subcategoriaId ?? null : sug?.subcategoriaId ?? null}
                      />
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
                    {m.monto > 0 && cobros.length > 0 && (
                      <ElegirYLigar
                        texto="Es un cobro ya registrado…"
                        opciones={[...cobros].sort((a, b) => Number(b.monto === m.monto) - Number(a.monto === m.monto)).map((c) => ({ id: c.id, texto: `${c.numero} · ${c.cliente ?? "—"} · ${clp(c.monto)}${c.monto === m.monto ? " ✓ mismo monto" : ""}` }))}
                        ligar={(id) => conciliarMovimientoAction(m.id, "cobro", id)}
                      />
                    )}
                    {m.monto < 0 && pagos.length > 0 && (
                      <ElegirYLigar
                        texto="Es un pago programado o ya hecho…"
                        opciones={[...pagos].sort((a, b) => Number(b.monto === -m.monto) - Number(a.monto === -m.monto)).map((p) => ({ id: p.id, texto: `${p.numero} · ${p.proveedor ?? "—"} · ${clp(p.monto)}${p.hecho ? " (ya pagado)" : ""}${p.monto === -m.monto ? " ✓ mismo monto" : ""}` }))}
                        ligar={(id) => conciliarMovimientoAction(m.id, "pago", id)}
                      />
                    )}
                    <SubirAdjunto entidadTipo="movimiento" entidadId={m.id} tipo="comprobante" texto="Adjuntar respaldo" />
                    {m.categoriaId && !m.faltaSubcategoria && (
                      <>
                        <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gris">Que se clasifique solo la próxima vez</p>
                        <BotonAccion
                          accion={async () => {
                            const patron = await pedirTexto({ titulo: "¿Qué texto de la glosa reconoce este tipo de movimiento?", ayuda: "Los próximos movimientos que lo contengan se clasificarán solos, con esta misma categoría y subcategoría.", inicial: m.glosa.split(/\s+/).slice(0, 3).join(" "), boton: "Guardar regla" });
                            if (!patron) return { ok: true };
                            return reglaDesdeMovimientoAction(m.id, "texto", patron);
                          }}
                          className={`${BOTON_SEC} w-full`}
                        >
                          <IconWand size={14} /> Regla por texto de la glosa
                        </BotonAccion>
                        {m.contraparteRut && (
                          <BotonAccion accion={() => reglaDesdeMovimientoAction(m.id, "rut", "")} className={`${BOTON_SEC} w-full`}>
                            <IconWand size={14} /> Regla por RUT {m.contraparteRut}
                          </BotonAccion>
                        )}
                      </>
                    )}
                    {m.estado === "Por aclarar" && m.categoriaId && !m.faltaSubcategoria && <BotonAccion accion={() => conciliarMovimientoAction(m.id, "otro", null)} className={`${BOTON_SEC} w-full`}>Conciliar sin documento</BotonAccion>}
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

/** Lista para ligar el movimiento a un cobro o pago que ya existe; al elegir, concilia y recarga. */
function ElegirYLigar({ texto, opciones, ligar }: { texto: string; opciones: { id: string; texto: string }[]; ligar: (id: string) => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <select
      className={`${CAMPO} ${ocupado ? "opacity-50" : ""}`}
      disabled={ocupado}
      defaultValue=""
      onChange={async (e) => {
        if (!e.target.value) return;
        setOcupado(true);
        const r = await ligar(e.target.value);
        setOcupado(false);
        if (!r.ok) avisar(r.error ?? "No se pudo.");
        else router.refresh();
      }}
    >
      <option value="">{texto}</option>
      {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
    </select>
  );
}
