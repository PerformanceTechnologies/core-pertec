"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle, IconCheck, IconDeviceFloppy, IconFileInvoice, IconFlask, IconLoader2, IconPlus, IconReceipt2, IconReceiptOff, IconReceiptRefund,
  IconSearch, IconSend, IconTrash, IconTruckDelivery, type Icon,
} from "@tabler/icons-react";
import {
  AYUDA_DTE, COD_REF, FORMA_PAGO, IND_TRASLADO, NOMBRE_DTE, TIPO_DESPACHO, TIPOS_REFERENCIA,
  calcularTotales, montoLinea, normalizarDocumento, validarDocumento, vencimientoDesde,
  type DocumentoDte, type LineaDte, type ReferenciaDte, type TipoEmitible,
} from "@/lib/fin/dte/modelo";
import { clp } from "@/lib/fin/reglas";
import { Avatar, BOTON_C, BOTON_SUAVE_C, CAMPO_C, CAMPO_I, ConIcono, HOJA, IconoTile } from "@/components/contactos/Visual";
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
  const nota = t === 61 || t === 56;
  const [verAtencion, setVerAtencion] = useState(() => Boolean(inicial.receptor.contacto || inicial.receptor.correo));

  // Los pasos, numerados en el orden en que se llenan (la guía tiene uno más: transporte).
  const pasos = [t === 52 ? "Destinatario" : "Cliente", t === 52 ? "Traslado" : "Fechas y pago", ...(t === 52 ? ["Transporte y destino"] : []), "Detalle", "Referencias", "Observaciones"];
  const n = (titulo: string) => pasos.indexOf(titulo) + 1;

  return (
    <div className="space-y-4">
      {ambiente === "certificacion" && (
        <p className="flex items-start gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] px-4 py-3 text-[13px] text-violet-800 dark:text-violet-200">
          <IconFlask size={17} className="mt-px shrink-0" /> <span><strong>Ambiente de pruebas.</strong> Lo que emitas aquí no tiene valor tributario y no se mezcla con ventas, saldos ni contabilidad.</span>
        </p>
      )}

      {/* Tipo de documento */}
      <section className={`${HOJA} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <IconoTile Icono={ICONO_TIPO[t]} tono="marca" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">Tipo de documento</p>
            <p className="text-base font-bold text-tinta">{NOMBRE_DTE[t]}</p>
          </div>
          {contexto && <span className="rounded-full bg-tinta/[0.05] px-3 py-1.5 text-[12px] text-gris">Nace de: <span className="font-semibold text-tinta">{contexto}</span></span>}
        </div>
        {!tipoFijo && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup" aria-label="Tipo de documento">
            {([33, 34, 52, 61, 56] as TipoEmitible[]).map((x) => {
              const Icono = ICONO_TIPO[x];
              const activo = x === t;
              return (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => cambiarTipo(x)}
                  className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition ${activo ? "border-naranjo bg-naranjo/[0.07] text-tinta ring-2 ring-naranjo/20" : "border-borde/70 text-gris hover:border-naranjo/40 hover:text-tinta"}`}
                >
                  <Icono size={18} stroke={1.75} className={activo ? "text-naranjo" : ""} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{NOMBRE_DTE[x].replace(" electrónica", "")}</span>
                    <span className="block text-[11px] text-gris-suave">Tipo {x}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[13px] text-gris">{AYUDA_DTE[t]}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-4">
          {/* Cliente / destinatario */}
          <Paso n={n(pasos[0])} titulo={t === 52 ? "Destinatario" : "Cliente"} ayuda="Búscalo por nombre o RUT. Sus datos tributarios salen de Contactos." error={conProblema("receptor")}>
            {cliente ? (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-tinta/[0.035] p-3.5">
                <Avatar nombre={cliente.razonSocial} tipo="empresa" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-tinta">{cliente.razonSocial}</p>
                  <p className="font-mono text-xs text-gris">{doc.receptor.rut || "Sin RUT"}</p>
                  <p className="text-[13px] text-gris">
                    {doc.receptor.giro || <span className="text-alerta">Falta el giro</span>}
                    <span className="text-gris-suave"> · </span>
                    {doc.receptor.direccion || <span className="text-alerta">Falta la dirección</span>}
                    {doc.receptor.comuna ? `, ${doc.receptor.comuna}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => elegirCliente(null)} className={BOTON_SUAVE_C}>Cambiar</button>
                {cliente.faltantes.length > 0 && (
                  <p className="flex w-full items-start gap-1.5 text-[12px] text-alerta">
                    <IconAlertTriangle size={14} className="mt-px shrink-0" />
                    <span>Le falta: {cliente.faltantes.join(", ")}. <Link href={`/finanzas/contactos/${cliente.id}`} target="_blank" className="font-semibold underline">Completar en Contactos</Link> y vuelve a elegirlo.</span>
                  </p>
                )}
                {!cliente.correoDte && <p className="w-full text-[12px] text-aviso">Sin correo de intercambio DTE: el SII igual le llega, pero no recibirá la copia por correo.</p>}
              </div>
            ) : (
              <>
                <div className="relative">
                  <ConIcono Icono={IconSearch}>
                    <input value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); if (cliente) elegirCliente(null); setQ(e.target.value); }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} placeholder="Buscar cliente por nombre o RUT…" className={CAMPO_I} autoComplete="off" />
                  </ConIcono>
                  {abierto && lista.length > 0 && (
                    <ul className="absolute z-40 mt-1.5 max-h-72 w-full overflow-auto rounded-2xl border border-borde/60 bg-superficie p-1.5 shadow-lg">
                      {lista.map((c) => (
                        <li key={c.id}>
                          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegirCliente(c)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-naranjo/[0.08]">
                            <Avatar nombre={c.razonSocial} tipo="empresa" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-tinta">{c.razonSocial}</span>
                              <span className="block font-mono text-[11px] text-gris">{c.rut ?? "sin RUT"}</span>
                            </span>
                            {c.faltantes.length > 0 && <span className="shrink-0 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-aviso">Incompleto</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="mt-2 text-[12px] text-gris">¿No está? <Link href="/finanzas/contactos" target="_blank" className="font-semibold text-naranjo">Créalo en Contactos</Link> y vuelve a buscarlo.</p>
              </>
            )}

            {verAtencion ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Etiqueta texto="Atención a" opcional>
                  <input value={doc.receptor.contacto ?? ""} onChange={(e) => set("receptor", { ...doc.receptor, contacto: e.target.value || null })} className={CAMPO_C} placeholder="Nombre y teléfono" />
                </Etiqueta>
                <Etiqueta texto="Correo de atención" opcional>
                  <input value={doc.receptor.correo ?? ""} onChange={(e) => set("receptor", { ...doc.receptor, correo: e.target.value || null })} className={CAMPO_C} />
                </Etiqueta>
              </div>
            ) : (
              <button type="button" onClick={() => setVerAtencion(true)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-naranjo hover:underline">
                <IconPlus size={14} /> Agregar a quién va dirigida (opcional)
              </button>
            )}
          </Paso>

          {/* Fechas y pago / traslado */}
          <Paso n={n(pasos[1])} titulo={pasos[1]}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Etiqueta texto="Fecha de emisión">
                <input type="date" value={doc.fechaEmision} max={hoy} onChange={(e) => set("fechaEmision", e.target.value)} className={`${CAMPO_C} ${conProblema("fechaEmision") ? ROJO : ""}`} />
              </Etiqueta>
              {t !== 52 && (
                <>
                  <Etiqueta texto="Forma de pago">
                    <select value={doc.formaPago ?? ""} onChange={(e) => { const fp = Number(e.target.value) as 1 | 2 | 3; setDoc((d) => ({ ...d, formaPago: fp, fechaVencimiento: fp === 2 ? d.fechaVencimiento ?? vencimientoDesde(d.fechaEmision, cliente?.plazoDias ?? 30) : null })); }} className={CAMPO_C}>
                      {FORMA_PAGO.map((f) => <option key={f.codigo} value={f.codigo}>{f.texto}</option>)}
                    </select>
                  </Etiqueta>
                  <Etiqueta texto="Vencimiento" ayuda={doc.formaPago !== 2 ? "Solo para pago a crédito." : undefined}>
                    <input type="date" value={doc.fechaVencimiento ?? ""} disabled={doc.formaPago !== 2} onChange={(e) => set("fechaVencimiento", e.target.value || null)} className={CAMPO_C} />
                  </Etiqueta>
                </>
              )}
              {t === 52 && (
                <Etiqueta texto="Motivo del traslado" obligatorio clase="sm:col-span-2" ayuda={IND_TRASLADO.find((x) => x.codigo === doc.indTraslado)?.ayuda}>
                  <select value={doc.indTraslado ?? ""} onChange={(e) => set("indTraslado", Number(e.target.value))} className={`${CAMPO_C} ${conProblema("indTraslado") ? ROJO : ""}`}>
                    {IND_TRASLADO.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.texto}</option>)}
                  </select>
                </Etiqueta>
              )}
            </div>
          </Paso>

          {/* Transporte (guía) */}
          {t === 52 && (
            <Paso n={n("Transporte y destino")} titulo="Transporte y destino" ayuda="Quién lleva los bienes y hacia dónde.">
              <div className="grid gap-3 sm:grid-cols-3">
                <Etiqueta texto="Quién transporta">
                  <select value={doc.tipoDespacho ?? ""} onChange={(e) => set("tipoDespacho", e.target.value ? Number(e.target.value) : null)} className={CAMPO_C}>
                    <option value="">—</option>
                    {TIPO_DESPACHO.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                  </select>
                </Etiqueta>
                <Etiqueta texto="Patente">
                  <input value={doc.transporte?.patente ?? ""} onChange={(e) => setTransporte("patente", e.target.value)} className={`${CAMPO_C} uppercase`} placeholder="ABCD12" />
                </Etiqueta>
                <Etiqueta texto="RUT transportista" obligatorio={doc.tipoDespacho === 2 || doc.tipoDespacho === 3}>
                  <input value={doc.transporte?.rutTransportista ?? ""} onChange={(e) => setTransporte("rutTransportista", e.target.value)} placeholder={doc.tipoDespacho === 2 || doc.tipoDespacho === 3 ? "Obligatorio" : ""} className={`${CAMPO_C} ${conProblema("transporte.rutTransportista") ? ROJO : ""}`} />
                </Etiqueta>
                <Etiqueta texto="RUT chofer">
                  <input value={doc.transporte?.rutChofer ?? ""} onChange={(e) => setTransporte("rutChofer", e.target.value)} className={`${CAMPO_C} ${conProblema("transporte.rutChofer") ? ROJO : ""}`} />
                </Etiqueta>
                <Etiqueta texto="Nombre chofer" clase="sm:col-span-2">
                  <input value={doc.transporte?.nombreChofer ?? ""} onChange={(e) => setTransporte("nombreChofer", e.target.value)} className={`${CAMPO_C} ${conProblema("transporte.nombreChofer") ? ROJO : ""}`} />
                </Etiqueta>
                <Etiqueta texto="Dirección de destino" ayuda="Faena, bodega u obra." clase="sm:col-span-3">
                  <input value={doc.transporte?.direccionDestino ?? ""} onChange={(e) => setTransporte("direccionDestino", e.target.value)} className={CAMPO_C} />
                </Etiqueta>
                <Etiqueta texto="Comuna destino">
                  <input value={doc.transporte?.comunaDestino ?? ""} onChange={(e) => setTransporte("comunaDestino", e.target.value)} className={`${CAMPO_C} ${conProblema("transporte.comunaDestino") ? ROJO : ""}`} />
                </Etiqueta>
                <Etiqueta texto="Ciudad destino">
                  <input value={doc.transporte?.ciudadDestino ?? ""} onChange={(e) => setTransporte("ciudadDestino", e.target.value)} className={CAMPO_C} />
                </Etiqueta>
              </div>
            </Paso>
          )}

          {/* Detalle */}
          <Paso
            n={n("Detalle")}
            titulo="Detalle"
            ayuda={sinValores ? "Traslado que no es venta: los precios pueden ir en cero." : "Lo que se cobra, una línea por producto o servicio. El precio va sin IVA."}
            error={conProblema("lineas")}
          >
            <div className="space-y-3">
              {doc.lineas.map((l, i) => (
                <div key={i} className="rounded-2xl border border-borde/70 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tinta/[0.06] text-[11px] font-bold text-gris">{i + 1}</span>
                    <span className="flex-1 text-[12px] font-semibold text-gris">Línea {i + 1}</span>
                    <span className="text-sm font-bold tabular-nums text-tinta">{clp(montoLinea(l))}</span>
                    <button type="button" onClick={() => setDoc((d) => ({ ...d, lineas: d.lineas.filter((_, j) => j !== i) }))} className="grid h-9 w-9 place-items-center rounded-full text-gris hover:bg-rose-500/10 hover:text-alerta" aria-label={`Quitar línea ${i + 1}`} title="Quitar línea"><IconTrash size={15} /></button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem]">
                    <Etiqueta texto="Producto o servicio" ayuda={l.nombre.length > 60 ? `${l.nombre.length}/80` : undefined}>
                      <input value={l.nombre} onChange={(e) => setLinea(i, { nombre: e.target.value })} placeholder="Ej.: Arriendo de equipo" maxLength={80} className={`${CAMPO_C} ${conProblema(`lineas.${i}.nombre`) ? ROJO : ""}`} />
                    </Etiqueta>
                    <Etiqueta texto="Cantidad">
                      <input value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: Number(e.target.value.replace(",", ".")) || 0 })} inputMode="decimal" className={`${CAMPO_C} text-right tabular-nums`} />
                    </Etiqueta>
                    <Etiqueta texto="Unidad">
                      <input value={l.unidad ?? ""} onChange={(e) => setLinea(i, { unidad: e.target.value.toUpperCase().slice(0, 4) || null })} title="UN, HR, DIA, MES" placeholder="UN" className={CAMPO_C} />
                    </Etiqueta>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
                    <Etiqueta texto="Precio unitario neto">
                      <span className="relative block">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris-suave">$</span>
                        <input value={l.precio} onChange={(e) => setLinea(i, { precio: Number(e.target.value.replace(/[$.\s]/g, "").replace(",", ".")) || 0 })} inputMode="decimal" className={`${CAMPO_C} pl-7 text-right tabular-nums`} />
                      </span>
                    </Etiqueta>
                    <Etiqueta texto="Descuento %">
                      <input value={l.descuentoPct} onChange={(e) => setLinea(i, { descuentoPct: Number(e.target.value.replace(",", ".")) || 0 })} inputMode="decimal" className={`${CAMPO_C} text-right tabular-nums`} />
                    </Etiqueta>
                    {t !== 34 && t !== 52 && (
                      <label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition ${l.exento ? "bg-naranjo/10 text-naranjo" : "bg-tinta/[0.05] text-gris hover:text-tinta"}`}>
                        <input type="checkbox" checked={l.exento} onChange={(e) => setLinea(i, { exento: e.target.checked })} className="accent-naranjo" /> Exento de IVA
                      </label>
                    )}
                  </div>
                  <div className="mt-3">
                    <Etiqueta texto="Descripción adicional" opcional>
                      <input value={l.descripcion ?? ""} onChange={(e) => setLinea(i, { descripcion: e.target.value || null })} placeholder="Período, faena, N° de serie…" className={CAMPO_C} />
                    </Etiqueta>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setDoc((d) => ({ ...d, lineas: [...d.lineas, lineaVacia()] }))} className={BOTON_SUAVE_C}><IconPlus size={15} /> Agregar línea</button>
              {t !== 34 && t !== 52 && (
                <label className="ml-auto flex items-center gap-2 text-[13px] font-semibold text-tinta/75">Descuento global % <span className="font-normal text-gris">(sobre lo afecto)</span>
                  <input value={doc.descuentoGlobalPct} onChange={(e) => set("descuentoGlobalPct", Number(e.target.value.replace(",", ".")) || 0)} inputMode="decimal" className={`${CAMPO_C} w-20 text-right tabular-nums`} />
                </label>
              )}
            </div>
          </Paso>

          {/* Referencias */}
          <Paso
            n={n("Referencias")}
            titulo="Referencias"
            ayuda={nota ? "El documento que esta nota modifica (obligatorio) y qué hace sobre él." : "OC, HES, HEM o contrato que el cliente exige ver en la factura (la minería no paga sin ellas)."}
            error={conProblema("referencias")}
          >
            {doc.referencias.length > 0 && (
              <div className="space-y-3">
                {doc.referencias.map((r, i) => (
                  <div key={i} className="rounded-2xl border border-borde/70 p-3">
                    <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_10rem_auto] sm:items-end">
                      <Etiqueta texto="Tipo">
                        <select value={r.tipo} onChange={(e) => setRef(i, { tipo: e.target.value })} className={CAMPO_C}>
                          {TIPOS_REFERENCIA.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                        </select>
                      </Etiqueta>
                      <Etiqueta texto="Número o folio">
                        <input value={r.folio} onChange={(e) => setRef(i, { folio: e.target.value })} placeholder="N° / folio" className={CAMPO_C} />
                      </Etiqueta>
                      <Etiqueta texto="Fecha">
                        <input type="date" value={r.fecha} onChange={(e) => setRef(i, { fecha: e.target.value })} className={CAMPO_C} />
                      </Etiqueta>
                      <button type="button" onClick={() => setDoc((d) => ({ ...d, referencias: d.referencias.filter((_, j) => j !== i) }))} className="grid h-10 w-10 place-items-center rounded-full text-gris hover:bg-rose-500/10 hover:text-alerta" aria-label={`Quitar referencia ${i + 1}`} title="Quitar referencia"><IconTrash size={15} /></button>
                    </div>
                    {nota && ["33", "34", "52", "56", "61"].includes(r.tipo) && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                        <Etiqueta texto="Qué hace">
                          <select value={r.codRef ?? ""} onChange={(e) => setRef(i, { codRef: (Number(e.target.value) || null) as ReferenciaDte["codRef"] })} className={CAMPO_C}>
                            <option value="">Elegir…</option>
                            {COD_REF.map((x) => <option key={x.codigo} value={x.codigo}>{x.texto}</option>)}
                          </select>
                        </Etiqueta>
                        <Etiqueta texto="Razón" ayuda="Sale impresa en el documento.">
                          <input value={r.razon ?? ""} onChange={(e) => setRef(i, { razon: e.target.value || null })} maxLength={90} placeholder="Ej.: Anula factura por error en el monto" className={CAMPO_C} />
                        </Etiqueta>
                        {r.codRef && <p className="text-[12px] text-gris sm:col-span-2">{COD_REF.find((x) => x.codigo === r.codRef)?.ayuda}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setDoc((d) => ({ ...d, referencias: [...d.referencias, refVacia(hoy)] }))} className={`${BOTON_SUAVE_C} ${doc.referencias.length ? "mt-3" : ""}`}><IconPlus size={15} /> Agregar referencia</button>
          </Paso>

          {/* Observaciones */}
          <Paso n={n("Observaciones")} titulo="Observaciones" ayuda="Opcional. Salen impresas en el documento.">
            <input value={doc.observaciones ?? ""} maxLength={100} onChange={(e) => set("observaciones", e.target.value || null)} className={CAMPO_C} placeholder="Ej.: Transferir a cuenta corriente…" aria-label="Observaciones" />
            <p className="mt-1 text-right text-[11px] text-gris-suave">{(doc.observaciones ?? "").length}/100</p>
          </Paso>
        </div>

        {/* Resumen, totales y acciones */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className={`${HOJA} p-5`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">Resumen</p>
            <p className="mt-1 font-bold text-tinta">{NOMBRE_DTE[t]}</p>
            <p className="truncate text-[13px] text-gris">{cliente?.razonSocial ?? (t === 52 ? "Sin destinatario" : "Sin cliente")}</p>
            <dl className="mt-4 space-y-2 text-sm">
              {totales.descuentoGlobal > 0 && <div className="flex justify-between"><dt className="text-gris">Descuento global</dt><dd className="tabular-nums">−{clp(totales.descuentoGlobal)}</dd></div>}
              {t !== 34 && <div className="flex justify-between"><dt className="text-gris">Neto</dt><dd className="tabular-nums">{clp(totales.neto)}</dd></div>}
              {totales.exento > 0 && <div className="flex justify-between"><dt className="text-gris">Exento</dt><dd className="tabular-nums">{clp(totales.exento)}</dd></div>}
              {t !== 34 && <div className="flex justify-between"><dt className="text-gris">IVA {Math.round(tasaIva * 100)}%</dt><dd className="tabular-nums">{clp(totales.iva)}</dd></div>}
              <div className="flex items-baseline justify-between border-t border-borde/70 pt-3"><dt className="font-bold text-tinta">Total</dt><dd className="text-xl font-extrabold tabular-nums text-tinta">{clp(totales.total)}</dd></div>
            </dl>

            <div className="mt-4">
              {intento && problemas.length > 0 && (
                <ul className="space-y-1.5 rounded-2xl bg-rose-500/[0.06] p-3 text-[12px] text-alerta">
                  {problemas.map((p, i) => <li key={i} className="flex gap-1.5"><IconAlertTriangle size={14} className="mt-px shrink-0" /> {p.texto}</li>)}
                </ul>
              )}
              {!intento && problemas.length === 0 && <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ok"><IconCheck size={15} /> Listo para emitir</p>}
              {!intento && problemas.length > 0 && <p className="text-[12px] text-gris">Faltan {problemas.length === 1 ? "1 dato" : `${problemas.length} datos`} para poder emitir.</p>}
            </div>
            {errorServidor && <p role="alert" className="mt-3 rounded-2xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta">{errorServidor}</p>}
            {bloqueado && <p className="mt-3 rounded-2xl bg-amber-500/[0.08] px-3 py-2.5 text-[12px] text-aviso">{bloqueado}</p>}

            <div className="mt-4 flex flex-col gap-2">
              <button type="button" disabled={pendiente || !activo || Boolean(bloqueado)} onClick={() => enviar("emitir")} className={`${BOTON_C} w-full`}>
                {pendiente ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />} Emitir{ambiente === "certificacion" ? " (prueba)" : ""}
              </button>
              <button type="button" disabled={pendiente} onClick={() => enviar("guardar")} className={`${BOTON_SUAVE_C} w-full`}>
                <IconDeviceFloppy size={16} /> Guardar borrador
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-gris-suave">El borrador no sale del Core. Al emitir, el proveedor asigna el folio, lo firma y lo envía al SII; el cliente recibe la copia en su correo de intercambio.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

const ROJO = "border-rose-400 bg-rose-500/[0.04]";

const ICONO_TIPO: Record<TipoEmitible, Icon> = {
  33: IconFileInvoice,
  34: IconReceiptOff,
  52: IconTruckDelivery,
  61: IconReceiptRefund,
  56: IconReceipt2,
};

/** Un paso del formulario: tarjeta con número, título y una ayuda corta. */
function Paso({ n, titulo, ayuda, error = false, children }: { n: number; titulo: string; ayuda?: string; error?: boolean; children: React.ReactNode }) {
  return (
    <section className={`${HOJA} p-4 sm:p-5 ${error ? "border-rose-400 ring-2 ring-rose-400/20" : ""}`}>
      <div className="mb-4 flex items-start gap-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${error ? "bg-rose-500/12 text-alerta" : "bg-naranjo/10 text-naranjo"}`}>{n}</span>
        <div className="min-w-0">
          <h3 className="font-bold text-tinta">{titulo}</h3>
          {ayuda && <p className="text-[13px] text-gris">{ayuda}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Un campo con su etiqueta arriba (y, si hace falta, una ayuda abajo). */
function Etiqueta({ texto, opcional, obligatorio, ayuda, clase = "", children }: { texto: string; opcional?: boolean; obligatorio?: boolean; ayuda?: string; clase?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${clase}`}>
      <span className="mb-1 block text-[12px] font-semibold text-tinta/75">
        {texto}
        {obligatorio && <span className="text-naranjo"> *</span>}
        {opcional && <span className="font-normal text-gris-suave"> (opcional)</span>}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-gris-suave">{ayuda}</span>}
    </label>
  );
}
