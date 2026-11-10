"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconLoader2, IconNotes, IconPlus, IconSend, IconSparkles, IconTrash } from "@tabler/icons-react";
import { guardarCotizacionAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { clp } from "@/lib/fin/reglas";
import { lineaNeta, totalesCotizacion, type LineaCotizacion } from "@/lib/fin/modelo";
import { BOTON, BOTON_SEC, ComboContacto, type OpcionContacto } from "@/components/fin/ui";
import EnviarCotizacion from "./EnviarCotizacion";
import { generarObservacionesArriendoAction } from "@/app/(protegido)/leads/acciones";
import { avisar, confirmar } from "@/components/fin/dialogos";

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
  atencion: string | null;
  correoAtencion: string | null;
  plazoEntrega: string | null;
  formaPago: string | null;
  descuentoGeneralTipo: "pct" | "monto" | null;
  descuentoGeneralValor: number;
  incluirDatosPago: boolean;
  /** Arriendo cobrado por mes o por día (la cantidad de cada línea está en esa unidad). */
  arriendoUnidad: "mes" | "dia";
  lineas: LineaCotizacion[];
}

/** Campos algo más bajos que los del resto del módulo: esta pantalla tiene muchos y se quiere ver casi todo sin desplazarse. */
const CAMPO_C =
  "min-h-9 w-full rounded-lg border border-transparent bg-tinta/[0.05] px-2.5 py-1.5 text-sm text-tinta placeholder:text-gris-suave transition hover:bg-tinta/[0.07] focus:border-cian/60 focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-cian/15";

const NUEVA: LineaCotizacion = { productoId: null, descripcion: "", cantidad: 1, unidad: "un", precioUnitario: 0, descuentoPct: 0, exento: false, meses: null };

/** «1.500», «1500» y «1,5» son números; mientras se escribe se respeta lo tecleado (la coma decimal no se pierde). */
function leerNumero(t: string): number {
  const s = t.trim();
  if (!s) return 0;
  const sinMiles = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(",", ".");
  const n = Number(sinMiles);
  return Number.isFinite(n) ? n : 0;
}

function Numero({ valor, alCambiar, etiqueta, className = "", vacioSiCero = false, placeholder }: { valor: number | null; alCambiar: (n: number) => void; etiqueta: string; className?: string; vacioSiCero?: boolean; placeholder?: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? (valor === null || (vacioSiCero && !valor) ? "" : valor.toLocaleString("es-CL", { maximumFractionDigits: 2 }));
  return (
    <input
      aria-label={etiqueta}
      inputMode="decimal"
      value={mostrado}
      placeholder={placeholder}
      className={`${CAMPO_C} text-right ${className}`}
      onFocus={(e) => {
        setTexto(valor ? String(valor).replace(".", ",") : "");
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        alCambiar(leerNumero(e.target.value));
      }}
      onBlur={() => setTexto(null)}
    />
  );
}

const VALIDEZ = [15, 30, 45, 60, 90];
const FORMAS_PAGO = ["Contado contra factura", "30 días desde la factura", "50% al aceptar y 50% contra entrega"];

/** Una sección compacta: título en una línea y el contenido pegado debajo. */
function Seccion({ n, titulo, ayuda, derecha, children }: { n: number; titulo: string; ayuda?: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borde bg-superficie p-3 sm:p-4">
      <header className="mb-2.5 flex items-center gap-2.5" title={ayuda}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-naranjo text-[11px] font-bold text-white">{n}</span>
        <h3 className="text-sm font-bold text-tinta">{titulo}</h3>
        {ayuda && <span className="hidden truncate text-xs text-gris md:inline">{ayuda}</span>}
        <span className="flex-1" />
        {derecha}
      </header>
      {children}
    </section>
  );
}

/** Etiqueta pequeña sobre su campo. */
function Et({ t, children, className = "" }: { t: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold text-tinta/70">{t}</span>
      {children}
    </label>
  );
}

/**
 * Cotización en tres secciones y casi sin desplazarse: 1) a quién y de qué, 2) qué se cotiza (una fila por
 * línea, totales en vivo) y 3) condiciones. Abajo, una barra fija con el total y las dos salidas: guardar
 * borrador o guardar y enviar por correo (PDF + mensaje armado con la cotización).
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
  const [guardadaId, setGuardadaId] = useState<string | null>(null);
  // Líneas con la casilla de nota abierta (las que ya traen una nota se muestran abiertas).
  const [notasAbiertas, setNotasAbiertas] = useState<number[]>([]);
  const general = d.descuentoGeneralTipo && d.descuentoGeneralValor > 0 ? { tipo: d.descuentoGeneralTipo, valor: d.descuentoGeneralValor } : null;
  const t = totalesCotizacion(d.lineas, tasaIva, general);
  const cambiarLinea = (i: number, cambio: Partial<LineaCotizacion>) => setD((x) => ({ ...x, lineas: x.lineas.map((l, k) => (k === i ? { ...l, ...cambio } : l)) }));
  const arriendo = d.tipo === "arriendo";
  const porDia = d.arriendoUnidad === "dia";
  const [generando, setGenerando] = useState(false);
  const generarObservaciones = async () => {
    if (d.notas?.trim() && !(await confirmar({ titulo: "Ya hay observaciones", ayuda: "La IA las reemplazará por un texto nuevo, armado con los productos y las condiciones de esta cotización.", boton: "Reemplazar" }))) return;
    setGenerando(true);
    const r = await generarObservacionesArriendoAction(JSON.stringify({ ...d, hayDescuento: d.lineas.some((l) => l.descuentoPct > 0) || (d.descuentoGeneralValor > 0 && d.descuentoGeneralTipo !== null) }));
    setGenerando(false);
    if (!r.ok) return avisar(r.error);
    setD((x) => ({ ...x, notas: r.texto }));
    avisar("Observaciones listas. Revísalas y ajusta lo que necesites antes de enviar.", "ok");
  };
  const quitarLinea = (i: number) => {
    setD((x) => ({ ...x, lineas: x.lineas.filter((_, k) => k !== i) }));
    setNotasAbiertas((a) => a.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)));
  };
  const alternarNota = (i: number) => setNotasAbiertas((a) => (a.includes(i) ? a.filter((k) => k !== i) : [...a, i]));

  const guardar = (enviar: boolean) =>
    iniciar(async () => {
      setError(null);
      const r = await guardarCotizacionAction(d.id, JSON.stringify(d));
      if (!r.ok) return setError(r.error);
      if (enviar && r.id) {
        // Queda guardada y se abre el envío encima; al cerrarlo (envíe o no) se va al detalle.
        setD((x) => ({ ...x, id: r.id! }));
        setGuardadaId(r.id);
        return;
      }
      router.push(`/leads/cotizaciones/${r.id}`);
      router.refresh();
    });

  // Columnas de cada línea en pantalla ancha (en el celular cada línea es una tarjeta de dos columnas).
  const columnas = arriendo
    ? "lg:grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_4rem_7rem_3.5rem_4.5rem_4.25rem_6.5rem_1.75rem]"
    : "lg:grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_4rem_7rem_4.5rem_4.25rem_6.5rem_1.75rem]";
  const lbl = "text-[10px] font-semibold text-gris lg:hidden";

  return (
    <div className="space-y-3 pb-24">
      <Seccion n={1} titulo="¿A quién y de qué?" ayuda="El cliente trae su condición de pago y lo que exige para facturar.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <Et t="Título de la cotización *" className="sm:col-span-2 lg:col-span-6"><input value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} className={CAMPO_C} placeholder="Mantención mensual de chancadores" autoFocus={!d.id} /></Et>
          <Et t="Tipo" className="lg:col-span-3">
            <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-borde bg-tinta/[0.03] p-0.5" role="group" aria-label="Tipo de cotización">
              {([["servicio", "Servicio"], ["arriendo", "Arriendo"], ["venta", "Venta"]] as const).map(([k, et]) => (
                <button key={k} type="button" aria-pressed={d.tipo === k} onClick={() => setD((x) => ({ ...x, tipo: k, lineas: x.lineas.map((l) => ({ ...l, meses: k === "arriendo" ? l.meses ?? 1 : null })) }))}
                  className={`rounded-md py-1.5 text-xs font-semibold transition ${d.tipo === k ? "bg-naranjo text-white shadow-sm" : "text-gris hover:text-tinta"}`}>{et}</button>
              ))}
            </div>
          </Et>
          <Et t="Fecha" className="lg:col-span-3"><input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} className={CAMPO_C} /></Et>

          <Et t="Cliente *" className="sm:col-span-2 lg:col-span-5">
            <ComboContacto
              name="_cliente"
              opciones={clientes}
              inicial={d.clienteId}
              alCambiar={(id) => {
                const p = id ? perfiles[id] : undefined;
                setD((x) => ({ ...x, clienteId: id, ...(p ? { condicionPagoDias: p.condicion, requiereOc: p.oc, requiereEdp: p.edp, requiereHes: p.hes } : {}) }));
              }}
            />
          </Et>
          <Et t="Atención a" className="lg:col-span-3"><input value={d.atencion ?? ""} onChange={(e) => setD({ ...d, atencion: e.target.value })} className={CAMPO_C} placeholder="Nombre y apellido" /></Et>
          <Et t="Correo de esa persona" className="sm:col-span-2 lg:col-span-4"><input type="email" value={d.correoAtencion ?? ""} onChange={(e) => setD({ ...d, correoAtencion: e.target.value })} className={CAMPO_C} placeholder="persona@cliente.cl" /></Et>

          <Et t="Vigencia" className="lg:col-span-2">
            <select value={d.validezDias} onChange={(e) => setD({ ...d, validezDias: Number(e.target.value) })} className={CAMPO_C}>
              {[...new Set([...VALIDEZ, d.validezDias])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{v} días</option>)}
            </select>
          </Et>
          <Et t="Lead de origen" className="lg:col-span-5">
            <select value={d.oportunidadId ?? ""} onChange={(e) => setD({ ...d, oportunidadId: e.target.value || null })} className={CAMPO_C}><option value="">Sin lead</option>{oportunidades.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
          </Et>
          <Et t="Proyecto (vacío = se crea al aceptar)" className="sm:col-span-2 lg:col-span-5">
            <select value={d.proyectoId ?? ""} onChange={(e) => setD({ ...d, proyectoId: e.target.value || null })} className={CAMPO_C}><option value="">Crear al aceptar</option>{proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </Et>
        </div>
      </Seccion>

      <Seccion
        n={2}
        titulo="¿Qué se cotiza?"
        ayuda={arriendo ? `En arriendo, la tarifa es ${porDia ? "diaria y se multiplica por los días" : "mensual y se multiplica por los meses"}.` : "Una fila por servicio o producto."}
        derecha={productos.length > 0 ? (
          <select aria-label="Agregar un producto del Inventario" value="" className={`${CAMPO_C} max-w-[13rem] text-xs`}
            onChange={(e) => {
              const p = productos.find((x) => x.id === e.target.value);
              if (p) setD((x) => ({ ...x, lineas: [...x.lineas.filter((l) => l.descripcion.trim() || l.precioUnitario > 0 || l.productoId), { ...NUEVA, productoId: p.id, descripcion: p.nombre, precioUnitario: p.precio, unidad: p.unidad ?? "un", meses: arriendo ? 1 : null }] }));
            }}>
            <option value="">+ Producto del Inventario…</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        ) : undefined}
      >
        {arriendo && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-tinta/70">Cobro del arriendo</span>
            <div className="inline-flex rounded-lg border border-borde bg-tinta/[0.03] p-0.5" role="group" aria-label="Cobro del arriendo">
              {([["mes", "Por mes"], ["dia", "Por día"]] as const).map(([k, et]) => (
                <button key={k} type="button" aria-pressed={d.arriendoUnidad === k} onClick={() => setD((x) => ({ ...x, arriendoUnidad: k }))}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition ${d.arriendoUnidad === k ? "bg-naranjo text-white shadow-sm" : "text-gris hover:text-tinta"}`}>{et}</button>
              ))}
            </div>
          </div>
        )}
        {/* Encabezado de columnas: solo en pantalla ancha; en el celular cada campo lleva su rótulo. */}
        <div className={`mb-1 hidden gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-gris lg:grid ${columnas}`}>
          <span /><span>Descripción</span><span className="text-right">Cant.</span><span>Unidad</span><span className="text-right">{arriendo ? (porDia ? "Tarifa/día" : "Tarifa/mes") : "Precio unit."}</span>{arriendo && <span className="text-right">{porDia ? "Días" : "Meses"}</span>}<span className="text-right">Desc. %</span><span className="text-center">Exento</span><span className="text-right">Total</span><span />
        </div>
        <ul className="space-y-1.5">
          {d.lineas.map((l, i) => (
            <li key={i} className={`grid grid-cols-2 items-end gap-1.5 rounded-xl border border-borde bg-tinta/[0.015] p-2 lg:items-center ${columnas}`}>
              <span className="hidden text-center text-[11px] font-bold text-gris-suave lg:block">{i + 1}</span>
              <div className="col-span-2 flex items-start gap-1.5 lg:col-span-1">
                <span className="mt-2 w-4 shrink-0 text-center text-[11px] font-bold text-gris-suave lg:hidden">{i + 1}</span>
                <textarea aria-label={`Descripción de la línea ${i + 1}`} value={l.descripcion} rows={1} onChange={(e) => cambiarLinea(i, { descripcion: e.target.value })} className={`${CAMPO_C} min-h-9 resize-y`} placeholder="Descripción del servicio o producto" />
                <button type="button" onClick={() => alternarNota(i)} aria-pressed={notasAbiertas.includes(i) || Boolean(l.nota?.trim())} title={l.nota?.trim() ? "Editar la nota de esta línea" : "Agregar una nota o descripción larga a esta línea"}
                  className={`rounded-lg p-1.5 transition ${l.nota?.trim() ? "bg-naranjo/10 text-naranjo" : notasAbiertas.includes(i) ? "bg-tinta/[0.07] text-tinta" : "text-gris hover:bg-tinta/[0.06] hover:text-tinta"}`} aria-label={`Nota de la línea ${i + 1}`}><IconNotes size={16} /></button>
                <button type="button" onClick={() => quitarLinea(i)} disabled={d.lineas.length === 1} className="rounded-lg p-1.5 text-gris hover:bg-rose-500/10 hover:text-alerta disabled:opacity-30 lg:hidden" aria-label={`Quitar la línea ${i + 1}`}><IconTrash size={16} /></button>
              </div>
              <label className="block"><span className={lbl}>Cantidad</span><Numero etiqueta="Cantidad" valor={l.cantidad} alCambiar={(n) => cambiarLinea(i, { cantidad: n })} /></label>
              <label className="block"><span className={lbl}>Unidad</span><input aria-label="Unidad" value={l.unidad ?? ""} onChange={(e) => cambiarLinea(i, { unidad: e.target.value })} className={CAMPO_C} /></label>
              <label className="block"><span className={lbl}>{arriendo ? (porDia ? "Tarifa por día" : "Tarifa mensual") : "Precio unitario"}</span><Numero etiqueta="Precio" valor={l.precioUnitario} alCambiar={(n) => cambiarLinea(i, { precioUnitario: n })} /></label>
              {arriendo && <label className="block"><span className={lbl}>{porDia ? "Días" : "Meses"}</span><Numero etiqueta={porDia ? "Días de arriendo" : "Meses de arriendo"} valor={l.meses} alCambiar={(n) => cambiarLinea(i, { meses: n || null })} /></label>}
              <label className="block"><span className={lbl}>Descuento %</span><Numero etiqueta="Descuento de la línea" valor={l.descuentoPct ? Math.round(l.descuentoPct * 1000) / 10 : null} vacioSiCero placeholder="0" alCambiar={(n) => cambiarLinea(i, { descuentoPct: Math.max(0, Math.min(100, n)) / 100 })} /></label>
              <label className="flex items-center gap-1.5 text-xs text-gris lg:justify-center"><input type="checkbox" checked={l.exento} onChange={(e) => cambiarLinea(i, { exento: e.target.checked })} aria-label="Exento de IVA" /> <span className="lg:hidden">Exento de IVA</span></label>
              <span className="col-span-2 text-right font-condensed text-base font-bold tabular-nums text-tinta lg:col-span-1">{clp(lineaNeta(l))}</span>
              <button type="button" onClick={() => quitarLinea(i)} disabled={d.lineas.length === 1} className="hidden rounded-lg p-1 text-gris hover:bg-rose-500/10 hover:text-alerta disabled:opacity-30 lg:block" aria-label={`Quitar la línea ${i + 1}`}><IconTrash size={15} /></button>
              {(notasAbiertas.includes(i) || Boolean(l.nota?.trim())) && (
                <div className="col-span-2 lg:col-span-full lg:pl-[1.75rem]">
                  <textarea aria-label={`Nota de la línea ${i + 1}`} value={l.nota ?? ""} rows={2} maxLength={2000} onChange={(e) => cambiarLinea(i, { nota: e.target.value })}
                    className={`${CAMPO_C} resize-y text-[13px]`} placeholder="Nota opcional: descripción, alcance o detalle de este producto o servicio. Sale bajo la línea en el PDF." />
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setD({ ...d, lineas: [...d.lineas, { ...NUEVA, meses: arriendo ? 1 : null }] })} className={BOTON_SEC}><IconPlus size={14} /> Agregar línea</button>
            <div className="flex items-center gap-1.5 rounded-xl border border-borde px-2 py-1" title="Sobre toda la cotización, además del descuento de cada línea">
              <span className="text-[11px] font-semibold text-tinta/70">Descuento general</span>
              <div className="inline-flex rounded-md border border-borde bg-tinta/[0.03] p-0.5" role="group" aria-label="Tipo de descuento general">
                {([["pct", "%"], ["monto", "$"]] as const).map(([k, et]) => (
                  <button key={k} type="button" aria-pressed={(d.descuentoGeneralTipo ?? "pct") === k} onClick={() => setD({ ...d, descuentoGeneralTipo: k })}
                    className={`w-7 rounded py-1 text-xs font-bold transition ${(d.descuentoGeneralTipo ?? "pct") === k ? "bg-naranjo text-white" : "text-gris hover:text-tinta"}`}>{et}</button>
                ))}
              </div>
              <div className="w-28"><Numero etiqueta="Descuento general" valor={d.descuentoGeneralValor} vacioSiCero placeholder="Ninguno" alCambiar={(n) => setD({ ...d, descuentoGeneralTipo: d.descuentoGeneralTipo ?? "pct", descuentoGeneralValor: n })} /></div>
            </div>
          </div>
          <dl className="grid min-w-[15rem] grid-cols-[1fr_auto] gap-x-6 gap-y-0 rounded-xl bg-tinta/[0.03] px-3 py-2 text-sm">
            {t.descuento > 0 && <><dt className="text-gris">Subtotal</dt><dd className="text-right tabular-nums">{clp(t.bruto)}</dd>
              <dt className="text-gris">Descuento{d.descuentoGeneralTipo === "pct" ? ` (${d.descuentoGeneralValor.toLocaleString("es-CL", { maximumFractionDigits: 2 })}%)` : ""}</dt><dd className="text-right tabular-nums text-alerta">−{clp(t.descuento)}</dd></>}
            <dt className="text-gris">{t.exento > 0 ? "Neto afecto" : "Neto"}</dt><dd className="text-right tabular-nums">{clp(t.neto)}</dd>
            {t.exento > 0 && <><dt className="text-gris">Exento</dt><dd className="text-right tabular-nums">{clp(t.exento)}</dd></>}
            <dt className="text-gris">IVA {Math.round(tasaIva * 100)}%</dt><dd className="text-right tabular-nums">{clp(t.iva)}</dd>
            <dt className="font-bold text-tinta">Total</dt><dd className="text-right font-condensed text-lg font-bold tabular-nums text-tinta">{clp(t.total)}</dd>
          </dl>
        </div>
      </Seccion>

      <Seccion n={3} titulo="Condiciones" ayuda="Salen en el PDF. Lo que dejes vacío no aparece.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <Et t="Forma de pago (vacío = «pago a N días»)" className="sm:col-span-2 lg:col-span-5">
            <input value={d.formaPago ?? ""} list="formas-de-pago" onChange={(e) => setD({ ...d, formaPago: e.target.value })} className={CAMPO_C} placeholder="Ej.: 50% al aceptar, 50% contra entrega" />
            <datalist id="formas-de-pago">{FORMAS_PAGO.map((f) => <option key={f} value={f} />)}</datalist>
          </Et>
          <Et t="Plazo de entrega o inicio" className="sm:col-span-2 lg:col-span-5"><input value={d.plazoEntrega ?? ""} onChange={(e) => setD({ ...d, plazoEntrega: e.target.value })} className={CAMPO_C} placeholder="Ej.: 10 días hábiles desde la OC" /></Et>
          <Et t="Días de pago" className="lg:col-span-2"><Numero etiqueta="Días de pago" valor={d.condicionPagoDias} alCambiar={(n) => setD({ ...d, condicionPagoDias: n })} className="text-left" /></Et>

          <div className="sm:col-span-2 lg:col-span-6">
            <span className="mb-1 block text-[11px] font-semibold text-tinta/70">El cliente exige para facturar</span>
            <div className="flex flex-wrap gap-1.5">
              {([["requiereOc", "Orden de compra"], ["requiereEdp", "EDP aprobado"], ["requiereHes", "HES"]] as const).map(([k, et]) => (
                <label key={k} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${d[k] ? "border-naranjo bg-naranjo/10 text-naranjo" : "border-borde text-gris"}`}><input type="checkbox" className="sr-only" checked={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.checked })} /> {d[k] && <IconCheck size={12} />} {et}</label>
              ))}
            </div>
          </div>
          <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 sm:col-span-2 lg:col-span-6 ${d.incluirDatosPago ? "border-naranjo bg-naranjo/[0.06]" : "border-borde"}`}>
            <input type="checkbox" className="mt-0.5" checked={d.incluirDatosPago} onChange={(e) => setD({ ...d, incluirDatosPago: e.target.checked })} />
            <span>
              <span className="block text-sm font-semibold text-tinta">Incluir los datos de pago en el PDF</span>
              <span className="block text-[11px] text-gris">Banco y cuenta de la empresa. Viene desmarcado.</span>
            </span>
          </label>
          <div className="sm:col-span-2 lg:col-span-12">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-tinta/70">Observaciones</span>
              {arriendo && (
                <button type="button" onClick={generarObservaciones} disabled={generando} title="Redacta las observaciones solo con los productos arrendados y las condiciones de esta cotización"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-naranjo/40 bg-naranjo/[0.07] px-2.5 py-1 text-xs font-semibold text-naranjo transition hover:bg-naranjo/[0.12] disabled:opacity-60">
                  {generando ? <IconLoader2 size={14} className="animate-spin" /> : <IconSparkles size={14} />} {generando ? "Redactando…" : "Generar con IA"}
                </button>
              )}
            </div>
            <textarea value={d.notas ?? ""} onChange={(e) => setD({ ...d, notas: e.target.value })} rows={2} className={`${CAMPO_C} resize-y`} placeholder={arriendo ? "Escríbelas o genéralas con IA: equipos arrendados, periodo, plazo y condiciones." : "Alcances, exclusiones, supuestos…"} />
            {arriendo && <p className="mt-1 text-[11px] text-gris">La IA usa solo los productos, el periodo y las condiciones de esta cotización (no envía el cliente ni los montos). Revisa el texto antes de enviar.</p>}
          </div>
        </div>
      </Seccion>

      {error && <p role="alert" className="rounded-lg border-l-[3px] border-rose-500 bg-rose-500/[0.07] px-3 py-2 text-xs text-alerta">{error}</p>}

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie/95 px-4 py-2.5 shadow-[0_12px_32px_-12px_rgba(23,20,17,0.35)] backdrop-blur">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gris">Total con IVA</p>
          <p className="font-condensed text-2xl font-bold leading-tight tabular-nums text-tinta">{clp(t.total)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pendiente} className={BOTON_SEC} onClick={() => guardar(false)}>
            {pendiente && <IconLoader2 size={14} className="animate-spin" />} Guardar borrador
          </button>
          <button type="button" disabled={pendiente} className={BOTON} onClick={() => guardar(true)}>
            <IconSend size={14} /> Guardar y enviar
          </button>
        </div>
      </div>

      {guardadaId && (
        <EnviarCotizacion
          id={guardadaId}
          abierta
          alCerrar={() => {
            router.push(`/leads/cotizaciones/${guardadaId}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
