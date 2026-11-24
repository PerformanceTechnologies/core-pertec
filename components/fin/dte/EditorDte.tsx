"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconCheck, IconDeviceFloppy, IconFlask, IconLoader2, IconPlus, IconSend, IconTrash } from "@tabler/icons-react";
import {
  AYUDA_DTE, COD_REF, FORMA_PAGO, IND_TRASLADO, NOMBRE_DTE, TIPO_DESPACHO, TIPOS_REFERENCIA,
  calcularTotales, montoLinea, normalizarDocumento, validarDocumento, vencimientoDesde,
  type DocumentoDte, type LineaDte, type ReferenciaDte, type TipoEmitible,
} from "@/lib/fin/dte/modelo";
import { clp } from "@/lib/fin/reglas";
import { BOTON, BOTON_SEC, CAMPO } from "../estilos";
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

  return (
    <div className="space-y-4">
      {ambiente === "certificacion" && (
        <p className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.06] px-3.5 py-2.5 text-[13px] text-violet-800 dark:text-violet-200">
          <IconFlask size={17} className="mt-px shrink-0" /> <span><strong>Ambiente de pruebas.</strong> Lo que emitas aquí no tiene valor tributario y no se mezcla con ventas, saldos ni contabilidad.</span>
        </p>
      )}
      {contexto && <p className="rounded-xl bg-tinta/[0.04] px-3.5 py-2 text-[13px] text-gris">Nace de: <span className="font-semibold text-tinta">{contexto}</span></p>}

      {/* Tipo */}
      <section className="rounded-2xl border border-borde bg-superficie p-4">
        <div className="flex flex-wrap gap-1.5">
          {([33, 34, 52, 61, 56] as TipoEmitible[]).map((x) => (
            <button key={x} type="button" disabled={tipoFijo && x !== t} onClick={() => cambiarTipo(x)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${x === t ? "border-naranjo bg-naranjo text-white" : "border-borde bg-superficie text-gris hover:text-tinta disabled:opacity-30"}`}>
              {x} · {NOMBRE_DTE[x].replace(" electrónica", "")}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-gris">{AYUDA_DTE[t]}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {/* Receptor */}
          <section className={`rounded-2xl border bg-superficie p-4 ${conProblema("receptor") ? "border-rose-400" : "border-borde"}`}>
            <h3 className="mb-2 text-sm font-bold text-tinta">{t === 52 ? "Destinatario" : "Cliente (receptor)"}</h3>
            <div className="relative">
              <input value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); if (cliente) elegirCliente(null); setQ(e.target.value); }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} placeholder="Buscar cliente por nombre o RUT…" className={CAMPO} autoComplete="off" />
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
            {cliente ? (
              <div className="mt-3 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
                <p><span className="text-gris">RUT</span> <span className="font-mono">{doc.receptor.rut || "—"}</span></p>
                <p><span className="text-gris">Giro</span> {doc.receptor.giro || <span className="text-alerta">falta</span>}</p>
                <p className="sm:col-span-2"><span className="text-gris">Dirección</span> {doc.receptor.direccion || <span className="text-alerta">falta</span>}{doc.receptor.comuna ? `, ${doc.receptor.comuna}` : ""}</p>
                {cliente.faltantes.length > 0 && (
                  <p className="sm:col-span-2 text-[12px] text-alerta">Le falta: {cliente.faltantes.join(", ")}. <Link href={`/finanzas/contactos/${cliente.id}`} target="_blank" className="font-semibold underline">Completar en Contactos</Link> y vuelve a elegirlo.</p>
                )}
                {!cliente.correoDte && <p className="sm:col-span-2 text-[12px] text-aviso">Sin correo de intercambio DTE: el SII igual le llega, pero no recibirá la copia por correo.</p>}
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-gris">Los datos tributarios salen de Contactos (no se escriben aquí). ¿No está? <Link href="/finanzas/contactos" target="_blank" className="font-semibold text-naranjo">Créalo en Contactos</Link>.</p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-semibold text-tinta/75">Atención a (opcional)<input value={doc.receptor.contacto ?? ""} onChange={(e) => set("receptor", { ...doc.receptor, contacto: e.target.value || null })} className={`${CAMPO} mt-1`} placeholder="Nombre y teléfono" /></label>
              <label className="block text-[12px] font-semibold text-tinta/75">Correo de atención (opcional)<input value={doc.receptor.correo ?? ""} onChange={(e) => set("receptor", { ...doc.receptor, correo: e.target.value || null })} className={`${CAMPO} mt-1`} /></label>
            </div>
          </section>

          {/* Fechas y pago */}
          <section className="grid gap-3 rounded-2xl border border-borde bg-superficie p-4 sm:grid-cols-3">
            <label className="block text-[12px] font-semibold text-tinta/75">Fecha de emisión<input type="date" value={doc.fechaEmision} max={hoy} onChange={(e) => set("fechaEmision", e.target.value)} className={`${CAMPO} mt-1 ${conProblema("fechaEmision") ? "border-rose-400" : ""}`} /></label>
            {t !== 52 && (
              <>
                <label className="block text-[12px] font-semibold text-tinta/75">Forma de pago
                  <select value={doc.formaPago ?? ""} onChange={(e) => { const fp = Number(e.target.value) as 1 | 2 | 3; setDoc((d) => ({ ...d, formaPago: fp, fechaVencimiento: fp === 2 ? d.fechaVencimiento ?? vencimientoDesde(d.fechaEmision, cliente?.plazoDias ?? 30) : null })); }} className={`${CAMPO} mt-1`}>
                    {FORMA_PAGO.map((f) => <option key={f.codigo} value={f.codigo}>{f.texto}</option>)}
                  </select>
                </label>
                <label className="block text-[12px] font-semibold text-tinta/75">Vencimiento<input type="date" value={doc.fechaVencimiento ?? ""} disabled={doc.formaPago !== 2} onChange={(e) => set("fechaVencimiento", e.target.value || null)} className={`${CAMPO} mt-1`} /></label>
              </>
            )}
            {t === 52 && (
              <>
                <label className="block text-[12px] font-semibold text-tinta/75 sm:col-span-2">Motivo del traslado *
                  <select value={doc.indTraslado ?? ""} onChange={(e) => set("indTraslado", Number(e.target.value))} className={`${CAMPO} mt-1 ${conProblema("indTraslado") ? "border-rose-400" : ""}`}>
                    {IND_TRASLADO.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.texto}</option>)}
                  </select>
                  <span className="mt-1 block text-[11px] font-normal text-gris-suave">{IND_TRASLADO.find((x) => x.codigo === doc.indTraslado)?.ayuda}</span>
                </label>
              </>
            )}
          </section>

          {/* Transporte (guía) */}
          {t === 52 && (
            <section className="rounded-2xl border border-borde bg-superficie p-4">
              <h3 className="mb-2 text-sm font-bold text-tinta">Transporte y destino</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-[12px] font-semibold text-tinta/75">Quién transporta
                  <select value={doc.tipoDespacho ?? ""} onChange={(e) => set("tipoDespacho", e.target.value ? Number(e.target.value) : null)} className={`${CAMPO} mt-1`}>
                    <option value="">—</option>
                    {TIPO_DESPACHO.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                  </select>
                </label>
                <label className="block text-[12px] font-semibold text-tinta/75">Patente<input value={doc.transporte?.patente ?? ""} onChange={(e) => setTransporte("patente", e.target.value)} className={`${CAMPO} mt-1 uppercase`} placeholder="ABCD12" /></label>
                <label className="block text-[12px] font-semibold text-tinta/75">RUT transportista<input value={doc.transporte?.rutTransportista ?? ""} onChange={(e) => setTransporte("rutTransportista", e.target.value)} placeholder={doc.tipoDespacho === 2 || doc.tipoDespacho === 3 ? "Obligatorio" : ""} className={`${CAMPO} mt-1 ${conProblema("transporte.rutTransportista") ? "border-rose-400" : ""}`} /></label>
                <label className="block text-[12px] font-semibold text-tinta/75">RUT chofer<input value={doc.transporte?.rutChofer ?? ""} onChange={(e) => setTransporte("rutChofer", e.target.value)} className={`${CAMPO} mt-1 ${conProblema("transporte.rutChofer") ? "border-rose-400" : ""}`} /></label>
                <label className="block text-[12px] font-semibold text-tinta/75 sm:col-span-2">Nombre chofer<input value={doc.transporte?.nombreChofer ?? ""} onChange={(e) => setTransporte("nombreChofer", e.target.value)} className={`${CAMPO} mt-1 ${conProblema("transporte.nombreChofer") ? "border-rose-400" : ""}`} /></label>
                <label className="block text-[12px] font-semibold text-tinta/75 sm:col-span-3">Dirección de destino (faena, bodega, obra)<input value={doc.transporte?.direccionDestino ?? ""} onChange={(e) => setTransporte("direccionDestino", e.target.value)} className={`${CAMPO} mt-1`} /></label>
                <label className="block text-[12px] font-semibold text-tinta/75">Comuna destino<input value={doc.transporte?.comunaDestino ?? ""} onChange={(e) => setTransporte("comunaDestino", e.target.value)} className={`${CAMPO} mt-1 ${conProblema("transporte.comunaDestino") ? "border-rose-400" : ""}`} /></label>
                <label className="block text-[12px] font-semibold text-tinta/75">Ciudad destino<input value={doc.transporte?.ciudadDestino ?? ""} onChange={(e) => setTransporte("ciudadDestino", e.target.value)} className={`${CAMPO} mt-1`} /></label>
              </div>
            </section>
          )}

          {/* Líneas */}
          <section className={`rounded-2xl border bg-superficie p-4 ${conProblema("lineas") ? "border-rose-400" : "border-borde"}`}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="flex-1 text-sm font-bold text-tinta">Detalle</h3>
              {sinValores && <span className="text-[11px] text-gris">Traslado que no es venta: los precios pueden ir en cero.</span>}
            </div>
            <div className="space-y-2">
              {doc.lineas.map((l, i) => (
                <div key={i} className="rounded-xl border border-borde/70 p-2.5">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_4.5rem_8rem_4.5rem_auto]">
                    <input value={l.nombre} onChange={(e) => setLinea(i, { nombre: e.target.value })} placeholder="Producto o servicio (máx. 80)" maxLength={80} className={`${CAMPO} ${conProblema(`lineas.${i}.nombre`) ? "border-rose-400" : ""}`} />
                    <input value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: Number(e.target.value.replace(",", ".")) || 0 })} inputMode="decimal" title="Cantidad" className={CAMPO} />
                    <input value={l.unidad ?? ""} onChange={(e) => setLinea(i, { unidad: e.target.value.toUpperCase().slice(0, 4) || null })} title="Unidad (UN, HR, DIA, MES)" placeholder="UN" className={CAMPO} />
                    <input value={l.precio} onChange={(e) => setLinea(i, { precio: Number(e.target.value.replace(/[$.\s]/g, "").replace(",", ".")) || 0 })} inputMode="decimal" title="Precio unitario neto" className={`${CAMPO} text-right`} />
                    <input value={l.descuentoPct} onChange={(e) => setLinea(i, { descuentoPct: Number(e.target.value.replace(",", ".")) || 0 })} inputMode="decimal" title="Descuento %" className={`${CAMPO} text-right`} />
                    <button type="button" onClick={() => setDoc((d) => ({ ...d, lineas: d.lineas.filter((_, j) => j !== i) }))} className="grid h-9 w-9 place-items-center rounded-lg text-gris hover:bg-rose-500/10 hover:text-alerta" aria-label="Quitar línea"><IconTrash size={15} /></button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                    <input value={l.descripcion ?? ""} onChange={(e) => setLinea(i, { descripcion: e.target.value || null })} placeholder="Descripción adicional (opcional): período, faena, N° de serie…" className={`${CAMPO} min-w-[14rem] flex-1`} />
                    {t !== 34 && t !== 52 && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={l.exento} onChange={(e) => setLinea(i, { exento: e.target.checked })} /> Exento</label>}
                    <span className="ml-auto font-semibold tabular-nums text-tinta">{clp(montoLinea(l))}</span>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setDoc((d) => ({ ...d, lineas: [...d.lineas, lineaVacia()] }))} className={`${BOTON_SEC} mt-2`}><IconPlus size={14} /> Agregar línea</button>
            {t !== 34 && t !== 52 && (
              <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-tinta/75">Descuento global % (sobre lo afecto)
                <input value={doc.descuentoGlobalPct} onChange={(e) => set("descuentoGlobalPct", Number(e.target.value.replace(",", ".")) || 0)} inputMode="decimal" className={`${CAMPO} w-20 text-right`} />
              </label>
            )}
          </section>

          {/* Referencias */}
          <section className={`rounded-2xl border bg-superficie p-4 ${conProblema("referencias") ? "border-rose-400" : "border-borde"}`}>
            <h3 className="text-sm font-bold text-tinta">Referencias</h3>
            <p className="mb-2 text-[12px] text-gris">{t === 61 || t === 56 ? "El documento que esta nota modifica (obligatorio) y qué hace sobre él." : "OC, HES, HEM o contrato que el cliente exige ver en la factura (la minería no paga sin ellas)."}</p>
            <div className="space-y-2">
              {doc.referencias.map((r, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-borde/70 p-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_9.5rem_auto]">
                  <select value={r.tipo} onChange={(e) => setRef(i, { tipo: e.target.value })} className={CAMPO}>
                    {TIPOS_REFERENCIA.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                  </select>
                  <input value={r.folio} onChange={(e) => setRef(i, { folio: e.target.value })} placeholder="N° / folio" className={CAMPO} />
                  <input type="date" value={r.fecha} onChange={(e) => setRef(i, { fecha: e.target.value })} className={CAMPO} />
                  <button type="button" onClick={() => setDoc((d) => ({ ...d, referencias: d.referencias.filter((_, j) => j !== i) }))} className="grid h-9 w-9 place-items-center rounded-lg text-gris hover:bg-rose-500/10 hover:text-alerta" aria-label="Quitar referencia"><IconTrash size={15} /></button>
                  {(t === 61 || t === 56) && ["33", "34", "52", "56", "61"].includes(r.tipo) && (
                    <>
                      <select value={r.codRef ?? ""} onChange={(e) => setRef(i, { codRef: (Number(e.target.value) || null) as ReferenciaDte["codRef"] })} className={`${CAMPO} sm:col-span-1`}>
                        <option value="">¿Qué hace?</option>
                        {COD_REF.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                      </select>
                      <input value={r.razon ?? ""} onChange={(e) => setRef(i, { razon: e.target.value || null })} maxLength={90} placeholder="Razón (sale impresa)" className={`${CAMPO} sm:col-span-3`} />
                      {r.codRef && <p className="text-[11px] text-gris sm:col-span-4">{COD_REF.find((x) => x.codigo === r.codRef)?.ayuda}</p>}
                    </>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setDoc((d) => ({ ...d, referencias: [...d.referencias, refVacia(hoy)] }))} className={`${BOTON_SEC} mt-2`}><IconPlus size={14} /> Agregar referencia</button>
          </section>

          <section className="rounded-2xl border border-borde bg-superficie p-4">
            <label className="block text-[12px] font-semibold text-tinta/75">Observaciones (salen en el documento, máx. 100)
              <input value={doc.observaciones ?? ""} maxLength={100} onChange={(e) => set("observaciones", e.target.value || null)} className={`${CAMPO} mt-1`} placeholder="Ej.: Transferir a cuenta corriente…" />
            </label>
          </section>
        </div>

        {/* Totales y acciones */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border border-borde bg-superficie p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{NOMBRE_DTE[t]}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              {totales.descuentoGlobal > 0 && <div className="flex justify-between"><dt className="text-gris">Descuento global</dt><dd className="tabular-nums">−{clp(totales.descuentoGlobal)}</dd></div>}
              {t !== 34 && <div className="flex justify-between"><dt className="text-gris">Neto</dt><dd className="tabular-nums">{clp(totales.neto)}</dd></div>}
              {totales.exento > 0 && <div className="flex justify-between"><dt className="text-gris">Exento</dt><dd className="tabular-nums">{clp(totales.exento)}</dd></div>}
              {t !== 34 && <div className="flex justify-between"><dt className="text-gris">IVA {Math.round(tasaIva * 100)}%</dt><dd className="tabular-nums">{clp(totales.iva)}</dd></div>}
              <div className="flex justify-between border-t border-borde pt-2 text-base font-extrabold text-tinta"><dt>Total</dt><dd className="tabular-nums">{clp(totales.total)}</dd></div>
            </dl>
          </div>

          {intento && problemas.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-rose-400/40 bg-rose-500/[0.05] p-3 text-[12px] text-alerta">
              {problemas.map((p, i) => <li key={i} className="flex gap-1.5"><IconAlertTriangle size={14} className="mt-px shrink-0" /> {p.texto}</li>)}
            </ul>
          )}
          {!intento && problemas.length === 0 && <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ok"><IconCheck size={15} /> Listo para emitir</p>}
          {errorServidor && <p role="alert" className="rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta">{errorServidor}</p>}
          {bloqueado && <p className="rounded-xl bg-amber-500/[0.08] px-3 py-2.5 text-[12px] text-aviso">{bloqueado}</p>}

          <div className="flex flex-col gap-2">
            <button type="button" disabled={pendiente || !activo || Boolean(bloqueado)} onClick={() => enviar("emitir")} className={`${BOTON} py-2.5`}>
              {pendiente ? <IconLoader2 size={15} className="animate-spin" /> : <IconSend size={15} />} Emitir {ambiente === "certificacion" ? "(prueba)" : ""}
            </button>
            <button type="button" disabled={pendiente} onClick={() => enviar("guardar")} className={BOTON_SEC}>
              <IconDeviceFloppy size={15} /> Guardar borrador
            </button>
          </div>
          <p className="text-[11px] leading-snug text-gris-suave">El borrador no sale del Core. Al emitir, el proveedor asigna el folio, lo firma y lo envía al SII; el cliente recibe la copia en su correo de intercambio.</p>
        </aside>
      </div>
    </div>
  );
}
