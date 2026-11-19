import Link from "next/link";
import { IconArrowRight, IconCircleCheck, type Icon } from "@tabler/icons-react";

// -----------------------------------------------------------------------------
//  Las piezas del Resumen del Repositorio Legal, con el mismo lenguaje que el Resumen de Gestión
//  financiera (components/fin/ResumenArriba.tsx): una hoja grande con la cifra principal y hacia
//  dónde va, tarjetas agrupadas por lo que significan (con su ícono en degradé y sus líneas de
//  apoyo) y la lista «Para hoy» con el número en una pastilla. Solo presentación.
// -----------------------------------------------------------------------------

export const HOJA = "rounded-[22px] border border-borde/60 bg-superficie shadow-[0_1px_2px_rgba(23,20,17,0.04),0_14px_36px_-20px_rgba(23,20,17,0.18)]";

const TONOS = {
  alerta: { tile: "from-rose-500 to-rose-400", sombra: "rgba(225,29,72,0.4)" },
  aviso: { tile: "from-amber-500 to-amber-400", sombra: "rgba(217,119,6,0.4)" },
  naranjo: { tile: "from-naranjo to-naranjo-suave", sombra: "rgba(200,82,23,0.45)" },
  cian: { tile: "from-cian to-cian-suave", sombra: "rgba(0,160,128,0.45)" },
} as const;

export type TonoTarjeta = keyof typeof TONOS;

export function IconoEnTile({ Icono, tono, chico = false }: { Icono: Icon; tono: TonoTarjeta; chico?: boolean }) {
  const t = TONOS[tono];
  return (
    <span className={`grid ${chico ? "h-8 w-8 rounded-[10px]" : "h-11 w-11 rounded-2xl"} shrink-0 place-items-center bg-linear-to-br text-white transition duration-300 group-hover:scale-110 group-hover:-rotate-6 ${t.tile}`} style={{ boxShadow: `0 4px 10px -3px ${t.sombra}` }}>
      <Icono size={chico ? 17 : 22} stroke={2} />
    </span>
  );
}

export type Linea = { etiqueta: string; valor: string; href?: string; destacar?: "alerta" | "aviso" | boolean };

/** Una tarjeta de cifras: ícono, cifra grande con su nota, y líneas de apoyo que llevan al detalle. */
export function TarjetaGrupo({ titulo, Icono, tono, principal, nota, href, lineas }: { titulo: string; Icono: Icon; tono: TonoTarjeta; principal: string; nota: string; href: string; lineas: Linea[] }) {
  return (
    <div className={`${HOJA} flex flex-col p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(23,20,17,0.04),0_22px_44px_-20px_rgba(23,20,17,0.28)]`}>
      <Link href={href} className="group">
        <div className="flex items-center gap-2.5">
          <IconoEnTile Icono={Icono} tono={tono} chico />
          <p className="flex-1 text-sm font-semibold text-tinta/80">{titulo}</p>
          <IconArrowRight size={15} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
        </div>
        <p className="animar-cifra mt-3 font-condensed text-4xl font-bold leading-none tracking-tight tabular-nums text-tinta">{principal}</p>
        <p className="mt-1 text-xs text-gris">{nota}</p>
      </Link>
      {lineas.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-borde/60 pt-3">
          {lineas.map((l) => {
            const fila = (
              <>
                <span className="min-w-0 flex-1 truncate text-gris">{l.etiqueta}</span>
                <span className={`font-semibold tabular-nums ${l.destacar === "alerta" ? "text-alerta" : l.destacar === "aviso" ? "text-aviso" : l.destacar ? "text-naranjo" : "text-tinta"}`}>{l.valor}</span>
              </>
            );
            return (
              <li key={l.etiqueta}>
                {l.href ? (
                  <Link href={l.href} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-tinta/[0.04]">
                    {fila}
                  </Link>
                ) : (
                  <div className="-mx-2 flex items-center gap-2 px-2 py-1.5 text-[13px]">{fila}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export type ItemAtencion = { n: number; texto: string; detalle?: string; href: string; tono: "alerta" | "aviso" | "naranjo" | "gris" };

const TONO_ATENCION: Record<ItemAtencion["tono"], string> = {
  alerta: "bg-rose-500/12 text-alerta",
  aviso: "bg-amber-500/15 text-aviso",
  naranjo: "bg-naranjo/15 text-naranjo",
  gris: "bg-tinta/[0.06] text-gris",
};

/** «Para hoy»: lo que pide acción, priorizado, cada cosa con su número y su enlace. */
export function ParaHoy({ items }: { items: ItemAtencion[] }) {
  if (items.length === 0)
    return (
      <section className={`${HOJA} flex items-center gap-4 p-5`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-ok">
          <IconCircleCheck size={24} stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-tinta">Todo al día</p>
          <p className="text-[13px] text-gris">Ningún documento vencido ni por vencer, y cada sociedad tiene sus documentos clave.</p>
        </div>
      </section>
    );
  return (
    <section className={`${HOJA} p-2`}>
      <p className="px-3 pb-1 pt-2 text-sm font-semibold text-tinta/80">
        Para hoy · {items.length} {items.length === 1 ? "cosa" : "cosas"}
      </p>
      <ul>
        {items.map((a) => (
          <li key={a.texto + a.href}>
            <Link href={a.href} className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition hover:bg-tinta/[0.035]">
              <span className={`grid h-8 min-w-8 place-items-center rounded-xl px-2 font-condensed text-lg font-bold tabular-nums ${TONO_ATENCION[a.tono]}`}>{a.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-tinta first-letter:uppercase">{a.texto}</span>
                {a.detalle && <span className="block truncate text-xs text-gris">{a.detalle}</span>}
              </span>
              <IconArrowRight size={15} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type BarraSociedad = { slug: string; nombre: string; ok: number; total: number; vencidos: number; porVencer: number };

/**
 * La hoja principal: cuántos documentos clave están al día en todo el grupo, y una barra por
 * sociedad (como «Así viene la caja»), de la más complicada a la más ordenada.
 */
export function SaludDelGrupo({ ok, total, actualizado, sociedades, rutaSociedad }: { ok: number; total: number; actualizado: string | null; sociedades: BarraSociedad[]; rutaSociedad: (slug: string) => string }) {
  const pct = total ? Math.round((ok / total) * 100) : 0;
  return (
    <section className={`${HOJA} grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]`}>
      <div className="flex flex-col justify-center gap-3 p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cian/12 text-cian">
            <IconCircleCheck size={19} stroke={1.9} />
          </span>
          <p className="text-sm font-semibold text-tinta/80">Documentos clave al día</p>
        </div>
        <p className="animar-cifra font-condensed text-6xl font-bold leading-none tracking-tight tabular-nums text-tinta">
          {pct}%
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-tinta/[0.05] px-2.5 py-1 text-gris">
            <span className="font-semibold text-tinta">{ok}</span> de {total} en orden
          </span>
          {actualizado && (
            <span className="rounded-full bg-tinta/[0.05] px-2.5 py-1 text-gris">
              SharePoint al <span className="font-semibold text-tinta">{actualizado}</span>
            </span>
          )}
        </div>
        <p className="text-xs text-gris">Constitución, extracto en el Diario Oficial, inscripción, certificado de vigencia, e-RUT e inicio de actividades de cada sociedad.</p>
      </div>
      <div className="border-t border-borde/60 bg-tinta/[0.015] p-6 lg:border-l lg:border-t-0">
        <p className="mb-4 text-sm font-semibold text-tinta/80">Así vienen las sociedades</p>
        <ul className="space-y-2.5">
          {sociedades.map((s) => {
            const p = s.total ? (s.ok / s.total) * 100 : 0;
            const color = s.vencidos > 0 ? "bg-rose-500/80" : s.porVencer > 0 ? "bg-amber-500/80" : p >= 100 ? "bg-emerald-500/80" : "bg-naranjo/80";
            return (
              <li key={s.slug}>
                <Link href={rutaSociedad(s.slug)} className="group block">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-semibold text-tinta group-hover:text-naranjo">{s.nombre}</span>
                    <span className="tabular-nums text-gris">
                      {s.ok}/{s.total}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-tinta/[0.06]">
                    <div className={`animar-llenar h-full rounded-full ${color}`} style={{ width: `${Math.max(p, 4)}%` }} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
