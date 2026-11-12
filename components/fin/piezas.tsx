import Link from "next/link";
import { IconBuildingBank, IconCalculator, IconChevronRight, IconFolders, IconInbox, IconLayoutDashboard, IconReceipt, IconShoppingCart, IconTargetArrow, type Icon } from "@tabler/icons-react";
import { IconoTile, type TonoIcono } from "@/components/contactos/Visual";
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
  if (p.startsWith("Vencida") || p.startsWith("Factura sin OC") || p.startsWith("Revisar") || p.startsWith("Devuelta") || p.startsWith("OC rechazada")) return "bg-rose-500/12 text-alerta dark:text-rose-300";
  if (p.startsWith("Borrador")) return "bg-slate-500/10 text-slate-500 dark:text-slate-300";
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
        <h2 className="inline-flex items-center gap-2 text-[15px] font-bold tracking-tight text-tinta">
          {icono && <span className="grid h-7 w-7 place-items-center rounded-lg bg-tinta/[0.05] text-gris">{icono}</span>} {titulo}
        </h2>
        <span className="h-px min-w-8 flex-1 bg-borde/70" />
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Un paso del proceso de una pantalla: qué es, cuántas cosas hay ahí y dónde verlas. */
export type PasoRecorrido = { titulo: string; ayuda?: string; n?: number; href?: string; alerta?: boolean };

/**
 * El proceso de la pantalla, paso a paso, al pie de la banda: se entiende de un vistazo por dónde
 * pasa cada cosa y en qué paso hay algo pendiente (el número naranjo).
 */
export function Recorrido({ pasos, titulo = "Cómo avanza" }: { pasos: PasoRecorrido[]; titulo?: string }) {
  return (
    <div className="mt-6 border-t border-borde/60 pt-4">
      <p className="mb-2 px-2 text-xs font-semibold text-gris">{titulo}</p>
      <ol className="grid grid-cols-2 gap-y-1 sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">
        {pasos.map((p, i) => {
          const pendiente = p.n !== undefined && p.n > 0;
          const cuerpo = (
            <>
              <span className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums transition ${p.alerta && pendiente ? "bg-naranjo text-white shadow-[0_4px_10px_-3px_rgba(200,82,23,0.55)]" : pendiente ? "bg-naranjo/12 text-naranjo" : "bg-tinta/[0.05] text-gris"}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight text-tinta">
                  {p.titulo}
                  {pendiente && <span className="rounded-full bg-naranjo px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">{p.n}</span>}
                </span>
                {p.ayuda && <span className="block text-[11px] leading-snug text-gris">{p.ayuda}</span>}
              </span>
            </>
          );
          return (
            <li key={p.titulo} className="flex min-w-0 items-center">
              {p.href ? (
                <Link href={p.href} scroll={false} className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-tinta/[0.04]">{cuerpo}</Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5">{cuerpo}</div>
              )}
              {i < pasos.length - 1 && <IconChevronRight size={14} className="mx-0.5 hidden shrink-0 text-gris-suave lg:block" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** El ícono y el color de cada pantalla, según la etiqueta de su banda. */
const ICONO_BANDA: [RegExp, Icon, TonoIcono][] = [
  [/venta|cobr/i, IconReceipt, "verde"],
  [/compra|pago/i, IconShoppingCart, "ambar"],
  [/tesorer|caja|banco/i, IconBuildingBank, "azul"],
  [/comercial|oportunidad/i, IconTargetArrow, "marca"],
  [/proyecto/i, IconFolders, "marca"],
  [/contab/i, IconCalculator, "azul"],
];

/** La banda de arriba de cada pantalla: una cifra grande, las de apoyo y (opcional) el proceso paso a paso. */
export function Banda({ etiqueta, valor, bajada, cifras, pasos, children, compacta = false }: { etiqueta: string; valor: string; bajada?: React.ReactNode; cifras?: { etiqueta: string; valor: string; detalle?: string; alerta?: boolean }[]; pasos?: PasoRecorrido[]; children?: React.ReactNode; compacta?: boolean }) {
  const [, Icono, tono] = ICONO_BANDA.find(([re]) => re.test(etiqueta)) ?? [/./, IconLayoutDashboard, "marca" as TonoIcono];
  if (compacta) return <BandaCompacta etiqueta={etiqueta} valor={valor} bajada={bajada} cifras={cifras} pasos={pasos} Icono={Icono} tono={tono}>{children}</BandaCompacta>;
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-borde/60 bg-superficie px-6 py-6 shadow-[0_1px_2px_rgba(23,20,17,0.04),0_14px_36px_-20px_rgba(23,20,17,0.18)] sm:px-7">
      <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-naranjo/[0.07] blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cian/[0.06] blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <IconoTile Icono={Icono} tono={tono} />
            <p className="text-sm font-semibold text-tinta/80">{etiqueta}</p>
          </div>
          <p className="animar-cifra mt-4 font-condensed text-5xl font-bold leading-none tracking-tight tabular-nums text-tinta">{valor}</p>
          {bajada && <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-gris">{bajada}</p>}
        </div>
        {cifras && cifras.length > 0 && (
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {cifras.map((c) => (
              <div key={c.etiqueta} className={`min-w-[8.5rem] rounded-2xl px-4 py-3 transition duration-200 hover:-translate-y-0.5 ${c.alerta ? "bg-naranjo/[0.09] ring-1 ring-naranjo/25" : "bg-tinta/[0.035]"}`}>
                <dt className={`text-xs font-semibold ${c.alerta ? "text-naranjo" : "text-gris"}`}>{c.etiqueta}</dt>
                <dd className="mt-1 font-condensed text-2xl font-bold tabular-nums text-tinta">{c.valor}</dd>
                {c.detalle && <dd className="truncate text-[11px] text-gris">{c.detalle}</dd>}
              </div>
            ))}
          </dl>
        )}
      </div>
      {pasos && pasos.length > 0 && <div className="relative"><Recorrido pasos={pasos} /></div>}
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, detalle, href, tono = "text-tinta", ayuda }: { etiqueta: string; valor: string; detalle?: React.ReactNode; href?: string; tono?: string; ayuda?: string }) {
  const cuerpo = (
    <>
      <p className="text-xs font-semibold text-gris" title={ayuda}>{etiqueta}</p>
      <p className={`mt-1 truncate font-condensed text-2xl font-bold tabular-nums ${tono}`}>{valor}</p>
      {detalle && <div className="mt-0.5 truncate text-[11px] text-gris">{detalle}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={`${TARJETA} block min-w-0 px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:border-naranjo/40 hover:shadow-md`} title={ayuda}>
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
  // La base puede traer otros parámetros (?mes=…): se conservan y solo cambia «ver».
  const href = (clave: string, primera: boolean) => {
    const [ruta, consulta = ""] = base.split("?");
    const p = new URLSearchParams(consulta);
    if (primera) p.delete("ver");
    else p.set("ver", clave);
    const q = p.toString();
    return q ? `${ruta}?${q}` : ruta;
  };
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-borde bg-superficie p-1">
      {opciones.map((o, i) => {
        const on = actual === o.clave;
        return (
          <Link
            key={o.clave}
            href={href(o.clave, i === 0)}
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

// Compactas a propósito: menos alto de fila y de encabezado, con la misma información. Los botones de una celda se achican con
// la regla `td.celda-fin` de globals.css.
export const TH = "px-2.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gris";
export const TD = "celda-fin px-2.5 py-1.5 align-top text-[13px] leading-snug";

/**
 * La misma banda con lo mismo (cifra grande, cifras de apoyo y proceso), en la mitad de alto: la cifra y su ícono
 * a la izquierda, las cifras de apoyo en una fila y el proceso en una línea. En el celular las cifras van de a dos.
 */
function BandaCompacta({ etiqueta, valor, bajada, cifras, pasos, Icono, tono, children }: { etiqueta: string; valor: string; bajada?: React.ReactNode; cifras?: { etiqueta: string; valor: string; detalle?: string; alerta?: boolean }[]; pasos?: PasoRecorrido[]; Icono: Icon; tono: TonoIcono; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-borde/60 bg-superficie px-3.5 py-3 shadow-[0_1px_2px_rgba(23,20,17,0.04),0_10px_26px_-18px_rgba(23,20,17,0.16)] sm:px-4">
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-naranjo/[0.06] blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <div className="flex min-w-0 items-center gap-3" title={typeof bajada === "string" ? bajada : undefined}>
          <IconoTile Icono={Icono} tono={tono} />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-gris">{etiqueta}</p>
            <p className="animar-cifra font-condensed text-3xl font-bold leading-none tracking-tight tabular-nums text-tinta">{valor}</p>
          </div>
        </div>
        {cifras && cifras.length > 0 && (
          <dl className="grid w-full min-w-0 grid-cols-2 gap-2 sm:w-auto sm:flex-1 sm:grid-cols-4">
            {cifras.map((c) => (
              <div key={c.etiqueta} className={`min-w-0 rounded-xl px-3 py-1.5 ${c.alerta ? "bg-naranjo/[0.09] ring-1 ring-naranjo/25" : "bg-tinta/[0.035]"}`}>
                <dt className={`truncate text-[11px] font-semibold ${c.alerta ? "text-naranjo" : "text-gris"}`}>{c.etiqueta}</dt>
                <dd className="flex items-baseline gap-1.5">
                  <span className="font-condensed text-lg font-bold leading-tight tabular-nums text-tinta">{c.valor}</span>
                  {c.detalle && <span className="truncate text-[10px] text-gris">{c.detalle}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {pasos && pasos.length > 0 && (
        <ol className="relative mt-2.5 flex flex-wrap items-center gap-x-0.5 gap-y-1 border-t border-borde/60 pt-2" aria-label="Cómo avanza">
          {pasos.map((p, i) => {
            const pendiente = p.n !== undefined && p.n > 0;
            const cuerpo = (
              <>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums ${p.alerta && pendiente ? "bg-naranjo text-white" : pendiente ? "bg-naranjo/12 text-naranjo" : "bg-tinta/[0.05] text-gris"}`}>{i + 1}</span>
                <span className="text-xs font-semibold text-tinta">{p.titulo}</span>
                {pendiente && <span className="rounded-full bg-naranjo px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">{p.n}</span>}
                {p.ayuda && <span className="hidden text-[11px] text-gris xl:inline">· {p.ayuda}</span>}
              </>
            );
            return (
              <li key={p.titulo} className="flex items-center">
                {p.href ? (
                  <Link href={p.href} scroll={false} title={p.ayuda} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-tinta/[0.04]">{cuerpo}</Link>
                ) : (
                  <span title={p.ayuda} className="flex items-center gap-1.5 px-1.5 py-1">{cuerpo}</span>
                )}
                {i < pasos.length - 1 && <IconChevronRight size={12} className="mx-0.5 shrink-0 text-gris-suave" aria-hidden />}
              </li>
            );
          })}
        </ol>
      )}
      {children}
    </section>
  );
}
