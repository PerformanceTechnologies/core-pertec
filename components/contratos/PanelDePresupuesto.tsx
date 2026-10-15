import { IconAlertTriangle, IconCoin, IconHistory } from "@tabler/icons-react";
import AprobadoresDeGastos from "./AprobadoresDeGastos";
import EditorDeMontoDePresupuesto from "./EditorDeMontoDePresupuesto";
import { Barrita, BarraPartida, type Tramo } from "./dashboard/graficos";
import { TARJETA } from "@/lib/contratos/estilos";
import { formatearPesos } from "@/lib/contratos/arranque-modelo";
import { pesosCompactos, type Tono } from "@/lib/contratos/dashboard-modelo";
import type { ResumenDePresupuesto, PendientesDeCotizacion } from "@/lib/contratos/gastos-modelo";
import type { CambioDePresupuesto } from "@/lib/contratos/gastos";

function Cifra({
  etiqueta,
  valor,
  ayuda,
  tono,
}: {
  etiqueta: string;
  valor: number | null;
  ayuda?: string;
  tono?: "ok" | "aviso" | "critico";
}) {
  const color =
    tono === "critico" ? "text-red-600" : tono === "aviso" ? "text-amber-600" : tono === "ok" ? "text-emerald-600" : "text-tinta";
  return (
    <div className="min-w-0 rounded-lg bg-fondo px-3 py-2.5" title={valor === null ? undefined : formatearPesos(valor)}>
      <span className={`block truncate text-xl font-extrabold leading-none tabular-nums ${color}`}>
        {valor === null ? "—" : pesosCompactos(valor)}
      </span>
      <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-gris">{etiqueta}</span>
      {ayuda && <span className="mt-0.5 block truncate text-[11px] text-gris-suave">{ayuda}</span>}
    </div>
  );
}

function tonoDeItem(presupuesto: number | null, proyectado: number, sobre: boolean): Tono {
  if (presupuesto === null) return "neutro";
  if (sobre) return "critico";
  return presupuesto > 0 && proyectado / presupuesto >= 0.85 ? "aviso" : "curso";
}

const FECHA = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" });

/**
 * El presupuesto de Gastos de arranque frente a lo que se gasta.
 *
 * Cuatro cifras que se leen de corrido —el presupuesto, lo comprometido (cotización aprobada u OC),
 * lo pagado y lo que queda— más una proyección: lo comprometido más lo que se espera comprometer
 * con las mejores cotizaciones recibidas. La proyección es lo que avisa que el presupuesto va a
 * quedar corto ANTES de aprobar, no después.
 *
 * Abajo, el reparto por ítem: cada uno con su presupuesto y su barra. Editar es de quien puede
 * aprobar (el lápiz solo aparece para esas personas), pero verlo es de todo el módulo.
 */
export default function PanelDePresupuesto({
  resumen,
  pendientes,
  cambios,
  puedeEditar,
  aprobadores,
  candidatosAAprobar,
  esAdmin,
}: {
  resumen: ResumenDePresupuesto;
  pendientes: PendientesDeCotizacion;
  cambios: CambioDePresupuesto[];
  puedeEditar: boolean;
  aprobadores: { id: string; nombre: string }[];
  candidatosAAprobar: { id: string; nombre: string }[];
  esAdmin: boolean;
}) {
  const r = resumen;
  const definido = r.total !== null;

  // La barra se parte en lo pagado, lo comprometido sin pagar, lo que se espera comprometer y lo
  // que queda. Si la proyección pasa el total no hay «queda»: la barra se agranda y el exceso es el aviso.
  const tramos: Tramo[] = [
    { clave: "pagado", etiqueta: "Pagado", valor: r.pagado, color: "var(--etapa-validado)" },
    {
      clave: "comprometido",
      etiqueta: "Comprometido sin pagar",
      valor: Math.max(0, r.comprometido - r.pagado),
      color: "var(--color-azul-suave)",
    },
    { clave: "por", etiqueta: "Por comprometer", valor: r.porComprometer, color: "var(--color-cian)" },
    {
      clave: "queda",
      etiqueta: "Disponible",
      valor: r.total === null ? 0 : Math.max(0, r.total - r.proyectado),
      color: "var(--color-borde)",
    },
  ];

  return (
    <section aria-labelledby="presupuesto-titulo" className={`${TARJETA} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="presupuesto-titulo" className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gris">
            <IconCoin size={16} className="text-cian" />
            Presupuesto · neto, sin IVA
          </h2>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-3xl font-extrabold tabular-nums text-tinta">{definido ? formatearPesos(r.total) : "Sin definir"}</span>
            {definido && r.original !== null && r.original !== r.total && (
              <span className="text-xs text-gris">original {formatearPesos(r.original)}</span>
            )}
          </p>
        </div>
        {puedeEditar && (
          <EditorDeMontoDePresupuesto
            tipo="total"
            titulo="Presupuesto total"
            descripcion="Gastos de arranque"
            valorInicial={r.total}
            etiquetaDelBoton={definido ? "Cambiar" : "Definir presupuesto"}
          />
        )}
      </div>

      {!definido ? (
        <p className="mt-4 rounded-lg border border-dashed border-borde bg-fondo/60 px-4 py-5 text-sm text-gris">
          {puedeEditar
            ? "Define el presupuesto total para poder ver cuánto se ha comprometido, cuánto se pagó y cuánto queda. Después lo repartes entre los ítems."
            : "Todavía no se define el presupuesto total. Lo define un administrador o quien apruebe gastos."}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Cifra
          etiqueta="Comprometido"
          valor={r.comprometido}
          ayuda={definido && r.total ? `${Math.round((r.comprometido / r.total) * 100)}% del total` : "aprobado u OC"}
        />
        <Cifra etiqueta="Pagado" valor={r.pagado} ayuda={`${r.lineas} ${r.lineas === 1 ? "línea" : "líneas"}`} />
        <Cifra
          etiqueta="Disponible"
          valor={r.disponible}
          tono={r.disponible !== null && r.disponible < 0 ? "critico" : undefined}
          ayuda="total menos comprometido"
        />
        <Cifra
          etiqueta="Proyectado"
          valor={r.proyectado}
          tono={r.enRiesgo ? "critico" : undefined}
          ayuda={r.enRiesgo ? "supera el presupuesto" : "comprometido + por comprometer"}
        />
      </div>

      {(r.proyectado > 0 || definido) && (
        <div className="mt-4">
          <BarraPartida tramos={tramos} alto={12} titulo="Presupuesto, comprometido y pagado" />
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
            {tramos.map((t) => (
              <span key={t.clave} className="flex items-center gap-1.5 text-[11px] text-gris">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                {t.etiqueta}
                <span className="font-bold tabular-nums text-tinta">{pesosCompactos(t.valor)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {r.enRiesgo && r.disponibleProyectado !== null && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          <IconAlertTriangle size={15} className="mt-px shrink-0" />
          Si todo sale como las mejores cotizaciones, el gasto supera el presupuesto en {formatearPesos(-r.disponibleProyectado)}.
        </p>
      )}
      {definido && r.sinRepartir !== null && r.sinRepartir < 0 && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          <IconAlertTriangle size={15} className="mt-px shrink-0" />
          Los ítems suman {formatearPesos(r.asignado)}, {formatearPesos(-r.sinRepartir)} más que el presupuesto total.
        </p>
      )}

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-gris">Por ítem</h3>
          {definido && r.sinRepartir !== null && r.sinRepartir >= 0 && (
            <span className="text-[11px] text-gris-suave">
              {r.sinRepartir === 0 ? "Todo el presupuesto está repartido" : `${formatearPesos(r.sinRepartir)} sin repartir`}
            </span>
          )}
        </div>

        {r.items.length === 0 ? (
          <p className="text-xs text-gris">Todavía no hay ítems. Créalos en «Ítems».</p>
        ) : (
          <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde">
            {r.items
              .filter((i) => i.lineas > 0 || i.presupuesto !== null || (puedeEditar && i.activo))
              .map((i) => {
                const tono = tonoDeItem(i.presupuesto, i.proyectado, i.sobre);
                const pct = i.presupuesto && i.presupuesto > 0 ? Math.round((i.proyectado / i.presupuesto) * 100) : null;
                return (
                  <li key={i.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta">
                        {i.nombre}
                        {!i.activo && <span className="ml-1.5 text-[11px] font-normal text-gris-suave">(desactivado)</span>}
                      </span>
                      <span className="shrink-0 text-right text-xs tabular-nums text-gris">
                        <span className="font-bold text-tinta">{pesosCompactos(i.comprometido)}</span>
                        {i.presupuesto === null ? " · sin presupuesto" : ` de ${pesosCompactos(i.presupuesto)}`}
                      </span>
                      {puedeEditar && (
                        <EditorDeMontoDePresupuesto
                          tipo="item"
                          itemId={i.id}
                          titulo={i.nombre}
                          descripcion="Presupuesto del ítem"
                          valorInicial={i.presupuesto}
                          compacto
                        />
                      )}
                    </div>
                    <div className="mt-1.5">
                      <Barrita valor={pct ?? 0} tono={tono} />
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gris-suave">
                      <span>
                        {i.lineas} {i.lineas === 1 ? "línea" : "líneas"}
                      </span>
                      {i.pagado > 0 && <span>{pesosCompactos(i.pagado)} pagado</span>}
                      {i.porComprometer > 0 && <span>{pesosCompactos(i.porComprometer)} por comprometer</span>}
                      {i.sobre && i.presupuesto !== null && (
                        <span className="font-bold text-red-600">
                          proyecta {pesosCompactos(i.proyectado - i.presupuesto)} sobre el presupuesto
                        </span>
                      )}
                    </p>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {(pendientes.esperandoRespuesta > 0 || pendientes.porVencer > 0 || r.ahorroLogrado > 0) && (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-borde pt-3 text-xs">
          {pendientes.esperandoRespuesta > 0 && (
            <div>
              <dt className="inline text-gris">Cotizaciones esperando respuesta: </dt>
              <dd className="inline font-bold text-tinta">
                {pendientes.esperandoRespuesta}
                {pendientes.respuestaAtrasada > 0 && (
                  <span className="font-bold text-amber-600"> ({pendientes.respuestaAtrasada} atrasadas)</span>
                )}
              </dd>
            </div>
          )}
          {pendientes.porVencer > 0 && (
            <div>
              <dt className="inline text-gris">Precios por vencer: </dt>
              <dd className="inline font-bold text-amber-600">{pendientes.porVencer}</dd>
            </div>
          )}
          {r.ahorroLogrado > 0 && (
            <div>
              <dt className="inline text-gris">Ahorro por comparar cotizaciones: </dt>
              <dd className="inline font-bold text-emerald-600">{formatearPesos(r.ahorroLogrado)}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-4 border-t border-borde pt-3">
        <AprobadoresDeGastos aprobadores={aprobadores} candidatos={candidatosAAprobar} puedeEditar={esAdmin} />
      </div>

      {cambios.length > 0 && (
        <details className="mt-3 text-xs text-gris">
          <summary className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 font-bold uppercase tracking-wide text-gris hover:text-azul">
            <IconHistory size={14} />
            Cambios del presupuesto
          </summary>
          <ul className="mt-2 space-y-1.5 border-l-2 border-borde pl-3">
            {cambios.map((c, i) => (
              <li key={i}>
                <span className="font-bold tabular-nums text-tinta">
                  {c.anterior === null ? "Definido" : `${formatearPesos(c.anterior)} →`} {formatearPesos(c.nuevo)}
                </span>
                <span className="text-gris-suave">
                  {" "}
                  · {c.usuario} · {FECHA.format(new Date(c.en))}
                </span>
                {c.motivo && <span className="block text-gris">«{c.motivo}»</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
