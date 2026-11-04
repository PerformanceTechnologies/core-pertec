import Link from "next/link";
import { IconFileInvoice, IconPlus, IconReceipt2 } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista } from "@/lib/fin/datos";
import { clp, clpCorto, conIva, fechaCl, inicioDeMes, mesLargo, sumarDias } from "@/lib/fin/reglas";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { anularPagoAction, crearCompraAction, registrarFacturaCompraAction, registrarPagoAction } from "../acciones-compras";
import { Banda, Chip, Monto, Pestanas, TD, TH, Vacio } from "@/components/fin/piezas";
import { BOTON, BOTON_SEC, BotonAccion, CAMPO, Campo, ComboContacto, ConVentana, FormAccion, SubirAdjunto } from "@/components/fin/ui";
import TablaCompras, { type HolguraCompra } from "@/components/fin/TablaCompras";

export const dynamic = "force-dynamic";

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const ver = sp.ver ?? "todas";
  const vivas = v.compras.filter((c) => !c.anulada);
  const porAprobar = vivas.filter((c) => c.paso === "Falta aprobación JP o gerente" || (c.paso === "Factura sin OC: regularizar" && !c.aprobadoPor));
  const porVisar = vivas.filter((c) => c.paso === "Falta visado de Finanzas" || (c.paso === "Factura sin OC: regularizar" && c.aprobadoPor));
  const recibidas = v.documentos.filter((d) => d.direccion === "recibido").sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision));
  const proveedores = v.contrapartes.filter((c) => c.esProveedor || !c.esCliente).map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  const cuentas = v.cuentas.filter((c) => c.activa && c.tipo !== "tarjeta").map((c) => ({ id: c.id, nombre: c.nombre }));

  // Widget de holgura al visar: el mes en que se pagaría y cuánto queda sobre el mínimo antes y después.
  const holguras: Record<string, HolguraCompra> = {};
  for (const c of porVisar) {
    const fechaPago = sumarDias(v.hoy, v.p.plazoPagoProveedorDias);
    const i = v.flujo.meses.findIndex((m) => m.mes === inicioDeMes(fechaPago));
    const mes = v.flujo.meses[i >= 0 ? i : v.flujo.meses.length - 1];
    if (mes) holguras[c.id] = { mes: mesLargo(mes.mes), antes: mes.holgura, despues: mes.holgura - conIva(c.netoCotizado ?? 0, v.p.tasaIva) };
  }
  const q = (sp.q ?? "").toLowerCase().trim();
  const lista = (ver === "aprobar" ? porAprobar : ver === "visar" ? porVisar : v.compras).filter(
    (c) => !q || `${c.codigo} ${c.descripcion} ${c.proveedorNombre ?? ""} ${c.proyectoNombre ?? ""} ${c.ocNumero ?? ""} ${c.facturaFolio ?? ""}`.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-5">
      <Banda
        etiqueta="Compras y pagos"
        valor={clp(v.dashboard.porPagar)}
        bajada="Por pagar (facturas recibidas). Solicitud → aprobación del JP o gerente → visado de Finanzas (nace la OC) → recepción → factura → pago."
        cifras={[
          { etiqueta: "Por aprobar", valor: String(porAprobar.length), alerta: porAprobar.length > 0 },
          { etiqueta: "Por visar", valor: clpCorto(v.dashboard.comprasEsperandoVisado), detalle: `${porVisar.length} compra(s)`, alerta: porVisar.length > 0 },
          { etiqueta: "Vencido", valor: clpCorto(v.dashboard.porPagarVencido), alerta: v.dashboard.porPagarVencido > 0 },
          { etiqueta: "Próximos 30 días", valor: clpCorto(v.dashboard.porPagar30) },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pestanas
          base={`${RUTA_FIN}/compras`}
          actual={ver}
          opciones={[
            { clave: "todas", etiqueta: "Todas", n: vivas.length },
            { clave: "aprobar", etiqueta: "Por aprobar", n: porAprobar.length },
            { clave: "visar", etiqueta: "Por visar", n: porVisar.length },
            { clave: "facturas", etiqueta: "Facturas recibidas", n: recibidas.length },
            { clave: "pagos", etiqueta: "Pagos", n: v.pagos.filter((p) => p.estado !== "anulado").length },
          ]}
        />
        <span className="flex-1" />
        <ConVentana boton={<><IconFileInvoice size={15} /> Factura sin OC</>} titulo="Registrar factura de proveedor sin OC" descripcion="Queda como «Factura sin OC: regularizar» para que pase por aprobación y visado (o se reclame en el SII dentro del plazo)." className={BOTON_SEC}>
          {(cerrar) => (
            <FormAccion accion={registrarFacturaCompraAction} textoBoton="Registrar" alOk={cerrar}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Proveedor *"><ComboContacto name="proveedorId" opciones={proveedores} requerido /></Campo>
                <Campo etiqueta="Proyecto"><select name="proyectoId" className={CAMPO}><option value="">General</option>{v.proyectos.filter((p) => !p.esGeneral && p.estado === "activo").map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
                <Campo etiqueta="Folio *"><input name="folio" required className={CAMPO} /></Campo>
                <Campo etiqueta="Tipo"><select name="tipoDte" className={CAMPO}><option value="33">33 · Factura</option><option value="34">34 · Exenta</option></select></Campo>
                <Campo etiqueta="Emisión *"><input name="fechaEmision" type="date" required defaultValue={v.hoy} className={CAMPO} /></Campo>
                <Campo etiqueta="Recepción en el SII" ayuda={`Plazo de reclamo: ${v.p.plazoReclamoFacturaDias} días`}><input name="fechaRecepcion" type="date" defaultValue={v.hoy} className={CAMPO} /></Campo>
                <Campo etiqueta="Neto"><input name="neto" className={CAMPO} /></Campo>
                <Campo etiqueta="IVA" ayuda="Vacío = se calcula"><input name="iva" className={CAMPO} /></Campo>
                <Campo etiqueta="Qué se compró" className="sm:col-span-2"><input name="descripcion" className={CAMPO} /></Campo>
              </div>
            </FormAccion>
          )}
        </ConVentana>
        <ConVentana boton={<><IconPlus size={15} /> Nueva solicitud</>} titulo="Nueva solicitud de compra" descripcion="Pocos datos: queda esperando la aprobación del JP o gerente." className={BOTON}>
          {(cerrar) => (
            <FormAccion accion={crearCompraAction} textoBoton="Crear solicitud" alOk={cerrar}>
              <Campo etiqueta="Qué se compra *"><input name="descripcion" required autoFocus className={CAMPO} placeholder="Repuestos para chancador" /></Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Proyecto"><select name="proyectoId" className={CAMPO}><option value="">General</option>{v.proyectos.filter((p) => !p.esGeneral && p.estado === "activo").map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
                <Campo etiqueta="Proveedor"><ComboContacto name="proveedorId" opciones={proveedores} /></Campo>
                <Campo etiqueta="Monto neto cotizado *"><input name="netoCotizado" required inputMode="numeric" className={CAMPO} placeholder="4800000" /></Campo>
                <Campo etiqueta="Se necesita para"><input name="fechaRequerida" type="date" className={CAMPO} /></Campo>
                <Campo etiqueta="Prioridad"><select name="prioridad" defaultValue="normal" className={CAMPO}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option></select></Campo>
              </div>
              <p className="text-[11px] text-gris">La cotización del proveedor (PDF) se adjunta desde la compra, después de crearla.</p>
            </FormAccion>
          )}
        </ConVentana>
      </div>

      {["todas", "aprobar", "visar"].includes(ver) && (
        <>
          {ver === "todas" && <form className="max-w-md"><input name="q" defaultValue={sp.q} placeholder="Buscar por código, proveedor, proyecto, OC o folio…" className={CAMPO} /></form>}
          {lista.length === 0 ? (
            <Vacio titulo={ver === "todas" ? "Todavía no hay compras" : "Nada pendiente aquí"} texto={ver === "todas" ? "Crea la primera con «Nueva solicitud»." : "Todo al día. ✓"} />
          ) : (
            <TablaCompras compras={lista} cuentas={cuentas} hoy={v.hoy} holguras={holguras} modo={ver as "todas" | "aprobar" | "visar"} />
          )}
          {ver === "todas" && lista.length > 0 && (
            <p className="text-[11px] text-gris">Para adjuntar la cotización del proveedor o la guía, ábrela en «Facturas recibidas» o usa el botón de la fila. Imprimir la OC: formato en diseño.</p>
          )}
        </>
      )}

      {ver === "facturas" && (
        recibidas.length === 0 ? (
          <Vacio titulo="No hay facturas recibidas" texto="Se registran desde la compra («Registrar factura») o con «Factura sin OC»." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[64rem] text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>Documento</th><th className={TH}>Proveedor</th><th className={TH}>Emisión / vence</th><th className={TH}>Compra</th><th className={`${TH} text-right`}>Total</th><th className={`${TH} text-right`}>Saldo</th><th className={TH}>Reclamo SII</th><th className={TH} /></tr></thead>
              <tbody className="divide-y divide-borde">
                {recibidas.map((d) => {
                  const compra = v.compras.find((c) => d.compraIds.includes(c.id));
                  const sinOc = compra?.paso === "Factura sin OC: regularizar";
                  return (
                    <tr key={d.id} className={d.estado === "anulado" ? "opacity-50" : ""}>
                      <td className={TD}><span className="rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold">{DTE_CORTO[d.tipoDte] ?? d.tipoDte}</span> <span className="font-semibold text-tinta">{d.folio}</span></td>
                      <td className={`${TD} max-w-[16rem] truncate`}>{d.razonSocial}</td>
                      <td className={`${TD} whitespace-nowrap text-xs text-gris`}>{fechaCl(d.fechaEmision)} · vence {fechaCl(d.fechaVencimiento)}</td>
                      <td className={`${TD} text-xs`}>{compra ? <>{compra.codigo} {sinOc && <Chip texto="Sin OC" tono="bg-rose-500/12 text-rose-700" />}</> : "—"}</td>
                      <td className={`${TD} text-right font-semibold`}><Monto valor={d.total} /></td>
                      <td className={`${TD} text-right`}><Monto valor={d.saldo} tono={d.saldo > 0 ? "font-semibold" : "text-emerald-600"} /></td>
                      <td className={`${TD} text-xs`}>{sinOc && d.diasParaReclamo !== null ? (d.diasParaReclamo >= 0 ? <span className={d.diasParaReclamo <= 2 ? "font-bold text-rose-600" : "text-amber-700"}>{d.diasParaReclamo} día(s) para reclamar</span> : <span className="text-gris">Plazo vencido</span>) : "—"}</td>
                      <td className={`${TD} text-right`}><SubirAdjunto entidadTipo="documento" entidadId={d.id} tipo="factura_pdf" texto="PDF/XML" />{compra && <> <SubirAdjunto entidadTipo="compra" entidadId={compra.id} tipo="cotizacion_proveedor" texto="Cotización" /></>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {ver === "pagos" && (
        <>
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[56rem] text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>Pago</th><th className={TH}>Proveedor</th><th className={TH}>Facturas</th><th className={TH}>Programado</th><th className={TH}>Pagado</th><th className={`${TH} text-right`}>Monto</th><th className={TH} /></tr></thead>
              <tbody className="divide-y divide-borde">
                {[...v.pagos].sort((a, b) => (a.estado === "programado" ? -1 : 1) - (b.estado === "programado" ? -1 : 1) || (a.fechaProgramada ?? "").localeCompare(b.fechaProgramada ?? "")).map((p) => (
                  <tr key={p.id} className={p.estado === "anulado" ? "opacity-50" : ""}>
                    <td className={`${TD} font-semibold text-tinta`}>{p.numero}<span className="block text-[10px] font-normal text-gris">{p.medio}</span></td>
                    <td className={`${TD} max-w-[14rem] truncate`}>{p.proveedorId ? v.nombreDe.get(p.proveedorId) : "—"}</td>
                    <td className={`${TD} text-xs`}>{p.aplicaciones.map((a) => `N° ${v.documentos.find((d) => d.id === a.documentoId)?.folio ?? "?"}`).join(", ")}</td>
                    <td className={`${TD} text-xs text-gris`}>{fechaCl(p.fechaProgramada)}</td>
                    <td className={`${TD} text-xs`}>{p.estado === "pagado" ? <span className="text-emerald-700">{fechaCl(p.fechaPago)}</span> : <Chip texto={p.estado === "anulado" ? "Anulado" : "Programado"} tono={p.estado === "anulado" ? "bg-slate-500/10 text-slate-500" : "bg-sky-500/10 text-sky-700"} />}</td>
                    <td className={`${TD} text-right font-semibold`}><Monto valor={p.monto} /></td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {p.estado === "programado" && (
                        <ConVentana boton="Marcar pagado" titulo={`Pago ${p.numero}`} className={BOTON_SEC}>
                          {(cerrar) => (
                            <FormAccion accion={registrarPagoAction.bind(null, p.id)} textoBoton="Marcar pagado" alOk={cerrar}>
                              <Campo etiqueta="Fecha real del pago"><input name="fecha" type="date" defaultValue={v.hoy} className={CAMPO} /></Campo>
                              <Campo etiqueta="Referencia"><input name="referencia" className={CAMPO} /></Campo>
                            </FormAccion>
                          )}
                        </ConVentana>
                      )}{" "}
                      {p.estado !== "anulado" && <BotonAccion accion={anularPagoAction.bind(null, p.id)} motivo={`¿Por qué se anula el pago ${p.numero}?`}>Anular</BotonAccion>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v.pagos.length === 0 && <p className="p-8 text-center text-sm text-gris">Sin pagos todavía. Se programan marcando compras en la pestaña «Todas».</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-borde px-4 py-3 text-sm text-gris">
            <IconReceipt2 size={18} className="text-naranjo" />
            <span className="flex-1">Reembolsos a empleados: las rendiciones aprobadas se revisan en Rendir Gastos (la integración para programar su pago aquí está apagada por ahora).</span>
            <Link href="/rendir-gastos?ver=aprobada" className="font-semibold text-naranjo hover:underline">Ver rendiciones por pagar</Link>
          </div>
        </>
      )}
    </div>
  );
}
