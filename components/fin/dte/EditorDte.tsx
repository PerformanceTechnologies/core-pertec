"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle, IconCheck, IconDeviceFloppy, IconFileInvoice, IconFlask, IconLoader2, IconNotes, IconPlus, IconReceipt2, IconReceiptOff,
  IconReceiptRefund, IconSearch, IconSend, IconTrash, IconTruckDelivery, IconUserPlus, IconX, type Icon,
} from "@tabler/icons-react";
import {
  AYUDA_DTE, COD_REF, FORMA_PAGO, IND_TRASLADO, NOMBRE_DTE, TIPO_DESPACHO, TIPOS_REFERENCIA,
  calcularTotales, montoLinea, normalizarDocumento, validarDocumento, vencimientoDesde,
  type DocumentoDte, type LineaDte, type ReferenciaDte, type TipoEmitible,
} from "@/lib/fin/dte/modelo";
import { clp } from "@/lib/fin/reglas";
import { BOTON, BOTON_SEC } from "../estilos";
import BuscadorProducto, { type ProductoBuscable } from "../BuscadorProducto";
import { avisar, confirmar } from "../dialogos";

/** Lo que el editor necesita de cada cliente para llenar el receptor sin escribirlo. */
export interface ClienteDte {
  id: string;
  rut: string | null;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correoDte: string | null;
  plazoDias: number | null;
  faltantes: string[];
}

type Res = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string };

const lineaVacia = (): LineaDte => ({ nombre: "", descripcion: null, cantidad: 1, unidad: "UN", precio: 0, descuentoPct: 0, exento: false, codigo: null });
const refVacia = (hoy: string): ReferenciaDte => ({ tipo: "801", folio: "", fecha: hoy, codRef: null, razon: null });

/**
 * El editor de un documento tributario (factura, exenta, guía, NC, ND). Calcula y valida mientras se escribe con
 * las MISMAS reglas que el servidor (lib/fin/dte/modelo.ts): lo que aquí dice «listo» el servidor lo acepta.
 *
 * Guardar deja un borrador (no sale nada al SII). Emitir guarda y manda al proveedor en un solo paso, con confirmación.
 */
export default function EditorDte({
  inicial,
  clientes,
  catalogo = [],
  clienteInicial,
  tasaIva,
  hoy,
  ambiente,
  activo,
  tipoFijo,
  contexto,
  guardar,
  emitir,
  bloqueado,
}: {
  inicial: DocumentoDte;
  clientes: ClienteDte[];
  /** Productos y servicios del Inventario, para buscarlos al escribir una línea (con su precio de venta). */
  catalogo?: ProductoBuscable[];
  clienteInicial: string | null;
  tasaIva: number;
  hoy: string;
  ambiente: "certificacion" | "produccion";
  /** Facturación electrónica configurada y encendida para la empresa. */
  activo: boolean;
  /** Si viene, no se puede cambiar el tipo (NC desde una factura, factura desde hitos). */
  tipoFijo?: boolean;
  /** De dónde nace (se muestra arriba): «Hitos V-0003, V-0004», «Corrige la factura N° 120»… */
  contexto?: string | null;
  guardar: (json: string, clienteId: string | null) => Promise<Res>;
  emitir: (json: string, clienteId: string | null) => Promise<Res>;
  /** Motivo por el que no se puede emitir (p. ej. falta configurar); se puede seguir guardando. */
  bloqueado?: string | null;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentoDte>(inicial);
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial);
  const [q, setQ] = useState(() => clientes.find((c) => c.id === clienteInicial)?.razonSocial ?? "");
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);

  const t = doc.tipo;
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const totales = useMemo(() => calcularTotales(doc, tasaIva), [doc, tasaIva]);
  const problemas = useMemo(() => validarDocumento(normalizarDocumento(doc), hoy, tasaIva), [doc, hoy, tasaIva]);
  const conProblema = (campo: string) => intento && problemas.some((p) => p.campo === campo || p.campo.startsWith(`${campo}.`));

  const set = <K extends keyof DocumentoDte>(k: K, v: DocumentoDte[K]) => setDoc((d) => ({ ...d, [k]: v }));
  const setLinea = (i: number, cambio: Partial<LineaDte>) => setDoc((d) => ({ ...d, lineas: d.lineas.map((l, j) => (j === i ? { ...l, ...cambio } : l)) }));
  const setRef = (i: number, cambio: Partial<ReferenciaDte>) => setDoc((d) => ({ ...d, referencias: d.referencias.map((r, j) => (j === i ? { ...r, ...cambio } : r)) }));
  const setTransporte = (k: keyof NonNullable<DocumentoDte["transporte"]>, v: string) =>
    setDoc((d) => ({ ...d, transporte: { patente: null, rutTransportista: null, rutChofer: null, nombreChofer: null, direccionDestino: null, comunaDestino: null, ciudadDestino: null, ...d.transporte, [k]: v } }));

  const elegirCliente = (c: ClienteDte | null) => {
    setClienteId(c?.id ?? null);
    setQ(c?.razonSocial ?? "");
    setAbierto(false);
    setDoc((d) => ({
      ...d,
      receptor: c
        ? { rut: c.rut ?? "", razonSocial: c.razonSocial, giro: c.giro, direccion: c.direccion, comuna: c.comuna, ciudad: c.ciudad, contacto: d.receptor.contacto, correo: d.receptor.correo }
        : { rut: "", razonSocial: "", giro: null, direccion: null, comuna: null, ciudad: null, contacto: null, correo: null },
      fechaVencimiento: c && d.tipo !== 52 && d.formaPago === 2 ? vencimientoDesde(d.fechaEmision, c.plazoDias ?? 30) : d.fechaVencimiento,
    }));
  };
  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = useMemo(() => {
    const x = plano(q.trim());
    if (!x || cliente?.razonSocial === q) return clientes.slice(0, 8);
    return clientes.filter((c) => plano(`${c.razonSocial} ${c.rut ?? ""}`).includes(x)).slice(0, 8);
  }, [q, clientes, cliente]);

  const cambiarTipo = (nuevo: TipoEmitible) =>
    setDoc((d) => ({
      ...d,
      tipo: nuevo,
      indTraslado: nuevo === 52 ? d.indTraslado ?? 1 : null,
      formaPago: nuevo === 52 ? null : d.formaPago ?? 2,
      referencias: (nuevo === 61 || nuevo === 56) && d.referencias.length === 0 ? [{ tipo: "33", folio: "", fecha: hoy, codRef: 3, razon: null }] : d.referencias,
    }));

  const enviar = (modo: "guardar" | "emitir") => {
    setIntento(true);
    setErrorServidor(null);
    const limpio = normalizarDocumento(doc);
    if (modo === "emitir" && problemas.length > 0) return avisar("Revisa lo marcado antes de emitir.");
    iniciar(async () => {
      if (modo === "emitir") {
        const ok = await confirmar({
          titulo: `¿Emitir ${NOMBRE_DTE[t].toLowerCase()} por ${clp(totales.total)}?`,
          ayuda: ambiente === "produccion"
            ? `Va al SII con valor tributario a nombre de ${limpio.receptor.razonSocial}. No se puede borrar: solo se corrige con una nota de crédito.`
            : "Ambiente de PRUEBAS (certificación): no tiene valor tributario y no toca saldos, hitos ni contabilidad.",
          boton: "Emitir",
          peligro: ambiente === "produccion",
        });
        if (!ok) return;
      }
      const r = await (modo === "emitir" ? emitir : guardar)(JSON.stringify(limpio), clienteId);
      if (!r.ok) {
        setErrorServidor(r.error);
        return;
      }
      if (r.mensaje) avisar(r.mensaje, r.mensaje.startsWith("No se emitió") ? "error" : modo === "emitir" ? "ok" : "info");
      router.push(`/finanzas/facturacion/${r.id}`);
      router.refresh();
    });
  };

  const sinValores = t === 52 && doc.indTraslado !== 1;
  const nota = t === 61 || t === 56;
  const [verAtencion, setVerAtencion] = useState(() => Boolean(inicial.receptor.contacto || inicial.receptor.correo));
  // Qué líneas muestran su descripción adicional (las que ya la tienen se ven siempre). Solo visual.
  const [descAbiertas, setDescAbiertas] = useState<number[]>([]);
  const alternarDesc = (i: number) => setDescAbiertas((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i]));

  return (
    <div className="space-y-3 pb-24 lg:pb-20">
      {ambiente === "certificacion" && (
        <p className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.06] px-3 py-2 text-sm text-violet-800 dark:text-violet-200">
          <IconFlask size={17} className="mt-px shrink-0" /> <span><strong>Ambiente de pruebas.</strong> Lo que emitas aquí no tiene valor tributario y no se mezcla con ventas, saldos ni contabilidad.</span>
        </p>
      )}
      {contexto && <p className="rounded-xl border border-naranjo/30 bg-naranjo/[0.06] px-3 py-2 text-sm text-tinta/80">Nace de: <span className="font-semibold text-tinta">{contexto}</span></p>}

      {/* 1 · Documento, cliente y fechas */}
      <Seccion n={1} titulo={t === 52 ? "¿Qué documento y a quién?" : "¿Qué documento y a quién se factura?"} ayuda={AYUDA_DTE[t]} error={conProblema("receptor")}>
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-tinta/[0.05] p-1" role="radiogroup" aria-label="Tipo de documento">
          {([33, 34, 52, 61, 56] as TipoEmitible[]).map((x) => {
            const Icono = ICONO_TIPO[x];
            const activo = x === t;
            return (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={activo}
                disabled={tipoFijo && !activo}
                onClick={() => cambiarTipo(x)}
                className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${activo ? "bg-superficie text-tinta shadow-sm" : "text-gris hover:text-tinta"}`}
              >
                <Icono size={16} stroke={1.75} className={activo ? "text-naranjo" : ""} />
                {NOMBRE_DTE[x].replace(" electrónica", "")}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <div className="min-w-0 sm:col-span-2 lg:col-span-6">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-tinta/70">{t === 52 ? "Destinatario *" : "Cliente *"}</span>
              <Link href="/finanzas/contactos" target="_blank" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-naranjo hover:bg-naranjo/10"><IconUserPlus size={13} /> Nuevo en Contactos</Link>
            </div>
            {cliente ? (
              <div className={`flex min-h-9 items-center gap-2 rounded-lg bg-tinta/[0.05] py-1 pl-2.5 pr-1 ${conProblema("receptor") ? ROJO : ""}`}>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta">{cliente.razonSocial}</span>
                <span className="shrink-0 font-mono text-[11px] text-gris">{doc.receptor.rut || "sin RUT"}</span>
                <button type="button" onClick={() => elegirCliente(null)} className="shrink-0 rounded-md p-1.5 text-gris hover:bg-tinta/[0.08] hover:text-tinta" aria-label="Cambiar cliente" title="Cambiar cliente"><IconX size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <input value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); if (cliente) elegirCliente(null); setQ(e.target.value); }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} placeholder="Busca por nombre o RUT" className={`${CAMPO_C} pl-8 ${conProblema("receptor") ? ROJO : ""}`} autoComplete="off" aria-label={t === 52 ? "Destinatario" : "Cliente"} />
                <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-suave" aria-hidden />
                {abierto && lista.length > 0 && (
                  <ul className="absolute z-40 mt-1.5 max-h-64 w-full overflow-auto rounded-2xl border border-borde/60 bg-superficie p-1.5 shadow-lg">
                    {lista.map((c) => (
                      <li key={c.id}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegirCliente(c)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-naranjo/[0.08]">
                          <span className="truncate">{c.razonSocial}</span>
                          <span className="shrink-0 font-mono text-[11px] text-gris">{c.rut ?? "sin RUT"}{c.faltantes.length ? " · incompleto" : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {cliente ? (
              <p className="mt-1 truncate text-[11px] text-gris">
                {doc.receptor.giro || <span className="text-alerta">sin giro</span>} · {doc.receptor.direccion || <span className="text-alerta">sin dirección</span>}{doc.receptor.comuna ? `, ${doc.receptor.comuna}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-gris">Los datos tributarios salen de Contactos (no se escriben aquí).</p>
            )}
            {cliente && cliente.faltantes.length > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-2.5 py-1.5 text-xs text-tinta/80">
                <IconAlertTriangle size={14} className="shrink-0 text-aviso" />
                <span className="min-w-0 flex-1">Le falta: {cliente.faltantes.join(", ")}.</span>
                <Link href={`/finanzas/contactos/${cliente.id}`} target="_blank" className="font-semibold text-naranjo hover:underline">Completar en Contactos</Link>
              </p>
            )}
            {cliente && !cliente.correoDte && <p className="mt-1 text-[11px] text-aviso">Sin correo de intercambio DTE: el SII igual le llega, pero no recibirá la copia por correo.</p>}
          </div>

          <Et t="Fecha de emisión" className="lg:col-span-2">
            <input type="date" value={doc.fechaEmision} max={hoy} onChange={(e) => set("fechaEmision", e.target.value)} className={`${CAMPO_C} ${conProblema("fechaEmision") ? ROJO : ""}`} />
          </Et>
          {t !== 52 ? (
            <>
              <Et t="Forma de pago" className="lg:col-span-2">
                <select value={doc.formaPago ?? ""} onChange={(e) => { const fp = Number(e.target.value) as 1 | 2 | 3; setDoc((d) => ({ ...d, formaPago: fp, fechaVencimiento: fp === 2 ? d.fechaVencimiento ?? vencimientoDesde(d.fechaEmision, cliente?.plazoDias ?? 30) : null })); }} className={CAMPO_C}>
                  {FORMA_PAGO.map((f) => <option key={f.codigo} value={f.codigo}>{f.texto}</option>)}
                </select>
              </Et>
              <Et t="Vencimiento" className="lg:col-span-2">
                <input type="date" value={doc.fechaVencimiento ?? ""} disabled={doc.formaPago !== 2} onChange={(e) => set("fechaVencimiento", e.target.value || null)} className={CAMPO_C} title={doc.formaPago !== 2 ? "Solo para pago a crédito" : undefined} />
              </Et>
            </>
          ) : (
            <Et t="Motivo del traslado *" className="lg:col-span-4">
              <select value={doc.indTraslado ?? ""} onChange={(e) => set("indTraslado", Number(e.target.value))} className={`${CAMPO_C} ${conProblema("indTraslado") ? ROJO : ""}`}>
                {IND_TRASLADO.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.texto}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-gris-suave">{IND_TRASLADO.find((x) => x.codigo === doc.indTraslado)?.ayuda}</span>
            </Et>
          )}

          {verAtencion ? (
            <>
              <Et t="Atención a (opcional)" className="lg:col-span-6">
                <input value={doc.receptor.contacto ?? ""} onChange={(e) => set("receptor", { ...doc.receptor, contacto: e.target.value || null })} className={CAMPO_C} placeholder="Nombre y teléfono" />
              </Et>
              <Et t="Correo de atención (opcional)" className="lg:col-span-6">
                <input value={doc.receptor.correo ?? ""} onChange={(e) => set("receptor", { ...doc.receptor, correo: e.target.value || null })} className={CAMPO_C} />
              </Et>
            </>
          ) : (
            <div className="sm:col-span-2 lg:col-span-12">
              <button type="button" onClick={() => setVerAtencion(true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-naranjo hover:bg-naranjo/10"><IconPlus size={13} /> Agregar a quién va dirigida (opcional)</button>
            </div>
          )}
        </div>
      </Seccion>

      {/* Guía: transporte y destino */}
      {t === 52 && (
        <Seccion n={2} titulo="Transporte y destino" ayuda="Quién lleva los bienes y hacia dónde.">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
            <Et t="Quién transporta" className="lg:col-span-3">
              <select value={doc.tipoDespacho ?? ""} onChange={(e) => set("tipoDespacho", e.target.value ? Number(e.target.value) : null)} className={CAMPO_C}>
                <option value="">—</option>
                {TIPO_DESPACHO.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
              </select>
            </Et>
            <Et t="Patente" className="lg:col-span-2"><input value={doc.transporte?.patente ?? ""} onChange={(e) => setTransporte("patente", e.target.value)} className={`${CAMPO_C} uppercase`} placeholder="ABCD12" /></Et>
            <Et t={doc.tipoDespacho === 2 || doc.tipoDespacho === 3 ? "RUT transportista *" : "RUT transportista"} className="lg:col-span-2"><input value={doc.transporte?.rutTransportista ?? ""} onChange={(e) => setTransporte("rutTransportista", e.target.value)} placeholder={doc.tipoDespacho === 2 || doc.tipoDespacho === 3 ? "Obligatorio" : ""} className={`${CAMPO_C} ${conProblema("transporte.rutTransportista") ? ROJO : ""}`} /></Et>
            <Et t="RUT chofer" className="lg:col-span-2"><input value={doc.transporte?.rutChofer ?? ""} onChange={(e) => setTransporte("rutChofer", e.target.value)} className={`${CAMPO_C} ${conProblema("transporte.rutChofer") ? ROJO : ""}`} /></Et>
            <Et t="Nombre chofer" className="sm:col-span-2 lg:col-span-3"><input value={doc.transporte?.nombreChofer ?? ""} onChange={(e) => setTransporte("nombreChofer", e.target.value)} className={`${CAMPO_C} ${conProblema("transporte.nombreChofer") ? ROJO : ""}`} /></Et>
            <Et t="Dirección de destino (faena, bodega, obra)" className="sm:col-span-2 lg:col-span-6"><input value={doc.transporte?.direccionDestino ?? ""} onChange={(e) => setTransporte("direccionDestino", e.target.value)} className={CAMPO_C} /></Et>
            <Et t="Comuna destino" className="lg:col-span-3"><input value={doc.transporte?.comunaDestino ?? ""} onChange={(e) => setTransporte("comunaDestino", e.target.value)} className={`${CAMPO_C} ${conProblema("transporte.comunaDestino") ? ROJO : ""}`} /></Et>
            <Et t="Ciudad destino" className="lg:col-span-3"><input value={doc.transporte?.ciudadDestino ?? ""} onChange={(e) => setTransporte("ciudadDestino", e.target.value)} className={CAMPO_C} /></Et>
          </div>
        </Seccion>
      )}

      {/* Detalle */}
      <Seccion n={t === 52 ? 3 : 2} titulo={t === 52 ? "¿Qué se traslada?" : "¿Qué se factura?"} ayuda={sinValores ? "Traslado que no es venta: los precios pueden ir en cero." : "Una fila por producto o servicio. Los precios son netos."} error={conProblema("lineas")}>
        {/* Encabezado de columnas: solo en pantalla ancha; en el celular cada campo lleva su rótulo. */}
        <div className={`mb-1 hidden gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-gris lg:grid ${COLUMNAS}`}>
          <span /><span>Producto o servicio</span><span className="text-right">Cant.</span><span>Unidad</span><span className="text-right">Precio unit. (neto)</span><span className="text-right">Desc. %</span><span className="text-center">{t !== 34 && t !== 52 ? "Exento" : ""}</span><span className="text-right">Total</span><span />
        </div>
        <ul className="space-y-1.5">
          {doc.lineas.map((l, i) => {
            const conDesc = descAbiertas.includes(i) || Boolean(l.descripcion);
            return (
              <li key={i} className={`grid grid-cols-2 items-start gap-1.5 rounded-xl border border-borde bg-tinta/[0.015] p-2 ${COLUMNAS}`}>
                <span className="hidden pt-2 text-center text-[11px] font-bold text-gris-suave lg:block">{i + 1}</span>
                <div className="col-span-2 flex items-start gap-1.5 lg:col-span-1">
                  <span className="mt-2 w-4 shrink-0 text-center text-[11px] font-bold text-gris-suave lg:hidden">{i + 1}</span>
                  <BuscadorProducto
                    catalogo={catalogo}
                    valor={l.nombre}
                    alElegir={(p) => setLinea(i, { nombre: p.nombre.slice(0, 80), codigo: p.sku ?? l.codigo, unidad: p.unidad ? p.unidad.toUpperCase().slice(0, 4) : l.unidad, precio: p.valor > 0 ? p.valor : l.precio })}
                  >
                    <input value={l.nombre} onChange={(e) => setLinea(i, { nombre: e.target.value })} placeholder={catalogo.length ? "Busca en el inventario o escribe (máx. 80)" : "Producto o servicio (máx. 80)"} maxLength={80} aria-label={`Producto o servicio, línea ${i + 1}`} autoComplete="off" className={`${CAMPO_C} ${conProblema(`lineas.${i}.nombre`) ? ROJO : ""}`} />
                  </BuscadorProducto>
                  <button type="button" onClick={() => alternarDesc(i)} aria-pressed={conDesc} title={l.descripcion ? "Editar la descripción adicional" : "Agregar una descripción adicional (período, faena, N° de serie)"}
                    className={`mt-0.5 shrink-0 rounded-lg p-1.5 transition ${l.descripcion ? "bg-naranjo/10 text-naranjo" : conDesc ? "bg-tinta/[0.07] text-tinta" : "text-gris hover:bg-tinta/[0.06] hover:text-tinta"}`} aria-label={`Descripción adicional de la línea ${i + 1}`}><IconNotes size={16} /></button>
                </div>
                <label className="block"><span className={LBL}>Cantidad</span><input aria-label="Cantidad" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: Number(e.target.value.replace(",", ".")) || 0 })} inputMode="decimal" className={`${CAMPO_C} text-right`} onFocus={(e) => e.currentTarget.select()} /></label>
                <label className="block"><span className={LBL}>Unidad</span><input aria-label="Unidad" value={l.unidad ?? ""} onChange={(e) => setLinea(i, { unidad: e.target.value.toUpperCase().slice(0, 4) || null })} title="UN, HR, DIA, MES" placeholder="UN" className={CAMPO_C} /></label>
                <label className="block"><span className={LBL}>Precio unitario (neto)</span><input aria-label="Precio unitario neto" value={l.precio} onChange={(e) => setLinea(i, { precio: Number(e.target.value.replace(/[$.\s]/g, "").replace(",", ".")) || 0 })} inputMode="decimal" className={`${CAMPO_C} text-right`} onFocus={(e) => e.currentTarget.select()} /></label>
                <label className="block"><span className={LBL}>Desc. %</span><input aria-label="Descuento de la línea" value={l.descuentoPct} onChange={(e) => setLinea(i, { descuentoPct: Number(e.target.value.replace(",", ".")) || 0 })} inputMode="decimal" className={`${CAMPO_C} text-right`} /></label>
                {t !== 34 && t !== 52 ? (
                  <label className="flex min-h-9 items-center gap-1.5 text-xs text-gris lg:justify-center"><input type="checkbox" checked={l.exento} onChange={(e) => setLinea(i, { exento: e.target.checked })} aria-label="Exento de IVA" /> <span className="lg:hidden">Exento de IVA</span></label>
                ) : (
                  <span className="hidden lg:block" />
                )}
                <div className="flex min-h-9 items-center justify-end gap-2">
                  <span className={`${LBL} mb-0`}>Total</span>
                  <span className="font-condensed text-lg font-bold tabular-nums text-tinta">{clp(montoLinea(l))}</span>
                </div>
                <div className="col-span-2 flex items-center justify-end lg:col-span-1">
                  <button type="button" onClick={() => setDoc((d) => ({ ...d, lineas: d.lineas.filter((_, j) => j !== i) }))} className="rounded-lg p-1.5 text-gris hover:bg-rose-500/10 hover:text-alerta" aria-label={`Quitar la línea ${i + 1}`} title="Quitar esta línea"><IconTrash size={16} /></button>
                </div>
                {conDesc && (
                  <div className="col-span-2 lg:col-span-full lg:pl-[1.75rem]">
                    <input value={l.descripcion ?? ""} onChange={(e) => setLinea(i, { descripcion: e.target.value || null })} placeholder="Descripción adicional (opcional): período, faena, N° de serie… Sale bajo la línea." aria-label={`Descripción adicional de la línea ${i + 1}`} className={`${CAMPO_C} text-[13px]`} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setDoc((d) => ({ ...d, lineas: [...d.lineas, lineaVacia()] }))} className={BOTON_SEC}><IconPlus size={14} /> Agregar línea</button>
            {t !== 34 && t !== 52 && (
              <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-tinta/70">Descuento global % (sobre lo afecto)
                <input value={doc.descuentoGlobalPct} onChange={(e) => set("descuentoGlobalPct", Number(e.target.value.replace(",", ".")) || 0)} inputMode="decimal" className={`${CAMPO_C.replace("w-full ", "")} w-20 text-right`} />
              </label>
            )}
          </div>
          <dl className="grid min-w-[15rem] grid-cols-[1fr_auto] gap-x-6 gap-y-0 rounded-xl bg-tinta/[0.03] px-3 py-2 text-sm">
            {totales.descuentoGlobal > 0 && <><dt className="text-gris">Descuento global</dt><dd className="text-right tabular-nums">−{clp(totales.descuentoGlobal)}</dd></>}
            {t !== 34 && <><dt className="text-gris">{totales.exento > 0 ? "Neto afecto" : "Neto"}</dt><dd className="text-right tabular-nums">{clp(totales.neto)}</dd></>}
            {totales.exento > 0 && <><dt className="text-gris">Exento</dt><dd className="text-right tabular-nums">{clp(totales.exento)}</dd></>}
            {t !== 34 && <><dt className="text-gris">IVA {Math.round(tasaIva * 100)}%</dt><dd className="text-right tabular-nums">{clp(totales.iva)}</dd></>}
            <dt className="font-bold text-tinta">Total</dt><dd className="text-right font-condensed text-lg font-bold tabular-nums text-tinta">{clp(totales.total)}</dd>
          </dl>
        </div>
      </Seccion>

      {/* Referencias y observaciones */}
      <Seccion
        n={t === 52 ? 4 : 3}
        titulo="Referencias y observaciones"
        ayuda={nota ? "El documento que esta nota modifica (obligatorio) y qué hace sobre él." : "OC, HES, HEM o contrato que el cliente exige ver en la factura (la minería no paga sin ellas)."}
        error={conProblema("referencias")}
      >
        {doc.referencias.length > 0 && (
          <>
            <div className="mb-1 hidden gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-gris lg:grid lg:grid-cols-[12rem_minmax(0,1fr)_9.5rem_2.25rem]">
              <span>Tipo</span><span>N° / folio</span><span>Fecha</span><span />
            </div>
            <ul className="space-y-1.5">
              {doc.referencias.map((r, i) => (
                <li key={i} className="grid grid-cols-2 items-start gap-1.5 rounded-xl border border-borde bg-tinta/[0.015] p-2 lg:grid-cols-[12rem_minmax(0,1fr)_9.5rem_2.25rem]">
                  <label className="col-span-2 block lg:col-span-1"><span className={LBL}>Tipo</span>
                    <select value={r.tipo} onChange={(e) => setRef(i, { tipo: e.target.value })} className={CAMPO_C} aria-label="Tipo de referencia">
                      {TIPOS_REFERENCIA.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className={LBL}>N° / folio</span><input value={r.folio} onChange={(e) => setRef(i, { folio: e.target.value })} placeholder="N° / folio" className={CAMPO_C} aria-label="Número o folio" /></label>
                  <label className="block"><span className={LBL}>Fecha</span><input type="date" value={r.fecha} onChange={(e) => setRef(i, { fecha: e.target.value })} className={CAMPO_C} aria-label="Fecha de la referencia" /></label>
                  <div className="col-span-2 flex items-center justify-end lg:col-span-1">
                    <button type="button" onClick={() => setDoc((d) => ({ ...d, referencias: d.referencias.filter((_, j) => j !== i) }))} className="rounded-lg p-1.5 text-gris hover:bg-rose-500/10 hover:text-alerta" aria-label={`Quitar la referencia ${i + 1}`} title="Quitar esta referencia"><IconTrash size={16} /></button>
                  </div>
                  {nota && ["33", "34", "52", "56", "61"].includes(r.tipo) && (
                    <>
                      <label className="col-span-2 block lg:col-span-1"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gris">Qué hace</span>
                        <select value={r.codRef ?? ""} onChange={(e) => setRef(i, { codRef: (Number(e.target.value) || null) as ReferenciaDte["codRef"] })} className={CAMPO_C}>
                          <option value="">¿Qué hace?</option>
                          {COD_REF.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                        </select>
                      </label>
                      <label className="col-span-2 block lg:col-span-3"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gris">Razón (sale impresa)</span>
                        <input value={r.razon ?? ""} onChange={(e) => setRef(i, { razon: e.target.value || null })} maxLength={90} placeholder="Razón (sale impresa)" className={CAMPO_C} />
                      </label>
                      {r.codRef && <p className="col-span-2 text-[11px] text-gris lg:col-span-4">{COD_REF.find((x) => x.codigo === r.codRef)?.ayuda}</p>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" onClick={() => setDoc((d) => ({ ...d, referencias: [...d.referencias, refVacia(hoy)] }))} className={`${BOTON_SEC} ${doc.referencias.length ? "mt-2.5" : ""}`}><IconPlus size={14} /> Agregar referencia</button>

        <Et t="Observaciones (salen en el documento, máx. 100)" className="mt-3">
          <input value={doc.observaciones ?? ""} maxLength={100} onChange={(e) => set("observaciones", e.target.value || null)} className={CAMPO_C} placeholder="Ej.: Transferir a cuenta corriente…" />
        </Et>
      </Seccion>

      {intento && problemas.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-rose-400/40 bg-rose-500/[0.05] px-3 py-2 text-[12px] text-alerta">
          {problemas.map((p, i) => <li key={i} className="flex gap-1.5"><IconAlertTriangle size={14} className="mt-px shrink-0" /> {p.texto}</li>)}
        </ul>
      )}
      {errorServidor && <p role="alert" className="rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta">{errorServidor}</p>}
      {bloqueado && <p className="rounded-xl bg-amber-500/[0.08] px-3 py-2.5 text-[12px] text-aviso">{bloqueado}</p>}
      <p className="px-1 text-[11px] leading-snug text-gris-suave">El borrador no sale del Core. Al emitir, el proveedor asigna el folio, lo firma y lo envía al SII; el cliente recibe la copia en su correo de intercambio.</p>

      {/* En el celular la barra queda sobre el menú de abajo (h-16); en escritorio, al pie de la pantalla. Igual que en la OC. */}
      <div className="sticky bottom-[4.5rem] z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie/95 px-4 py-2.5 shadow-[0_12px_32px_-12px_rgba(23,20,17,0.35)] backdrop-blur lg:bottom-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gris">{NOMBRE_DTE[t]} · total{t !== 34 ? " con IVA" : ""}</p>
          <p className="font-condensed text-2xl font-bold leading-tight tabular-nums text-tinta">{clp(totales.total)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!intento && problemas.length === 0 && <span className="hidden items-center gap-1 text-[12px] font-semibold text-ok sm:inline-flex"><IconCheck size={15} /> Listo para emitir</span>}
          <button type="button" disabled={pendiente} onClick={() => enviar("guardar")} className={BOTON_SEC}><IconDeviceFloppy size={14} /> Guardar borrador</button>
          <button type="button" disabled={pendiente || !activo || Boolean(bloqueado)} onClick={() => enviar("emitir")} className={BOTON}>
            {pendiente ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />} Emitir{ambiente === "certificacion" ? " (prueba)" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Campos algo más bajos que los del resto del módulo, como en la solicitud de compra (EditorSolicitud). */
const CAMPO_C =
  "min-h-9 w-full rounded-lg border border-transparent bg-tinta/[0.05] px-2.5 py-1.5 text-sm text-tinta placeholder:text-gris-suave transition hover:bg-tinta/[0.07] focus:border-cian/60 focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-cian/15 disabled:cursor-not-allowed disabled:opacity-50";
const LBL = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gris lg:hidden";
/** Columnas de cada línea en pantalla ancha: el producto se lleva lo que sobra. En el celular cada línea es una tarjeta. */
const COLUMNAS = "lg:grid-cols-[1.25rem_minmax(0,1fr)_4.75rem_4.25rem_7.5rem_4.25rem_3.75rem_7rem_2.25rem]";
const ROJO = "!border-rose-400 bg-rose-500/[0.04]";

const ICONO_TIPO: Record<TipoEmitible, Icon> = {
  33: IconFileInvoice,
  34: IconReceiptOff,
  52: IconTruckDelivery,
  61: IconReceiptRefund,
  56: IconReceipt2,
};

/** Una sección compacta, como en la solicitud de compra: número naranjo, título en una línea y el contenido debajo. */
function Seccion({ n, titulo, ayuda, error = false, children }: { n: number; titulo: string; ayuda?: string; error?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border bg-superficie p-3 sm:p-4 ${error ? "border-rose-400" : "border-borde"}`}>
      <header className="mb-2.5 flex flex-wrap items-center gap-2.5" title={ayuda}>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${error ? "bg-rose-500" : "bg-naranjo"}`}>{n}</span>
        <h3 className="text-sm font-bold text-tinta">{titulo}</h3>
        {ayuda && <span className="hidden truncate text-xs text-gris md:inline">{ayuda}</span>}
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
