import Link from "next/link";
import { IconBuildingBank, IconCreditCard, IconPlus } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista } from "@/lib/fin/datos";
import { CONCEPTOS_MANUALES, clp, clpCorto, fechaCl, finDeMes, mesLargo, type MesFlujo } from "@/lib/fin/reglas";
import { TARJETA } from "@/lib/estilos";
import { actualizarSaldoAction, guardarPartidaAction } from "../acciones-config";
import { actualizarCesionAction, crearMovimientoAction, crearOperacionFactoringAction } from "../acciones-tesoreria";
import { Banda, Chip, Deshabilitado, Monto, Pestanas, Seccion, TD, TH, Vacio, tonoFactoring } from "@/components/fin/piezas";
import { BOTON_SEC, CAMPO, Campo, CampoEnLinea, ConVentana, FormAccion } from "@/components/fin/ui";
import BandejaBanco, { ImportarCartola } from "@/components/fin/BandejaBanco";

export const dynamic = "force-dynamic";

export default async function TesoreriaPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const ver = sp.ver ?? "banco";
  const porAclarar = v.movimientos.filter((m) => m.estado === "Por aclarar");
  const pestanaBanco = ["banco", "sugeridos", "conciliados", "escalar"].includes(ver);
  const movs =
    ver === "sugeridos" ? v.movimientos.filter((m) => m.sugerencia && !m.categoriaId)
    : ver === "conciliados" ? v.movimientos.filter((m) => m.estado !== "Por aclarar")
    : ver === "escalar" ? v.movimientos.filter((m) => m.escalar)
    : porAclarar;
  const facturasAbiertas = v.documentos
    .filter((d) => d.direccion === "emitido" && d.estado === "vigente" && [33, 34, 56].includes(d.tipoDte) && d.saldo > 0 && !d.cedido)
    .map((d) => ({ id: d.id, folio: d.folio, clienteId: d.contraparteId, clienteNombre: d.razonSocial, fechaEmision: d.fechaEmision, vence: d.fechaVencimiento, saldo: d.saldo }));
  const pagosProgramados = v.pagos.filter((p) => p.estado === "programado").map((p) => ({ id: p.id, numero: p.numero, monto: p.monto, proveedor: p.proveedorId ? v.nombreDe.get(p.proveedorId) ?? null : null, fecha: p.fechaProgramada }));
  const cuentasActivas = v.cuentas.filter((c) => c.activa);

  return (
    <div className="space-y-5">
      <Banda
        etiqueta="Tesorería"
        valor={clp(v.cajaBancos)}
        bajada="Caja en bancos según el banco. La rutina diaria: cargar la cartola de ayer, categorizar y ligar, y asignar a quién preguntar lo que no se reconoce."
        cifras={[
          { etiqueta: "Por aclarar", valor: String(porAclarar.length), detalle: clp(v.dashboard.montoPorAclarar), alerta: porAclarar.length > 0 },
          { etiqueta: "Para escalar", valor: String(v.dashboard.movimientosEscalar), alerta: v.dashboard.movimientosEscalar > 0 },
          { etiqueta: "Deuda tarjeta", valor: clpCorto(v.deudaTarjeta) },
          { etiqueta: "Factoring vigente", valor: clpCorto(v.dashboard.cedidasVigentes) },
        ]}
      />

      <Pestanas
        base={`${RUTA_FIN}/tesoreria`}
        actual={pestanaBanco ? "banco" : ver}
        opciones={[{ clave: "banco", etiqueta: "Banco diario", n: porAclarar.length }, { clave: "factoring", etiqueta: "Factoring", n: v.cesiones.filter((c) => c.estado !== "Liquidada").length }, { clave: "flujo", etiqueta: "Flujo de caja" }]}
      />

      {pestanaBanco && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cuentasActivas.map((c) => (
              <div key={c.id} className={`${TARJETA} p-4`}>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gris">{c.tipo === "tarjeta" ? <IconCreditCard size={14} /> : <IconBuildingBank size={14} />} {c.nombre} {c.numeroEnmascarado}</p>
                <p className="mt-1 font-condensed text-2xl font-bold tabular-nums text-tinta">{clp(c.saldoBanco)}</p>
                <p className="text-[11px] text-gris">según banco al {fechaCl(c.fechaSaldo)}{c.saldoCalculado !== c.saldoBanco && <> · calculado {clp(c.saldoCalculado)}</>}</p>
                <ConVentana boton="Actualizar saldo" titulo={`Saldo de ${c.nombre}`} className="mt-2 text-[11px] font-semibold text-naranjo hover:underline">
                  {(cerrar) => (
                    <FormAccion accion={actualizarSaldoAction.bind(null, c.id)} textoBoton="Guardar" alOk={cerrar}>
                      <Campo etiqueta={c.tipo === "tarjeta" ? "Saldo (negativo = deuda)" : "Saldo según el banco"}><input name="saldoBanco" defaultValue={c.saldoBanco} className={CAMPO} /></Campo>
                      <Campo etiqueta="Al día"><input name="fechaSaldo" type="date" defaultValue={v.hoy} className={CAMPO} /></Campo>
                    </FormAccion>
                  )}
                </ConVentana>
              </div>
            ))}
            {cuentasActivas.length === 0 && <Vacio titulo="Sin cuentas" texto="Crea tus cuentas de banco y tarjeta en Configuración." />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ImportarCartola cuentas={cuentasActivas.map((c) => ({ id: c.id, nombre: c.nombre }))} />
            <span className="flex-1" />
            <ConVentana boton={<><IconPlus size={15} /> Movimiento a mano</>} titulo="Agregar movimiento" className={BOTON_SEC}>
              {(cerrar) => (
                <FormAccion accion={crearMovimientoAction} textoBoton="Agregar" alOk={cerrar}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta="Cuenta"><select name="cuentaId" className={CAMPO}>{cuentasActivas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
                    <Campo etiqueta="Fecha"><input name="fecha" type="date" defaultValue={v.hoy} className={CAMPO} /></Campo>
                    <Campo etiqueta="Glosa del banco" className="sm:col-span-2"><input name="glosa" required className={CAMPO} /></Campo>
                    <Campo etiqueta="Monto" ayuda="+ abono / − cargo"><input name="monto" required className={CAMPO} placeholder="-185000" /></Campo>
                    <Campo etiqueta="N° documento"><input name="numeroDocumento" className={CAMPO} /></Campo>
                  </div>
                </FormAccion>
              )}
            </ConVentana>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[["banco", `Por aclarar · ${porAclarar.length}`], ["sugeridos", `Sugeridos · ${v.movimientos.filter((m) => m.sugerencia && !m.categoriaId).length}`], ["escalar", `Escalar · ${v.dashboard.movimientosEscalar}`], ["conciliados", "Conciliados"]].map(([k, t]) => (
              <Link key={k} href={k === "banco" ? `${RUTA_FIN}/tesoreria` : `${RUTA_FIN}/tesoreria?ver=${k}`} scroll={false} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${ver === k ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:text-tinta"}`}>{t}</Link>
            ))}
          </div>
          {movs.length === 0 ? (
            <Vacio titulo={v.movimientos.length ? "Nada en esta bandeja ✓" : "Aún no hay movimientos"} texto={v.movimientos.length ? undefined : "Importa tu primera cartola (CSV o Excel del banco o de la tarjeta)."} />
          ) : (
            <BandejaBanco
              movimientos={movs.slice(0, 300)}
              categorias={v.categorias.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre, requiereProyecto: c.requiereProyecto }))}
              proyectos={v.proyectos.filter((p) => p.estado === "activo").map((p) => ({ id: p.id, nombre: p.nombre }))}
              facturas={facturasAbiertas}
              pagos={pagosProgramados}
              cuentasBanco={cuentasActivas.filter((c) => c.tipo === "banco").map((c) => ({ id: c.id, nombre: c.nombre }))}
              hoy={v.hoy}
            />
          )}
        </>
      )}

      {ver === "factoring" && <Factoring v={v} />}
      {ver === "flujo" && <FlujoCaja v={v} />}
    </div>
  );
}

type V = Awaited<ReturnType<typeof cargarVista>>;

function Factoring({ v }: { v: V }) {
  const cedibles = v.documentos.filter((d) => d.direccion === "emitido" && d.estado === "vigente" && [33, 34].includes(d.tipoDte) && !d.cedido && d.saldo > 0);
  const vigentes = v.cesiones.filter((c) => c.estado !== "Liquidada");
  const porFactor = [...new Set(vigentes.map((c) => c.factorNombre))].map((f) => {
    const xs = vigentes.filter((c) => c.factorNombre === f);
    return { f, nominal: xs.reduce((s, c) => s + c.nominal, 0), anticipos: xs.reduce((s, c) => s + c.anticipo, 0), mora: xs.reduce((s, c) => s + c.moraEstimada, 0), excedentes: xs.reduce((s, c) => s + c.montoFlujo, 0) };
  });
  const guardar = (id: string, campo: string) => actualizarCesionAction.bind(null, id, campo);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-gris">Una fila por factura cedida. La fecha real de pago del cliente es la clave para confirmar con el factor y no pagar mora que no corresponde.</p>
        <Deshabilitado motivo="Disponible al integrar facturación electrónica" clase={BOTON_SEC}>Ceder electrónicamente</Deshabilitado>
        <ConVentana boton={<><IconPlus size={15} /> Nueva operación</>} titulo="Nueva operación de factoring" ancho="max-w-3xl">
          {(cerrar) =>
            v.factores.length === 0 ? (
              <p className="text-sm text-gris">Primero crea el factor en Configuración.</p>
            ) : (
              <FormAccion accion={crearOperacionFactoringAction} textoBoton="Ceder facturas" alOk={cerrar}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo etiqueta="Factor"><select name="factorId" className={CAMPO}>{v.factores.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre} · {Math.round(f.pctAnticipoDefault * 100)}%</option>)}</select></Campo>
                  <Campo etiqueta="N° operación (liquidación)"><input name="numero" className={CAMPO} placeholder="Vacío = correlativo" /></Campo>
                  <Campo etiqueta="Recurso"><select name="recurso" className={CAMPO}><option value="con">Con recurso</option><option value="sin">Sin recurso</option></select></Campo>
                  <Campo etiqueta="Fecha cesión"><input name="fechaCesion" type="date" defaultValue={v.hoy} className={CAMPO} /></Campo>
                  <Campo etiqueta="% anticipo" ayuda="Vacío = el del factor"><input name="pctAnticipo" className={CAMPO} placeholder="90" /></Campo>
                  <Campo etiqueta="Costo cobrado (interés + comisión + gastos)"><input name="costoTotal" className={CAMPO} /></Campo>
                  <Campo etiqueta="Fecha anticipo recibido"><input name="fechaAnticipo" type="date" className={CAMPO} /></Campo>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-gris">Facturas a ceder (vigentes, con saldo, no cedidas)</p>
                  <ul className="max-h-64 divide-y divide-borde overflow-auto rounded-xl border border-borde">
                    {cedibles.map((d) => (
                      <li key={d.id}><label className="flex items-center gap-3 px-3 py-2 text-sm"><input type="checkbox" name="documentoIds" value={d.id} /><span className="flex-1">N° {d.folio} · {d.razonSocial}</span><span className="tabular-nums text-gris">{clp(d.saldo)}</span></label></li>
                    ))}
                    {cedibles.length === 0 && <li className="px-3 py-4 text-xs text-gris">No hay facturas que ceder.</li>}
                  </ul>
                </div>
              </FormAccion>
            )
          }
        </ConVentana>
      </div>

      {porFactor.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {porFactor.map((x) => (
            <div key={x.f} className={`${TARJETA} p-4`}>
              <p className="font-bold text-tinta">{x.f}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-gris">Nominal vigente</dt><dd className="font-semibold tabular-nums">{clp(x.nominal)}</dd></div>
                <div><dt className="text-gris">Anticipos vigentes</dt><dd className="font-semibold tabular-nums">{clp(x.anticipos)}</dd></div>
                <div><dt className="text-gris">Mora estimada</dt><dd className={`font-semibold tabular-nums ${x.mora ? "text-alerta" : ""}`}>{clp(x.mora)}</dd></div>
                <div><dt className="text-gris">Excedentes por recibir</dt><dd className="font-semibold tabular-nums text-ok">{clp(x.excedentes)}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {v.cesiones.length === 0 ? (
        <Vacio titulo="Sin facturas cedidas" texto="Crea una operación eligiendo las facturas que cediste." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[86rem] text-sm">
            <thead><tr className="border-b border-borde"><th className={TH}>Operación</th><th className={TH}>Factura</th><th className={`${TH} text-right`}>Nominal</th><th className={`${TH} text-right`}>Anticipo / neto</th><th className={TH}>Vence / estimada</th><th className={TH}>Pago real cliente</th><th className={TH}>Factor confirma</th><th className={TH}>Mora</th><th className={`${TH} text-right`}>Excedente</th><th className={TH}>Excedente recibido</th><th className={TH}>Estado</th></tr></thead>
            <tbody className="divide-y divide-borde">
              {v.cesiones.map((c) => (
                <tr key={c.id}>
                  <td className={`${TD} text-xs`}><span className="font-semibold text-tinta">{c.operacionNumero}</span><span className="block text-gris">{c.factorNombre} · {c.recurso === "con" ? "con" : "sin"} recurso · {fechaCl(c.fechaCesion)}</span></td>
                  <td className={`${TD} text-xs`}>N° {c.folio}<span className="block max-w-[12rem] truncate text-gris">{c.clienteNombre}</span></td>
                  <td className={`${TD} text-right`}><Monto valor={c.nominal} /></td>
                  <td className={`${TD} text-right text-xs`}><Monto valor={c.anticipo} /><span className="block text-gris">neto {clp(c.netoRecibido)}</span></td>
                  <td className={`${TD} text-xs text-gris`}>{fechaCl(c.vence)}<span className="block">est. {fechaCl(c.fechaEstimadaPago)}</span></td>
                  <td className={TD}><CampoEnLinea tipo="date" valor={c.fechaPagoReal} guardar={guardar(c.id, "fecha_pago_cliente")} ancho="w-32" /></td>
                  <td className={TD}><CampoEnLinea tipo="date" valor={c.factorConfirmaFecha} guardar={guardar(c.id, "factor_confirma_fecha")} ancho="w-32" /></td>
                  <td className={`${TD} text-xs`}>{c.diasMora ? <span className="text-alerta">{c.diasMora} d · {clp(c.moraEstimada)}</span> : "—"}<div className="mt-1"><CampoEnLinea valor={c.moraCobrada === null ? null : String(c.moraCobrada)} guardar={guardar(c.id, "mora_cobrada")} placeholder="cobrada" ancho="w-24" /></div></td>
                  <td className={`${TD} text-right`}><Monto valor={c.excedenteEsperado} /></td>
                  <td className={TD}><CampoEnLinea tipo="date" valor={c.excedenteRecibidoFecha} guardar={guardar(c.id, "excedente_fecha")} ancho="w-32" /></td>
                  <td className={TD}><Chip texto={c.estado} tono={tonoFactoring(c.estado)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FlujoCaja({ v }: { v: V }) {
  const f = v.flujo;
  const enMes = (fecha: string | null, i: number) => Boolean(fecha && (i === 0 ? fecha <= finDeMes(f.meses[0].mes) : fecha >= f.meses[i].mes && fecha <= finDeMes(f.meses[i].mes)));
  const detalle = {
    cobrosFacturadas: (i: number) => v.hitos.filter((h) => h.tipoFlujo === "Facturada" && h.montoFlujo && enMes(h.fechaFlujo, i)).map((h) => ({ t: `${h.codigo} · ${h.clienteNombre ?? ""} · N° ${h.factura?.folio}`, m: h.montoFlujo, f: h.fechaFlujo, href: `${RUTA_FIN}/ventas/hito/${h.id}` })),
    cobrosPorFacturar: (i: number) => v.hitos.filter((h) => h.tipoFlujo === "Por facturar" && h.montoFlujo && enMes(h.fechaFlujo, i)).map((h) => ({ t: `${h.codigo} · ${h.clienteNombre ?? ""} · ${h.etapa}`, m: h.montoFlujo, f: h.fechaFlujo, href: `${RUTA_FIN}/ventas/hito/${h.id}` })),
    excedentesFactoring: (i: number) => v.cesiones.filter((c) => c.montoFlujo && enMes(c.fechaFlujo, i)).map((c) => ({ t: `Op. ${c.operacionNumero} · N° ${c.folio}`, m: c.montoFlujo, f: c.fechaFlujo, href: `${RUTA_FIN}/tesoreria?ver=factoring` })),
    pagosProveedores: (i: number) => v.compras.filter((c) => c.montoFlujo && enMes(c.fechaFlujo, i)).map((c) => ({ t: `${c.codigo} · ${c.proveedorNombre ?? ""} · ${c.paso}`, m: c.montoFlujo, f: c.fechaFlujo, href: `${RUTA_FIN}/compras?q=${c.codigo}` })),
  } as const;
  const fila = (etiqueta: string, clave: keyof MesFlujo, signo: "+" | "−" | "", calc?: keyof typeof detalle, manual?: string, fuerte = false) => (
    <tr className={fuerte ? "bg-tinta/[0.03] font-bold" : ""}>
      <td className="px-4 py-2 text-sm text-tinta">{signo && <span className="mr-1 text-gris">{signo}</span>}{etiqueta}{manual && <span className="ml-1.5 rounded bg-amber-400/20 px-1 text-[10px] font-semibold text-aviso">manual</span>}</td>
      {f.meses.map((m, i) => (
        <td key={m.mes} className={`px-3 py-2 text-right text-sm tabular-nums ${manual ? "bg-amber-300/[0.08]" : ""}`}>
          {calc && Number(m[clave]) ? (
            <details className="group relative inline-block text-left">
              <summary className="cursor-pointer list-none text-right hover:text-naranjo [&::-webkit-details-marker]:hidden">{clp(Number(m[clave]))}</summary>
              <ul className="absolute right-0 z-30 mt-1 w-80 rounded-xl border border-borde bg-superficie p-2 text-xs font-normal shadow-xl">
                {detalle[calc](i).map((x, k) => <li key={k}><a href={x.href} className="flex gap-2 rounded px-2 py-1 hover:bg-tinta/[0.04]"><span className="flex-1 truncate">{x.t}</span><span className="text-gris">{fechaCl(x.f)}</span><span className="tabular-nums">{clpCorto(x.m)}</span></a></li>)}
              </ul>
            </details>
          ) : manual ? (
            <CampoManual mes={m.mes} concepto={manual} valor={Number(m[clave])} />
          ) : (
            <span className={Number(m[clave]) < 0 ? "text-alerta" : ""}>{typeof m[clave] === "number" ? clp(Number(m[clave])) : String(m[clave])}</span>
          )}
        </td>
      ))}
    </tr>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-gris">Parte con la caja real de hoy, suma lo que se espera cobrar y resta lo que se espera pagar. Mes 1 incluye lo atrasado. Toca una cifra calculada para ver de dónde sale; las filas ámbar se escriben.</p>
      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="w-full min-w-[46rem]">
          <thead><tr className="border-b border-borde"><th className={TH}>Concepto</th>{f.meses.map((m, i) => <th key={m.mes} className={`${TH} text-right capitalize`}>{mesLargo(m.mes)}{i === 0 ? " (desde hoy)" : ""}</th>)}</tr></thead>
          <tbody className="divide-y divide-borde">
            {fila("Caja al inicio", "cajaInicio", "", undefined, undefined, true)}
            {fila("Cobros de facturas emitidas (no cedidas)", "cobrosFacturadas", "+", "cobrosFacturadas")}
            {fila("Cobros por facturar (con fecha estimada)", "cobrosPorFacturar", "+", "cobrosPorFacturar")}
            {fila("Excedentes de factoring", "excedentesFactoring", "+", "excedentesFactoring")}
            {fila("Anticipos de factoring planificados", "anticiposFactoring", "+", undefined, "anticipos_factoring")}
            {fila("Otros ingresos", "otrosIngresos", "+", undefined, "otros_ingresos")}
            {fila("Total entradas", "totalEntradas", "", undefined, undefined, true)}
            {fila("Pagos a proveedores", "pagosProveedores", "−", "pagosProveedores")}
            {fila("Remuneraciones", "remuneraciones", "−", undefined, "remuneraciones")}
            {fila("Impuestos (IVA, PPM, retenciones)", "impuestos", "−", undefined, "impuestos")}
            {fila("Créditos, leasing y otros", "creditos", "−", undefined, "creditos_leasing")}
            <tr><td className="px-4 py-2 text-sm text-tinta"><span className="mr-1 text-gris">−</span>Pago tarjeta de crédito <span className="text-[10px] text-gris">(mes 1: deuda actual)</span></td>{f.meses.map((m, i) => <td key={m.mes} className={`px-3 py-2 text-right text-sm tabular-nums ${i > 0 ? "bg-amber-300/[0.08]" : ""}`}>{i === 0 ? clp(m.pagoTarjeta) : <CampoManual mes={m.mes} concepto="pago_tarjeta" valor={m.pagoTarjeta} />}</td>)}</tr>
            {fila("Total salidas", "totalSalidas", "", undefined, undefined, true)}
            {fila("Caja al final", "cajaFinal", "", undefined, undefined, true)}
            {fila("Mínimo de caja (política)", "minimo", "")}
            <tr className="font-bold">
              <td className="px-4 py-2 text-sm">Holgura</td>
              {f.meses.map((m) => <td key={m.mes} className={`px-3 py-2 text-right text-sm tabular-nums ${m.holgura < 0 ? "bg-rose-500/[0.08] text-alerta" : "text-ok"}`}>{clp(m.holgura)}<span className="block text-[10px]">{m.alerta}</span></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Seccion titulo="Informativo (no incluido)">
          <ul className={`${TARJETA} divide-y divide-borde text-sm`}>
            <li className="flex items-center gap-3 px-4 py-2.5"><span className="flex-1">Trabajos por facturar sin fecha estimada</span><span className="font-semibold tabular-nums">{clp(f.porFacturarSinFecha)}</span><Link href={`${RUTA_FIN}/ventas?sinFecha=1`} className="text-xs font-semibold text-naranjo">Asignar fecha</Link></li>
            <li className="flex items-center gap-3 px-4 py-2.5"><span className="flex-1">Compras sin visar</span><span className="font-semibold tabular-nums">{clp(f.comprasSinVisar)}</span><Link href={`${RUTA_FIN}/compras?ver=visar`} className="text-xs font-semibold text-naranjo">Revisar</Link></li>
          </ul>
        </Seccion>
        <Seccion titulo="Cargar una partida manual">
          <div className={`${TARJETA} p-4`}>
            <FormAccion accion={guardarPartidaAction} textoBoton="Guardar">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo etiqueta="Concepto"><select name="concepto" className={CAMPO}>{CONCEPTOS_MANUALES.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}</select></Campo>
                <Campo etiqueta="Mes"><select name="mes" className={CAMPO}>{f.meses.map((m) => <option key={m.mes} value={m.mes}>{mesLargo(m.mes)}</option>)}</select></Campo>
                <Campo etiqueta="Monto"><input name="monto" className={CAMPO} /></Campo>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="repetir" /> Repetir los 11 meses siguientes (cuota fija)</label>
            </FormAccion>
          </div>
        </Seccion>
      </div>
    </div>
  );
}

function CampoManual({ mes, concepto, valor }: { mes: string; concepto: string; valor: number }) {
  const guardar = async (v: string) => {
    "use server";
    const fd = new FormData();
    fd.set("mes", mes);
    fd.set("concepto", concepto);
    fd.set("monto", v || "0");
    return guardarPartidaAction(fd);
  };
  return <CampoEnLinea valor={String(valor)} guardar={guardar} ancho="w-28 text-right" />;
}
