import Link from "next/link";
import { IconFileInvoice, IconPlus, IconReceipt2, IconShoppingCart } from "@tabler/icons-react";
import { cargarVista, contextoFin, RUTA_COMPRAS } from "@/lib/fin/datos";
import { permisosDeUsuario } from "@/lib/fin/flujos";
import { lineasDeCompras, resumenDeCompra, tasaIvaDe } from "@/lib/fin/oc-datos";
import { clp, clpCorto, conIva, fechaCl, inicioDeMes, mesLargo, sumarDias, type PasoCompra } from "@/lib/fin/reglas";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { anularPagoAction, registrarFacturaCompraAction, registrarPagoAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import { Banda, Chip, Monto, Pestanas, TD, TH, Vacio } from "@/components/fin/piezas";
import { BotonAccion, Campo, ComboContacto, ConVentana, FormAccion, SubirAdjunto } from "@/components/fin/ui";
import { BOTON, BOTON_SEC, CAMPO } from "@/components/fin/estilos";
import TablaCompras, { type HolguraCompra } from "@/components/fin/TablaCompras";

export const dynamic = "force-dynamic";

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const sp = await searchParams;
  const [v, ctx] = await Promise.all([cargarVista(), contextoFin()]);
  const puede = await permisosDeUsuario(ctx);
  const ver = sp.ver ?? "todas";
  const vivas = v.compras.filter((c) => !c.anulada);
  const enPaso = (p: PasoCompra) => vivas.filter((c) => c.paso === p).length;
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
    // Una «Factura sin OC» ya está en el flujo como por pagar: visarla no saca caja de nuevo.
    const yaEnFlujo = c.paso === "Factura sin OC: regularizar";
    if (mes) holguras[c.id] = { mes: mesLargo(mes.mes), antes: mes.holgura, despues: yaEnFlujo ? mes.holgura : mes.holgura - conIva(c.netoCotizado ?? 0, v.p.tasaIva) };
  }
  const yo = ctx.usuario.correo.toLowerCase();
  const mias = v.compras.filter((c) => c.formatoOc && ((c.creadoPor ?? "").toLowerCase() === yo || (c.solicitante ?? "").toLowerCase() === yo));
  const devueltas = mias.filter((c) => c.paso === "Devuelta: corregir y reenviar").length;
  const q = (sp.q ?? "").toLowerCase().trim();
  const lista = (ver === "aprobar" ? porAprobar : ver === "visar" ? porVisar : ver === "mias" ? mias : v.compras).filter(
    (c) => !q || `${c.codigo} ${c.descripcion} ${c.proveedorNombre ?? ""} ${c.proyectoNombre ?? ""} ${c.ocNumero ?? ""} ${c.facturaFolio ?? ""}`.toLowerCase().includes(q),
  );

  // El resumen completo de cada solicitud con formato de OC de la lista: lo que ve quien aprueba en el popup.
  const conFormato = lista.filter((c) => c.formatoOc);
  const resumenes: Record<string, ReturnType<typeof resumenDeCompra>> = {};
  if (conFormato.length > 0) {
    const [lineas, tasaIva] = await Promise.all([lineasDeCompras(conFormato.map((c) => c.id)), tasaIvaDe(ctx.empresa.id)]);
    for (const c of conFormato) {
      const r = resumenDeCompra(c, lineas.get(c.id) ?? [], tasaIva);
      const prov = c.proveedorId ? v.contrapartes.find((x) => x.id === c.proveedorId) : null;
      resumenes[c.id] = prov && r.proveedor ? { ...r, proveedor: { nombre: r.proveedor.nombre, rut: prov.rut } } : r;
    }
  }

  return (
    <div className="space-y-5">
      <Banda
        etiqueta="Compras y pagos"
        valor={clp(v.dashboard.porPagar)}
        bajada="Por pagar: facturas de proveedores recibidas que aún no se pagan."
        pasos={[
          { titulo: "Solicitud", ayuda: "Quien necesita la compra", n: enPaso("Borrador: enviar a aprobación") + enPaso("Devuelta: corregir y reenviar"), href: `${RUTA_COMPRAS}?ver=mias`, alerta: enPaso("Devuelta: corregir y reenviar") > 0 },
          { titulo: "Aprobación", ayuda: "Jefe de proyecto o gerente", n: porAprobar.length, href: `${RUTA_COMPRAS}?ver=aprobar`, alerta: true },
          { titulo: "Visado", ayuda: "Finanzas revisa la caja y emite la OC", n: porVisar.length, href: `${RUTA_COMPRAS}?ver=visar`, alerta: true },
          { titulo: "Envío", ayuda: "La OC sale al proveedor", n: enPaso("Enviar OC al proveedor") + enPaso("Emitir OC al proveedor") },
          { titulo: "Recepción", ayuda: "El proveedor acepta o rechaza", n: enPaso("Esperar respuesta del proveedor") + enPaso("OC rechazada por el proveedor") + enPaso("Esperar recepción conforme"), alerta: enPaso("OC rechazada por el proveedor") > 0 },
          { titulo: "Factura", ayuda: "Se compara con la OC", n: enPaso("Esperar factura del proveedor") + enPaso("Revisar diferencia con la OC"), href: `${RUTA_COMPRAS}?ver=facturas` },
          { titulo: "Pago", ayuda: "Se programa según el flujo", n: enPaso("Programar pago") + enPaso("Vencida: programar pago ya") + enPaso("Pago programado"), href: `${RUTA_COMPRAS}?ver=pagos`, alerta: enPaso("Vencida: programar pago ya") > 0 },
        ]}
        cifras={[
          { etiqueta: "Por aprobar", valor: String(porAprobar.length), alerta: porAprobar.length > 0 },
          { etiqueta: "Por visar", valor: clpCorto(v.dashboard.comprasEsperandoVisado), detalle: `${porVisar.length} compra(s)`, alerta: porVisar.length > 0 },
          { etiqueta: "Vencido", valor: clpCorto(v.dashboard.porPagarVencido), alerta: v.dashboard.porPagarVencido > 0 },
          { etiqueta: "Próximos 30 días", valor: clpCorto(v.dashboard.porPagar30) },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pestanas
          base={`${RUTA_COMPRAS}`}
          actual={ver}
          opciones={[
            { clave: "todas", etiqueta: "Todas", n: vivas.length },
            { clave: "mias", etiqueta: devueltas > 0 ? "Mis solicitudes · devueltas" : "Mis solicitudes", n: devueltas > 0 ? devueltas : mias.length },
            { clave: "aprobar", etiqueta: "Por aprobar", n: porAprobar.length },
            { clave: "visar", etiqueta: "Por visar", n: porVisar.length },
            { clave: "facturas", etiqueta: "Facturas recibidas", n: recibidas.length },
            { clave: "pagos", etiqueta: "Pagos", n: v.pagos.filter((p) => p.estado !== "anulado").length },
          ]}
        />
        <span className="flex-1" />
        <ConVentana boton={<><IconFileInvoice size={15} /> Factura sin OC</>} titulo="Registrar factura de proveedor sin OC" descripcion="Queda como «Factura sin OC: regularizar» para que pase por aprobación y visado (o se reclame en el SII dentro del plazo)." className={BOTON_SEC}>
          {(
            <FormAccion accion={registrarFacturaCompraAction} textoBoton="Registrar">
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
        <Link href={`${RUTA_COMPRAS}/nueva`} className={BOTON}><IconPlus size={15} /> Nueva solicitud</Link>
      </div>

      {["todas", "aprobar", "visar", "mias"].includes(ver) && (
        <>
          {ver === "todas" && <form className="max-w-md"><input name="q" defaultValue={sp.q} placeholder="Buscar por código, proveedor, proyecto, OC o folio…" className={CAMPO} /></form>}
          {lista.length === 0 ? (
            <Vacio titulo={ver === "todas" ? "Todavía no hay compras" : ver === "mias" ? "No has creado solicitudes" : "Nada pendiente aquí"} texto={ver === "todas" || ver === "mias" ? "Toda compra parte como solicitud: usa «Nueva solicitud» (arriba a la derecha). Después pasa por aprobación y visado." : "Todo al día. ✓"} icono={<IconShoppingCart size={24} stroke={1.6} />} />
          ) : (
            <TablaCompras compras={lista} cuentas={cuentas} hoy={v.hoy} holguras={holguras} modo={ver === "mias" ? "todas" : (ver as "todas" | "aprobar" | "visar")} puede={puede} esAdmin={ctx.usuario.rol === "admin"} resumenes={resumenes} />
          )}
          {ver === "todas" && lista.length > 0 && (
            <p className="text-[11px] text-gris">Para adjuntar la cotización del proveedor o la guía, ábrela en «Facturas recibidas» o usa el botón de la fila. Imprimir la OC: formato en diseño.</p>
          )}
        </>
      )}

      {ver === "facturas" && (
        recibidas.length === 0 ? (
          <Vacio titulo="No hay facturas recibidas" texto="Se registran desde la compra («Registrar factura») o, si llegó sin OC, con «Factura sin OC»." icono={<IconFileInvoice size={24} stroke={1.6} />} />
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
                      <td className={`${TD} text-xs`}>{compra ? <>{compra.codigo} {sinOc && <Chip texto="Sin OC" tono="bg-rose-500/12 text-alerta" />}</> : "—"}</td>
                      <td className={`${TD} text-right font-semibold`}><Monto valor={d.total} /></td>
                      <td className={`${TD} text-right`}><Monto valor={d.saldo} tono={d.saldo > 0 ? "font-semibold" : "text-ok"} /></td>
                      <td className={`${TD} text-xs`}>{sinOc && d.diasParaReclamo !== null ? (d.diasParaReclamo >= 0 ? <span className={d.diasParaReclamo <= 2 ? "font-bold text-alerta" : "text-aviso"}>{d.diasParaReclamo} día(s) para reclamar</span> : <span className="text-gris">Plazo vencido</span>) : "—"}</td>
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
                    <td className={`${TD} text-xs`}>{p.estado === "pagado" ? <span className="text-ok">{fechaCl(p.fechaPago)}</span> : <Chip texto={p.estado === "anulado" ? "Anulado" : "Programado"} tono={p.estado === "anulado" ? "bg-slate-500/10 text-slate-500" : "bg-sky-500/10 text-info"} />}</td>
                    <td className={`${TD} text-right font-semibold`}><Monto valor={p.monto} /></td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {p.estado === "programado" && puede.compras_pagador && (
                        <ConVentana boton="Marcar pagado" titulo={`Pago ${p.numero}`} className={BOTON_SEC}>
                          {(
                            <FormAccion accion={registrarPagoAction.bind(null, p.id)} textoBoton="Marcar pagado">
                              <Campo etiqueta="Fecha real del pago"><input name="fecha" type="date" defaultValue={v.hoy} className={CAMPO} /></Campo>
                              <Campo etiqueta="Referencia"><input name="referencia" className={CAMPO} /></Campo>
                            </FormAccion>
                          )}
                        </ConVentana>
                      )}{" "}
                      {p.estado !== "anulado" && puede.compras_pagador && <BotonAccion accion={anularPagoAction.bind(null, p.id)} motivo={`¿Por qué se anula el pago ${p.numero}?`}>Anular</BotonAccion>}
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
