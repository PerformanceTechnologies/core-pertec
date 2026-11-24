import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { FilaResumen, ResumenCategorias as Resumen } from "@/lib/fin/clasificacion";
import { clp, mesLargo } from "@/lib/fin/reglas";
import { TARJETA } from "@/lib/estilos";

/**
 * El mes del banco por categoría, como lo lee Finanzas: arriba el resultado (ingresos y gastos), aparte lo que mueve caja
 * pero no es ingreso ni gasto (Financiamiento y Traspasos Internos) y al final lo que falta clasificar. Cada categoría se
 * abre para ver sus subcategorías.
 */
export default function ResumenCategorias({ r, base, mesAnterior, mesSiguiente }: { r: Resumen; base: string; mesAnterior: string; mesSiguiente: string | null }) {
  const neto = r.totalIngresos - r.totalEgresos;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`${base}&mes=${mesAnterior}`} scroll={false} className="grid h-8 w-8 place-items-center rounded-lg border border-borde bg-superficie text-gris hover:text-tinta" aria-label="Mes anterior">
          <IconChevronLeft size={16} />
        </Link>
        <h2 className="min-w-[10rem] text-center text-[15px] font-bold text-tinta first-letter:uppercase">{mesLargo(r.desde)}</h2>
        {mesSiguiente ? (
          <Link href={`${base}&mes=${mesSiguiente}`} scroll={false} className="grid h-8 w-8 place-items-center rounded-lg border border-borde bg-superficie text-gris hover:text-tinta" aria-label="Mes siguiente">
            <IconChevronRight size={16} />
          </Link>
        ) : (
          <span className="h-8 w-8" />
        )}
        <p className="flex-1 text-xs text-gris">
          El banco del mes y las boletas de los informes aprobados de Rendir gastos, según su clasificación. Financiamiento, Traspasos Internos y la transferencia de
          los fondos por rendir no suman en el resultado (el gasto real lo traen las boletas).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Cifra etiqueta="Ingresos" valor={r.totalIngresos} tono="text-ok" />
        <Cifra etiqueta="Gastos" valor={-r.totalEgresos} tono="text-alerta" />
        <Cifra etiqueta="Resultado de caja" valor={neto} tono={neto < 0 ? "text-alerta" : "text-tinta"} />
        <Cifra
          etiqueta="Por clasificar"
          valor={r.porAclarar.ingresos - r.porAclarar.egresos}
          detalle={`${r.porAclarar.movimientos} movimiento(s)`}
          tono={r.porAclarar.movimientos > 0 ? "text-aviso" : "text-gris"}
        />
      </div>

      <Tabla titulo="Ingresos y gastos" filas={r.resultado} vacio="Sin movimientos clasificados este mes." />
      {r.sinResultado.length > 0 && <Tabla titulo="No es ingreso ni gasto (Financiamiento y Traspasos Internos)" filas={r.sinResultado} />}
      {r.porAclarar.movimientos > 0 && (
        <p className="text-xs text-aviso">
          Faltan {r.porAclarar.movimientos} movimiento(s) por clasificar en este mes. Mientras estén pendientes, los totales no están completos.
        </p>
      )}
      {r.rendidoSinTipo.boletas > 0 && (
        <p className="text-xs text-aviso">
          {r.rendidoSinTipo.boletas} boleta(s) rendida(s) por {clp(r.rendidoSinTipo.monto)} no tienen tipo de gasto de Finanzas y no suman arriba. Se completa en el informe, en Rendir gastos.
        </p>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, tono, detalle }: { etiqueta: string; valor: number; tono: string; detalle?: string }) {
  return (
    <div className={`${TARJETA} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gris">{etiqueta}</p>
      <p className={`mt-1 font-condensed text-2xl font-bold tabular-nums ${tono}`}>{clp(valor)}</p>
      {detalle && <p className="text-[11px] text-gris">{detalle}</p>}
    </div>
  );
}

function Tabla({ titulo, filas, vacio }: { titulo: string; filas: FilaResumen[]; vacio?: string }) {
  return (
    <section className={`${TARJETA} overflow-hidden`}>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_3.5rem] gap-2 border-b border-borde bg-tinta/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gris">
        <span>{titulo}</span>
        <span className="text-right">Entradas</span>
        <span className="text-right">Salidas</span>
        <span className="text-right">Mov.</span>
      </div>
      {filas.length === 0 && vacio && <p className="px-4 py-4 text-xs text-gris">{vacio}</p>}
      {filas.map((f) => (
        <details key={f.categoriaId ?? f.nombre} className="group border-b border-borde last:border-b-0">
          <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_7rem_7rem_3.5rem] gap-2 px-4 py-2.5 text-sm hover:bg-tinta/[0.02] [&::-webkit-details-marker]:hidden">
            <span className="truncate font-semibold text-tinta">
              <span className="mr-1.5 inline-block text-gris transition group-open:rotate-90">›</span>
              {f.nombre}
            </span>
            <span className="text-right tabular-nums text-ok">{f.ingresos ? clp(f.ingresos) : "—"}</span>
            <span className="text-right tabular-nums text-alerta" title={f.rendido ? `${clp(f.rendido)} vienen de boletas rendidas` : undefined}>{f.egresos ? clp(-f.egresos) : "—"}</span>
            <span className="text-right tabular-nums text-gris">{f.movimientos}</span>
          </summary>
          <ul className="bg-tinta/[0.015] pb-1">
            {f.subcategorias.map((s) => (
              <li key={s.subcategoriaId ?? "sin"} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_3.5rem] gap-2 px-4 py-1.5 pl-9 text-xs">
                <span className={`truncate ${s.subcategoriaId ? "text-tinta" : "text-aviso"}`}>
                  {s.nombre}
                  {s.rendido > 0 && <span className="text-gris"> · {s.rendido === s.egresos ? "rendido" : `incl. ${clp(s.rendido)} rendido`}</span>}
                </span>
                <span className="text-right tabular-nums text-gris">{s.ingresos ? clp(s.ingresos) : "—"}</span>
                <span className="text-right tabular-nums text-gris">{s.egresos ? clp(-s.egresos) : "—"}</span>
                <span className="text-right tabular-nums text-gris">{s.movimientos}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
