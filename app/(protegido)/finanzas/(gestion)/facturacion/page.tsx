import Link from "next/link";
import { IconArrowsExchange, IconFileInvoice, IconFlask, IconInbox, IconPlus, IconRefresh, IconSettings, IconTruckDelivery } from "@tabler/icons-react";
import { cargarVista, contextoFin } from "@/lib/fin/datos";
import { cedibles, configuracionDte, listarCesionesElectronicas, listarEmisiones, listarRecibidos } from "@/lib/fin/dte/servicio";
import { ACCIONES_RECIBIDO, ETIQUETA_ESTADO_SII, NOMBRE_DTE } from "@/lib/fin/dte/modelo";
import { clp, clpCorto, fechaCl } from "@/lib/fin/reglas";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { avisoBloqueo } from "@/components/fin/dte/aviso";
import {
  cederFacturaAction, descartarRecibidoAction, guardarConfigDteAction, registrarRecibidoAction, responderRecibidoAction, sincronizarRecibidosAction,
} from "@/app/(protegido)/gestion-financiera/acciones-dte";
import { Banda, Chip, Monto, Pestanas, TD, TH, Vacio } from "@/components/fin/piezas";
import { BotonAccion, Campo, ConVentana, FormAccion } from "@/components/fin/ui";
import { BOTON, BOTON_SEC, CAMPO } from "@/components/fin/estilos";
import { TARJETA } from "@/lib/estilos";
import ProbarConexion from "@/components/fin/dte/ProbarConexion";
import ArchivoDocumentos from "@/components/fin/dte/ArchivoDocumentos";
import { TONO_EMISION, TONO_SII } from "@/components/fin/dte/tonos";
import { COMUNAS_ORDENADAS } from "@/lib/contactos-modelo";

export const dynamic = "force-dynamic";

const RUTA = "/finanzas/facturacion";

type Params = { ver?: string; q?: string; clase?: string; anio?: string; mes?: string };

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoFin();
  const [v, cfg, emisiones, cesiones] = await Promise.all([cargarVista(), configuracionDte(ctx.empresa.id), listarEmisiones(ctx.empresa.id), listarCesionesElectronicas(ctx.empresa.id)]);
  const recibidos = await listarRecibidos(ctx.empresa.id, cfg.ambiente, v.hoy, v.p.plazoReclamoFacturaDias);
  const ver = sp.ver ?? "emitidos";
  const esAdmin = ctx.usuario.rol === "admin";
  const bloqueo = avisoBloqueo(cfg);
  const prueba = cfg.ambiente === "certificacion";

  const emitidos = emisiones.filter((e) => e.estado === "emitido" && e.tipoDte !== 52);
  const guias = emisiones.filter((e) => e.estado === "emitido" && e.tipoDte === 52);
  const pendientes = emisiones.filter((e) => ["borrador", "error", "enviando"].includes(e.estado));
  const bandeja = recibidos.filter((r) => !r.descartado);
  const porResponder = bandeja.filter((r) => !r.accion && (r.diasParaResponder ?? 0) >= 0);
  const urgentes = porResponder.filter((r) => (r.diasParaResponder ?? 99) <= 2);
  const sinRegistrar = bandeja.filter((r) => !r.documentoId && r.ambiente === "produccion");
  const listaParaFacturar = v.hitos.filter((h) => !h.anulado && h.etapa === "Lista para facturar");
  const delMes = emitidos.filter((e) => e.fechaEmision.slice(0, 7) === v.hoy.slice(0, 7) && e.ambiente === cfg.ambiente);
  const facturadoMes = delMes.reduce((s, e) => s + (e.tipoDte === 61 ? -e.total : e.total), 0);
  const q = (sp.q ?? "").toLowerCase().trim();
  const filtra = <T extends { folio: string | null; receptorNombre: string | null; receptorRut: string }>(xs: T[]) =>
    xs.filter((e) => !q || `${e.folio ?? ""} ${e.receptorNombre ?? ""} ${e.receptorRut}`.toLowerCase().includes(q));
  const cedi = await cedibles(ctx.empresa.id, cfg.ambiente, v.documentos);
  const comprasEsperando = v.compras.filter((c) => !c.anulada && c.proveedorId && ["Esperar factura del proveedor", "Esperar recepción conforme", "Esperar respuesta del proveedor", "Pago programado", "Programar pago"].includes(c.paso));

  return (
    <div className="space-y-3">
      <Banda
        compacta
        etiqueta="Facturación electrónica"
        valor={clp(facturadoMes)}
        bajada={<>Emitido este mes {prueba ? "(pruebas)" : ""}, neto de notas de crédito. Facturas, notas, guías y cesión se emiten aquí y van al SII vía {cfg.proveedorNombre}; lo recibido llega a la bandeja.</>}
        pasos={[
          { titulo: "Lista para facturar", ayuda: "Hitos de Ventas", n: listaParaFacturar.length, href: `/finanzas/ventas?etapa=Lista para facturar`, alerta: listaParaFacturar.length > 0 },
          { titulo: "Borradores", ayuda: "Por emitir o corregir", n: pendientes.length, href: `${RUTA}?ver=borradores`, alerta: pendientes.some((e) => e.estado !== "borrador") },
          { titulo: "Emitidos", ayuda: "Con folio del SII", n: emitidos.length, href: RUTA },
          { titulo: "Recibidos por responder", ayuda: "8 días para aceptar o reclamar", n: porResponder.length, href: `${RUTA}?ver=recibidos`, alerta: urgentes.length > 0 },
          { titulo: "Cesiones", ayuda: "Factoring electrónico", n: cesiones.filter((c) => c.estado === "cedida").length, href: `${RUTA}?ver=cesiones` },
        ]}
        cifras={[
          { etiqueta: "Ambiente", valor: prueba ? "Pruebas" : "Producción", alerta: prueba },
          { etiqueta: "Estado", valor: bloqueo ? "Por configurar" : "Listo", alerta: Boolean(bloqueo) },
          { etiqueta: "Recibidos urgentes", valor: String(urgentes.length), alerta: urgentes.length > 0 },
          { etiqueta: "Sin registrar en Compras", valor: String(sinRegistrar.length) },
        ]}
      />

      {prueba && (
        <p className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.06] px-3.5 py-2.5 text-[13px] text-violet-800 dark:text-violet-200">
          <IconFlask size={17} className="mt-px shrink-0" />
          <span><strong>Ambiente de pruebas (certificación / demo).</strong> Lo emitido no tiene valor tributario y queda solo en esta pantalla: no toca hitos, saldos, flujo ni contabilidad. Para pasar a producción, el administrador cambia el ambiente en Administración › Integraciones.</span>
        </p>
      )}
      {bloqueo && <p className="rounded-xl bg-amber-500/[0.08] px-3.5 py-2.5 text-[13px] text-aviso">{bloqueo}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Pestanas
          base={RUTA}
          actual={ver}
          opciones={[
            { clave: "emitidos", etiqueta: "Emitidos", n: emitidos.length },
            { clave: "borradores", etiqueta: "Borradores", n: pendientes.length },
            { clave: "guias", etiqueta: "Guías de despacho", n: guias.length },
            { clave: "recibidos", etiqueta: "Recibidos", n: bandeja.length },
            { clave: "cesiones", etiqueta: "Cesiones", n: cesiones.length },
            { clave: "archivo", etiqueta: "Archivo (PDF/XML)" },
            { clave: "configuracion", etiqueta: "Configuración" },
          ]}
        />
        <span className="flex-1" />
        <Link href={`${RUTA}/nuevo?tipo=52`} className={BOTON_SEC}><IconTruckDelivery size={15} /> Nueva guía</Link>
        <Link href={`${RUTA}/nuevo?tipo=34`} className={BOTON_SEC}><IconPlus size={15} /> Factura exenta</Link>
        <Link href={`${RUTA}/nuevo?tipo=33`} className={BOTON}><IconFileInvoice size={15} /> Nueva factura</Link>
      </div>

      {(ver === "emitidos" || ver === "guias" || ver === "borradores") && (
        <>
          <form className="max-w-md"><input type="hidden" name="ver" value={ver} /><input name="q" defaultValue={sp.q} placeholder="Buscar por folio, cliente o RUT…" className={CAMPO} /></form>
          {(() => {
            const filas = filtra(ver === "emitidos" ? emitidos : ver === "guias" ? guias : pendientes);
            if (filas.length === 0)
              return ver === "guias" ? (
                <Vacio titulo="Sin guías de despacho" texto="La guía respalda el traslado de bienes: venta con despacho, arriendo de equipos a faena, traslado entre bodegas o envío a reparación. Se crea con «Nueva guía», o desde un hito de arriendo (primer mes)." icono={<IconTruckDelivery size={24} stroke={1.6} />}>
                  <Link href={`${RUTA}/nuevo?tipo=52`} className={BOTON}>Nueva guía</Link>
                </Vacio>
              ) : ver === "borradores" ? (
                <Vacio titulo="Sin borradores" texto="Lo que guardes sin emitir, lo que falló y lo que quedó a medio enviar aparece aquí." />
              ) : (
                <Vacio titulo="Aún no hay documentos emitidos" texto="Lo normal es facturar desde Ventas: marca los hitos «Lista para facturar» y usa «Emitir factura electrónica». También puedes crear una factura suelta con «Nueva factura»." icono={<IconFileInvoice size={24} stroke={1.6} />}>
                  <Link href="/finanzas/ventas?etapa=Lista para facturar" className={BOTON_SEC}>Ir a lo listo para facturar</Link>
                </Vacio>
              );
            return (
              <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
                <table className="w-full min-w-[60rem] text-sm">
                  <thead><tr className="border-b border-borde"><th className={TH}>Documento</th><th className={TH}>{ver === "guias" ? "Destinatario" : "Cliente"}</th><th className={TH}>Emisión</th><th className={`${TH} text-right`}>Total</th><th className={TH}>Estado</th><th className={TH} /></tr></thead>
                  <tbody className="divide-y divide-borde">
                    {filas.map((e) => (
                      <tr key={e.id} className="hover:bg-tinta/[0.02]">
                        <td className={TD}>
                          <Link href={`${RUTA}/${e.id}`} className="font-semibold text-tinta hover:text-naranjo">
                            <span className="mr-1 rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold" title={NOMBRE_DTE[e.tipoDte]}>{DTE_CORTO[e.tipoDte] ?? e.tipoDte}</span>
                            {e.folio ? `N° ${e.folio}` : "Sin folio"}
                          </Link>
                          {e.ambiente === "certificacion" && <Chip texto="Prueba" tono="ml-1 bg-violet-500/10 text-violet-700" />}
                          {e.tipoDte === 52 && e.documento.indTraslado && <span className="block text-[10px] text-gris">Traslado {e.documento.indTraslado}{e.documento.transporte?.patente ? ` · ${e.documento.transporte.patente}` : ""}</span>}
                        </td>
                        <td className={`${TD} max-w-[18rem]`}><span className="block truncate">{e.receptorNombre ?? "—"}</span><span className="font-mono text-[10px] text-gris">{e.receptorRut}</span></td>
                        <td className={`${TD} whitespace-nowrap text-xs text-gris`}>{fechaCl(e.fechaEmision)}</td>
                        <td className={`${TD} text-right font-semibold`}><Monto valor={e.tipoDte === 61 ? -e.total : e.total} /></td>
                        <td className={TD}>
                          {e.estado === "emitido" ? <Chip texto={ETIQUETA_ESTADO_SII[e.estadoSii ?? "pendiente"]} tono={TONO_SII[e.estadoSii ?? "pendiente"]} /> : <Chip texto={e.estado === "enviando" ? "En duda: revisar" : e.estado === "error" ? "Con error" : "Borrador"} tono={TONO_EMISION[e.estado]} />}
                          {e.error && <span className="mt-0.5 block max-w-[18rem] truncate text-[10px] text-alerta" title={e.error}>{e.error}</span>}
                        </td>
                        <td className={`${TD} whitespace-nowrap text-right`}>
                          {e.folio && <a href={`/api/finanzas/dte/${e.id}/pdf`} target="_blank" className={BOTON_SEC}>PDF</a>}{" "}
                          <Link href={`${RUTA}/${e.id}`} className={BOTON_SEC}>{e.estado === "emitido" ? "Ver" : "Abrir"}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>
      )}

      {ver === "recibidos" && (
        <div className="space-y-3">
          <div className={`${TARJETA} flex flex-wrap items-end gap-3 p-4`}>
            <div className="min-w-[16rem] flex-1">
              <p className="text-sm font-bold text-tinta">Bandeja del SII</p>
              <p className="text-[12px] text-gris">Lo que otros te facturaron. Tienes <strong>{v.p.plazoReclamoFacturaDias} días corridos</strong> desde la recepción en el SII para aceptar o reclamar; después, queda aceptada por ley y con mérito ejecutivo. Registrarla en Compras la liga a su OC y la deja lista para programar el pago.</p>
            </div>
            <FormAccion accion={sincronizarRecibidosAction} textoBoton="Traer del SII" className="flex flex-wrap items-end gap-2" limpiar={false}>
              <Campo etiqueta="Desde"><input type="date" name="desde" defaultValue={new Date(Date.parse(`${v.hoy}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10)} className={CAMPO} /></Campo>
              <Campo etiqueta="Hasta"><input type="date" name="hasta" defaultValue={v.hoy} className={CAMPO} /></Campo>
            </FormAccion>
          </div>
          {bandeja.length === 0 ? (
            <Vacio titulo="La bandeja está vacía" texto="Usa «Traer del SII» para cargar lo recibido en un rango de fechas." icono={<IconInbox size={24} stroke={1.6} />} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
              <table className="w-full min-w-[72rem] text-sm">
                <thead><tr className="border-b border-borde"><th className={TH}>Documento</th><th className={TH}>Proveedor</th><th className={TH}>Emisión</th><th className={`${TH} text-right`}>Total</th><th className={TH}>Plazo SII</th><th className={TH}>Respuesta</th><th className={TH}>Compras</th><th className={TH} /></tr></thead>
                <tbody className="divide-y divide-borde">
                  {bandeja.map((r) => {
                    const compras = comprasEsperando.filter((c) => c.proveedorId === r.contraparteId);
                    return (
                      <tr key={r.id}>
                        <td className={TD}><span className="mr-1 rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold">{DTE_CORTO[r.tipoDte] ?? r.tipoDte}</span><span className="font-semibold text-tinta">N° {r.folio}</span></td>
                        <td className={`${TD} max-w-[16rem]`}><span className="block truncate">{r.razonSocial ?? "—"}</span><span className="font-mono text-[10px] text-gris">{r.rutEmisor}{!r.contraparteId && " · no está en Contactos"}</span></td>
                        <td className={`${TD} text-xs text-gris`}>{fechaCl(r.fechaEmision)}</td>
                        <td className={`${TD} text-right font-semibold`}><Monto valor={r.total} /></td>
                        <td className={`${TD} text-xs`}>
                          {r.accion ? <span className="text-gris">—</span> : r.diasParaResponder === null ? "—" : r.diasParaResponder < 0 ? <span className="text-gris">Vencido (aceptada por ley)</span> : <span className={r.diasParaResponder <= 2 ? "font-bold text-alerta" : "text-tinta"}>{r.diasParaResponder} día(s)</span>}
                        </td>
                        <td className={`${TD} text-xs`}>
                          {r.accion ? (
                            <Chip texto={ACCIONES_RECIBIDO.find((a) => a.codigo === r.accion)?.texto ?? r.accion} tono={["RCD", "RFP", "RFT"].includes(r.accion) ? "bg-rose-500/12 text-alerta" : "bg-emerald-500/12 text-ok"} titulo={r.accionMotivo ?? undefined} />
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              <BotonAccion accion={responderRecibidoAction.bind(null, r.id, "ACD")} confirmar={`¿Aceptar la factura ${r.folio} de ${r.razonSocial ?? r.rutEmisor} ante el SII? No se puede cambiar después.`} className={BOTON_SEC}>Aceptar</BotonAccion>
                              <BotonAccion accion={responderRecibidoAction.bind(null, r.id, "RCD")} motivo={`¿Por qué reclamas el contenido de la factura ${r.folio}?`} className={BOTON_SEC}>Reclamar</BotonAccion>
                              <BotonAccion accion={responderRecibidoAction.bind(null, r.id, "RFP")} motivo="¿Qué faltó? (reclamo por falta parcial de mercaderías)" className={BOTON_SEC}>Falta parcial</BotonAccion>
                              <BotonAccion accion={responderRecibidoAction.bind(null, r.id, "RFT")} motivo="¿Qué no llegó? (reclamo por falta total de mercaderías)" className={BOTON_SEC}>Falta total</BotonAccion>
                            </span>
                          )}
                        </td>
                        <td className={`${TD} text-xs`}>
                          {r.documentoId ? <span className="font-semibold text-ok">Registrada</span> : r.ambiente !== "produccion" ? <span className="text-gris">Prueba</span> : (
                            <ConVentana boton="Registrar" titulo={`Factura recibida N° ${r.folio}`} descripcion={`${r.razonSocial ?? r.rutEmisor} · ${clp(r.total)}`} className={BOTON_SEC}>
                              <FormAccion accion={registrarRecibidoAction} textoBoton="Registrar en Compras">
                                <input type="hidden" name="recibidoId" value={r.id} />
                                <Campo etiqueta="¿De qué compra es?" ayuda={compras.length ? "Las compras de este proveedor que esperan factura." : "Este proveedor no tiene compras esperando factura: quedará como «Factura sin OC: regularizar»."}>
                                  <select name="compraId" className={CAMPO}>
                                    <option value="">Sin OC (regularizar después)</option>
                                    {compras.map((c) => <option key={c.id} value={c.id}>{c.codigo}{c.ocNumero ? ` · ${c.ocNumero}` : ""} · {c.descripcion.slice(0, 50)} · {clpCorto(c.netoCotizado ?? 0)}</option>)}
                                  </select>
                                </Campo>
                                <Campo etiqueta="Proyecto (si es sin OC)">
                                  <select name="proyectoId" className={CAMPO}><option value="">General</option>{v.proyectos.filter((p) => p.estado === "activo").map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                                </Campo>
                                <Campo etiqueta="Descripción (si es sin OC)"><input name="descripcion" className={CAMPO} placeholder={`Factura ${r.folio} de ${r.razonSocial ?? ""}`} /></Campo>
                              </FormAccion>
                            </ConVentana>
                          )}
                        </td>
                        <td className={`${TD} whitespace-nowrap text-right`}>
                          {!r.documentoId && <BotonAccion accion={descartarRecibidoAction.bind(null, r.id)} motivo="¿Por qué se saca de la bandeja? (no se borra del SII)" className="text-[11px] font-semibold text-gris hover:text-alerta">Quitar</BotonAccion>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {ver === "cesiones" && (
        <div className="space-y-3">
          <div className={`${TARJETA} flex flex-wrap items-center gap-3 p-4`}>
            <div className="min-w-[16rem] flex-1">
              <p className="text-sm font-bold text-tinta">Ceder una factura (factoring electrónico)</p>
              <p className="text-[12px] text-gris">La cesión se inscribe en el Registro Público Electrónico de Transferencias del SII (AEC). Se cede la factura electrónica (33) a crédito, por su <strong>total</strong>, y el SII exige que tenga acuse de recibo del cliente o los 8 días sin reclamo cumplidos. La firma {cfg.personaAutorizada ? <strong>{cfg.personaAutorizada.nombre}</strong> : <span className="font-semibold text-alerta">la persona autorizada (falta configurarla)</span>}. Después de ceder, registra el anticipo y el costo en <Link href="/gestion-financiera/tesoreria?ver=factoring" className="font-semibold text-naranjo">Tesorería › Factoring</Link>.</p>
            </div>
            <ConVentana boton={<><IconArrowsExchange size={15} /> Ceder factura</>} titulo="Ceder factura electrónicamente" ancho="max-w-3xl">
              {cedi.length === 0 ? (
                <p className="text-sm text-gris">No hay facturas que ceder {prueba ? "(emite primero una factura de prueba)" : "(vigentes, con saldo y no cedidas)"}.</p>
              ) : (
                <FormAccion accion={cederFacturaAction} textoBoton="Ceder" confirmar="¿Ceder la factura? La cesión queda inscrita en el SII y el cliente será notificado: no se deshace desde el Core.">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-gris">Factura</p>
                    <ul className="max-h-56 divide-y divide-borde overflow-auto rounded-xl border border-borde">
                      {cedi.map((c, i) => (
                        <li key={c.documentoId ?? c.emisionId}>
                          <label className="flex items-center gap-3 px-3 py-2 text-sm">
                            <input type="radio" name={c.documentoId ? "documentoId" : "emisionId"} value={c.documentoId ?? c.emisionId ?? ""} defaultChecked={i === 0} required />
                            <span className="flex-1">{DTE_CORTO[c.tipoDte]} N° {c.folio} · {c.receptor} <span className="text-[11px] text-gris">· {fechaCl(c.fechaEmision)}{c.vencimiento ? ` · vence ${fechaCl(c.vencimiento)}` : ""}{c.aCredito === false ? " · al contado: no se puede ceder" : ""}</span></span>
                            <span className="tabular-nums text-gris">{clp(c.total)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta="Factor" ayuda="Sus datos (RUT, dirección, correo) se completan solos si están en Configuración › Factores">
                      <select name="factorId" className={CAMPO}><option value="">— Escribir los datos abajo —</option>{v.factores.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
                    </Campo>
                    <Campo etiqueta="Correo del cliente (deudor)" ayuda="Vacío = el de cobranza del cliente o su correo DTE. Recibe copia de la cesión"><input name="correoDeudor" type="email" className={CAMPO} /></Campo>
                    <Campo etiqueta="RUT del factor"><input name="cesionarioRut" className={CAMPO} placeholder="Vacío = el del factor" /></Campo>
                    <Campo etiqueta="Razón social del factor"><input name="cesionarioNombre" className={CAMPO} placeholder="Vacío = el del factor" /></Campo>
                    <Campo etiqueta="Dirección del factor"><input name="cesionarioDireccion" className={CAMPO} /></Campo>
                    <Campo etiqueta="Correo del factor"><input name="cesionarioCorreo" type="email" className={CAMPO} /></Campo>
                    <Campo etiqueta="Otras condiciones (opcional)" className="sm:col-span-2"><input name="otrasCondiciones" className={CAMPO} placeholder="Ej.: según contrato de factoring N° 123" /></Campo>
                  </div>
                </FormAccion>
              )}
            </ConVentana>
          </div>
          {cesiones.length === 0 ? (
            <Vacio titulo="Sin cesiones electrónicas" icono={<IconArrowsExchange size={24} stroke={1.6} />} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
              <table className="w-full min-w-[56rem] text-sm">
                <thead><tr className="border-b border-borde"><th className={TH}>Factura</th><th className={TH}>Cesionario</th><th className={`${TH} text-right`}>Monto</th><th className={TH}>Estado</th><th className={TH}>Cuándo</th></tr></thead>
                <tbody className="divide-y divide-borde">
                  {cesiones.map((c) => (
                    <tr key={c.id}>
                      <td className={TD}><span className="font-semibold text-tinta">{DTE_CORTO[c.tipoDte]} N° {c.folio}</span>{c.ambiente === "certificacion" && <Chip texto="Prueba" tono="ml-1 bg-violet-500/10 text-violet-700" />}</td>
                      <td className={TD}>{c.cesionarioNombre}<span className="block font-mono text-[10px] text-gris">{c.cesionarioRut}</span></td>
                      <td className={`${TD} text-right font-semibold`}><Monto valor={c.monto} /></td>
                      <td className={TD}><Chip texto={c.estado === "cedida" ? "Cedida" : c.estado === "enviando" ? "En duda: revisar" : c.estado === "rechazada" ? "Rechazada" : "Con error"} tono={c.estado === "cedida" ? "bg-emerald-500/12 text-ok" : c.estado === "enviando" ? "bg-amber-500/12 text-aviso" : "bg-rose-500/12 text-alerta"} />{c.error && <span className="block max-w-[20rem] truncate text-[10px] text-alerta" title={c.error}>{c.error}</span>}</td>
                      <td className={`${TD} text-xs text-gris`}>{fechaCl(c.creadoEn.slice(0, 10))} · {c.creadoPor?.split("@")[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {ver === "archivo" && (
        <ArchivoDocumentos
          empresaId={ctx.empresa.id}
          ruta={RUTA}
          clase={sp.clase === "recibido" ? "recibido" : "emitido"}
          anio={Number(sp.anio) || null}
          mes={Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : null}
          q={(sp.q ?? "").slice(0, 80)}
        />
      )}

      {ver === "configuracion" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className={`${TARJETA} p-5`}>
            <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-tinta"><IconSettings size={17} /> Datos del emisor · {ctx.empresa.nombre}</h2>
            <p className="mb-4 text-[12px] text-gris">Son los datos que salen como «Emisor» en cada documento. Deben ser iguales a los registrados en el SII y en SimpleFactura.</p>
            {esAdmin ? (
              <FormAccion accion={guardarConfigDteAction} textoBoton="Guardar configuración">
                <label className="flex items-center gap-2 rounded-xl bg-tinta/[0.04] px-3 py-2.5 text-sm font-semibold"><input type="checkbox" name="activo" defaultChecked={cfg.activo} /> Facturación electrónica encendida para {ctx.empresa.nombre}</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="RUT *"><input name="rut" defaultValue={cfg.emisor.rut} className={CAMPO} /></Campo>
                  <Campo etiqueta="Razón social (como en el SII)"><input name="razonSocial" defaultValue={cfg.emisor.razonSocial} className={CAMPO} /></Campo>
                  <Campo etiqueta="Giro *" ayuda="Máx. 80"><input name="giro" defaultValue={cfg.emisor.giro ?? ""} className={CAMPO} /></Campo>
                  <Campo etiqueta="Actividad económica (acteco) *" ayuda="6 dígitos, la principal registrada en el SII"><input name="acteco" defaultValue={cfg.emisor.acteco ?? ""} inputMode="numeric" className={CAMPO} /></Campo>
                  <Campo etiqueta="Dirección casa matriz *" className="sm:col-span-2"><input name="direccion" defaultValue={cfg.emisor.direccion ?? ""} maxLength={70} className={CAMPO} /></Campo>
                  <Campo etiqueta="Comuna *">
                    <input name="comuna" list="comunas-dte" defaultValue={cfg.emisor.comuna ?? ""} className={CAMPO} />
                    <datalist id="comunas-dte">{COMUNAS_ORDENADAS.map((c) => <option key={c} value={c} />)}</datalist>
                  </Campo>
                  <Campo etiqueta="Ciudad"><input name="ciudad" defaultValue={cfg.emisor.ciudad ?? ""} className={CAMPO} /></Campo>
                  <Campo etiqueta="Correo DTE de la empresa"><input name="correoDte" type="email" defaultValue={cfg.emisor.correo ?? ""} className={CAMPO} /></Campo>
                  <Campo etiqueta="Sucursal en SimpleFactura" ayuda="Tal como aparece en SimpleFactura (por omisión «Casa Matriz»)"><input name="sucursal" defaultValue={cfg.emisor.sucursal} className={CAMPO} /></Campo>
                  <p className="pt-1 text-xs font-bold uppercase tracking-wide text-gris sm:col-span-2">Persona autorizada a ceder facturas (firma el AEC con su certificado digital en SimpleFactura)</p>
                  <Campo etiqueta="RUT"><input name="cesionRut" defaultValue={cfg.personaAutorizada?.rut ?? ""} className={CAMPO} /></Campo>
                  <Campo etiqueta="Nombre"><input name="cesionNombre" defaultValue={cfg.personaAutorizada?.nombre ?? ""} className={CAMPO} /></Campo>
                  <Campo etiqueta="Correo" className="sm:col-span-2"><input name="cesionCorreo" type="email" defaultValue={cfg.personaAutorizada?.correo ?? ""} className={CAMPO} /></Campo>
                </div>
              </FormAccion>
            ) : (
              <p className="text-sm text-gris">Solo el administrador del Core cambia esta configuración.</p>
            )}
          </section>
          <aside className="space-y-4">
            <section className={`${TARJETA} p-5 text-sm`}>
              <h3 className="mb-2 font-bold text-tinta">Conexión con {cfg.proveedorNombre}</h3>
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-2"><dt className="text-gris">Cuenta cargada</dt><dd className={cfg.configurado ? "font-semibold text-ok" : "font-semibold text-alerta"}>{cfg.configurado ? "Sí (cifrada)" : "No"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gris">Emisión habilitada</dt><dd className={cfg.emisionHabilitada ? "font-semibold text-ok" : "font-semibold text-alerta"}>{cfg.emisionHabilitada ? "Sí" : "No, aún"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gris">Ambiente</dt><dd className="font-semibold">{prueba ? "Pruebas (certificación)" : "Producción"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gris">Encendida en {ctx.empresa.nombre}</dt><dd className="font-semibold">{cfg.activo ? "Sí" : "No"}</dd></div>
                {cfg.emisorDemo && <div className="flex justify-between gap-2"><dt className="text-gris">Emisor</dt><dd className="font-semibold text-violet-700">Cuenta demo de SimpleFactura</dd></div>}
                <div className="flex justify-between gap-2"><dt className="text-gris">Datos del emisor</dt><dd className={cfg.faltantesEmisor.length && !cfg.emisorDemo ? "font-semibold text-alerta" : "font-semibold text-ok"}>{cfg.faltantesEmisor.length ? (cfg.emisorDemo ? `Faltan ${cfg.faltantesEmisor.length} (no se usan en la demo)` : `Faltan ${cfg.faltantesEmisor.length}`) : "Completos"}</dd></div>
              </dl>
              {esAdmin && (
                <div className="mt-3 space-y-2">
                  {cfg.configurado && <ProbarConexion />}
                  <Link href="/integraciones" className="inline-flex text-[13px] font-semibold text-naranjo hover:underline">Cuenta y emisión: Administración › Integraciones →</Link>
                </div>
              )}
            </section>
            <section className={`${TARJETA} p-5 text-[12px] leading-relaxed text-gris`}>
              <h3 className="mb-2 text-sm font-bold text-tinta">Pasar a producción</h3>
              <ol className="list-decimal space-y-1 pl-4">
                <li>En SimpleFactura: empresa creada con certificado digital, folios (CAF) cargados por tipo y la sucursal.</li>
                <li>En Administración › Integraciones: cargar la cuenta de SimpleFactura (queda cifrada), elegir «Producción» y probar la conexión.</li>
                <li>Aquí: datos del emisor completos y encender. Después, en Integraciones, «Habilitar emisión».</li>
                <li>Emitir una primera factura real de bajo monto y revisar PDF, correo al cliente y estado en el SII.</li>
              </ol>
            </section>
          </aside>
        </div>
      )}

      {ver !== "configuracion" && (
        <p className="flex items-center gap-1.5 text-[11px] text-gris-suave"><IconRefresh size={12} /> El estado en el SII se actualiza al abrir cada documento («Consultar estado»).</p>
      )}
    </div>
  );
}
