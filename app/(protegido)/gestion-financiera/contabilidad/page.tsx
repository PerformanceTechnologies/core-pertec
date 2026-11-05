import Link from "next/link";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { RUTA_FIN, asientosGuardados, cargarVista, cuentasContables, entradaContable, estadoPeriodo } from "@/lib/fin/datos";
import { clp, fechaCl, finDeMes, inicioDeMes, mesLargo } from "@/lib/fin/reglas";
import { balanceComprobacion, estadoResultados, generarAsientos } from "@/lib/fin/contabilidad";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { TARJETA } from "@/lib/estilos";
import { cerrarPeriodoAction, contabilizarPeriodoAction } from "../acciones-tesoreria";
import { Banda, Pestanas, Seccion, TD, TH } from "@/components/fin/piezas";
import { BotonAccion } from "@/components/fin/ui";
import { BOTON } from "@/components/fin/estilos";

export const dynamic = "force-dynamic";

export default async function ContabilidadPage({ searchParams }: { searchParams: Promise<{ ver?: string; mes?: string }> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const desde = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : inicioDeMes(v.hoy);
  const hasta = finDeMes(desde);
  const [anio, mes] = [Number(desde.slice(0, 4)), Number(desde.slice(5, 7))];
  const [guardados, periodo, nombres] = await Promise.all([asientosGuardados(v.empresa.id, desde, hasta), estadoPeriodo(v.empresa.id, anio, mes), cuentasContables(v.empresa.id)]);
  const propuestos = generarAsientos(entradaContable(v), desde, hasta);
  const yaGuardados = new Set(guardados.map((a) => `${a.origenTipo}|${a.origenId}`));
  const pendientes = propuestos.filter((a) => !yaGuardados.has(`${a.origenTipo}|${a.origenId}`)).length;
  const base = guardados.length ? guardados : propuestos;
  const saldos = balanceComprobacion(base);
  const er = estadoResultados(saldos);
  const ver = sp.ver ?? "diario";
  const activa = Boolean(v.flags.contabilidad_activa);
  const meses = Array.from({ length: 12 }, (_, i) => inicioDeMes(v.hoy, -i));
  const libro = (dir: "emitido" | "recibido") => v.documentos.filter((d) => d.direccion === dir && d.estado === "vigente" && d.tipoDte !== 52 && d.fechaEmision >= desde && d.fechaEmision <= hasta);
  const signo = (d: { tipoDte: number }) => (d.tipoDte === 61 ? -1 : 1);
  const iva = (dir: "emitido" | "recibido") => libro(dir).reduce((s, d) => s + signo(d) * d.iva, 0);
  // Un documento que no cuadra (total ≠ neto + exento + IVA) no propone asiento: se avisa aquí en vez de omitirlo en silencio.
  const conAsiento = new Set(propuestos.map((a) => a.origenId));
  const descuadrados = [...libro("emitido"), ...libro("recibido")].filter((d) => !conAsiento.has(d.id));
  const url = (k: string) => `${RUTA_FIN}/contabilidad?ver=${k}&mes=${desde.slice(0, 7)}`;
  const nombre = (c: string) => nombres.get(c) ?? c;

  return (
    <div className="space-y-5">
      <Banda
        etiqueta={`Contabilidad · ${mesLargo(desde)}`}
        valor={clp(er.resultado)}
        bajada={activa ? "Contabilidad integrada: cada documento propone su asiento; al contabilizar el mes quedan guardados." : "Modo contador externo: aquí ves los libros de compra y venta, el IVA del mes y los asientos propuestos para el contador. Se activa la contabilidad integrada en Configuración."}
        cifras={[
          { etiqueta: "Ingresos", valor: clp(er.ingresos) },
          { etiqueta: "Costos y gastos", valor: clp(er.gastos) },
          { etiqueta: "IVA débito − crédito", valor: clp(iva("emitido") - iva("recibido")), detalle: "Estimación F29" },
          { etiqueta: "Período", valor: periodo.estado === "cerrado" ? "Cerrado" : "Abierto", alerta: periodo.estado !== "cerrado" && desde < inicioDeMes(v.hoy) },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2"><input type="hidden" name="ver" value={ver} /><select name="mes" defaultValue={desde.slice(0, 7)} className="rounded-lg border border-borde bg-superficie px-2.5 py-2 text-xs">{meses.map((m) => <option key={m} value={m.slice(0, 7)}>{mesLargo(m)}</option>)}</select><button className="rounded-lg border border-borde px-3 py-2 text-xs font-semibold">Ver</button></form>
        <Pestanas base={url("diario")} actual={ver} opciones={[{ clave: "diario", etiqueta: "Libro diario" }, { clave: "mayor", etiqueta: "Mayor" }, { clave: "balance", etiqueta: "Balance y EERR" }, { clave: "libros", etiqueta: "Libros compra/venta" }]} />
        <span className="flex-1" />
        {periodo.estado !== "cerrado" && activa && <BotonAccion accion={contabilizarPeriodoAction.bind(null, anio, mes)} className={BOTON} confirmar={`Contabilizar ${mesLargo(desde)}: se guardan los asientos propuestos que falten.`}>Contabilizar mes{pendientes > 0 ? ` (${pendientes})` : ""}</BotonAccion>}
        {periodo.estado !== "cerrado" ? (
          <BotonAccion accion={cerrarPeriodoAction.bind(null, anio, mes, true)} confirmar={`Cerrar ${mesLargo(desde)}: no se podrán registrar documentos con fecha en ese mes.`}><IconLock size={14} /> Cerrar período</BotonAccion>
        ) : (
          <BotonAccion accion={cerrarPeriodoAction.bind(null, anio, mes, false)} motivo="¿Por qué se reabre el período?"><IconLockOpen size={14} /> Reabrir</BotonAccion>
        )}
      </div>

      {descuadrados.length > 0 && (
        <div className="rounded-xl border-l-[3px] border-amber-500 bg-amber-500/[0.07] px-4 py-3 text-xs text-aviso">
          <p className="font-semibold">{descuadrados.length === 1 ? "Un documento no genera asiento" : `${descuadrados.length} documentos no generan asiento`}: su total no es neto + exento + IVA. Corrígelo antes de contabilizar.</p>
          <p className="mt-1">{descuadrados.map((d) => `${DTE_CORTO[d.tipoDte] ?? d.tipoDte} ${d.folio} · ${d.razonSocial ?? "—"} (total ${clp(d.total)}, neto + exento + IVA ${clp(d.neto + d.exento + d.iva)})`).join(" · ")}</p>
        </div>
      )}

      {ver === "diario" && (
        <Seccion titulo={guardados.length ? `Asientos contabilizados (${guardados.length})` : `Asientos propuestos (${propuestos.length})`}>
          <div className="space-y-2">
            {base.map((a, i) => (
              <div key={i} className={`${TARJETA} overflow-hidden`}>
                <p className="flex flex-wrap gap-2 border-b border-borde px-4 py-2 text-xs"><span className="font-semibold text-tinta">{"numero" in a ? a.numero : "Propuesto"}</span><span className="text-gris">{fechaCl(a.fecha)}</span><span className="flex-1 truncate text-tinta">{a.glosa}</span></p>
                <table className="w-full text-xs"><tbody>{a.lineas.map((l, k) => <tr key={k}><td className="px-4 py-1 font-mono text-gris">{l.cuenta}</td><td className="px-2 py-1">{nombre(l.cuenta)}</td><td className="px-4 py-1 text-right tabular-nums">{l.debe ? clp(l.debe) : ""}</td><td className="px-4 py-1 text-right tabular-nums">{l.haber ? clp(l.haber) : ""}</td></tr>)}</tbody></table>
              </div>
            ))}
            {base.length === 0 && <p className={`${TARJETA} p-6 text-center text-sm text-gris`}>Sin movimientos contables en el mes. Los movimientos «Por aclarar» no generan asiento.</p>}
          </div>
        </Seccion>
      )}
      {ver === "mayor" && (
        <div className="space-y-3">
          {saldos.map((s) => (
            <details key={s.cuenta} className={`${TARJETA} overflow-hidden`}>
              <summary className="flex cursor-pointer gap-3 px-4 py-2.5 text-sm"><span className="font-mono text-gris">{s.cuenta}</span><span className="flex-1 font-semibold text-tinta">{nombre(s.cuenta)}</span><span className="tabular-nums">D {clp(s.debe)}</span><span className="tabular-nums">H {clp(s.haber)}</span><span className="w-32 text-right font-bold tabular-nums">{clp(s.deudor - s.acreedor)}</span></summary>
              <ul className="border-t border-borde text-xs">{base.flatMap((a) => a.lineas.filter((l) => l.cuenta === s.cuenta).map((l, k) => <li key={`${a.glosa}${k}${a.fecha}`} className="flex gap-3 px-4 py-1"><span className="w-20 text-gris">{fechaCl(a.fecha)}</span><span className="flex-1 truncate">{a.glosa}</span><span className="w-28 text-right tabular-nums">{l.debe ? clp(l.debe) : ""}</span><span className="w-28 text-right tabular-nums">{l.haber ? clp(l.haber) : ""}</span></li>))}</ul>
            </details>
          ))}
        </div>
      )}
      {ver === "balance" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[40rem] text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>Cuenta</th><th className={`${TH} text-right`}>Debe</th><th className={`${TH} text-right`}>Haber</th><th className={`${TH} text-right`}>Deudor</th><th className={`${TH} text-right`}>Acreedor</th></tr></thead>
              <tbody className="divide-y divide-borde">{saldos.map((s) => <tr key={s.cuenta}><td className={TD}><span className="font-mono text-xs text-gris">{s.cuenta}</span> {nombre(s.cuenta)}</td><td className={`${TD} text-right tabular-nums`}>{clp(s.debe)}</td><td className={`${TD} text-right tabular-nums`}>{clp(s.haber)}</td><td className={`${TD} text-right tabular-nums`}>{s.deudor ? clp(s.deudor) : ""}</td><td className={`${TD} text-right tabular-nums`}>{s.acreedor ? clp(s.acreedor) : ""}</td></tr>)}</tbody>
              <tfoot><tr className="border-t-2 border-borde font-bold"><td className={TD}>Totales {saldos.reduce((t, s) => t + s.debe - s.haber, 0) === 0 ? "✓ cuadra" : "⚠ no cuadra"}</td><td className={`${TD} text-right tabular-nums`}>{clp(saldos.reduce((t, s) => t + s.debe, 0))}</td><td className={`${TD} text-right tabular-nums`}>{clp(saldos.reduce((t, s) => t + s.haber, 0))}</td><td className={`${TD} text-right tabular-nums`}>{clp(saldos.reduce((t, s) => t + s.deudor, 0))}</td><td className={`${TD} text-right tabular-nums`}>{clp(saldos.reduce((t, s) => t + s.acreedor, 0))}</td></tr></tfoot>
            </table>
          </div>
          <div className={`${TARJETA} space-y-2 p-5 text-sm`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gris">Estado de resultados</p>
            <p className="flex justify-between"><span>Ingresos</span><span className="tabular-nums">{clp(er.ingresos)}</span></p>
            <p className="flex justify-between"><span>Costos y gastos</span><span className="tabular-nums">− {clp(er.gastos)}</span></p>
            <p className="flex justify-between border-t border-borde pt-2 font-bold"><span>Resultado</span><span className={`tabular-nums ${er.resultado < 0 ? "text-alerta" : "text-ok"}`}>{clp(er.resultado)}</span></p>
          </div>
        </div>
      )}
      {ver === "libros" && (
        <div className="grid gap-5 xl:grid-cols-2">
          {(["emitido", "recibido"] as const).map((dir) => (
            <Seccion key={dir} titulo={dir === "emitido" ? `Libro de ventas · IVA débito ${clp(iva("emitido"))}` : `Libro de compras · IVA crédito ${clp(iva("recibido"))}`}>
              <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
                <table className="w-full min-w-[34rem] text-xs">
                  <thead><tr className="border-b border-borde"><th className={TH}>Doc.</th><th className={TH}>Fecha</th><th className={TH}>Contraparte</th><th className={`${TH} text-right`}>Neto</th><th className={`${TH} text-right`}>IVA</th><th className={`${TH} text-right`}>Total</th></tr></thead>
                  <tbody className="divide-y divide-borde">{libro(dir).map((d) => <tr key={d.id}><td className={TD}>{DTE_CORTO[d.tipoDte] ?? d.tipoDte} {d.folio}</td><td className={TD}>{fechaCl(d.fechaEmision)}</td><td className={`${TD} max-w-[12rem] truncate`}>{d.razonSocial} <span className="text-gris">{d.rutContraparte}</span></td><td className={`${TD} text-right tabular-nums`}>{clp(signo(d) * (d.neto + d.exento))}</td><td className={`${TD} text-right tabular-nums`}>{clp(signo(d) * d.iva)}</td><td className={`${TD} text-right tabular-nums`}>{clp(signo(d) * d.total)}</td></tr>)}</tbody>
                </table>
                {libro(dir).length === 0 && <p className="p-5 text-center text-xs text-gris">Sin documentos en el mes.</p>}
              </div>
            </Seccion>
          ))}
          <p className="text-[11px] text-gris xl:col-span-2">Cuadratura con el Registro de Compras y Ventas del SII: compara estos libros con la pantalla <Link href="/finanzas/sii" className="font-semibold text-naranjo">Facturas compra y venta</Link> del Core.</p>
        </div>
      )}
    </div>
  );
}
