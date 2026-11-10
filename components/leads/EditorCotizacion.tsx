"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconLoader2, IconPlus, IconSend, IconTrash } from "@tabler/icons-react";
import { guardarCotizacionAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { clp } from "@/lib/fin/reglas";
import { lineaNeta, totalesCotizacion, type LineaCotizacion } from "@/lib/fin/modelo";
import { BOTON, BOTON_SEC, CAMPO, Campo, ComboContacto, type OpcionContacto } from "@/components/fin/ui";
import EnviarCotizacion from "./EnviarCotizacion";

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
  lineas: LineaCotizacion[];
}

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
      className={`${CAMPO} text-right ${className}`}
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

const VALIDEZ = [15, 30, 45, 60];
const FORMAS_PAGO = ["Contado contra factura", "30 días desde la factura", "50% al aceptar y 50% contra entrega"];

function Paso({ n, titulo, ayuda, children }: { n: number; titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-naranjo text-xs font-bold text-white">{n}</span>
        <div>
          <h3 className="text-sm font-bold text-tinta">{titulo}</h3>
          {ayuda && <p className="text-xs text-gris">{ayuda}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * Cotización en tres pasos en una sola pantalla: 1) a quién y de qué, 2) qué se cotiza (líneas, totales en
 * vivo) y 3) condiciones. Abajo, una barra fija con el total y las dos salidas: guardar borrador o guardar y
 * enviar por correo (PDF + mensaje armado con la cotización).
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
  const t = totalesCotizacion(d.lineas, tasaIva, d.descuentoGeneralTipo && d.descuentoGeneralValor > 0 ? { tipo: d.descuentoGeneralTipo, valor: d.descuentoGeneralValor } : null);
  const cambiarLinea = (i: number, cambio: Partial<LineaCotizacion>) => setD((x) => ({ ...x, lineas: x.lineas.map((l, k) => (k === i ? { ...l, ...cambio } : l)) }));
  const arriendo = d.tipo === "arriendo";
  const hayDescuento = d.lineas.some((l) => l.descuentoPct > 0);

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

  return (
    <div className="space-y-4 pb-24">
      <Paso n={1} titulo="¿A quién y de qué?" ayuda="El cliente trae su condición de pago y lo que exige para facturar.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Campo etiqueta="Título de la cotización *" className="lg:col-span-2"><input value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} className={CAMPO} placeholder="Mantención mensual de chancadores" autoFocus={!d.id} /></Campo>
          <Campo etiqueta="Tipo">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-borde bg-tinta/[0.03] p-1" role="group" aria-label="Tipo de cotización">
              {([["servicio", "Servicio"], ["arriendo", "Arriendo"], ["venta", "Venta"]] as const).map(([k, et]) => (
                <button key={k} type="button" aria-pressed={d.tipo === k} onClick={() => setD((x) => ({ ...x, tipo: k, lineas: x.lineas.map((l) => ({ ...l, meses: k === "arriendo" ? l.meses ?? 1 : null })) }))}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${d.tipo === k ? "bg-naranjo text-white shadow-sm" : "text-gris hover:text-tinta"}`}>{et}</button>
              ))}
            </div>
          </Campo>
          <Campo etiqueta="Cliente *" className="lg:col-span-2">
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
          <Campo etiqueta="Fecha"><input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} className={CAMPO} /></Campo>
          <Campo etiqueta="Atención a" ayuda="Quien recibe la cotización en el cliente"><input value={d.atencion ?? ""} onChange={(e) => setD({ ...d, atencion: e.target.value })} className={CAMPO} placeholder="Nombre y apellido" /></Campo>
          <Campo etiqueta="Correo de esa persona" ayuda="Se propone al enviar"><input type="email" value={d.correoAtencion ?? ""} onChange={(e) => setD({ ...d, correoAtencion: e.target.value })} className={CAMPO} placeholder="persona@cliente.cl" /></Campo>
          <Campo etiqueta="Vigencia">
            <div className="flex flex-wrap items-center gap-1.5">
              {VALIDEZ.map((v) => (
                <button key={v} type="button" aria-pressed={d.validezDias === v} onClick={() => setD({ ...d, validezDias: v })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${d.validezDias === v ? "border-naranjo bg-naranjo/10 text-naranjo" : "border-borde text-gris hover:text-tinta"}`}>{v} días</button>
              ))}
              {!VALIDEZ.includes(d.validezDias) && <span className="rounded-full border border-naranjo bg-naranjo/10 px-3 py-1.5 text-xs font-semibold text-naranjo">{d.validezDias} días</span>}
            </div>
          </Campo>
          <Campo etiqueta="Lead de origen" className="lg:col-span-1">
            <select value={d.oportunidadId ?? ""} onChange={(e) => setD({ ...d, oportunidadId: e.target.value || null })} className={CAMPO}><option value="">Sin lead</option>{oportunidades.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
          </Campo>
          <Campo etiqueta="Proyecto" ayuda="Vacío = se crea al aceptar" className="lg:col-span-1">
            <select value={d.proyectoId ?? ""} onChange={(e) => setD({ ...d, proyectoId: e.target.value || null })} className={CAMPO}><option value="">Crear al aceptar</option>{proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </Campo>
        </div>
      </Paso>

      <Paso n={2} titulo="¿Qué se cotiza?" ayuda={arriendo ? "En arriendo, la tarifa es mensual y se multiplica por los meses." : "Una línea por servicio o producto. Los totales se calculan solos."}>
        <ul className="space-y-3">
          {d.lineas.map((l, i) => (
            <li key={i} className="rounded-xl border border-borde bg-tinta/[0.015] p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-center text-xs font-bold text-gris-suave">{i + 1}</span>
                <textarea aria-label={`Descripción de la línea ${i + 1}`} value={l.descripcion} rows={2} onChange={(e) => cambiarLinea(i, { descripcion: e.target.value })} className={CAMPO} placeholder="Descripción del servicio o producto" />
                <button type="button" onClick={() => setD({ ...d, lineas: d.lineas.filter((_, k) => k !== i) })} disabled={d.lineas.length === 1} className="mt-1 rounded-lg p-2 text-gris hover:bg-rose-500/10 hover:text-alerta disabled:opacity-30" aria-label={`Quitar la línea ${i + 1}`}><IconTrash size={16} /></button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 pl-7 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_9rem]">
                <Campo etiqueta="Cantidad"><Numero etiqueta="Cantidad" valor={l.cantidad} alCambiar={(n) => cambiarLinea(i, { cantidad: n })} /></Campo>
                <Campo etiqueta="Unidad"><input value={l.unidad ?? ""} onChange={(e) => cambiarLinea(i, { unidad: e.target.value })} className={CAMPO} /></Campo>
                <Campo etiqueta={arriendo ? "Tarifa mensual" : "Precio unitario"}><Numero etiqueta="Precio" valor={l.precioUnitario} alCambiar={(n) => cambiarLinea(i, { precioUnitario: n })} /></Campo>
                {arriendo ? <Campo etiqueta="Meses"><Numero etiqueta="Meses" valor={l.meses} alCambiar={(n) => cambiarLinea(i, { meses: n || null })} /></Campo> : <div className="hidden lg:block" />}
                <Campo etiqueta="Descuento %"><Numero etiqueta="Descuento" valor={l.descuentoPct ? Math.round(l.descuentoPct * 1000) / 10 : null} vacioSiCero placeholder="0" alCambiar={(n) => cambiarLinea(i, { descuentoPct: Math.max(0, Math.min(100, n)) / 100 })} /></Campo>
                <div className="col-span-2 flex items-end justify-between gap-3 sm:col-span-3 lg:col-span-1 lg:flex-col lg:items-end lg:justify-end">
                  <label className="inline-flex items-center gap-1.5 text-xs text-gris"><input type="checkbox" checked={l.exento} onChange={(e) => cambiarLinea(i, { exento: e.target.checked })} /> Exento de IVA</label>
                  <span className="text-right"><span className="block text-[10px] font-semibold uppercase tracking-wide text-gris">Total línea</span><span className="font-condensed text-lg font-bold tabular-nums text-tinta">{clp(lineaNeta(l))}</span></span>
                </div>
              </div>
              {productos.length > 0 && (
                <div className="mt-2 pl-7">
                  <select aria-label={`Producto de Inventario para la línea ${i + 1}`} value={l.productoId ?? ""}
                    onChange={(e) => {
                      const p = productos.find((x) => x.id === e.target.value);
                      cambiarLinea(i, p ? { productoId: p.id, descripcion: l.descripcion || p.nombre, precioUnitario: l.precioUnitario || p.precio, unidad: p.unidad ?? l.unidad } : { productoId: null });
                    }}
                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-gris hover:border-borde">
                    <option value="">Rellenar desde un producto de Inventario (opcional)</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <button type="button" onClick={() => setD({ ...d, lineas: [...d.lineas, { ...NUEVA, meses: arriendo ? 1 : null }] })} className={BOTON_SEC}><IconPlus size={14} /> Agregar línea</button>
            <div className="rounded-xl border border-borde p-3">
              <p className="text-[12px] font-semibold text-tinta/75">Descuento general</p>
              <p className="mb-2 text-[11px] text-gris">Sobre toda la cotización, además del descuento de cada línea.</p>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl border border-borde bg-tinta/[0.03] p-1" role="group" aria-label="Tipo de descuento general">
                  {([["pct", "%"], ["monto", "$"]] as const).map(([k, et]) => (
                    <button key={k} type="button" aria-pressed={(d.descuentoGeneralTipo ?? "pct") === k} onClick={() => setD({ ...d, descuentoGeneralTipo: k })}
                      className={`w-9 rounded-lg py-1.5 text-xs font-bold transition ${(d.descuentoGeneralTipo ?? "pct") === k ? "bg-naranjo text-white" : "text-gris hover:text-tinta"}`}>{et}</button>
                  ))}
                </div>
                <div className="w-36"><Numero etiqueta="Descuento general" valor={d.descuentoGeneralValor} vacioSiCero placeholder="Sin descuento" alCambiar={(n) => setD({ ...d, descuentoGeneralTipo: d.descuentoGeneralTipo ?? "pct", descuentoGeneralValor: n })} /></div>
              </div>
            </div>
          </div>
          <dl className="grid min-w-[16rem] grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 rounded-xl bg-tinta/[0.03] px-4 py-3 text-sm">
            {t.descuento > 0 && <><dt className="text-gris">Subtotal</dt><dd className="text-right tabular-nums">{clp(t.bruto)}</dd>
              <dt className="text-gris">Descuento general{d.descuentoGeneralTipo === "pct" ? ` (${d.descuentoGeneralValor.toLocaleString("es-CL", { maximumFractionDigits: 2 })}%)` : ""}</dt><dd className="text-right tabular-nums text-alerta">−{clp(t.descuento)}</dd></>}
            <dt className="text-gris">{t.exento > 0 ? "Neto afecto" : "Neto"}</dt><dd className="text-right tabular-nums">{clp(t.neto)}</dd>
            {t.exento > 0 && <><dt className="text-gris">Exento</dt><dd className="text-right tabular-nums">{clp(t.exento)}</dd></>}
            <dt className="text-gris">IVA {Math.round(tasaIva * 100)}%</dt><dd className="text-right tabular-nums">{clp(t.iva)}</dd>
            <dt className="font-bold text-tinta">Total</dt><dd className="text-right font-condensed text-xl font-bold tabular-nums text-tinta">{clp(t.total)}</dd>
          </dl>
        </div>
        {hayDescuento && <p className="mt-2 text-[11px] text-gris">El descuento se aplica línea por línea y sale en el PDF.</p>}
      </Paso>

      <Paso n={3} titulo="Condiciones" ayuda="Salen en el PDF. Lo que dejes vacío no aparece.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Campo etiqueta="Forma de pago" ayuda="Vacío = «Pago a N días desde la factura», según los días de abajo">
            <input value={d.formaPago ?? ""} onChange={(e) => setD({ ...d, formaPago: e.target.value })} className={CAMPO} placeholder="Ej.: 50% al aceptar, 50% contra entrega" />
            <span className="mt-1.5 flex flex-wrap gap-1.5">{FORMAS_PAGO.map((f) => <button key={f} type="button" onClick={() => setD({ ...d, formaPago: f })} className="rounded-full border border-borde px-2.5 py-1 text-[11px] text-gris hover:border-naranjo/50 hover:text-tinta">{f}</button>)}</span>
          </Campo>
          <Campo etiqueta="Plazo de entrega o inicio"><input value={d.plazoEntrega ?? ""} onChange={(e) => setD({ ...d, plazoEntrega: e.target.value })} className={CAMPO} placeholder="Ej.: 10 días hábiles desde la orden de compra" /></Campo>
          <Campo etiqueta="Días de pago (para facturar y cobrar)" ayuda="Hereda del cliente. Define el vencimiento de la factura."><Numero etiqueta="Días de pago" valor={d.condicionPagoDias} alCambiar={(n) => setD({ ...d, condicionPagoDias: n })} className="text-left" /></Campo>
          <div className="space-y-1.5">
            <span className="block text-[12px] font-semibold text-tinta/75">El cliente exige para facturar</span>
            <div className="flex flex-wrap gap-2">
              {([["requiereOc", "Orden de compra"], ["requiereEdp", "EDP aprobado"], ["requiereHes", "HES"]] as const).map(([k, et]) => (
                <label key={k} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${d[k] ? "border-naranjo bg-naranjo/10 text-naranjo" : "border-borde text-gris"}`}><input type="checkbox" className="sr-only" checked={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.checked })} /> {d[k] && <IconCheck size={12} />} {et}</label>
              ))}
            </div>
          </div>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 lg:col-span-2 ${d.incluirDatosPago ? "border-naranjo bg-naranjo/[0.06]" : "border-borde"}`}>
            <input type="checkbox" className="mt-0.5" checked={d.incluirDatosPago} onChange={(e) => setD({ ...d, incluirDatosPago: e.target.checked })} />
            <span>
              <span className="block text-sm font-semibold text-tinta">Incluir los datos de pago en el PDF</span>
              <span className="block text-xs text-gris">Banco y cuenta de la empresa, para que el cliente sepa dónde pagar. Viene desmarcado: actívalo solo si quieres que salgan.</span>
            </span>
          </label>
          <Campo etiqueta="Observaciones" className="lg:col-span-2"><textarea value={d.notas ?? ""} onChange={(e) => setD({ ...d, notas: e.target.value })} rows={3} className={CAMPO} placeholder="Alcances, exclusiones, supuestos…" /></Campo>
        </div>
      </Paso>

      {error && <p role="alert" className="rounded-lg border-l-[3px] border-rose-500 bg-rose-500/[0.07] px-3 py-2 text-xs text-alerta">{error}</p>}

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie/95 px-4 py-3 shadow-[0_12px_32px_-12px_rgba(23,20,17,0.35)] backdrop-blur">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gris">Total con IVA</p>
          <p className="font-condensed text-2xl font-bold tabular-nums text-tinta">{clp(t.total)}</p>
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
