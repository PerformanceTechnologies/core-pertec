import Link from "next/link";
import { IconAlertTriangle, IconArrowRight, IconCalendarStats, IconCheck, IconChartBar, IconClock, IconFolders, IconTargetArrow, IconUsers } from "@tabler/icons-react";
import { RUTA_FIN, cargarComercial, cargarVista } from "@/lib/fin/datos";
import { clp, clpCorto, diasEntre, fechaCl, mesLargo, sumarDias } from "@/lib/fin/reglas";
import { ETAPAS_OPORTUNIDAD } from "@/lib/fin/modelo";
import { TARJETA } from "@/lib/estilos";
import { COLOR_ETAPA, Kpi, Monto, Seccion } from "@/components/fin/piezas";

export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);

/** Tramos de antigüedad: por vencer, 1–30, 31–60, 61–90, más de 90 días. */
function aging(items: { vence: string | null; monto: number }[], hoy: string) {
  const t = [0, 0, 0, 0, 0];
  for (const x of items) {
    if (x.monto <= 0) continue;
    const d = x.vence ? diasEntre(x.vence, hoy) : 0;
    t[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4] += x.monto;
  }
  return t;
}
const TRAMOS = ["Por vencer", "1–30 días", "31–60", "61–90", "+90"];
const COLOR_TRAMO = ["#0ea5e9", "#f59e0b", "#f97316", "#e11d48", "#9f1239"];

export default async function ResumenFinanzasPage() {
  const [v, com] = await Promise.all([cargarVista(), cargarComercial()]);
  const d = v.dashboard;
  const holguras = v.flujo.meses.map((m) => m.holgura);
  // Sin cuentas no hay caja inicial: la proyección no es real y no debe alarmar.
  const sinCuentas = v.cuentas.length === 0;
  const peor = sinCuentas ? null : v.flujo.meses.reduce((a, b) => (b.holgura < a.holgura ? b : a), v.flujo.meses[0]);
  const mesActual = v.hoy.slice(0, 7);
  const ventasMes = v.documentos.filter((x) => x.direccion === "emitido" && x.estado === "vigente" && x.fechaEmision.startsWith(mesActual) && [33, 34].includes(x.tipoDte)).reduce((s, x) => s + x.neto + x.exento, 0);
  const anioPasado = `${Number(mesActual.slice(0, 4)) - 1}${mesActual.slice(4)}`;
  const ventasAnioPasado = v.documentos.filter((x) => x.direccion === "emitido" && x.estado === "vigente" && x.fechaEmision.startsWith(anioPasado) && [33, 34].includes(x.tipoDte)).reduce((s, x) => s + x.neto + x.exento, 0);
  const activos = v.proyectos.filter((p) => p.estado === "activo" && !p.esGeneral);
  const vendidoActivos = activos.reduce((s, p) => s + p.cifras.vendido, 0);
  const margenActivos = vendidoActivos ? activos.reduce((s, p) => s + p.cifras.margen, 0) / vendidoActivos : null;
  const nombre = (id: string | null) => (id ? v.nombreDe.get(id) ?? "—" : "Sin cliente");

  const agingCxc = aging(v.hitos.filter((h) => h.factura && !h.anulado).map((h) => ({ vence: h.vence, monto: h.saldo ?? 0 })), v.hoy);
  const agingCxp = aging(v.compras.filter((c) => c.facturaTotal !== null && !c.fechaPagoReal && !c.anulada).map((c) => ({ vence: c.facturaVence, monto: c.montoFlujo })), v.hoy);
  const maxEtapa = Math.max(...d.porEtapa.map((e) => e.monto), 1);
  const maxFlujo = Math.max(...v.flujo.meses.flatMap((m) => [m.totalEntradas, m.totalSalidas, Math.abs(m.cajaFinal), m.minimo]), 1);

  const abiertas = com.oportunidades.filter((o) => !["ganada", "perdida"].includes(o.etapa));
  const ponderado = abiertas.reduce((s, o) => s + (o.montoEstimado * o.probabilidad) / 100, 0);
  const cerradas = com.oportunidades.filter((o) => ["ganada", "perdida"].includes(o.etapa));
  const conversion = cerradas.length ? cerradas.filter((o) => o.etapa === "ganada").length / cerradas.length : null;

  // ── Atención hoy: lo que pide acción, priorizado ──
  const sinGestion = v.hitos.filter((h) => h.etapa === "Vencida" && (h.diasVencida ?? 0) > 7);
  const facturasSinOcPorReclamar = v.documentos.filter((x) => x.direccion === "recibido" && x.estado === "vigente" && x.diasParaReclamo !== null && x.diasParaReclamo >= 0 && v.compras.some((c) => c.paso === "Factura sin OC: regularizar" && c.documentoIds.includes(x.id)));
  const atencion = [
    { n: d.movimientosEscalar, texto: "movimientos del banco para escalar", href: `${RUTA_FIN}/tesoreria?ver=escalar`, tono: "rose" },
    { n: d.movimientosPorAclarar, texto: "movimientos por aclarar", href: `${RUTA_FIN}/tesoreria`, tono: "amber" },
    { n: d.facturasSinOc, texto: `facturas sin OC${facturasSinOcPorReclamar.length ? ` (la más urgente: ${Math.min(...facturasSinOcPorReclamar.map((x) => x.diasParaReclamo!))} días para reclamar)` : ""}`, href: `${RUTA_FIN}/compras`, tono: "rose" },
    { n: v.compras.filter((c) => c.paso === "Falta visado de Finanzas").length, texto: "compras esperando visado", href: `${RUTA_FIN}/compras?ver=visar`, tono: "amber" },
    { n: v.compras.filter((c) => c.paso === "Falta aprobación JP o gerente").length, texto: "compras esperando aprobación", href: `${RUTA_FIN}/compras?ver=aprobar`, tono: "amber" },
    { n: v.hitos.filter((h) => h.etapa === "Lista para facturar").length, texto: `hitos listos para facturar (${clpCorto(d.listoParaFacturar)})`, href: `${RUTA_FIN}/ventas?etapa=Lista para facturar`, tono: "naranjo" },
    { n: sinGestion.length, texto: "facturas vencidas hace más de 7 días", href: `${RUTA_FIN}/ventas?etapa=Vencida`, tono: "rose" },
    { n: v.cesiones.filter((c) => c.estado === "Cliente pagó: confirmar con el factor").length, texto: "cesiones: cliente pagó, confirmar con el factor", href: `${RUTA_FIN}/tesoreria?ver=factoring`, tono: "amber" },
    { n: v.hitos.filter((h) => h.tipoFlujo === "Por facturar" && h.fechaAceptacion && !h.fechaFlujo && !h.anulado).length, texto: "trabajos por facturar sin fecha estimada de pago", href: `${RUTA_FIN}/ventas?sinFecha=1`, tono: "slate" },
    { n: sinCuentas ? 0 : v.flujo.meses.filter((m) => m.alerta === "FALTA CAJA").length, texto: "meses con FALTA CAJA en la proyección", href: `${RUTA_FIN}/tesoreria?ver=flujo`, tono: "rose" },
  ].filter((x) => x.n > 0);

  // Primeros pasos: se muestran hasta que la empresa tenga cuentas, una cartola y algo registrado.
  const primerosPasos = [
    { titulo: "Crea tus cuentas", texto: "Banco, tarjeta y caja, con el saldo de hoy. La tarjeta va con su deuda en negativo.", listo: v.cuentas.length > 0, href: `${RUTA_FIN}/configuracion?ver=cuentas`, boton: "Crear cuentas" },
    { titulo: "Importa la cartola", texto: "El CSV o Excel que bajas del banco. Si la vuelves a subir, no se duplica.", listo: Boolean(v.ultimaImportacion) || v.movimientos.length > 0, href: `${RUTA_FIN}/tesoreria`, boton: "Ir a Tesorería" },
    { titulo: "Registra ventas y compras", texto: "Una oportunidad o cotización en Comercial, o una solicitud en Compras. El resumen se arma solo.", listo: v.hitos.length > 0 || v.compras.length > 0 || com.oportunidades.length > 0, href: `${RUTA_FIN}/comercial`, boton: "Ir a Comercial" },
  ];
  const listos = primerosPasos.filter((x) => x.listo).length;

  return (
    <div className="space-y-7">
      {listos < primerosPasos.length && (
        <section className={`${TARJETA} border-naranjo/40 p-5`}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-tinta">Primeros pasos en {v.empresa.nombre}</p>
              <p className="text-sm text-gris">Tres cosas y el módulo queda andando. Cada una se marca sola cuando está hecha.</p>
            </div>
            <span className="text-xs font-semibold tabular-nums text-gris">{listos} de {primerosPasos.length}</span>
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-tinta/[0.06]"><span className="block h-full rounded-full bg-naranjo transition-all" style={{ width: `${(listos / primerosPasos.length) * 100}%` }} /></span>
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {primerosPasos.map((x, i) => {
              const actual = !x.listo && primerosPasos.slice(0, i).every((y) => y.listo);
              return (
                <li key={x.titulo} className={`flex gap-3 rounded-xl border p-4 ${actual ? "border-naranjo/50 bg-naranjo/[0.05]" : "border-borde"}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${x.listo ? "bg-emerald-500/15 text-ok" : actual ? "bg-naranjo text-white" : "bg-tinta/[0.06] text-gris"}`}>
                    {x.listo ? <IconCheck size={15} stroke={2.5} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold ${x.listo ? "text-gris line-through decoration-1" : "text-tinta"}`}>{x.titulo}</p>
                    <p className="mt-0.5 text-xs text-gris">{x.texto}</p>
                    {!x.listo && (
                      <Link href={x.href} className={`mt-2.5 inline-flex items-center gap-1 text-xs font-bold ${actual ? "text-naranjo" : "text-gris hover:text-tinta"}`}>
                        {x.boton} <IconArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ── Fila 1: KPIs ── */}
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo"><span className="h-px w-6 bg-naranjo" /> Caja en bancos hoy</span>
            <p className="texto-banda mt-3 font-condensed text-5xl font-bold leading-none tabular-nums">{clp(d.cajaBancos)}</p>
            <p className="texto-banda-65 mt-2 text-sm">
              Deuda tarjeta {clp(d.deudaTarjeta)} · {v.ultimaImportacion ? `banco actualizado el ${fechaCl(v.ultimaImportacion.slice(0, 10))}` : "aún no se importa ninguna cartola"}
            </p>
          </div>
          <div className={`rounded-xl border px-5 py-3 ${peor && peor.holgura < 0 ? "border-rose-400/50 bg-rose-500/[0.15]" : "borde-banda bg-white/[0.03]"}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${peor && peor.holgura < 0 ? "text-rose-300" : "texto-banda-45"}`}>Holgura mínima próximos {v.flujo.meses.length} meses</p>
            <p className="texto-banda mt-1 font-condensed text-3xl font-bold tabular-nums">{peor ? clp(Math.min(...holguras)) : "—"}</p>
            {!peor && <p className="texto-banda-45 text-[11px]">Crea tus cuentas en Configuración para proyectar la caja</p>}
            {peor && <p className="texto-banda-45 text-[11px]">en {mesLargo(peor.mes)} · mínimo de caja {clpCorto(v.p.minimoCaja)}</p>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi etiqueta="Por cobrar (con IVA)" valor={clpCorto(d.porCobrar)} detalle={<>vencido <Monto valor={d.porCobrarVencido} corto /> · cedido <Monto valor={d.porCobrarCedido} corto /></>} href={`${RUTA_FIN}/ventas?ver=facturas`} ayuda="Saldo de facturas emitidas no pagadas, con IVA" />
        <Kpi etiqueta="Terminado sin facturar" valor={clpCorto(d.terminadoSinFacturar)} detalle={<>listo hoy <Monto valor={d.listoParaFacturar} corto /></>} href={`${RUTA_FIN}/ventas?etapa=Lista para facturar`} tono={d.listoParaFacturar > 0 ? "text-naranjo" : "text-tinta"} ayuda="Hitos terminados esperando EDP, OC, HES o listos para facturar (con IVA)" />
        <Kpi etiqueta="Por pagar" valor={clpCorto(d.porPagar)} detalle={<>vencido <Monto valor={d.porPagarVencido} corto /> · 30 días <Monto valor={d.porPagar30} corto /></>} href={`${RUTA_FIN}/compras?ver=facturas`} ayuda="Facturas de proveedores recibidas y no pagadas" />
        <Kpi etiqueta="Factoring vigente" valor={clpCorto(d.cedidasVigentes)} detalle={`anticipos ${clpCorto(d.anticiposVigentes)} · ${d.facturasEnMora} en mora`} href={`${RUTA_FIN}/tesoreria?ver=factoring`} ayuda="Nominal de facturas cedidas sin liquidar" />
        <Kpi etiqueta="Ventas del mes (neto)" valor={clpCorto(ventasMes)} detalle={`mismo mes año anterior ${clpCorto(ventasAnioPasado)}`} href={`${RUTA_FIN}/ventas?ver=facturas`} ayuda="Facturado neto del mes en curso" />
        <Kpi etiqueta="Margen proyectos activos" valor={pct(margenActivos)} detalle={`vendido ${clpCorto(vendidoActivos)}`} href={`${RUTA_FIN}/proyectos`} ayuda="(Vendido − compras comprometidas) / vendido, sin mano de obra propia" />
      </div>

      {/* ── Atención hoy ── */}
      <Seccion titulo="Atención hoy" icono={<IconAlertTriangle size={15} />}>
        {atencion.length === 0 ? (
          <p className={`${TARJETA} px-4 py-3 text-sm text-ok dark:text-emerald-300`}>Nada pendiente que pida acción hoy. ✓</p>
        ) : (
          <ul className={`${TARJETA} divide-y divide-borde`}>
            {atencion.map((a) => (
              <li key={a.texto}>
                <Link href={a.href} className="group flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-tinta/[0.02]">
                  <span className={`grid h-7 min-w-7 place-items-center rounded-lg px-1.5 font-condensed text-base font-bold tabular-nums ${a.tono === "rose" ? "bg-rose-500/12 text-alerta" : a.tono === "amber" ? "bg-amber-500/15 text-aviso" : a.tono === "naranjo" ? "bg-naranjo/15 text-naranjo" : "bg-slate-500/10 text-gris"}`}>{a.n}</span>
                  <span className="flex-1 text-tinta">{a.texto}</span>
                  <IconArrowRight size={15} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* ── Proyección y embudo ── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Seccion titulo={`Proyección de caja · ${v.flujo.meses.length} meses`} icono={<IconCalendarStats size={15} />} accion={<Link href={`${RUTA_FIN}/tesoreria?ver=flujo`} className="text-xs font-semibold text-naranjo hover:underline">Ver flujo</Link>}>
          <div className={`${TARJETA} p-5`}>
            <div className="grid grid-cols-3 gap-4">
              {v.flujo.meses.map((m) => (
                <div key={m.mes} className="flex flex-col items-center gap-2">
                  <div className="relative flex h-44 w-full items-end justify-center gap-1.5">
                    <div className="w-5 rounded-t bg-emerald-500/80" style={{ height: `${(m.totalEntradas / maxFlujo) * 100}%` }} title={`Entradas ${clp(m.totalEntradas)}`} />
                    <div className="w-5 rounded-t bg-rose-500/70" style={{ height: `${(m.totalSalidas / maxFlujo) * 100}%` }} title={`Salidas ${clp(m.totalSalidas)}`} />
                    <div className={`w-5 rounded-t ${m.cajaFinal < m.minimo ? "bg-rose-600" : "bg-naranjo"}`} style={{ height: `${(Math.max(0, m.cajaFinal) / maxFlujo) * 100}%` }} title={`Caja final ${clp(m.cajaFinal)}`} />
                    <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-tinta/30" style={{ bottom: `${(m.minimo / maxFlujo) * 100}%` }} title={`Mínimo ${clp(m.minimo)}`} />
                  </div>
                  <p className="text-xs font-bold text-tinta first-letter:uppercase">{mesLargo(m.mes)}</p>
                  {sinCuentas ? <p className="text-[11px] text-gris">Sin cuentas creadas</p> : <p className={`text-[11px] font-semibold tabular-nums ${m.holgura < 0 ? "text-alerta" : "text-ok"}`}>{m.alerta === "OK" ? "Holgura" : "FALTA CAJA"} {clpCorto(m.holgura)}</p>}
                </div>
              ))}
            </div>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-borde pt-3 text-[11px] text-gris">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> Entradas</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500/70" /> Salidas</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-naranjo" /> Caja final</span>
              <span className="inline-flex items-center gap-1"><span className="h-0 w-3 border-t-2 border-dashed border-tinta/40" /> Mínimo de caja</span>
            </p>
          </div>
        </Seccion>

        <Seccion titulo="Ventas por etapa" icono={<IconChartBar size={15} />}>
          <div className={`${TARJETA} space-y-2 p-5`}>
            {d.porEtapa.map((e) => (
              <Link key={e.etapa} href={`${RUTA_FIN}/ventas?etapa=${encodeURIComponent(e.etapa)}`} className="group block">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-tinta group-hover:text-naranjo">{e.etapa}</span>
                  <span className="tabular-nums text-gris">{e.n}</span>
                  <span className="w-16 text-right font-semibold tabular-nums text-tinta">{clpCorto(e.monto)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${(e.monto / maxEtapa) * 100}%`, background: COLOR_ETAPA[e.etapa] }} />
                </div>
              </Link>
            ))}
          </div>
        </Seccion>
      </div>

      {/* ── Aging ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[{ t: "Antigüedad de cuentas por cobrar", a: agingCxc }, { t: "Antigüedad de cuentas por pagar", a: agingCxp }].map(({ t, a }) => {
          const total = a.reduce((s, x) => s + x, 0);
          return (
            <Seccion key={t} titulo={t} icono={<IconClock size={15} />}>
              <div className={`${TARJETA} p-5`}>
                <div className="flex h-4 overflow-hidden rounded-full bg-tinta/[0.06]">
                  {a.map((x, i) => (x > 0 ? <div key={i} style={{ width: `${(x / (total || 1)) * 100}%`, background: COLOR_TRAMO[i] }} title={`${TRAMOS[i]}: ${clp(x)}`} /> : null))}
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                  {a.map((x, i) => (
                    <div key={i}>
                      <p className="text-[10px] text-gris">{TRAMOS[i]}</p>
                      <p className="text-xs font-bold tabular-nums" style={{ color: x > 0 ? COLOR_TRAMO[i] : undefined }}>{clpCorto(x)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Seccion>
          );
        })}
      </div>

      {/* ── Mandantes y proyectos ── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Seccion titulo="Saldos por mandante" icono={<IconUsers size={15} />}>
          <div className={`${TARJETA} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris"><th className="px-4 py-2.5">Mandante</th><th className="px-3 py-2.5 text-right">Terminado sin facturar</th><th className="px-3 py-2.5 text-right">Por cobrar</th><th className="px-4 py-2.5 text-right">Vencido</th></tr></thead>
              <tbody className="divide-y divide-borde">
                {d.porMandante.filter((m) => m.terminadoSinFacturar || m.porCobrar).sort((a, b) => b.porCobrar + b.terminadoSinFacturar - a.porCobrar - a.terminadoSinFacturar).slice(0, 10).map((m) => (
                  <tr key={m.clienteId ?? "-"}>
                    <td className="max-w-[14rem] truncate px-4 py-2 font-semibold text-tinta">{nombre(m.clienteId)}</td>
                    <td className="px-3 py-2 text-right"><Monto valor={m.terminadoSinFacturar} corto /></td>
                    <td className="px-3 py-2 text-right"><Monto valor={m.porCobrar} corto /></td>
                    <td className="px-4 py-2 text-right"><Monto valor={m.vencido} corto tono={m.vencido ? "text-alerta font-semibold" : ""} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.porMandante.length === 0 && <p className="p-6 text-center text-xs text-gris">Sin hitos todavía.</p>}
          </div>
        </Seccion>
        <Seccion titulo="Rentabilidad por proyecto" icono={<IconFolders size={15} />}>
          <ul className={`${TARJETA} divide-y divide-borde`}>
            {activos.sort((a, b) => b.cifras.vendido - a.cifras.vendido).slice(0, 8).map((p) => {
              const uso = p.presupuestoCostos ? p.cifras.comprometido / p.presupuestoCostos : null;
              return (
                <li key={p.id}>
                  <Link href={`${RUTA_FIN}/proyectos/${p.id}`} className="block px-4 py-2.5 hover:bg-tinta/[0.02]">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold text-tinta">{p.nombre}</span>
                      <span className="text-xs tabular-nums text-gris">vendido {clpCorto(p.cifras.vendido)}</span>
                      <span className={`w-14 text-right text-xs font-bold tabular-nums ${(p.cifras.margenPct ?? 0) < 0.2 ? "text-alerta" : "text-ok"}`}>{pct(p.cifras.margenPct)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
                      {uso === null ? <div className="h-full w-full bg-slate-300/40" title="Sin presupuesto" /> : <div className={`h-full rounded-full ${uso > 1 ? "bg-rose-500" : uso > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, uso * 100)}%` }} title={`Presupuesto usado ${pct(uso)}`} />}
                    </div>
                  </Link>
                </li>
              );
            })}
            {activos.length === 0 && <li className="p-6 text-center text-xs text-gris">Sin proyectos activos.</li>}
          </ul>
        </Seccion>
      </div>

      {/* ── CRM ── */}
      <Seccion titulo="Pipeline comercial" icono={<IconTargetArrow size={15} />} accion={<Link href={`${RUTA_FIN}/comercial`} className="text-xs font-semibold text-naranjo hover:underline">Ver oportunidades</Link>}>
        <div className={`${TARJETA} grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_14rem]`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ETAPAS_OPORTUNIDAD.filter((e) => !["ganada", "perdida"].includes(e.clave)).map((e) => {
              const xs = abiertas.filter((o) => o.etapa === e.clave);
              return (
                <div key={e.clave} className="rounded-xl border border-borde px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gris">{e.etiqueta} · {e.probabilidad}%</p>
                  <p className="font-condensed text-xl font-bold tabular-nums text-tinta">{clpCorto(xs.reduce((s, o) => s + o.montoEstimado, 0))}</p>
                  <p className="text-[11px] text-gris">{xs.length} oportunidad{xs.length === 1 ? "" : "es"}</p>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl bg-naranjo/[0.07] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-naranjo">Forecast ponderado</p>
            <p className="font-condensed text-2xl font-bold tabular-nums text-tinta">{clpCorto(ponderado)}</p>
            <p className="text-[11px] text-gris">Tasa de conversión {pct(conversion)} · cierres próximos 30 días: {abiertas.filter((o) => o.fechaCierre && o.fechaCierre <= sumarDias(v.hoy, 30)).length}</p>
          </div>
        </div>
      </Seccion>
    </div>
  );
}
