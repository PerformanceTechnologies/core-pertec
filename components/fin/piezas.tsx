import Link from "next/link";
import { IconChevronRight, IconInbox } from "@tabler/icons-react";
import { TARJETA } from "@/lib/estilos";
import { clp, clpCorto, type EtapaHito, type PasoCompra, type EstadoFactoring } from "@/lib/fin/reglas";

// Piezas visuales de Gestión financiera (sin estado: sirven en servidor y en cliente). Colores
// semánticos fijos: los mismos en chips, tarjetas y gráficos.

export const TONO_ETAPA: Record<EtapaHito, string> = {
  "Cotización enviada": "bg-slate-500/10 text-tinta dark:text-slate-300",
  "Por iniciar": "bg-slate-500/10 text-tinta dark:text-slate-300",
  "En ejecución": "bg-sky-500/10 text-info dark:text-sky-300",
  "Esperando aprobación EDP": "bg-amber-500/12 text-aviso dark:text-amber-300",
  "Esperando OC": "bg-amber-500/12 text-aviso dark:text-amber-300",
  "Esperando HES": "bg-amber-500/12 text-aviso dark:text-amber-300",
  "Lista para facturar": "bg-naranjo/15 text-naranjo font-bold",
  "Por cobrar": "bg-sky-500/10 text-info dark:text-sky-300",
  Vencida: "bg-rose-500/12 text-alerta dark:text-rose-300",
  Cobrada: "bg-emerald-500/12 text-ok dark:text-emerald-300",
};

export const COLOR_ETAPA: Record<EtapaHito, string> = {
  "Cotización enviada": "#94a3b8", "Por iniciar": "#64748b", "En ejecución": "#0284c7", "Esperando aprobación EDP": "#d97706", "Esperando OC": "#f59e0b",
  "Esperando HES": "#fbbf24", "Lista para facturar": "#c85217", "Por cobrar": "#0ea5e9", Vencida: "#e11d48", Cobrada: "#16a34a",
};

export function tonoPaso(p: PasoCompra): string {
  if (p === "Pagada") return "bg-emerald-500/12 text-ok dark:text-emerald-300";
  if (p === "Anulada") return "bg-slate-500/10 text-slate-500";
  if (p.startsWith("Vencida") || p.startsWith("Factura sin OC") || p.startsWith("Revisar")) return "bg-rose-500/12 text-alerta dark:text-rose-300";
  if (p.startsWith("Falta")) return "bg-amber-500/12 text-aviso dark:text-amber-300";
  if (p === "Pago programado") return "bg-sky-500/10 text-info dark:text-sky-300";
  return "bg-naranjo/12 text-naranjo";
}

export function tonoFactoring(e: EstadoFactoring): string {
  if (e === "Liquidada") return "bg-emerald-500/12 text-ok dark:text-emerald-300";
  if (e === "En mora: cobrar al cliente") return "bg-rose-500/12 text-alerta dark:text-rose-300";
  if (e === "Vigente") return "bg-sky-500/10 text-info dark:text-sky-300";
  return "bg-amber-500/12 text-aviso dark:text-amber-300";
}

/**
 * Un botón que existe pero todavía no funciona (facturación electrónica, formatos imprimibles):
 * se ve atenuado y al pasar el mouse explica por qué. El envoltorio recibe el hover (el botón
 * atenuado no), así el aviso sí aparece.
 */
export function Deshabilitado({ motivo, clase, children }: { motivo: string; clase: string; children: React.ReactNode }) {
  return (
    <span title={motivo} aria-disabled="true" tabIndex={0} className="inline-flex cursor-not-allowed">
      <span className={`${clase} pointer-events-none opacity-40`}>{children}</span>
    </span>
  );
}

export function Chip({ texto, tono, titulo }: { texto: string; tono: string; titulo?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tono}`} title={titulo ?? texto}>
      {texto}
    </span>
  );
}

export function Monto({ valor, corto = false, tono = "" }: { valor: number | null | undefined; corto?: boolean; tono?: string }) {
  if (valor === null || valor === undefined) return <span className="text-gris-suave">—</span>;
  return (
    <span className={`tabular-nums ${valor < 0 ? "text-alerta" : tono}`} title={corto ? clp(valor) : undefined}>
      {corto ? clpCorto(valor) : clp(valor)}
    </span>
  );
}

export function Seccion({ titulo, icono, accion, children, id }: { titulo: string; icono?: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/60">
          {icono} {titulo}
        </h2>
        <span className="h-px min-w-8 flex-1 bg-borde" />
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Un paso del proceso de una pantalla: qué es, cuántas cosas hay ahí y dónde verlas. */
export type PasoRecorrido = { titulo: string; ayuda?: string; n?: number; href?: string; alerta?: boolean };

/**
 * El proceso de la pantalla, paso a paso, al pie de la banda oscura: se entiende de un vistazo por
 * dónde pasa cada cosa y en qué paso hay algo pendiente (el número naranjo).
 */
export function Recorrido({ pasos, titulo = "Cómo avanza" }: { pasos: PasoRecorrido[]; titulo?: string }) {
  return (
    <div className="borde-banda mt-6 border-t pt-4">
      <p className="texto-banda-45 mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]">{titulo}</p>
      <ol className="flex flex-wrap items-center gap-y-1">
        {pasos.map((p, i) => {
          const pendiente = p.n !== undefined && p.n > 0;
          const cuerpo = (
            <>
              <span className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold tabular-nums ${p.alerta && pendiente ? "border-naranjo bg-naranjo text-white" : "border-naranjo/50 text-naranjo"}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="texto-banda flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
                  {p.titulo}
                  {pendiente && <span className="rounded-full bg-naranjo px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">{p.n}</span>}
                </span>
                {p.ayuda && <span className="texto-banda-45 block max-w-[13rem] text-[11px] leading-snug">{p.ayuda}</span>}
              </span>
            </>
          );
          return (
            <li key={p.titulo} className="flex items-center">
              {p.href ? (
                <Link href={p.href} scroll={false} className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.07]">{cuerpo}</Link>
              ) : (
                <div className="flex items-start gap-2 px-2 py-1.5">{cuerpo}</div>
              )}
              {i < pasos.length - 1 && <IconChevronRight size={14} className="texto-banda-45 mx-0.5 shrink-0" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** La banda oscura de arriba de cada pantalla: una cifra grande, las de apoyo y (opcional) el proceso paso a paso. */
export function Banda({ etiqueta, valor, bajada, cifras, pasos, children }: { etiqueta: string; valor: string; bajada?: React.ReactNode; cifras?: { etiqueta: string; valor: string; detalle?: string; alerta?: boolean }[]; pasos?: PasoRecorrido[]; children?: React.ReactNode }) {
  return (
    <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
            <span className="h-px w-6 bg-naranjo" /> {etiqueta}
          </span>
          <p className="texto-banda mt-3 font-condensed text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl">{valor}</p>
          {bajada && <p className="texto-banda-65 mt-2 max-w-2xl text-sm">{bajada}</p>}
        </div>
        {cifras && cifras.length > 0 && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cifras.map((c) => (
              <div key={c.etiqueta} className={`min-w-[8.5rem] rounded-xl border px-4 py-3 ${c.alerta ? "border-naranjo/40 bg-naranjo/[0.12]" : "borde-banda bg-white/[0.03]"}`}>
                <dt className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${c.alerta ? "text-naranjo" : "texto-banda-45"}`}>{c.etiqueta}</dt>
                <dd className="texto-banda mt-1 font-condensed text-2xl font-bold tabular-nums">{c.valor}</dd>
                {c.detalle && <dd className="texto-banda-45 truncate text-[11px]">{c.detalle}</dd>}
              </div>
            ))}
          </dl>
        )}
      </div>
      {pasos && pasos.length > 0 && <Recorrido pasos={pasos} />}
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, detalle, href, tono = "text-tinta", ayuda }: { etiqueta: string; valor: string; detalle?: React.ReactNode; href?: string; tono?: string; ayuda?: string }) {
  const cuerpo = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gris" title={ayuda}>{etiqueta}</p>
      <p className={`mt-1 truncate font-condensed text-2xl font-bold tabular-nums ${tono}`}>{valor}</p>
      {detalle && <div className="mt-0.5 truncate text-[11px] text-gris">{detalle}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={`${TARJETA} block min-w-0 px-4 py-3 transition hover:-translate-y-0.5 hover:border-naranjo/40`} title={ayuda}>
      {cuerpo}
    </Link>
  ) : (
    <div className={`${TARJETA} min-w-0 px-4 py-3`} title={ayuda}>{cuerpo}</div>
  );
}

/** Estado vacío: qué va aquí y (en children) el botón del primer paso. */
export function Vacio({ titulo, texto, icono, children }: { titulo: string; texto?: string; icono?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={`${TARJETA} grid place-items-center gap-2 px-6 py-12 text-center`}>
      <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-naranjo/[0.08] text-naranjo">{icono ?? <IconInbox size={24} stroke={1.6} />}</span>
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      {texto && <p className="max-w-md text-xs text-gris">{texto}</p>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Pestañas secundarias por parámetro de URL (?ver=…). */
export function Pestanas({ base, actual, opciones }: { base: string; actual: string; opciones: { clave: string; etiqueta: string; n?: number }[] }) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-borde bg-superficie p-1">
      {opciones.map((o, i) => {
        const on = actual === o.clave;
        return (
          <Link
            key={o.clave}
            href={i === 0 ? base : `${base}?ver=${o.clave}`}
            scroll={false}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}
          >
            {o.etiqueta}
            {o.n !== undefined && <span className="tabular-nums opacity-70">{o.n}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export const TH = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gris";
export const TD = "px-3 py-2.5 align-top";
