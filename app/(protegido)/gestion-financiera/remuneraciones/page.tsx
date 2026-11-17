import Link from "next/link";
import { redirect } from "next/navigation";
import { IconCalendarEvent, IconLock, IconPlugConnected, IconRefresh, IconScale, IconUsers } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista, contextoFin } from "@/lib/fin/datos";
import { clp, clpCorto, fechaCl, mesLargo } from "@/lib/fin/reglas";
import { cargarRemuneraciones, MESES_EN_PANTALLA } from "@/lib/fin/remuneraciones";
import { puedeVerRemuneraciones } from "@/lib/fin/remuneraciones-acceso";
import type { CoberturaCartola, EstadoPago, GrupoPrevisional, LineaResumen, ResultadoPago } from "@/lib/fin/remuneraciones-modelo";
import { TARJETA } from "@/lib/estilos";
import { Banda, Chip, Seccion, TD, TH, Vacio } from "@/components/fin/piezas";
import { BotonAccion } from "@/components/fin/ui";
import { BOTON_SEC } from "@/components/fin/estilos";
import { actualizarDesdeBukAction, usarSugerenciaEnFlujoAction } from "../acciones-remuneraciones";

export const dynamic = "force-dynamic";

const TONO_PAGO: Record<EstadoPago, string> = {
  Pagado: "bg-emerald-500/12 text-ok dark:text-emerald-300",
  Parcial: "bg-amber-500/12 text-aviso dark:text-amber-300",
  "Por pagar": "bg-sky-500/10 text-info dark:text-sky-300",
  Pendiente: "bg-rose-500/12 text-alerta dark:text-rose-300",
  "Sin cartola": "bg-slate-500/10 text-slate-500 dark:text-slate-300",
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });

export default async function RemuneracionesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await contextoFin();
  // Los sueldos son confidenciales: sin permiso, ni siquiera se consulta BUK.
  if (!(await puedeVerRemuneraciones(ctx))) redirect(RUTA_FIN);
  const sp = await searchParams;
  const datos = await cargarRemuneraciones(ctx, await cargarVista());

  if (datos.estado === "sin-configurar") {
    return (
      <Vacio titulo="Falta conectar BUK" texto="Pídele a quien administra el sistema que cargue BUK_URL y BUK_API_TOKEN en el servidor. La clave solo necesita permiso de lectura de Contabilidad." icono={<IconPlugConnected size={24} stroke={1.6} />} />
    );
  }
  if (datos.estado === "error") {
    return (
      <div className={`${TARJETA} space-y-3 p-5`}>
        <p className="text-sm font-semibold text-alerta">No se pudo leer BUK</p>
        <p className="text-sm text-gris">{datos.mensaje}</p>
        <BotonAccion accion={actualizarDesdeBukAction} className={BOTON_SEC}><IconRefresh size={14} /> Reintentar</BotonAccion>
      </div>
    );
  }

  const { filas } = datos;
  if (filas.length === 0) {
    return <Vacio titulo="BUK no tiene liquidaciones en los últimos meses" texto={`Se revisaron los últimos ${MESES_EN_PANTALLA} meses de ${datos.empresaBuk}.`} icono={<IconUsers size={24} stroke={1.6} />} />;
  }
  const sel = filas.find((f) => f.periodo === sp.mes) ?? filas.find((f) => f.periodo === ctx.hoy.slice(0, 7)) ?? filas[0];
  const r = sel.resumen;
  const nombreMes = mesLargo(`${sel.periodo}-01`);

  return (
    <div className="space-y-5">
      <Banda
        etiqueta="Remuneraciones"
        valor={clp(r.liquido)}
        bajada={
          <>
            Líquido a pagar a las personas en <strong className="text-tinta">{nombreMes}</strong>, según el libro de remuneraciones de BUK ({datos.empresaBuk}).{" "}
            {sel.cerrado ? "El libro está cerrado en BUK." : "Provisorio: el libro de este mes sigue abierto en BUK y puede cambiar."}
          </>
        }
        cifras={[
          { etiqueta: "Previred (leyes sociales)", valor: clpCorto(r.previred), detalle: `vence ${fechaCl(sel.previred.fecha)}` },
          { etiqueta: "Impuesto único", valor: clpCorto(r.impuesto), detalle: "va en el F29" },
          { etiqueta: "Costo empresa", valor: clpCorto(r.costoEmpresa), detalle: "sueldos + aportes del empleador" },
          { etiqueta: "Personas", valor: String(r.personas) },
        ]}
      />

      <nav aria-label="Mes" className="flex flex-wrap items-center gap-1.5">
        {filas.map((f) => (
          <Link
            key={f.periodo}
            href={`${RUTA_FIN}/remuneraciones?mes=${f.periodo}`}
            scroll={false}
            aria-current={f.periodo === sel.periodo ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${f.periodo === sel.periodo ? "bg-tinta text-superficie" : "border border-borde bg-superficie text-gris hover:text-tinta"}`}
          >
            {mesLargo(`${f.periodo}-01`)}
          </Link>
        ))}
      </nav>

      {!r.cuadra && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta">
          <IconScale size={16} className="mt-px shrink-0" /> El debe y el haber del libro de BUK no cuadran en {nombreMes} (diferencia {clp(r.diferencia)}). Revisa la centralización en BUK antes de usar estas cifras.
        </p>
      )}

      <Seccion titulo={`Estado de pago · ${nombreMes}`} icono={<IconCalendarEvent size={15} />}>
        <div className="grid gap-3 lg:grid-cols-3">
          <TarjetaPago titulo="Sueldos (líquido)" etiquetaFecha="Fecha de pago" pago={sel.sueldos} cobertura={datos.cobertura} />
          <TarjetaPago titulo="Previred (leyes sociales)" etiquetaFecha="Plazo de referencia" pago={sel.previred} cobertura={datos.cobertura} />
          <div className={`${TARJETA} p-4`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-tinta">Impuesto único</h3>
              <Chip texto="Va en el F29" tono="bg-slate-500/10 text-slate-500 dark:text-slate-300" />
            </div>
            <p className="mt-2 font-condensed text-2xl font-bold tabular-nums text-tinta">{clp(r.impuesto)}</p>
            <p className="mt-1 text-xs text-gris">Es el impuesto retenido a las personas. Se declara y paga en el F29 del mes siguiente, junto con el resto de los impuestos: no tiene estado propio acá.</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gris">
          El estado sale de cruzar lo que dice BUK con los movimientos del banco de Tesorería: salidas categorizadas como remuneraciones (o con «sueldo», «remuneración» o «nómina» en la glosa) cerca de la fecha de pago, y las que dicen «Previred».
          Banco cargado: {datos.cobertura ? `del ${fechaCl(datos.cobertura.desde)} al ${fechaCl(datos.cobertura.hasta)}` : "sin movimientos"}.
        </p>
      </Seccion>

      <Seccion titulo="Últimos meses" icono={<IconUsers size={15} />}>
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Mes</th>
                <th className={TH}>Libro en BUK</th>
                <th className={`${TH} text-right`}>Personas</th>
                <th className={`${TH} text-right`}>Líquido</th>
                <th className={`${TH} text-right`}>Previred</th>
                <th className={`${TH} text-right`}>Impuesto único</th>
                <th className={`${TH} text-right`}>Costo empresa</th>
                <th className={TH}>Sueldos</th>
                <th className={TH}>Previred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f) => (
                <tr key={f.periodo} className={f.periodo === sel.periodo ? "bg-tinta/[0.03]" : ""}>
                  <td className={`${TD} font-semibold capitalize text-tinta`}><Link href={`${RUTA_FIN}/remuneraciones?mes=${f.periodo}`} scroll={false} className="hover:text-naranjo">{mesLargo(`${f.periodo}-01`)}</Link></td>
                  <td className={TD}><Chip texto={f.cerrado ? "Cerrado" : "Abierto"} tono={f.cerrado ? "bg-slate-500/10 text-slate-500 dark:text-slate-300" : "bg-amber-500/12 text-aviso dark:text-amber-300"} /></td>
                  <td className={`${TD} text-right tabular-nums`}>{f.resumen.personas}</td>
                  <td className={`${TD} text-right tabular-nums`}>{clp(f.resumen.liquido)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{clp(f.resumen.previred)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{clp(f.resumen.impuesto)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{clp(f.resumen.costoEmpresa)}</td>
                  <td className={TD}><Chip texto={f.sueldos.estado} tono={TONO_PAGO[f.sueldos.estado]} /></td>
                  <td className={TD}><Chip texto={f.previred.estado} tono={TONO_PAGO[f.previred.estado]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion titulo={`Para el flujo de caja`} icono={<IconCalendarEvent size={15} />}>
        <p className="mb-3 text-sm text-gris">
          Lo que sale de la caja por remuneraciones en cada mes del flujo: los sueldos cuando se pagan y Previred cuando vence. Lo que el banco ya muestra pagado no se suma (el flujo parte de la caja real de hoy).
          Cargarlo reemplaza lo escrito a mano en la fila «Remuneraciones» de Tesorería › Flujo de caja.
        </p>
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[46rem]">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Mes del flujo</th>
                <th className={TH}>De dónde sale</th>
                <th className={`${TH} text-right`}>Sugerido</th>
                <th className={`${TH} text-right`}>Hoy en el flujo</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {datos.sugerencias.map((s) => {
                const actual = datos.manualFlujo.get(s.mes) ?? 0;
                const monto = Math.round(s.monto);
                const igual = Math.abs(actual - monto) < 1;
                return (
                  <tr key={s.mes}>
                    <td className={`${TD} font-semibold capitalize text-tinta`}>{mesLargo(s.mes)}{s.estimado && <span className="ml-1.5 rounded bg-amber-400/20 px-1 text-[10px] font-semibold normal-case text-aviso">estimado</span>}</td>
                    <td className={TD}>
                      <ul className="space-y-0.5 text-xs">
                        {s.partes.map((p) => (
                          <li key={p.concepto} className="flex flex-wrap gap-x-2"><span className="text-tinta">{p.concepto}</span><span className="tabular-nums">{clp(p.monto)}</span><span className="text-gris">· {p.nota}</span></li>
                        ))}
                      </ul>
                    </td>
                    <td className={`${TD} text-right font-semibold tabular-nums`}>{clp(monto)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{clp(actual)}</td>
                    <td className={`${TD} text-right`}>
                      {igual ? (
                        <Chip texto="Ya cargado" tono="bg-emerald-500/12 text-ok dark:text-emerald-300" />
                      ) : (
                        <BotonAccion accion={usarSugerenciaEnFlujoAction.bind(null, s.mes)} confirmar={`¿Cargar ${clp(monto)} en «Remuneraciones» del flujo de ${mesLargo(s.mes)}? Reemplaza ${clp(actual)}.`} className={BOTON_SEC}>Cargar en el flujo</BotonAccion>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion titulo={`Detalle del libro · ${nombreMes}`} icono={<IconScale size={15} />}>
        <div className="grid gap-3 lg:grid-cols-2">
          <TablaLineas titulo="Sueldos y beneficios" total={r.haberes.reduce((s, l) => s + l.monto, 0)} lineas={r.haberes} />
          <TablaLineas titulo="Aportes del empleador" total={r.aportes.reduce((s, l) => s + l.monto, 0)} lineas={r.aportes} />
          <Previsional grupos={r.previsional} total={r.previred} />
          <div className={`${TARJETA} overflow-hidden`}>
            <div className="flex items-baseline justify-between border-b border-borde px-3 py-2"><h3 className="text-sm font-bold text-tinta">Por centro de costo</h3><span className="text-xs tabular-nums text-gris">costo empresa {clp(r.costoEmpresa)}</span></div>
            <table className="w-full">
              <tbody className="divide-y divide-borde">
                {r.centros.map((c) => (
                  <tr key={c.centro}><td className={TD}>{c.centro}</td><td className={`${TD} text-right text-xs text-gris`}>{c.personas} {c.personas === 1 ? "persona" : "personas"}</td><td className={`${TD} text-right tabular-nums`}>{clp(c.costo)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Seccion>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gris">
        <span className="inline-flex items-center gap-1.5"><IconLock size={13} /> Información confidencial: solo la ven el administrador y las personas asignadas. No se muestran nombres ni RUT de las personas: solo totales por concepto.</span>
        <span>Leído de BUK a las {hora(datos.leidoEn)}.</span>
        <BotonAccion accion={actualizarDesdeBukAction} className={BOTON_SEC}><IconRefresh size={13} /> Actualizar desde BUK</BotonAccion>
      </div>
    </div>
  );
}

function TarjetaPago({ titulo, etiquetaFecha, pago, cobertura }: { titulo: string; etiquetaFecha: string; pago: ResultadoPago; cobertura: CoberturaCartola | null }) {
  const aviso =
    pago.estado === "Sin cartola"
      ? cobertura
        ? `La cartola cargada va del ${fechaCl(cobertura.desde)} al ${fechaCl(cobertura.hasta)} y no cubre esa fecha: no se puede confirmar. Carga la cartola en Tesorería.`
        : "No hay movimientos de banco cargados: no se puede confirmar. Carga la cartola en Tesorería." 
      : pago.estado === "Pendiente"
        ? "Ya pasó la fecha y el pago no aparece en el banco."
        : pago.estado === "Parcial"
          ? `Falta ${clp(pago.saldo)} por pagar.`
          : null;
  return (
    <div className={`${TARJETA} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-tinta">{titulo}</h3>
        <Chip texto={pago.estado} tono={TONO_PAGO[pago.estado]} />
      </div>
      <p className="mt-2 font-condensed text-2xl font-bold tabular-nums text-tinta">{clp(pago.esperado)}</p>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
        <dt className="text-gris">{etiquetaFecha}</dt><dd className="text-right tabular-nums">{fechaCl(pago.fecha)}</dd>
        <dt className="text-gris">En el banco</dt><dd className="text-right tabular-nums">{clp(pago.pagado)}</dd>
      </dl>
      {aviso && <p className="mt-2 text-xs text-aviso">{aviso}</p>}
      {pago.movimientos.length > 0 && (
        <ul className="mt-2 divide-y divide-borde border-t border-borde text-xs">
          {pago.movimientos.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-1">
              <span className="tabular-nums text-gris">{fechaCl(m.fecha)}</span>
              <span className="min-w-0 flex-1 truncate" title={`${m.glosa} · ${m.cuenta}`}>{m.glosa}</span>
              <span className="tabular-nums">{clp(-m.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TablaLineas({ titulo, total, lineas }: { titulo: string; total: number; lineas: LineaResumen[] }) {
  return (
    <div className={`${TARJETA} overflow-hidden`}>
      <div className="flex items-baseline justify-between border-b border-borde px-3 py-2"><h3 className="text-sm font-bold text-tinta">{titulo}</h3><span className="text-xs font-semibold tabular-nums text-tinta">{clp(total)}</span></div>
      <table className="w-full">
        <tbody className="divide-y divide-borde">
          {lineas.map((l) => (
            <tr key={l.concepto}><td className={TD}>{l.concepto}</td><td className={`${TD} text-right text-xs text-gris`}>{l.personas}</td><td className={`${TD} text-right tabular-nums`}>{clp(l.monto)}</td></tr>
          ))}
          {lineas.length === 0 && <tr><td className={`${TD} text-gris`}>Sin movimientos.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Previsional({ grupos, total }: { grupos: GrupoPrevisional[]; total: number }) {
  return (
    <div className={`${TARJETA} overflow-hidden`}>
      <div className="flex items-baseline justify-between border-b border-borde px-3 py-2"><h3 className="text-sm font-bold text-tinta">Previred (a pagar)</h3><span className="text-xs font-semibold tabular-nums text-tinta">{clp(total)}</span></div>
      <table className="w-full">
        <tbody className="divide-y divide-borde">
          {grupos.map((g) => (
            <tr key={g.grupo}>
              <td className={TD}>
                <span className="font-semibold text-tinta">{g.grupo}</span>
                {g.detalle.length > 1 && <span className="block text-[11px] text-gris">{g.detalle.map((d) => `${d.concepto} ${clpCorto(d.monto)}`).join(" · ")}</span>}
              </td>
              <td className={`${TD} text-right tabular-nums`}>{clp(g.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
