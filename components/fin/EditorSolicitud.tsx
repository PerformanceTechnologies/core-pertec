"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconFileTypePdf, IconLoader2, IconPlus, IconSend, IconTrash } from "@tabler/icons-react";
import { guardarSolicitudAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import { MONEDAS, ETIQUETA_MONEDA, formatoMonto, netoLineaOc, aPesos, totalesOc, type LineaOc, type Moneda, type SolicitanteTipo } from "@/lib/fin/oc-modelo";
import { BOTON, BOTON_SEC, CAMPO } from "./estilos";
import { Campo, ComboContacto, type OpcionContacto } from "./ui";
import { avisar, confirmar } from "./dialogos";

export interface DatosEditorSolicitud {
  id: string | null;
  codigo: string | null;
  titulo: string;
  solicitanteTipo: SolicitanteTipo;
  solicitanteUsuarioId: string | null;
  solicitanteOtro: string;
  proveedorId: string | null;
  atencion: string;
  proveedorCorreo: string;
  proyectoId: string | null;
  moneda: Moneda;
  tipoCambio: string;
  lineas: LineaOc[];
  fechaRequerida: string;
  entregaLugar: string;
  entregaPlazo: string;
  formaPago: string;
  condicionPagoDias: string;
  observaciones: string;
  condiciones: string;
  /** Motivo con que la devolvieron, para tenerlo a la vista mientras corrige. */
  devueltaMotivo: string | null;
}

interface LineaForm {
  productoId: string | null;
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio: string;
  /** En % (10 = 10 %). */
  dto: string;
  exento: boolean;
  nota: string;
}

/** «1.500», «1500» y «1,5» son números; mientras se escribe se respeta lo tecleado. */
function leerNumero(t: string): number {
  const s = t.trim();
  if (!s) return 0;
  const sinMiles = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(",", ".");
  const n = Number(sinMiles);
  return Number.isFinite(n) ? n : 0;
}

const aForm = (l: LineaOc): LineaForm => ({
  productoId: l.productoId, descripcion: l.descripcion, cantidad: String(l.cantidad).replace(".", ","), unidad: l.unidad ?? "", precio: String(l.precioUnitario).replace(".", ","),
  dto: l.descuentoPct > 0 ? String(Math.round(l.descuentoPct * 1000) / 10).replace(".", ",") : "", exento: l.exento, nota: l.nota ?? "",
});
const aLinea = (f: LineaForm): LineaOc => ({
  productoId: f.productoId, descripcion: f.descripcion.trim(), cantidad: leerNumero(f.cantidad), unidad: f.unidad.trim() || null, precioUnitario: leerNumero(f.precio),
  descuentoPct: Math.max(0, Math.min(100, leerNumero(f.dto))) / 100, exento: f.exento, nota: f.nota.trim() || null,
});
const LINEA_NUEVA: LineaForm = { productoId: null, descripcion: "", cantidad: "1", unidad: "un", precio: "", dto: "", exento: false, nota: "" };

const TARJETA_SECCION = "rounded-2xl border border-borde bg-superficie p-4 sm:p-5";
const TITULO_SECCION = "mb-3 text-[13px] font-bold uppercase tracking-wide text-gris";
/** Más bajos que el resto: esta pantalla tiene muchos campos. */
const CAMPO_C = `${CAMPO} min-h-10`;

/**
 * La solicitud de compra con formato de OC. Un solo formulario, de arriba abajo, pensado para el celular
 * (cada ítem es una tarjeta) y que en pantallas grandes pone los campos en fila. «Guardar borrador» no exige
 * nada más que el título; «Enviar a aprobación» exige proveedor, ítems y total.
 */
export default function EditorSolicitud({
  inicial,
  proveedores,
  proyectos,
  personas,
  yo,
  indicadores,
  tasaIva,
  condicionesEmpresa,
}: {
  inicial: DatosEditorSolicitud;
  proveedores: OpcionContacto[];
  proyectos: { id: string; nombre: string }[];
  personas: { id: string; nombre: string; correo: string }[];
  yo: { id: string; nombre: string };
  indicadores: { uf: number | null; dolar: number | null };
  tasaIva: number;
  condicionesEmpresa: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [solicitanteTipo, setSolicitanteTipo] = useState<SolicitanteTipo>(inicial.solicitanteTipo);
  const [solicitanteUsuarioId, setSolicitanteUsuarioId] = useState(inicial.solicitanteUsuarioId ?? "");
  const [solicitanteOtro, setSolicitanteOtro] = useState(inicial.solicitanteOtro);
  const [proveedorId, setProveedorId] = useState<string | null>(inicial.proveedorId);
  const [atencion, setAtencion] = useState(inicial.atencion);
  const [proveedorCorreo, setProveedorCorreo] = useState(inicial.proveedorCorreo);
  const [proyectoId, setProyectoId] = useState(inicial.proyectoId ?? "");
  const [moneda, setMoneda] = useState<Moneda>(inicial.moneda);
  const [tipoCambio, setTipoCambio] = useState(inicial.tipoCambio);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas.length > 0 ? inicial.lineas.map(aForm) : [{ ...LINEA_NUEVA }]);
  const [fechaRequerida, setFechaRequerida] = useState(inicial.fechaRequerida);
  const [entregaLugar, setEntregaLugar] = useState(inicial.entregaLugar);
  const [entregaPlazo, setEntregaPlazo] = useState(inicial.entregaPlazo);
  const [formaPago, setFormaPago] = useState(inicial.formaPago);
  const [condicionPagoDias, setCondicionPagoDias] = useState(inicial.condicionPagoDias);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [condiciones, setCondiciones] = useState(inicial.condiciones || condicionesEmpresa);

  const items = lineas.map(aLinea);
  const t = totalesOc(items.filter((l) => l.descripcion), tasaIva, moneda);
  const tc = moneda === "CLP" ? 1 : leerNumero(tipoCambio);
  const sugerido = moneda === "UF" ? indicadores.uf : moneda === "USD" ? indicadores.dolar : null;

  function cambiarLinea(i: number, parche: Partial<LineaForm>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...parche } : l)));
  }

  function cambiarMoneda(nueva: Moneda) {
    setMoneda(nueva);
    // Al pasar a UF o dólar se propone el valor de hoy; el de antes no sirve en otra moneda.
    const valor = nueva === "UF" ? indicadores.uf : nueva === "USD" ? indicadores.dolar : null;
    setTipoCambio(valor ? String(valor).replace(".", ",") : "");
  }

  function guardar(enviar: boolean) {
    const datos = {
      titulo, proveedorId, atencion, proveedorCorreo, proyectoId: proyectoId || null, solicitanteTipo, solicitanteUsuarioId: solicitanteUsuarioId || null, solicitanteOtro,
      moneda, tipoCambio: tc, lineas: items.filter((l) => l.descripcion), fechaRequerida: fechaRequerida || null, entregaLugar, entregaPlazo, formaPago,
      condicionPagoDias: condicionPagoDias.trim() === "" ? null : leerNumero(condicionPagoDias), observaciones, condiciones: condiciones.trim() === condicionesEmpresa.trim() ? "" : condiciones,
    };
    iniciar(async () => {
      if (enviar && !(await confirmar({ titulo: "¿Enviar a aprobación?", ayuda: "Después de enviarla ya no se puede editar, salvo que quien aprueba la devuelva.", boton: "Enviar" }))) return;
      const r = await guardarSolicitudAction(inicial.id, JSON.stringify(datos), enviar);
      if (!r.ok) return avisar(r.error);
      avisar(enviar ? "Enviada a aprobación." : "Borrador guardado.", "ok");
      router.push(`/finanzas/compras/${r.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-4">
      {inicial.devueltaMotivo && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-4 py-3 text-sm text-alerta">
          <strong>La devolvieron:</strong> {inicial.devueltaMotivo}
        </p>
      )}

      <section className={TARJETA_SECCION}>
        <h2 className={TITULO_SECCION}>Quién solicita y qué se compra</h2>
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-[12px] font-semibold text-tinta/75">Quién solicita</span>
            <div role="radiogroup" aria-label="Quién solicita" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-borde bg-tinta/[0.03] p-1">
              {(
                [
                  ["yo", `Yo (${yo.nombre})`],
                  ["usuario", "Otra persona del Core"],
                  ["otro", "Alguien externo"],
                ] as const
              ).map(([clave, etiqueta]) => (
                <button
                  key={clave}
                  type="button"
                  role="radio"
                  aria-checked={solicitanteTipo === clave}
                  onClick={() => setSolicitanteTipo(clave)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${solicitanteTipo === clave ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            {solicitanteTipo === "usuario" && (
              <select value={solicitanteUsuarioId} onChange={(e) => setSolicitanteUsuarioId(e.target.value)} className={`${CAMPO_C} mt-2`} aria-label="Persona que solicita">
                <option value="">Elige a la persona…</option>
                {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
            {solicitanteTipo === "otro" && <input value={solicitanteOtro} onChange={(e) => setSolicitanteOtro(e.target.value)} placeholder="Nombre de quien solicita" maxLength={120} className={`${CAMPO_C} mt-2`} aria-label="Nombre de quien solicita" />}
          </div>
          <Campo etiqueta="Título o descripción breve *">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Repuestos para chancador planta Norte" maxLength={300} className={CAMPO_C} />
          </Campo>
          <Campo etiqueta="Proyecto" ayuda="A qué proyecto se carga el gasto.">
            <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={CAMPO_C}>
              <option value="">General</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
        </div>
      </section>

      <section className={TARJETA_SECCION}>
        <h2 className={TITULO_SECCION}>Proveedor</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Proveedor *" className="sm:col-span-2">
            <ComboContacto name="proveedorId" opciones={proveedores} inicial={proveedorId} alCambiar={setProveedorId} />
          </Campo>
          <Campo etiqueta="Atención"><input value={atencion} onChange={(e) => setAtencion(e.target.value)} placeholder="Nombre de su contacto" maxLength={120} className={CAMPO_C} /></Campo>
          <Campo etiqueta="Correo para enviarle la OC"><input value={proveedorCorreo} onChange={(e) => setProveedorCorreo(e.target.value)} type="email" inputMode="email" placeholder="ventas@proveedor.cl" maxLength={160} className={CAMPO_C} /></Campo>
        </div>
      </section>

      <section className={TARJETA_SECCION}>
        <h2 className={TITULO_SECCION}>Ítems</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Moneda">
            <select value={moneda} onChange={(e) => cambiarMoneda(e.target.value as Moneda)} className={CAMPO_C}>
              {MONEDAS.map((m) => <option key={m} value={m}>{ETIQUETA_MONEDA[m]}</option>)}
            </select>
          </Campo>
          {moneda !== "CLP" && (
            <Campo etiqueta={`Valor de ${moneda} en pesos *`} ayuda={sugerido ? `Hoy: ${formatoMonto(sugerido, "CLP")}. Puedes ajustarlo.` : "Escríbelo: no pudimos traer el valor de hoy."}>
              <div className="flex gap-2">
                <input value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} inputMode="decimal" placeholder="38.500" className={CAMPO_C} />
                {sugerido && <button type="button" onClick={() => setTipoCambio(String(sugerido).replace(".", ","))} className={`${BOTON_SEC} shrink-0`}>Usar hoy</button>}
              </div>
            </Campo>
          )}
        </div>

        <ul className="space-y-3">
          {lineas.map((l, i) => {
            const li = items[i];
            return (
              <li key={i} className="rounded-xl border border-borde bg-tinta/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gris">Ítem {i + 1}</span>
                  <span className="text-sm font-bold tabular-nums text-tinta">{formatoMonto(netoLineaOc(li, moneda), moneda)}</span>
                  <button type="button" onClick={() => setLineas((ls) => (ls.length === 1 ? [{ ...LINEA_NUEVA }] : ls.filter((_, j) => j !== i)))} className="grid h-9 w-9 place-items-center rounded-lg text-gris transition hover:bg-rose-500/10 hover:text-alerta" aria-label={`Quitar el ítem ${i + 1}`}>
                    <IconTrash size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                  <input value={l.descripcion} onChange={(e) => cambiarLinea(i, { descripcion: e.target.value })} placeholder="Descripción del producto o servicio" maxLength={500} className={`${CAMPO_C} col-span-2 sm:col-span-12`} aria-label={`Descripción del ítem ${i + 1}`} />
                  <label className="sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase text-gris">Cantidad</span><input value={l.cantidad} onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })} inputMode="decimal" className={CAMPO_C} /></label>
                  <label className="sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase text-gris">Unidad</span><input value={l.unidad} onChange={(e) => cambiarLinea(i, { unidad: e.target.value })} maxLength={20} className={CAMPO_C} /></label>
                  <label className="col-span-2 sm:col-span-4"><span className="mb-1 block text-[10px] font-semibold uppercase text-gris">Precio unitario (neto)</span><input value={l.precio} onChange={(e) => cambiarLinea(i, { precio: e.target.value })} inputMode="decimal" placeholder="0" className={CAMPO_C} /></label>
                  <label className="sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase text-gris">Desc. %</span><input value={l.dto} onChange={(e) => cambiarLinea(i, { dto: e.target.value })} inputMode="decimal" placeholder="0" className={CAMPO_C} /></label>
                  <label className="flex items-end gap-2 pb-2 text-xs text-tinta sm:col-span-2"><input type="checkbox" checked={l.exento} onChange={(e) => cambiarLinea(i, { exento: e.target.checked })} className="h-4 w-4 accent-[var(--color-naranjo)]" /> Exento de IVA</label>
                  <textarea value={l.nota} onChange={(e) => cambiarLinea(i, { nota: e.target.value })} rows={1} placeholder="Detalle opcional (marca, código, especificación…)" maxLength={1000} className={`${CAMPO_C} col-span-2 sm:col-span-12`} aria-label={`Detalle del ítem ${i + 1}`} />
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setLineas((ls) => [...ls, { ...LINEA_NUEVA }])} className={`${BOTON_SEC} mt-3 w-full sm:w-auto`}><IconPlus size={15} /> Agregar ítem</button>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 rounded-xl bg-tinta/[0.04] px-4 py-3 text-sm">
          <p className="flex justify-between"><span className="text-gris">{t.exento > 0 ? "Neto afecto" : "Neto"}</span><span className="tabular-nums">{formatoMonto(t.neto, moneda)}</span></p>
          {t.exento > 0 && <p className="flex justify-between"><span className="text-gris">Exento</span><span className="tabular-nums">{formatoMonto(t.exento, moneda)}</span></p>}
          <p className="flex justify-between"><span className="text-gris">IVA {Math.round(tasaIva * 1000) / 10}%</span><span className="tabular-nums">{formatoMonto(t.iva, moneda)}</span></p>
          <p className="flex justify-between border-t border-borde pt-1 text-base font-extrabold text-tinta"><span>Total</span><span className="tabular-nums">{formatoMonto(t.total, moneda)}</span></p>
          {moneda !== "CLP" && <p className="flex justify-between text-xs text-gris"><span>En pesos</span><span className="tabular-nums">{formatoMonto(aPesos(t.total, moneda, tc), "CLP")}</span></p>}
        </div>
      </section>

      <section className={TARJETA_SECCION}>
        <h2 className={TITULO_SECCION}>Entrega y pago</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Lugar de entrega" className="sm:col-span-2"><input value={entregaLugar} onChange={(e) => setEntregaLugar(e.target.value)} placeholder="Faena Planta Norte, Calama" maxLength={300} className={CAMPO_C} /></Campo>
          <Campo etiqueta="Plazo de entrega"><input value={entregaPlazo} onChange={(e) => setEntregaPlazo(e.target.value)} placeholder="5 días hábiles" maxLength={120} className={CAMPO_C} /></Campo>
          <Campo etiqueta="Se necesita para"><input type="date" value={fechaRequerida} onChange={(e) => setFechaRequerida(e.target.value)} className={CAMPO_C} /></Campo>
          <Campo etiqueta="Días para pagar" ayuda="0 = contado contra factura."><input value={condicionPagoDias} onChange={(e) => setCondicionPagoDias(e.target.value)} inputMode="numeric" placeholder="30" className={CAMPO_C} /></Campo>
          <Campo etiqueta="Forma de pago"><input value={formaPago} onChange={(e) => setFormaPago(e.target.value)} placeholder="Transferencia" maxLength={200} className={CAMPO_C} /></Campo>
        </div>
      </section>

      <section className={TARJETA_SECCION}>
        <h2 className={TITULO_SECCION}>Observaciones y condiciones</h2>
        <div className="space-y-3">
          <Campo etiqueta="Observaciones" ayuda="Salen en la OC, para el proveedor."><textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} maxLength={2000} className={CAMPO_C} /></Campo>
          <Campo etiqueta="Condiciones generales" ayuda="Vienen de la empresa; puedes ajustarlas solo para esta OC."><textarea value={condiciones} onChange={(e) => setCondiciones(e.target.value)} rows={5} maxLength={3000} className={CAMPO_C} /></Campo>
        </div>
      </section>

      {/* En el celular la barra queda sobre el menú de abajo (h-16); en escritorio, al pie de la pantalla. */}
      <div className="sticky bottom-[4.5rem] z-30 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-borde bg-superficie/95 px-4 py-3 shadow-lg backdrop-blur lg:bottom-3">
        <span className="mr-auto text-sm font-bold tabular-nums text-tinta">{formatoMonto(t.total, moneda)}</span>
        {inicial.id && (
          <a href={`/api/finanzas/compras/${inicial.id}/oc-pdf`} target="_blank" rel="noopener" className={BOTON_SEC}><IconFileTypePdf size={15} /> Vista previa</a>
        )}
        <button type="button" disabled={pendiente} onClick={() => guardar(false)} className={BOTON_SEC}>{pendiente ? <IconLoader2 size={15} className="animate-spin" /> : null} Guardar borrador</button>
        <button type="button" disabled={pendiente} onClick={() => guardar(true)} className={BOTON}><IconSend size={15} /> Enviar a aprobación</button>
      </div>
    </div>
  );
}
