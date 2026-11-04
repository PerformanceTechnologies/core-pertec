"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { CAMPO } from "@/lib/estilos";

// Piezas interactivas de Gestión financiera: formularios que llaman a una Server Action, botones
// que piden confirmación o motivo, ventanas y el buscador de contactos.

type Res = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string };

export const BOTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-naranjo px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave disabled:opacity-50";
export const BOTON_SEC =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-50";

/** Formulario que envía a una acción y, si sale bien, refresca (y avisa con alOk). */
export function FormAccion({
  accion,
  children,
  textoBoton = "Guardar",
  alOk,
  className = "space-y-4",
  confirmar,
}: {
  accion: (fd: FormData) => Promise<Res>;
  children: React.ReactNode;
  textoBoton?: string;
  alOk?: (r: Res & { ok: true }) => void;
  className?: string;
  confirmar?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmar && !confirm(confirmar)) return;
        const fd = new FormData(e.currentTarget);
        setError(null);
        iniciar(async () => {
          const r = await accion(fd);
          if (!r.ok) return setError(r.error);
          router.refresh();
          alOk?.(r);
        });
      }}
    >
      {children}
      {error && <p className="rounded-lg border-l-[3px] border-rose-500 bg-rose-500/[0.07] px-3 py-2 text-xs text-alerta dark:text-rose-300">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pendiente} className={BOTON}>
          {pendiente && <IconLoader2 size={14} className="animate-spin" />} {textoBoton}
        </button>
      </div>
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
}: {
  accion: (motivo: string) => Promise<Res>;
  children: React.ReactNode;
  confirmar?: string;
  motivo?: string;
  className?: string;
  titulo?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      title={titulo}
      disabled={pendiente}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        let m = "";
        if (motivo) {
          const r = prompt(motivo);
          if (r === null) return;
          m = r.trim();
          if (!m) return alert("Hay que escribir el motivo.");
        } else if (confirmar && !confirm(confirmar)) return;
        iniciar(async () => {
          const r = await accion(m);
          if (!r.ok) alert(r.error);
          else {
            if (r.mensaje) alert(r.mensaje);
            router.refresh();
          }
        });
      }}
    >
      {pendiente ? <IconLoader2 size={14} className="animate-spin" /> : null}
      {children}
    </button>
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
  children: (cerrar: () => void) => React.ReactNode;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={(e) => (e.stopPropagation(), setAbierta(true))}>
        {boton}
      </button>
      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo={titulo} descripcion={descripcion} ancho={ancho}>
        {abierta && children(() => setAbierta(false))}
      </VentanaModal>
    </>
  );
}

export function Campo({ etiqueta, ayuda, children, className = "" }: { etiqueta: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-gris">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-gris-suave">{ayuda}</span>}
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
  return (
    <div className="relative">
      <input type="hidden" name={name} value={id ?? ""} />
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
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={CAMPO}
      />
      {abierto && lista.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-borde bg-superficie p-1 shadow-xl">
          {lista.map((o) => (
            <li key={o.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-naranjo/[0.07] ${o.id === id ? "bg-naranjo/[0.07]" : ""}`}>
                <span className="truncate text-tinta">{o.nombre}</span>
                {o.rut && <span className="shrink-0 font-mono text-[11px] text-gris">{o.rut}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierto && lista.length === 0 && q.trim() && (
        <p className="absolute z-40 mt-1 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-xs text-gris shadow-xl">
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
          if (r.error) alert(r.error);
          else router.refresh();
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
        alert(r.error);
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
