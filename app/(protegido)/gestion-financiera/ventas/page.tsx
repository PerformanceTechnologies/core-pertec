import Link from "next/link";
import { IconPlus, IconReceipt2 } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista } from "@/lib/fin/datos";
import { ETAPAS_HITO, clp, clpCorto, fechaCl, type EtapaHito } from "@/lib/fin/reglas";
import { DTE_CORTO, TIPOS_DTE } from "@/lib/fin/modelo";
import { anularCobroAction, anularDocumentoAction, guardarHitoAction, registrarNotaAction } from "../acciones-ventas";
import { Banda, Chip, Deshabilitado, Monto, Pestanas, TD, TH, TONO_ETAPA, Vacio } from "@/components/fin/piezas";
import { BOTON, BOTON_SEC, BotonAccion, CAMPO, Campo, ComboContacto, ConVentana, FormAccion, SubirAdjunto } from "@/components/fin/ui";
import TablaHitos from "@/components/fin/TablaHitos";
import FormCobro from "@/components/fin/FormCobro";

export const dynamic = "force-dynamic";

type Params = { ver?: string; etapa?: string; sinFecha?: string; q?: string };

export default async function VentasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const ver = sp.ver ?? "hitos";
  const activos = v.hitos.filter((h) => !h.anulado);
  const enEtapa = (e: EtapaHito) => activos.filter((h) => h.etapa === e).length;
  const emitidos = v.documentos.filter((d) => d.direccion === "emitido").sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision));
  const clientes = v.contrapartes.filter((c) => c.esCliente || !c.esProveedor).map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  const abiertas = emitidos
    .filter((d) => d.estado === "vigente" && [33, 34, 56].includes(d.tipoDte) && d.saldo > 0)
    .map((d) => ({ id: d.id, folio: d.folio, clienteId: d.contraparteId, clienteNombre: d.razonSocial, fechaEmision: d.fechaEmision, vence: d.fechaVencimiento, saldo: d.saldo }));

  const q = (sp.q ?? "").toLowerCase().trim();
  const filtrados = activos
    .filter((h) => !sp.etapa || h.etapa === sp.etapa)
    .filter((h) => sp.sinFecha !== "1" || (h.tipoFlujo === "Por facturar" && h.fechaAceptacion && !h.fechaFlujo))
    .filter((h) => !q || `${h.codigo} ${h.descripcion} ${h.periodo ?? ""} ${h.clienteNombre ?? ""} ${h.proyectoNombre ?? ""} ${h.factura?.folio ?? ""}`.toLowerCase().includes(q));

  return (
    <div className="space-y-5">
      <Banda
        etiqueta="Ventas y cobranza"
        valor={clp(v.dashboard.porCobrar)}
        bajada="Por cobrar con IVA: facturas emitidas que el cliente aún no paga. Cada fila de abajo es algo que se factura: un EDP, un hito, un mes de arriendo o un spot."
        pasos={[
          { titulo: "Por iniciar", ayuda: "Cotización aceptada", n: enEtapa("Por iniciar"), href: `${RUTA_FIN}/ventas?etapa=Por iniciar` },
          { titulo: "En ejecución", ayuda: "Se está haciendo el trabajo", n: enEtapa("En ejecución"), href: `${RUTA_FIN}/ventas?etapa=En ejecución` },
          { titulo: "Requisitos", ayuda: "EDP, OC o HES del cliente", n: enEtapa("Esperando aprobación EDP") + enEtapa("Esperando OC") + enEtapa("Esperando HES") },
          { titulo: "Lista para facturar", ayuda: "Registra la factura", n: enEtapa("Lista para facturar"), href: `${RUTA_FIN}/ventas?etapa=Lista para facturar`, alerta: true },
          { titulo: "Por cobrar", ayuda: "Registra el cobro cuando llegue", n: enEtapa("Por cobrar") + enEtapa("Vencida"), href: `${RUTA_FIN}/ventas?etapa=Por cobrar`, alerta: enEtapa("Vencida") > 0 },
          { titulo: "Cobrada", n: enEtapa("Cobrada"), href: `${RUTA_FIN}/ventas?etapa=Cobrada` },
        ]}
        cifras={[
          { etiqueta: "Listo para facturar", valor: clpCorto(v.dashboard.listoParaFacturar), alerta: v.dashboard.listoParaFacturar > 0 },
          { etiqueta: "Terminado sin facturar", valor: clpCorto(v.dashboard.terminadoSinFacturar) },
          { etiqueta: "Vencido", valor: clpCorto(v.dashboard.porCobrarVencido), alerta: v.dashboard.porCobrarVencido > 0 },
          { etiqueta: "Cedido a factoring", valor: clpCorto(v.dashboard.porCobrarCedido) },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pestanas base={`${RUTA_FIN}/ventas`} actual={ver} opciones={[{ clave: "hitos", etiqueta: "Hitos por facturar / cobrar", n: activos.length }, { clave: "facturas", etiqueta: "Facturas emitidas", n: emitidos.length }, { clave: "cobros", etiqueta: "Cobros", n: v.cobros.length }]} />
        <span className="flex-1" />
        <ConVentana boton={<><IconPlus size={15} /> Nuevo hito</>} titulo="Nuevo hito facturable" descripcion="Para un trabajo spot o un hito extra. Lo normal es que nazcan al aceptar una cotización." className={BOTON_SEC}>
          {(
            <FormAccion accion={guardarHitoAction.bind(null, null)} textoBoton="Crear hito">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Cliente"><ComboContacto name="clienteId" opciones={clientes} /></Campo>
                <Campo etiqueta="Proyecto">
                  <select name="proyectoId" className={CAMPO}><option value="">—</option>{v.proyectos.filter((p) => p.estado === "activo").map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                </Campo>
                <Campo etiqueta="Descripción *" className="sm:col-span-2"><input name="descripcion" required className={CAMPO} /></Campo>
                <Campo etiqueta="Hito / período"><input name="periodo" placeholder="Única, EDP nov, Arriendo dic…" className={CAMPO} /></Campo>
                <Campo etiqueta="Monto neto *"><input name="neto" required inputMode="numeric" className={CAMPO} /></Campo>
                <Campo etiqueta="Tipo"><select name="tipo" className={CAMPO}><option value="servicio">Servicio</option><option value="arriendo">Arriendo</option><option value="venta">Venta</option></select></Campo>
                <Campo etiqueta="Aceptado el" ayuda="Vacío = cotización enviada"><input name="fechaAceptacion" type="date" defaultValue={v.hoy} className={CAMPO} /></Campo>
                <Campo etiqueta="N° OC cliente"><input name="ocClienteNumero" className={CAMPO} /></Campo>
                <Campo etiqueta="Trabajo"><select name="estadoTrabajo" className={CAMPO}><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="terminado">Terminado</option></select></Campo>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="requiereEdp" /> Requiere EDP</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="requiereHes" /> Requiere HES</label>
              </div>
            </FormAccion>
          )}
        </ConVentana>
        <ConVentana boton={<><IconReceipt2 size={15} /> Registrar cobro</>} titulo="Registrar cobro" ancho="max-w-3xl">
          {<FormCobro facturas={abiertas} cuentas={v.cuentas.filter((c) => c.tipo === "banco")} hoy={v.hoy} />}
        </ConVentana>
      </div>

      {ver === "hitos" && (
        <>
          {/* Barra de etapas: clic = filtro */}
          <div className="flex flex-wrap gap-1.5">
            <Link href={`${RUTA_FIN}/ventas`} scroll={false} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!sp.etapa && !sp.sinFecha ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:text-tinta"}`}>Todas · {activos.length}</Link>
            {ETAPAS_HITO.map((e) => {
              const xs = activos.filter((h) => h.etapa === e);
              if (xs.length === 0) return null;
              return (
                <Link key={e} href={`${RUTA_FIN}/ventas?etapa=${encodeURIComponent(e)}`} scroll={false} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${sp.etapa === e ? "border-naranjo ring-2 ring-naranjo/20" : "border-transparent"} ${TONO_ETAPA[e as EtapaHito]}`}>
                  {e === "Lista para facturar" && "▶ "}{e} · {xs.length} · {clpCorto(xs.reduce((s, h) => s + h.totalConIva, 0))}
                </Link>
              );
            })}
          </div>
          <form className="max-w-md"><input name="q" defaultValue={sp.q} placeholder="Buscar hito, cliente, proyecto o folio…" className={CAMPO} />{sp.etapa && <input type="hidden" name="etapa" value={sp.etapa} />}</form>
          {filtrados.length === 0 ? (
            <Vacio titulo={activos.length ? "Ningún hito con ese filtro" : "Todavía no hay hitos"} texto={activos.length ? "Prueba con otra etapa o borra la búsqueda." : "Los hitos nacen solos al aceptar una cotización en Comercial. Para un trabajo suelto, usa «Nuevo hito»."} icono={<IconReceipt2 size={24} stroke={1.6} />}>{activos.length ? <Link href={`${RUTA_FIN}/ventas`} className={BOTON_SEC}>Ver todos</Link> : <Link href={`${RUTA_FIN}/comercial`} className={BOTON}>Ir a Comercial</Link>}</Vacio>
          ) : (
            <TablaHitos hitos={filtrados} tasaIva={v.p.tasaIva} hoy={v.hoy} />
          )}
        </>
      )}

      {ver === "facturas" && (
        <>
          <div className="flex flex-wrap gap-2">
            <ConVentana boton="Nota de crédito / débito / guía" titulo="Registrar nota o guía" className={BOTON_SEC}>
              {(
                <FormAccion accion={registrarNotaAction} textoBoton="Registrar">
                  <input type="hidden" name="direccion" value="emitido" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo etiqueta="Tipo"><select name="tipoDte" className={CAMPO}><option value="61">61 · Nota de crédito</option><option value="56">56 · Nota de débito</option><option value="52">52 · Guía de despacho</option></select></Campo>
                    <Campo etiqueta="Folio *"><input name="folio" required className={CAMPO} /></Campo>
                    <Campo etiqueta="Fecha *"><input name="fechaEmision" type="date" required defaultValue={v.hoy} className={CAMPO} /></Campo>
                  </div>
                  <Campo etiqueta="Factura que referencia (NC/ND)">
                    <select name="documentoReferenciadoId" className={CAMPO}><option value="">—</option>{emitidos.filter((d) => [33, 34].includes(d.tipoDte) && d.estado === "vigente").map((d) => <option key={d.id} value={d.id}>N° {d.folio} · {d.razonSocial} · {clp(d.total)}</option>)}</select>
                  </Campo>
                  <Campo etiqueta="Hito (solo guía de despacho)">
                    <select name="hitoId" className={CAMPO}><option value="">—</option>{activos.filter((h) => !h.factura).map((h) => <option key={h.id} value={h.id}>{h.codigo} · {h.periodo ?? h.descripcion} · {h.clienteNombre}</option>)}</select>
                  </Campo>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo etiqueta="Neto"><input name="neto" inputMode="numeric" className={CAMPO} /></Campo>
                    <Campo etiqueta="IVA" ayuda="Vacío = se calcula"><input name="iva" inputMode="numeric" className={CAMPO} /></Campo>
                    <Campo etiqueta="Exento"><input name="exento" inputMode="numeric" className={CAMPO} /></Campo>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reabrirHitos" /> Si la NC anula toda la factura, reabrir sus hitos para facturar de nuevo</label>
                  <Campo etiqueta="Motivo"><input name="motivo" className={CAMPO} /></Campo>
                </FormAccion>
              )}
            </ConVentana>
          </div>
          {emitidos.length === 0 ? (
            <Vacio titulo="No hay facturas emitidas" texto="Se registran desde los hitos «Lista para facturar»: márcalos y usa «Registrar factura»." icono={<IconReceipt2 size={24} stroke={1.6} />}><Link href={`${RUTA_FIN}/ventas?etapa=Lista para facturar`} className={BOTON_SEC}>Ver lo listo para facturar</Link></Vacio>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
              <table className="w-full min-w-[62rem] text-sm">
                <thead><tr className="border-b border-borde"><th className={TH}>Documento</th><th className={TH}>Cliente</th><th className={TH}>Emisión / vence</th><th className={`${TH} text-right`}>Total</th><th className={`${TH} text-right`}>Saldo</th><th className={TH}>Hitos</th><th className={TH} /></tr></thead>
                <tbody className="divide-y divide-borde">
                  {emitidos.map((d) => (
                    <tr key={d.id} className={d.estado === "anulado" ? "opacity-50" : ""}>
                      <td className={TD}><span className="rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold" title={TIPOS_DTE[d.tipoDte]}>{DTE_CORTO[d.tipoDte] ?? d.tipoDte}</span> <span className="font-semibold text-tinta">{d.folio}</span>{d.cedido && <Chip texto="Cedida" tono="ml-1 bg-violet-500/10 text-violet-700" />}{d.estado === "anulado" && <Chip texto="Anulada" tono="ml-1 bg-slate-500/10 text-slate-500" />}{d.referencias && <span className="block text-[10px] text-gris">{d.referencias}</span>}</td>
                      <td className={`${TD} max-w-[16rem] truncate`}>{d.razonSocial ?? "—"}</td>
                      <td className={`${TD} whitespace-nowrap text-xs text-gris`}>{fechaCl(d.fechaEmision)}{d.fechaVencimiento && <> · vence {fechaCl(d.fechaVencimiento)}</>}</td>
                      <td className={`${TD} text-right font-semibold`}><Monto valor={d.tipoDte === 61 ? -d.total : d.total} /></td>
                      <td className={`${TD} text-right`}>{[61, 52].includes(d.tipoDte) ? "—" : <Monto valor={d.saldo} tono={d.saldo > 0 ? "font-semibold text-tinta" : "text-ok"} />}</td>
                      <td className={`${TD} text-xs text-gris`}>{v.hitos.filter((h) => d.hitoIds.includes(h.id)).map((h) => h.codigo).join(", ") || "—"}</td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        <SubirAdjunto entidadTipo="documento" entidadId={d.id} tipo="factura_pdf" texto="PDF/XML" />{" "}
                        {d.estado === "vigente" && <BotonAccion accion={anularDocumentoAction.bind(null, d.id)} motivo={`¿Por qué se anula el documento ${d.folio}?`}>Anular</BotonAccion>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {ver === "cobros" && (
        v.cobros.length === 0 ? (
          <Vacio titulo="Aún no hay cobros" texto="Cuando el cliente pague, regístralo con «Registrar cobro» o directo desde el abono en el Banco diario." icono={<IconReceipt2 size={24} stroke={1.6} />} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[50rem] text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>Cobro</th><th className={TH}>Cliente</th><th className={TH}>Fecha</th><th className={TH}>Facturas</th><th className={`${TH} text-right`}>Monto</th><th className={TH} /></tr></thead>
              <tbody className="divide-y divide-borde">
                {[...v.cobros].reverse().map((c) => (
                  <tr key={c.id} className={c.estado === "anulado" ? "opacity-50" : ""}>
                    <td className={`${TD} font-semibold text-tinta`}>{c.numero}<span className="block text-[10px] font-normal text-gris">{c.medio}{c.referencia ? ` · ${c.referencia}` : ""}</span></td>
                    <td className={`${TD} max-w-[16rem] truncate`}>{c.clienteId ? v.nombreDe.get(c.clienteId) : "—"}</td>
                    <td className={`${TD} text-xs text-gris`}>{fechaCl(c.fecha)}</td>
                    <td className={`${TD} text-xs`}>{c.aplicaciones.map((a) => `N° ${v.documentos.find((d) => d.id === a.documentoId)?.folio ?? "?"} (${clpCorto(a.monto)})`).join(", ")}</td>
                    <td className={`${TD} text-right font-semibold`}><Monto valor={c.monto} /></td>
                    <td className={`${TD} text-right`}>{c.estado !== "anulado" && <BotonAccion accion={anularCobroAction.bind(null, c.id)} motivo={`¿Por qué se anula el cobro ${c.numero}?`}>Anular</BotonAccion>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <p className="text-[11px] text-gris-suave">
        <span className="font-semibold">Emitir factura electrónica</span> y <span className="font-semibold">ceder electrónicamente</span> estarán disponibles al integrar la facturación electrónica; mientras, se registra lo emitido en el SII. <Deshabilitado motivo="Disponible al integrar facturación electrónica" clase={`${BOTON} ml-1`}>Emitir factura electrónica</Deshabilitado>
      </p>
    </div>
  );
}
