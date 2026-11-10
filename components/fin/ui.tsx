"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";

/** Cierra la ventana (ConVentana) que contiene al formulario: así una página de servidor no tiene que pasar funciones. */
const CerrarVentana = createContext<(() => void) | null>(null);
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle, IconArrowsExchange, IconBuildingBank, IconCash, IconCheck, IconChecklist, IconCreditCard, IconFileInvoice, IconFilePlus,
  IconFolder, IconForms, IconLoader2, IconPackage, IconPencil, IconPlus, IconReceipt2, IconSearch, IconTargetArrow, IconUserDollar, IconWand, type Icon,
} from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { IconoTile, type TonoIcono } from "@/components/contactos/Visual";
import { BOTON, BOTON_SEC, CAMPO } from "./estilos";
import { avisar, BOTON_VENTANA, BOTON_VENTANA_SUAVE, confirmar as confirmarDialogo, pedirTexto } from "./dialogos";

// Piezas interactivas de Gestión financiera: formularios que llaman a una Server Action, botones
// que piden confirmación o motivo, ventanas y el buscador de contactos.

type Res = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string };

export { BOTON, BOTON_SEC };

/** Formulario que envía a una acción y, si sale bien, refresca (y avisa con alOk). */
export function FormAccion({
  accion,
  children,
  textoBoton = "Guardar",
  alOk,
  className = "space-y-4",
  confirmar,
  limpiar = false,
}: {
  accion: (fd: FormData) => Promise<Res>;
  children: React.ReactNode;
  textoBoton?: string;
  alOk?: (r: Res & { ok: true }) => void;
  className?: string;
  confirmar?: string;
  /** Vacía el formulario al guardar bien (para los que se usan varias veces seguidas). */
  limpiar?: boolean;
}) {
  const router = useRouter();
  const cerrarVentana = useContext(CerrarVentana);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const formulario = e.currentTarget;
        const fd = new FormData(formulario);
        setError(null);
        if (confirmar && !(await confirmarDialogo({ titulo: confirmar }))) return;
        iniciar(async () => {
          const r = await accion(fd);
          if (!r.ok) return setError(r.error);
          router.refresh();
          if (limpiar) formulario.reset();
          if (alOk) alOk(r);
          else cerrarVentana?.();
        });
      }}
    >
      {children}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium leading-snug text-alerta">
          <IconAlertTriangle size={16} className="mt-px shrink-0" /> {error}
        </p>
      )}
      {cerrarVentana ? (
        // Dentro de una ventana: el pie queda pegado abajo, con «Cancelar» y la acción a la derecha.
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-[28px] border-t border-borde/60 bg-superficie/95 px-5 py-3.5 backdrop-blur sm:flex-row sm:justify-end">
          <button type="button" onClick={cerrarVentana} className={BOTON_VENTANA_SUAVE}>Cancelar</button>
          <button type="submit" disabled={pendiente} className={BOTON_VENTANA}>
            {pendiente ? <IconLoader2 size={16} className="animate-spin" /> : <IconCheck size={16} stroke={2.2} />} {pendiente ? "Guardando…" : textoBoton}
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button type="submit" disabled={pendiente} className={BOTON}>
            {pendiente && <IconLoader2 size={14} className="animate-spin" />} {textoBoton}
          </button>
        </div>
      )}
    </form>
  );
}

/** Un botón que ejecuta una acción. Con `motivo`, pide escribirlo antes (anular, rechazar…). */
export function BotonAccion({
  accion,
  children,
  confirmar,
  motivo,
  className = BOTON_SEC,
  titulo,
  irA,
  volverA,
}: {
  accion: (motivo: string) => Promise<Res>;
  children: React.ReactNode;
  confirmar?: string;
  motivo?: string;
  className?: string;
  titulo?: string;
  /** Si la acción devuelve un id, abre `${irA}${id}` (p. ej. la versión nueva de una cotización). */
  irA?: string;
  /** Al terminar bien, abre esta dirección (p. ej. la lista, tras eliminar el registro que se estaba viendo). */
  volverA?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      title={titulo}
      disabled={pendiente}
      className={className}
      onClick={async (e) => {
        e.stopPropagation();
        let m = "";
        if (motivo) {
          const r = await pedirTexto({ titulo: motivo, ayuda: "Queda en el historial, para que se entienda después.", placeholder: "El motivo…", boton: "Confirmar" });
          if (r === null) return;
          m = r.trim();
          if (!m) return;
        } else if (confirmar && !(await confirmarDialogo({ titulo: confirmar }))) return;
        iniciar(async () => {
          const r = await accion(m);
          if (!r.ok) avisar(r.error);
          else {
            if (r.mensaje) avisar(r.mensaje, "info");
            if (volverA) router.push(volverA);
            else if (irA && r.id) router.push(`${irA}${r.id}`);
            else router.refresh();
          }
        });
      }}
    >
      {pendiente ? <IconLoader2 size={14} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/** Lo que muestra una ventana cuando todavía no hay con qué trabajar (p. ej. cobrar sin facturas). */
export function VacioVentana({ titulo, texto, enlace }: { titulo: string; texto: string; enlace?: { href: string; texto: string } }) {
  const cerrarVentana = useContext(CerrarVentana);
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-tinta/[0.035] px-6 py-7 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-superficie text-gris shadow-sm"><IconForms size={20} stroke={1.6} /></span>
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      <p className="max-w-sm text-[13px] leading-snug text-gris">{texto}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {cerrarVentana && <button type="button" onClick={cerrarVentana} className={BOTON_VENTANA_SUAVE}>Entendido</button>}
        {enlace && <a href={enlace.href} className={BOTON_VENTANA}>{enlace.texto}</a>}
      </div>
    </div>
  );
}

/** Botón que abre una ventana con contenido (normalmente un FormAccion). */
export function ConVentana({
  boton,
  titulo,
  descripcion,
  ancho = "max-w-2xl",
  children,
  className = BOTON,
}: {
  boton: React.ReactNode;
  titulo: string;
  descripcion?: string;
  ancho?: string;
  /** Contenido de la ventana. Un FormAccion adentro la cierra solo al guardar bien. */
  children: React.ReactNode | ((cerrar: () => void) => React.ReactNode);
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);
  const { Icono, tono } = iconoDe(titulo);
  return (
    <>
      <button type="button" className={className} onClick={(e) => (e.stopPropagation(), setAbierta(true))}>
        {boton}
      </button>
      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo={titulo} descripcion={descripcion} ancho={ancho} variante="hoja" icono={<IconoTile Icono={Icono} tono={tono} />}>
        {abierta && <CerrarVentana.Provider value={cerrar}>{typeof children === "function" ? children(cerrar) : children}</CerrarVentana.Provider>}
      </VentanaModal>
    </>
  );
}

/**
 * El ícono de la ventana, según lo que hace (sale del título: así las 60 ventanas del módulo lo
 * tienen sin tocar cada página). El orden importa: lo más específico primero.
 */
const ICONOS_VENTANA: [RegExp, Icon, TonoIcono][] = [
  [/^editar|^saldo de|perfil/i, IconPencil, "azul"],
  [/cobro/i, IconCash, "verde"],
  [/pag(o|ar)/i, IconCreditCard, "verde"],
  [/factoring/i, IconArrowsExchange, "azul"],
  [/factura|nota o gu[ií]a/i, IconFileInvoice, "ambar"],
  [/recepci[oó]n/i, IconPackage, "ambar"],
  [/cotizaci[oó]n|aceptar/i, IconChecklist, "verde"],
  [/oportunidad|^cot-|^op-/i, IconTargetArrow, "marca"],
  [/hito/i, IconReceipt2, "marca"],
  [/proyecto/i, IconFolder, "marca"],
  [/movimiento|cuenta/i, IconBuildingBank, "azul"],
  [/regla/i, IconWand, "azul"],
  [/cliente|contacto/i, IconUserDollar, "verde"],
  [/compra|solicitud/i, IconFilePlus, "marca"],
  [/^nuev[oa]/i, IconPlus, "marca"],
  [/buscar/i, IconSearch, "azul"],
];
function iconoDe(titulo: string): { Icono: Icon; tono: TonoIcono } {
  const f = ICONOS_VENTANA.find(([re]) => re.test(titulo));
  return f ? { Icono: f[1], tono: f[2] } : { Icono: IconForms, tono: "marca" };
}

/** Un campo con su etiqueta. Un « *» al final de la etiqueta marca que es obligatorio. */
export function Campo({ etiqueta, ayuda, children, className = "" }: { etiqueta: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  const obligatorio = /\s\*$/.test(etiqueta);
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-[12px] font-semibold text-tinta/75">
        {obligatorio ? etiqueta.replace(/\s\*$/, "") : etiqueta}
        {obligatorio && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] leading-snug text-gris-suave">{ayuda}</span>}
    </label>
  );
}

export { CAMPO };

export interface OpcionContacto {
  id: string;
  nombre: string;
  rut: string | null;
}

/**
 * Elegir un contacto escribiendo (razón social o RUT). Guarda el id en un campo oculto `name`.
 * Los contactos se crean en Contactos: acá solo se eligen.
 */
export function ComboContacto({ name, opciones, inicial, placeholder = "Buscar por nombre o RUT…", requerido = false, alCambiar }: {
  name: string;
  opciones: OpcionContacto[];
  inicial?: string | null;
  placeholder?: string;
  requerido?: boolean;
  alCambiar?: (id: string | null) => void;
}) {
  const [id, setId] = useState<string | null>(inicial ?? null);
  const [q, setQ] = useState(() => opciones.find((o) => o.id === inicial)?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLInputElement>(null);
  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = useMemo(() => {
    const t = plano(q.trim());
    if (!t || opciones.find((o) => o.id === id)?.nombre === q) return opciones.slice(0, 8);
    return opciones.filter((o) => plano(`${o.nombre} ${o.rut ?? ""}`).includes(t)).slice(0, 8);
  }, [q, opciones, id]);
  const elegir = (o: OpcionContacto | null) => {
    setId(o?.id ?? null);
    setQ(o?.nombre ?? "");
    setAbierto(false);
    alCambiar?.(o?.id ?? null);
  };
  // Texto escrito sin elegir de la lista: no se guarda en silencio sin contacto.
  useEffect(() => {
    caja.current?.setCustomValidity(q.trim() && !id ? "Elige el contacto de la lista (o borra el texto)." : "");
  }, [q, id]);
  return (
    <div className="relative">
      <input type="hidden" name={name} value={id ?? ""} />
      <IconSearch size={16} stroke={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
      <input
        ref={caja}
        value={q}
        required={requerido && !id}
        onChange={(e) => {
          setQ(e.target.value);
          setId(null);
          setAbierto(true);
          alCambiar?.(null);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => {
          // Si lo escrito calza con uno solo, se elige solo.
          if (!id && q.trim() && lista.length === 1) elegir(lista[0]);
          setTimeout(() => setAbierto(false), 150);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={`${CAMPO} pl-9`}
      />
      {abierto && lista.length > 0 && (
        <ul className="absolute z-40 mt-1.5 max-h-64 w-full overflow-auto rounded-2xl border border-borde/60 bg-superficie p-1.5 shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)]">
          {lista.map((o) => (
            <li key={o.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-naranjo/[0.08] ${o.id === id ? "bg-naranjo/[0.08]" : ""}`}>
                <span className="truncate text-tinta">{o.nombre}</span>
                {o.rut && <span className="shrink-0 font-mono text-[11px] text-gris">{o.rut}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierto && lista.length === 0 && q.trim() && (
        <p className="absolute z-40 mt-1.5 w-full rounded-2xl border border-borde/60 bg-superficie px-3.5 py-2.5 text-xs text-gris shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)]">
          No está. Créalo primero en <a href="/finanzas/contactos" target="_blank" className="font-semibold text-naranjo">Contactos</a>.
        </p>
      )}
    </div>
  );
}

/** Subir un respaldo a un registro (cotización, OC cliente, EDP, factura, comprobante…). */
export function SubirAdjunto({ entidadTipo, entidadId, tipo = "otro", texto = "Adjuntar" }: { entidadTipo: string; entidadId: string; tipo?: string; texto?: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.csv,.xlsx"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setSubiendo(true);
          const fd = new FormData();
          fd.set("archivo", f);
          fd.set("entidadTipo", entidadTipo);
          fd.set("entidadId", entidadId);
          fd.set("tipo", tipo);
          const r = await fetch("/api/gestion-financiera/adjunto", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "No se pudo subir." }));
          setSubiendo(false);
          if (entrada.current) entrada.current.value = "";
          if (r.error) avisar(r.error);
          else {
            avisar("Respaldo adjuntado.", "ok");
            router.refresh();
          }
        }}
      />
      <button type="button" className={BOTON_SEC} disabled={subiendo} onClick={(e) => (e.stopPropagation(), entrada.current?.click())}>
        {subiendo && <IconLoader2 size={14} className="animate-spin" />} {texto}
      </button>
    </>
  );
}

/** Edición en línea de un campo: se guarda al salir del campo (o con Enter). */
export function CampoEnLinea({ valor, tipo = "text", opciones, guardar, placeholder, ancho = "w-28" }: {
  valor: string | null;
  tipo?: "text" | "date" | "select";
  opciones?: { valor: string; texto: string }[];
  guardar: (v: string) => Promise<Res>;
  placeholder?: string;
  ancho?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(valor ?? "");
  const [pendiente, iniciar] = useTransition();
  const enviar = (nuevo: string) => {
    if (nuevo === (valor ?? "")) return;
    iniciar(async () => {
      const r = await guardar(nuevo);
      if (!r.ok) {
        avisar(r.error);
        setV(valor ?? "");
      } else router.refresh();
    });
  };
  const clase = `${ancho} rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-tinta outline-none transition hover:border-borde focus:border-naranjo/60 focus:bg-superficie ${pendiente ? "opacity-50" : ""}`;
  if (tipo === "select")
    return (
      <select value={v} disabled={pendiente} onClick={(e) => e.stopPropagation()} onChange={(e) => (setV(e.target.value), enviar(e.target.value))} className={clase}>
        <option value="">—</option>
        {opciones?.map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
    );
  return (
    <input
      type={tipo}
      value={v}
      placeholder={placeholder ?? "—"}
      disabled={pendiente}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => enviar(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className={clase}
    />
  );
}
