"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconFileTypePdf, IconLoader2, IconNotes, IconPlus, IconSend, IconSparkles, IconTrash, IconUserPlus, IconX } from "@tabler/icons-react";
import { guardarSolicitudAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import { MONEDAS, formatoMonto, netoLineaOc, aPesos, totalesOc, type LineaOc, type Moneda, type SolicitanteTipo } from "@/lib/fin/oc-modelo";
import type { DatosLeidos } from "@/lib/fin/oc-ia-datos";
import { BOTON, BOTON_SEC } from "./estilos";
import { ComboContacto, type OpcionContacto } from "./ui";
import { avisar, confirmar } from "./dialogos";
import FormularioContacto, { type ContactoCreado, type PrecargaContacto } from "@/components/contactos/FormularioContacto";

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

const texto = (n: number) => String(n).replace(".", ",");
const aForm = (l: LineaOc): LineaForm => ({
  productoId: l.productoId, descripcion: l.descripcion, cantidad: texto(l.cantidad), unidad: l.unidad ?? "", precio: l.precioUnitario ? texto(l.precioUnitario) : "",
  dto: l.descuentoPct > 0 ? texto(Math.round(l.descuentoPct * 1000) / 10) : "", exento: l.exento, nota: l.nota ?? "",
});
const aLinea = (f: LineaForm): LineaOc => ({
  productoId: f.productoId, descripcion: f.descripcion.trim(), cantidad: leerNumero(f.cantidad), unidad: f.unidad.trim() || null, precioUnitario: leerNumero(f.precio),
  descuentoPct: Math.max(0, Math.min(100, leerNumero(f.dto))) / 100, exento: f.exento, nota: f.nota.trim() || null,
});
const LINEA_NUEVA: LineaForm = { productoId: null, descripcion: "", cantidad: "1", unidad: "un", precio: "", dto: "", exento: false, nota: "" };

/** Campos algo más bajos que los del resto del módulo: esta pantalla tiene muchos y se quiere ver casi todo sin desplazarse. */
const CAMPO_C =
  "min-h-9 w-full rounded-lg border border-transparent bg-tinta/[0.05] px-2.5 py-1.5 text-sm text-tinta placeholder:text-gris-suave transition hover:bg-tinta/[0.07] focus:border-cian/60 focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-cian/15";
const LBL = "text-[10px] font-semibold text-gris lg:hidden";
/** Columnas de cada ítem en pantalla ancha (en el celular cada ítem es una tarjeta de dos columnas). */
const COLUMNAS = "lg:grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_4rem_7.5rem_4.5rem_4rem_7rem_1.75rem]";
const TIPOS_ARCHIVO = "application/pdf,image/jpeg,image/png,image/webp";
const MAXIMO_ARCHIVO = 4 * 1024 * 1024;

/** Una sección compacta: título en una línea y el contenido pegado debajo. */
function Seccion({ n, titulo, ayuda, derecha, children }: { n: number; titulo: string; ayuda?: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borde bg-superficie p-3 sm:p-4">
      <header className="mb-2.5 flex flex-wrap items-center gap-2.5" title={ayuda}>
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
 * La solicitud de compra con formato de OC, en tres secciones y casi sin desplazarse (como la cotización):
 * 1) quién, qué y a quién, 2) ítems con totales en vivo, 3) entrega, pago y condiciones. Arriba hay una alternativa:
 * subir la cotización del proveedor y dejar que la IA llene el formulario (se revisa antes de guardar).
 * «Guardar borrador» no exige más que el título; «Enviar a aprobación» exige proveedor, ítems y total.
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
  puedeCrearProveedor = false,
}: {
  inicial: DatosEditorSolicitud;
  proveedores: OpcionContacto[];
  proyectos: { id: string; nombre: string }[];
  personas: { id: string; nombre: string; correo: string }[];
  yo: { id: string; nombre: string };
  indicadores: { uf: number | null; dolar: number | null };
  tasaIva: number;
  condicionesEmpresa: string;
  /** Quien no tiene Contactos no ve el botón (la acción lo sacaría de la pantalla y perdería lo escrito). */
  puedeCrearProveedor?: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [solicitanteTipo, setSolicitanteTipo] = useState<SolicitanteTipo>(inicial.solicitanteTipo);
  const [solicitanteUsuarioId, setSolicitanteUsuarioId] = useState(inicial.solicitanteUsuarioId ?? "");
  const [solicitanteOtro, setSolicitanteOtro] = useState(inicial.solicitanteOtro);
  const [proveedorId, setProveedorId] = useState<string | null>(inicial.proveedorId);
  // Proveedores creados desde aquí (popup) y lo que la IA leyó del proveedor cuando no está en Contactos.
  const [creados, setCreados] = useState<OpcionContacto[]>([]);
  const [creando, setCreando] = useState<PrecargaContacto | null>(null);
  const [proveedorSinContacto, setProveedorSinContacto] = useState<PrecargaContacto | null>(null);
  // El combo de proveedor solo lee su valor inicial al montarse: al cargar uno desde la IA se remonta con otra clave.
  const [claveProveedor, setClaveProveedor] = useState(0);
  const [atencion, setAtencion] = useState(inicial.atencion);
  const [proveedorCorreo, setProveedorCorreo] = useState(inicial.proveedorCorreo);
  const [proyectoId, setProyectoId] = useState(inicial.proyectoId ?? "");
  const [moneda, setMoneda] = useState<Moneda>(inicial.moneda);
  const [tipoCambio, setTipoCambio] = useState(inicial.tipoCambio);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas.length > 0 ? inicial.lineas.map(aForm) : [{ ...LINEA_NUEVA }]);
  const [notasAbiertas, setNotasAbiertas] = useState<number[]>([]);
  const [fechaRequerida, setFechaRequerida] = useState(inicial.fechaRequerida);
  const [entregaLugar, setEntregaLugar] = useState(inicial.entregaLugar);
  const [entregaPlazo, setEntregaPlazo] = useState(inicial.entregaPlazo);
  const [formaPago, setFormaPago] = useState(inicial.formaPago);
  const [condicionPagoDias, setCondicionPagoDias] = useState(inicial.condicionPagoDias);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [condiciones, setCondiciones] = useState(inicial.condiciones || condicionesEmpresa);

  // Cotización del proveedor leída con IA.
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [avisosIa, setAvisosIa] = useState<string[]>([]);

  const items = lineas.map(aLinea);
  const t = totalesOc(items.filter((l) => l.descripcion), tasaIva, moneda);
  const tc = moneda === "CLP" ? 1 : leerNumero(tipoCambio);
  const sugerido = moneda === "UF" ? indicadores.uf : moneda === "USD" ? indicadores.dolar : null;
  const cambiarLinea = (i: number, parche: Partial<LineaForm>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...parche } : l)));
  const quitarLinea = (i: number) => {
    setLineas((ls) => (ls.length === 1 ? [{ ...LINEA_NUEVA }] : ls.filter((_, j) => j !== i)));
    setNotasAbiertas((a) => a.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)));
  };
  const alternarNota = (i: number) => setNotasAbiertas((a) => (a.includes(i) ? a.filter((k) => k !== i) : [...a, i]));

  /** El proveedor recién creado en el popup: queda elegido en la solicitud. */
  function proveedorCreado(c: ContactoCreado) {
    setCreados((x) => [...x, { id: c.id, nombre: c.razonSocial, rut: c.rut }]);
    setProveedorId(c.id);
    setClaveProveedor((k) => k + 1);
    setProveedorSinContacto(null);
    setCreando(null);
    avisar(`Proveedor «${c.razonSocial}» creado y elegido.`, "ok");
  }

  function cambiarMoneda(nueva: Moneda) {
    setMoneda(nueva);
    // Al pasar a UF o dólar se propone el valor de hoy; el de antes no sirve en otra moneda.
    const valor = nueva === "UF" ? indicadores.uf : nueva === "USD" ? indicadores.dolar : null;
    setTipoCambio(valor ? texto(valor) : "");
  }

  async function leerConIa(f: File) {
    if (f.size > MAXIMO_ARCHIVO) return avisar("El archivo pesa más de 4 MB. Comprímelo o sube solo las páginas con los precios.");
    const hayItems = lineas.some((l) => l.descripcion.trim());
    if (hayItems && !(await confirmar({ titulo: "¿Leer la cotización con IA?", ayuda: "Reemplazará los ítems, el proveedor y las condiciones que ya escribiste. Podrás revisar todo antes de guardar.", boton: "Leer y reemplazar" }))) return;
    setLeyendo(true);
    setAvisosIa([]);
    try {
      const fd = new FormData();
      fd.set("archivo", f);
      const r = await fetch("/api/finanzas/compras/leer-cotizacion", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "No se pudo leer la cotización." }));
      if (r.error || !r.datos) return avisar(r.error ?? "No se pudo leer la cotización.");
      const d = r.datos as DatosLeidos;
      setArchivo(f);
      if (d.titulo) setTitulo(d.titulo);
      setProveedorId(r.proveedorId ?? null);
      setClaveProveedor((k) => k + 1);
      // Si el proveedor del documento no está en Contactos, queda a un clic de crearlo (con lo que se leyó).
      const leido = r.proveedorLeido as { razonSocial: string | null; rut: string | null; correo: string | null; telefono: string | null; direccion: string | null } | null;
      setProveedorSinContacto(!r.proveedorId && leido && (leido.razonSocial || leido.rut) ? { razonSocial: leido.razonSocial ?? undefined, rut: leido.rut ?? undefined, correo: leido.correo ?? undefined, telefono: leido.telefono ?? undefined, direccion: leido.direccion ?? undefined } : null);
      setAtencion(d.atencion ?? "");
      setProveedorCorreo(r.correoProveedor ?? "");
      setMoneda(d.moneda);
      const valor = d.moneda === "UF" ? indicadores.uf : d.moneda === "USD" ? indicadores.dolar : null;
      setTipoCambio(d.moneda === "CLP" || !valor ? "" : texto(valor));
      setLineas(d.lineas.length > 0 ? d.lineas.map(aForm) : [{ ...LINEA_NUEVA }]);
      setNotasAbiertas([]);
      if (d.plazoEntrega) setEntregaPlazo(d.plazoEntrega);
      if (d.lugarEntrega) setEntregaLugar(d.lugarEntrega);
      if (d.formaPago) setFormaPago(d.formaPago);
      if (d.condicionPagoDias !== null) setCondicionPagoDias(String(d.condicionPagoDias));
      if (d.observaciones) setObservaciones(d.observaciones);
      setAvisosIa(d.avisos);
      avisar(d.avisos.length > 0 ? "Listo. Revisa los avisos antes de guardar." : "Listo: revisa los datos y guarda.", d.avisos.length > 0 ? "info" : "ok");
    } finally {
      setLeyendo(false);
      if (entradaArchivo.current) entradaArchivo.current.value = "";
    }
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
      // La cotización del proveedor que se leyó queda de respaldo de la solicitud.
      if (archivo && r.id) {
        const fd = new FormData();
        fd.set("archivo", archivo);
        fd.set("entidadTipo", "compra");
        fd.set("entidadId", r.id);
        fd.set("tipo", "cotizacion_proveedor");
        const sub = await fetch("/api/gestion-financiera/adjunto", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "No se pudo adjuntar." }));
        if (sub.error) avisar(`La solicitud quedó guardada, pero no se pudo adjuntar la cotización: ${sub.error}`);
      }
      avisar(enviar ? "Enviada a aprobación." : "Borrador guardado.", "ok");
      router.push(`/finanzas/compras/${r.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 pb-24 lg:pb-20">
      {inicial.devueltaMotivo && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-sm text-alerta">
          <strong>La devolvieron:</strong> {inicial.devueltaMotivo}
        </p>
      )}

      {/* Alternativa: en vez de escribir todo, subir la cotización del proveedor. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-naranjo/50 bg-naranjo/[0.04] px-3 py-2.5">
        <IconSparkles size={18} className="shrink-0 text-naranjo" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-semibold text-tinta">¿Tienes la cotización del proveedor?</p>
          <p className="text-xs text-gris">{archivo ? <><IconFileTypePdf size={12} className="mr-1 inline" />{archivo.name} · se adjuntará a la solicitud</> : "Súbela (PDF o foto) y la IA llena el formulario. Tú revisas antes de guardar."}</p>
        </div>
        <input ref={entradaArchivo} type="file" accept={TIPOS_ARCHIVO} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerConIa(f); }} />
        <button type="button" disabled={leyendo || pendiente} onClick={() => entradaArchivo.current?.click()} className={`${BOTON_SEC} shrink-0`}>
          {leyendo ? <IconLoader2 size={15} className="animate-spin" /> : <IconSparkles size={15} />} {leyendo ? "Leyendo…" : archivo ? "Leer otra" : "Subir y leer con IA"}
        </button>
      </div>
      {avisosIa.length > 0 && (
        <div role="status" className="relative rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 pr-9 text-xs text-aviso">
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><IconAlertTriangle size={14} /> Revisa esto antes de guardar</p>
          <ul className="list-disc space-y-0.5 pl-4 text-tinta/80">{avisosIa.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <button type="button" onClick={() => setAvisosIa([])} className="absolute right-2 top-2 rounded p-1 text-gris hover:text-tinta" aria-label="Cerrar los avisos"><IconX size={14} /></button>
        </div>
      )}

      <Seccion n={1} titulo="¿Quién, qué y a quién?" ayuda="Quién pide la compra, para qué proyecto y a qué proveedor.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <Et t="Título o descripción breve *" className="sm:col-span-2 lg:col-span-6"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Repuestos para chancador planta Norte" maxLength={300} className={CAMPO_C} autoFocus={!inicial.id} /></Et>
          <Et t="Quién solicita" className="lg:col-span-3">
            <select value={solicitanteTipo} onChange={(e) => setSolicitanteTipo(e.target.value as SolicitanteTipo)} className={CAMPO_C}>
              <option value="yo">Yo ({yo.nombre})</option>
              <option value="usuario">Otra persona del Core</option>
              <option value="otro">Alguien externo</option>
            </select>
          </Et>
          <Et t={solicitanteTipo === "otro" ? "Nombre de quien solicita" : "Persona"} className="lg:col-span-3">
            {solicitanteTipo === "usuario" ? (
              <select value={solicitanteUsuarioId} onChange={(e) => setSolicitanteUsuarioId(e.target.value)} className={CAMPO_C}>
                <option value="">Elige…</option>
                {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            ) : solicitanteTipo === "otro" ? (
              <input value={solicitanteOtro} onChange={(e) => setSolicitanteOtro(e.target.value)} placeholder="Nombre y apellido" maxLength={120} className={CAMPO_C} />
            ) : (
              <input value={yo.nombre} readOnly tabIndex={-1} className={`${CAMPO_C} cursor-default opacity-70`} aria-label="Solicita: tú" />
            )}
          </Et>

          <Et t="Proyecto (a quién se carga el gasto)" className="sm:col-span-2 lg:col-span-5">
            <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={CAMPO_C}>
              <option value="">General</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Et>
          <div className="min-w-0 sm:col-span-2 lg:col-span-7">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-tinta/70">Proveedor *</span>
              {puedeCrearProveedor && <button type="button" onClick={() => setCreando(proveedorSinContacto ?? { esProveedor: true, esCliente: false })} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-naranjo hover:bg-naranjo/10"><IconUserPlus size={13} /> Nuevo proveedor</button>}
            </div>
            <ComboContacto key={claveProveedor} name="_proveedor" opciones={[...proveedores, ...creados]} inicial={proveedorId} alCambiar={setProveedorId} />
            {proveedorSinContacto && !proveedorId && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-2.5 py-1.5 text-xs text-tinta/80">
                <IconAlertTriangle size={14} className="shrink-0 text-aviso" />
                <span className="min-w-0 flex-1">«{proveedorSinContacto.razonSocial ?? proveedorSinContacto.rut}» no está en Contactos.</span>
                {puedeCrearProveedor ? <button type="button" onClick={() => setCreando(proveedorSinContacto)} className={`${BOTON} !px-2.5 !py-1 !text-xs`}><IconUserPlus size={13} /> Crear proveedor</button> : <span className="text-gris">Pídele a quien administra Contactos que lo cree.</span>}
              </p>
            )}
          </div>

          <Et t="Atención del proveedor" className="lg:col-span-4"><input value={atencion} onChange={(e) => setAtencion(e.target.value)} placeholder="Nombre de su contacto" maxLength={120} className={CAMPO_C} /></Et>
          <Et t="Correo para enviarle la OC" className="lg:col-span-5"><input value={proveedorCorreo} onChange={(e) => setProveedorCorreo(e.target.value)} type="email" inputMode="email" placeholder="ventas@proveedor.cl" maxLength={160} className={CAMPO_C} /></Et>
          <Et t="Se necesita para" className="lg:col-span-3"><input type="date" value={fechaRequerida} onChange={(e) => setFechaRequerida(e.target.value)} className={CAMPO_C} /></Et>
        </div>
      </Seccion>

      <Seccion
        n={2}
        titulo="¿Qué se compra?"
        ayuda="Una fila por producto o servicio. Los precios son netos."
        derecha={
          <div className="flex items-center gap-1.5">
            <select value={moneda} onChange={(e) => cambiarMoneda(e.target.value as Moneda)} className={`${CAMPO_C} w-auto text-xs`} aria-label="Moneda">
              {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {moneda !== "CLP" && (
              <>
                <input value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} inputMode="decimal" placeholder={`$ por ${moneda}`} aria-label={`Valor de ${moneda} en pesos`} title={sugerido ? `Hoy: ${formatoMonto(sugerido, "CLP")}` : "Escribe el valor en pesos"} className={`${CAMPO_C} w-28 text-right text-xs`} />
                {sugerido && <button type="button" onClick={() => setTipoCambio(texto(sugerido))} className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-naranjo hover:bg-naranjo/10" title={`Usar el valor de hoy: ${formatoMonto(sugerido, "CLP")}`}>Hoy</button>}
              </>
            )}
          </div>
        }
      >
        {/* Encabezado de columnas: solo en pantalla ancha; en el celular cada campo lleva su rótulo. */}
        <div className={`mb-1 hidden gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-gris lg:grid ${COLUMNAS}`}>
          <span /><span>Descripción</span><span className="text-right">Cant.</span><span>Unidad</span><span className="text-right">Precio unit.</span><span className="text-right">Desc. %</span><span className="text-center">Exento</span><span className="text-right">Total</span><span />
        </div>
        <ul className="space-y-1.5">
          {lineas.map((l, i) => (
            <li key={i} className={`grid grid-cols-2 items-end gap-1.5 rounded-xl border border-borde bg-tinta/[0.015] p-2 lg:items-center ${COLUMNAS}`}>
              <span className="hidden text-center text-[11px] font-bold text-gris-suave lg:block">{i + 1}</span>
              <div className="col-span-2 flex items-start gap-1.5 lg:col-span-1">
                <span className="mt-2 w-4 shrink-0 text-center text-[11px] font-bold text-gris-suave lg:hidden">{i + 1}</span>
                <textarea aria-label={`Descripción del ítem ${i + 1}`} value={l.descripcion} rows={1} maxLength={500} onChange={(e) => cambiarLinea(i, { descripcion: e.target.value })} className={`${CAMPO_C} min-h-9 resize-y`} placeholder="Descripción del producto o servicio" />
                <button type="button" onClick={() => alternarNota(i)} aria-pressed={notasAbiertas.includes(i) || Boolean(l.nota.trim())} title={l.nota.trim() ? "Editar el detalle de este ítem" : "Agregar un detalle (marca, código, especificación)"}
                  className={`rounded-lg p-1.5 transition ${l.nota.trim() ? "bg-naranjo/10 text-naranjo" : notasAbiertas.includes(i) ? "bg-tinta/[0.07] text-tinta" : "text-gris hover:bg-tinta/[0.06] hover:text-tinta"}`} aria-label={`Detalle del ítem ${i + 1}`}><IconNotes size={16} /></button>
                <button type="button" onClick={() => quitarLinea(i)} className="rounded-lg p-1.5 text-gris hover:bg-rose-500/10 hover:text-alerta lg:hidden" aria-label={`Quitar el ítem ${i + 1}`}><IconTrash size={16} /></button>
              </div>
              <label className="block"><span className={LBL}>Cantidad</span><input aria-label="Cantidad" value={l.cantidad} onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })} inputMode="decimal" className={`${CAMPO_C} text-right`} onFocus={(e) => e.currentTarget.select()} /></label>
              <label className="block"><span className={LBL}>Unidad</span><input aria-label="Unidad" value={l.unidad} onChange={(e) => cambiarLinea(i, { unidad: e.target.value })} maxLength={20} className={CAMPO_C} /></label>
              <label className="block"><span className={LBL}>Precio unitario (neto)</span><input aria-label="Precio unitario" value={l.precio} onChange={(e) => cambiarLinea(i, { precio: e.target.value })} inputMode="decimal" placeholder="0" className={`${CAMPO_C} text-right`} onFocus={(e) => e.currentTarget.select()} /></label>
              <label className="block"><span className={LBL}>Descuento %</span><input aria-label="Descuento de la línea" value={l.dto} onChange={(e) => cambiarLinea(i, { dto: e.target.value })} inputMode="decimal" placeholder="0" className={`${CAMPO_C} text-right`} /></label>
              <label className="flex items-center gap-1.5 text-xs text-gris lg:justify-center"><input type="checkbox" checked={l.exento} onChange={(e) => cambiarLinea(i, { exento: e.target.checked })} aria-label="Exento de IVA" /> <span className="lg:hidden">Exento de IVA</span></label>
              <span className="col-span-2 text-right font-condensed text-base font-bold tabular-nums text-tinta lg:col-span-1">{formatoMonto(netoLineaOc(items[i], moneda), moneda)}</span>
              <button type="button" onClick={() => quitarLinea(i)} className="hidden rounded-lg p-1 text-gris hover:bg-rose-500/10 hover:text-alerta lg:block" aria-label={`Quitar el ítem ${i + 1}`}><IconTrash size={15} /></button>
              {(notasAbiertas.includes(i) || Boolean(l.nota.trim())) && (
                <div className="col-span-2 lg:col-span-full lg:pl-[1.75rem]">
                  <textarea aria-label={`Detalle del ítem ${i + 1}`} value={l.nota} rows={2} maxLength={1000} onChange={(e) => cambiarLinea(i, { nota: e.target.value })} className={`${CAMPO_C} resize-y text-[13px]`} placeholder="Detalle opcional: marca, código, especificación. Sale bajo el ítem en la OC." />
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3">
          <button type="button" onClick={() => setLineas((ls) => [...ls, { ...LINEA_NUEVA }])} className={BOTON_SEC}><IconPlus size={14} /> Agregar ítem</button>
          <dl className="grid min-w-[15rem] grid-cols-[1fr_auto] gap-x-6 gap-y-0 rounded-xl bg-tinta/[0.03] px-3 py-2 text-sm">
            <dt className="text-gris">{t.exento > 0 ? "Neto afecto" : "Neto"}</dt><dd className="text-right tabular-nums">{formatoMonto(t.neto, moneda)}</dd>
            {t.exento > 0 && <><dt className="text-gris">Exento</dt><dd className="text-right tabular-nums">{formatoMonto(t.exento, moneda)}</dd></>}
            <dt className="text-gris">IVA {Math.round(tasaIva * 100)}%</dt><dd className="text-right tabular-nums">{formatoMonto(t.iva, moneda)}</dd>
            <dt className="font-bold text-tinta">Total</dt><dd className="text-right font-condensed text-lg font-bold tabular-nums text-tinta">{formatoMonto(t.total, moneda)}</dd>
            {moneda !== "CLP" && <><dt className="text-xs text-gris">En pesos</dt><dd className="text-right text-xs tabular-nums text-gris">{formatoMonto(aPesos(t.total, moneda, tc), "CLP")}</dd></>}
          </dl>
        </div>
      </Seccion>

      <Seccion n={3} titulo="Entrega, pago y condiciones" ayuda="Salen en el PDF. Lo que dejes vacío no aparece.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <Et t="Lugar de entrega" className="sm:col-span-2 lg:col-span-6"><input value={entregaLugar} onChange={(e) => setEntregaLugar(e.target.value)} placeholder="Faena Planta Norte, Calama" maxLength={300} className={CAMPO_C} /></Et>
          <Et t="Plazo de entrega" className="lg:col-span-3"><input value={entregaPlazo} onChange={(e) => setEntregaPlazo(e.target.value)} placeholder="5 días hábiles" maxLength={120} className={CAMPO_C} /></Et>
          <Et t="Días de pago" className="lg:col-span-3"><input value={condicionPagoDias} onChange={(e) => setCondicionPagoDias(e.target.value)} inputMode="numeric" placeholder="30 (0 = contado)" className={`${CAMPO_C} text-right`} /></Et>
          <Et t="Forma de pago" className="sm:col-span-2 lg:col-span-4"><input value={formaPago} onChange={(e) => setFormaPago(e.target.value)} placeholder="Transferencia" maxLength={200} className={CAMPO_C} /></Et>
          <Et t="Observaciones para el proveedor" className="sm:col-span-2 lg:col-span-8"><textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={1} maxLength={2000} className={`${CAMPO_C} resize-y`} placeholder="Despachar con guía y certificado…" /></Et>
          <details className="sm:col-span-2 lg:col-span-12">
            <summary className="cursor-pointer text-xs font-semibold text-gris hover:text-tinta">Condiciones generales de la OC (vienen de la empresa; ajústalas solo para esta OC)</summary>
            <textarea value={condiciones} onChange={(e) => setCondiciones(e.target.value)} rows={4} maxLength={3000} className={`${CAMPO_C} mt-1.5 resize-y`} aria-label="Condiciones generales" />
          </details>
        </div>
      </Seccion>

      {/* Crear el proveedor sin salir de la solicitud: el formulario de Contactos, en un popup y ya con lo que leyó la IA. */}
      {creando && (
        <FormularioContacto
          abiertaExterna
          precarga={{ esProveedor: true, esCliente: false, ...creando }}
          alCerrar={() => setCreando(null)}
          alCrear={proveedorCreado}
        />
      )}

      {/* En el celular la barra queda sobre el menú de abajo (h-16); en escritorio, al pie de la pantalla. */}
      <div className="sticky bottom-[4.5rem] z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie/95 px-4 py-2.5 shadow-[0_12px_32px_-12px_rgba(23,20,17,0.35)] backdrop-blur lg:bottom-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gris">Total con IVA</p>
          <p className="font-condensed text-2xl font-bold leading-tight tabular-nums text-tinta">{formatoMonto(t.total, moneda)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {inicial.id && <a href={`/api/finanzas/compras/${inicial.id}/oc-pdf`} target="_blank" rel="noopener" className={BOTON_SEC}><IconFileTypePdf size={14} /> Vista previa</a>}
          <button type="button" disabled={pendiente || leyendo} onClick={() => guardar(false)} className={BOTON_SEC}>{pendiente && <IconLoader2 size={14} className="animate-spin" />} Guardar borrador</button>
          <button type="button" disabled={pendiente || leyendo} onClick={() => guardar(true)} className={BOTON}><IconSend size={14} /> Enviar a aprobación</button>
        </div>
      </div>
    </div>
  );
}
