import Link from "next/link";
import { IconArrowDownLeft, IconArrowRight, IconArrowUpRight, IconBuildingBank, IconCheck, IconChartLine, IconCircleCheck, type Icon } from "@tabler/icons-react";
import { clp, clpCorto } from "@/lib/fin/reglas";

// La parte de arriba del Resumen: primeros pasos, la caja de hoy con hacia dónde va, y las cifras
// agrupadas por lo que significan (lo que entra, lo que sale, cómo va el mes) en vez de seis
// cuadros iguales. Solo presentación: todos los números llegan calculados desde la página.

const HOJA = "rounded-[22px] border border-borde/60 bg-superficie shadow-[0_1px_2px_rgba(23,20,17,0.04),0_14px_36px_-20px_rgba(23,20,17,0.18)]";

// ─────────────────────────────────────────────────────────────────────────────
//  Primeros pasos
// ─────────────────────────────────────────────────────────────────────────────

export type PasoInicial = { titulo: string; texto: string; listo: boolean; href: string; boton: string };

function Anillo({ hechos, total }: { hechos: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-16 w-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-tinta/[0.07]" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="animar-anillo stroke-naranjo" strokeDasharray={c} strokeDashoffset={c * (1 - hechos / total)} style={{ "--vuelta": c } as React.CSSProperties} />
      </svg>
      <span className="font-condensed text-lg font-bold tabular-nums text-tinta">
        {hechos}<span className="text-gris">/{total}</span>
      </span>
    </span>
  );
}

export function PrimerosPasos({ empresa, pasos }: { empresa: string; pasos: PasoInicial[] }) {
  const hechos = pasos.filter((p) => p.listo).length;
  const actual = pasos.findIndex((p) => !p.listo);
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-naranjo/15 bg-linear-to-br from-naranjo/[0.08] via-superficie to-cian/[0.07] p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Anillo hechos={hechos} total={pasos.length} />
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight tracking-tight text-tinta">Dejemos andando las finanzas de {empresa}</p>
          <p className="mt-0.5 text-sm text-gris">Son {pasos.length} pasos y cada uno se marca solo cuando está hecho.</p>
        </div>
      </div>

      <ol className="relative mt-6 grid gap-4 md:grid-cols-3 md:gap-6">
        {/* La línea que une los pasos (en pantallas anchas) */}
        <span aria-hidden className="absolute left-4 right-[calc(33%-1rem)] top-4 hidden h-px bg-linear-to-r from-naranjo/40 to-borde md:block" />
        {pasos.map((p, i) => {
          const esActual = i === actual;
          return (
            <li key={p.titulo} className="relative flex gap-3 md:block">
              <span
                className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ring-4 ring-superficie ${
                  p.listo ? "bg-emerald-500 text-white" : esActual ? "bg-naranjo text-white shadow-[0_6px_14px_-4px_rgba(200,82,23,0.6)]" : "border border-borde bg-superficie text-gris"
                }`}
              >
                {p.listo ? <IconCheck size={16} stroke={2.6} /> : i + 1}
              </span>
              <div className="min-w-0 md:mt-3">
                <p className={`font-semibold ${p.listo ? "text-gris line-through decoration-1" : "text-tinta"}`}>{p.titulo}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-gris">{p.texto}</p>
                {!p.listo &&
                  (esActual ? (
                    <Link href={p.href} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-naranjo px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-naranjo-suave active:scale-[0.98]">
                      {p.boton} <IconArrowRight size={15} />
                    </Link>
                  ) : (
                    <Link href={p.href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-gris transition hover:text-tinta">
                      {p.boton} <IconArrowRight size={13} />
                    </Link>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  La caja de hoy y hacia dónde va
// ─────────────────────────────────────────────────────────────────────────────

export type MesCaja = { etiqueta: string; cajaFinal: number; holgura: number; falta: boolean };

export function CajaHoy({ caja, deudaTarjeta, actualizado, meses, sinCuentas, holguraMinima, mesMinimo, minimoCaja }: {
  caja: number;
  deudaTarjeta: number;
  actualizado: string | null;
  meses: MesCaja[];
  sinCuentas: boolean;
  holguraMinima: number | null;
  mesMinimo: string | null;
  minimoCaja: number;
}) {
  const tope = Math.max(...meses.map((m) => Math.abs(m.cajaFinal)), 1);
  const enRojo = holguraMinima !== null && holguraMinima < 0;
  return (
    <section className={`${HOJA} grid overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`}>
      <div className="relative p-6 sm:p-7">
        <span aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-cian/[0.08] blur-2xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-cian to-cian-suave text-white shadow-[0_4px_10px_-3px_rgba(0,160,128,0.5)]">
            <IconBuildingBank size={18} stroke={1.75} />
          </span>
          <p className="text-sm font-semibold text-tinta/80">Caja en bancos hoy</p>
        </div>
        <p className="animar-cifra relative mt-4 font-condensed text-6xl font-bold leading-none tracking-tight tabular-nums text-tinta">{clp(caja)}</p>
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-tinta/[0.05] px-2.5 py-1 text-gris">
            Tarjeta <strong className="font-semibold text-tinta">{deudaTarjeta > 0 ? `−${clp(deudaTarjeta)}` : clp(0)}</strong>
          </span>
          <span className={`rounded-full px-2.5 py-1 ${actualizado ? "bg-tinta/[0.05] text-gris" : "bg-amber-500/12 text-aviso"}`}>
            {actualizado ? <>Banco al <strong className="font-semibold text-tinta">{actualizado}</strong></> : "Aún no se importa ninguna cartola"}
          </span>
        </div>
      </div>

      <div className="border-t border-borde/60 bg-tinta/[0.02] p-6 sm:p-7 lg:border-l lg:border-t-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-tinta/80">Así viene la caja</p>
          {!sinCuentas && holguraMinima !== null && (
            <p className={`text-xs ${enRojo ? "font-semibold text-alerta" : "text-gris"}`}>
              {enRojo ? "Falta caja en " : "Holgura mínima en "}
              {mesMinimo}: <strong className={enRojo ? "" : "text-ok"}>{clpCorto(holguraMinima)}</strong>
            </p>
          )}
        </div>
        {sinCuentas ? (
          <div className="mt-4 grid h-36 place-items-center rounded-2xl border border-dashed border-borde px-6 text-center">
            <p className="text-[13px] text-gris">Cuando crees tus cuentas, aquí verás cómo queda la caja de cada mes.</p>
          </div>
        ) : (
          <div className="mt-4 grid h-36 grid-cols-3 items-end gap-3">
            {meses.map((m, i) => (
              <div key={m.etiqueta} className="flex h-full flex-col justify-end gap-1.5">
                <p className={`text-center text-xs font-bold tabular-nums ${m.cajaFinal < 0 ? "text-alerta" : "text-tinta"}`}>{clpCorto(m.cajaFinal)}</p>
                <div className="flex flex-1 items-end justify-center">
                  <div
                    className={`animar-crecer w-full max-w-16 rounded-xl ${m.falta ? "bg-linear-to-t from-rose-500/70 to-rose-400/50" : "bg-linear-to-t from-naranjo/80 to-naranjo-suave/60"}`}
                    style={{ height: `${Math.max(6, (Math.abs(m.cajaFinal) / tope) * 100)}%`, animationDelay: `${300 + i * 120}ms` }}
                    title={`Caja final ${clp(m.cajaFinal)} · holgura ${clp(m.holgura)}`}
                  />
                </div>
                <p className="text-center text-[11px] font-semibold capitalize text-gris">{m.etiqueta}</p>
              </div>
            ))}
          </div>
        )}
        {!sinCuentas && minimoCaja > 0 && <p className="mt-3 text-[11px] text-gris">Mínimo de caja definido: {clpCorto(minimoCaja)}</p>}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Las cifras, agrupadas
// ─────────────────────────────────────────────────────────────────────────────

type Linea = { etiqueta: string; valor: string; href?: string; destacar?: boolean | "alerta" };

const TONOS = {
  entra: { tile: "from-cian to-cian-suave", sombra: "rgba(0,160,128,0.45)", barra: "bg-cian" },
  sale: { tile: "from-rose-500 to-rose-400", sombra: "rgba(225,29,72,0.4)", barra: "bg-rose-500" },
  mes: { tile: "from-naranjo to-naranjo-suave", sombra: "rgba(200,82,23,0.45)", barra: "bg-naranjo" },
} as const;

function Grupo({ titulo, Icono, tono, principal, nota, href, lineas }: { titulo: string; Icono: Icon; tono: keyof typeof TONOS; principal: string; nota: string; href: string; lineas: Linea[] }) {
  const t = TONOS[tono];
  return (
    <div className={`${HOJA} flex flex-col p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(23,20,17,0.04),0_22px_44px_-20px_rgba(23,20,17,0.28)]`}>
      <Link href={href} className="group">
        <div className="flex items-center gap-2.5">
          <span className={`grid h-8 w-8 place-items-center rounded-[10px] bg-linear-to-br text-white transition duration-300 group-hover:scale-110 group-hover:-rotate-6 ${t.tile}`} style={{ boxShadow: `0 4px 10px -3px ${t.sombra}` }}>
            <Icono size={17} stroke={2} />
          </span>
          <p className="flex-1 text-sm font-semibold text-tinta/80">{titulo}</p>
          <IconArrowRight size={15} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
        </div>
        <p className="animar-cifra mt-3 font-condensed text-4xl font-bold leading-none tracking-tight tabular-nums text-tinta">{principal}</p>
        <p className="mt-1 text-xs text-gris">{nota}</p>
      </Link>
      <ul className="mt-4 space-y-1 border-t border-borde/60 pt-3">
        {lineas.map((l) => {
          const fila = (
            <>
              <span className="flex-1 text-gris">{l.etiqueta}</span>
              <span className={`font-semibold tabular-nums ${l.destacar === "alerta" ? "text-alerta" : l.destacar ? "text-naranjo" : "text-tinta"}`}>{l.valor}</span>
            </>
          );
          return (
            <li key={l.etiqueta}>
              {l.href ? (
                <Link href={l.href} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-tinta/[0.04]">{fila}</Link>
              ) : (
                <div className="-mx-2 flex items-center gap-2 px-2 py-1.5 text-[13px]">{fila}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Cifras({ entra, sale, mes }: {
  entra: { porCobrar: number; vencido: number; cedido: number; terminado: number; listo: number; factoring: number; href: { cobrar: string; terminado: string; factoring: string } };
  sale: { porPagar: number; vencido: number; prox30: number; href: string };
  mes: { ventas: number; anioPasado: number; margen: string; vendido: number; href: { ventas: string; proyectos: string } };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Grupo
        titulo="Por entrar"
        Icono={IconArrowDownLeft}
        tono="entra"
        principal={clpCorto(entra.porCobrar)}
        nota={`Te deben con IVA · vencido ${clpCorto(entra.vencido)}${entra.cedido ? ` · cedido ${clpCorto(entra.cedido)}` : ""}`}
        href={entra.href.cobrar}
        lineas={[
          { etiqueta: "Terminado sin facturar", valor: clpCorto(entra.terminado), href: entra.href.terminado },
          { etiqueta: "Listo para facturar hoy", valor: clpCorto(entra.listo), href: entra.href.terminado, destacar: entra.listo > 0 },
          { etiqueta: "Factoring vigente", valor: clpCorto(entra.factoring), href: entra.href.factoring },
        ]}
      />
      <Grupo
        titulo="Por salir"
        Icono={IconArrowUpRight}
        tono="sale"
        principal={clpCorto(sale.porPagar)}
        nota="Facturas de proveedores sin pagar"
        href={sale.href}
        lineas={[
          { etiqueta: "Ya vencido", valor: clpCorto(sale.vencido), href: sale.href, destacar: sale.vencido > 0 ? "alerta" : false },
          { etiqueta: "Vence en 30 días", valor: clpCorto(sale.prox30), href: sale.href },
        ]}
      />
      <Grupo
        titulo="Este mes"
        Icono={IconChartLine}
        tono="mes"
        principal={clpCorto(mes.ventas)}
        nota="Facturado neto en el mes"
        href={mes.href.ventas}
        lineas={[
          { etiqueta: "Mismo mes, año pasado", valor: clpCorto(mes.anioPasado) },
          { etiqueta: "Margen proyectos activos", valor: mes.margen, href: mes.href.proyectos },
          { etiqueta: "Vendido en proyectos activos", valor: clpCorto(mes.vendido), href: mes.href.proyectos },
        ]}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Atención hoy
// ─────────────────────────────────────────────────────────────────────────────

export type ItemAtencion = { n: number; texto: string; href: string; tono: string };

const TONO_ATENCION: Record<string, string> = {
  rose: "bg-rose-500/12 text-alerta",
  amber: "bg-amber-500/15 text-aviso",
  naranjo: "bg-naranjo/15 text-naranjo",
  slate: "bg-tinta/[0.06] text-gris",
};

export function AtencionHoy({ items, rutinas }: { items: ItemAtencion[]; rutinas: string }) {
  if (items.length === 0)
    return (
      <section className={`${HOJA} flex items-center gap-4 p-5`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-ok">
          <IconCircleCheck size={24} stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-tinta">Todo al día</p>
          <p className="text-[13px] text-gris">Nada pide acción hoy. Si quieres, repasa la rutina del día.</p>
        </div>
        <Link href={rutinas} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-tinta/[0.06] px-3.5 text-sm font-semibold text-tinta transition hover:bg-tinta/[0.1]">
          Rutinas <IconArrowRight size={14} />
        </Link>
      </section>
    );
  return (
    <section className={`${HOJA} p-2`}>
      <p className="px-3 pb-1 pt-2 text-sm font-semibold text-tinta/80">Para hoy · {items.length} {items.length === 1 ? "cosa" : "cosas"}</p>
      <ul>
        {items.map((a) => (
          <li key={a.texto}>
            <Link href={a.href} className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition hover:bg-tinta/[0.035]">
              <span className={`grid h-8 min-w-8 place-items-center rounded-xl px-2 font-condensed text-lg font-bold tabular-nums ${TONO_ATENCION[a.tono] ?? TONO_ATENCION.slate}`}>{a.n}</span>
              <span className="flex-1 text-tinta first-letter:uppercase">{a.texto}</span>
              <IconArrowRight size={15} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
