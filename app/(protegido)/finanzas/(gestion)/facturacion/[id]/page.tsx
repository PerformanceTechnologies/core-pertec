import Link from "next/link";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconArrowLeft, IconArrowsExchange, IconCopy, IconFileMinus, IconFilePlus, IconFlask, IconHistory } from "@tabler/icons-react";
import { cargarVista, contextoFin, historialDe } from "@/lib/fin/datos";
import { clientesParaDte, configuracionDte, obtenerEmision } from "@/lib/fin/dte/servicio";
import { COD_REF, ETIQUETA_ESTADO_SII, IND_TRASLADO, NOMBRE_DTE, TIPOS_REFERENCIA, TIPO_DESPACHO, calcularTotales, montoLinea } from "@/lib/fin/dte/modelo";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { TARJETA } from "@/lib/estilos";
import {
  consultarEstadoDteAction, descartarBorradorAction, ligarGuiaAction, emitirDteAction, guardarBorradorDteAction, resolverEnvioAction, verificarEnvioAction,
} from "@/app/(protegido)/gestion-financiera/acciones-dte";
import EditorDte from "@/components/fin/dte/EditorDte";
import { avisoBloqueo } from "@/components/fin/dte/aviso";
import { TONO_EMISION, TONO_SII } from "@/components/fin/dte/tonos";
import { Chip, Seccion } from "@/components/fin/piezas";
import { BotonAccion, Campo, ConVentana, FormAccion } from "@/components/fin/ui";
import { BOTON, BOTON_SEC, CAMPO } from "@/components/fin/estilos";

export const dynamic = "force-dynamic";

const RUTA = "/finanzas/facturacion";

export default async function EmisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contextoFin();
  const [em, cfg, v] = await Promise.all([obtenerEmision(ctx.empresa.id, id), configuracionDte(ctx.empresa.id), cargarVista()]);
  if (!em) notFound();
  const historial = await historialDe(ctx.empresa.id, id);
  const d = em.documento;
  const editable = em.estado === "borrador" || em.estado === "error";
  const origenJson = JSON.stringify({ hitoIds: em.hitoIds, documentoReferenciadoId: em.documentoReferenciadoId });
  const hitos = v.hitos.filter((h) => em.hitoIds.includes(h.id));
  const ref = em.documentoReferenciadoId ? v.documentos.find((x) => x.id === em.documentoReferenciadoId) : null;
  const tot = calcularTotales(d, cfg.tasaIva);
  // Para «Ligar a un hito»: hitos vigentes sin guía, primero los del mismo cliente.
  const candidatos = em.tipoDte === 52 && em.hitoIds.length === 0
    ? v.hitos.filter((h) => !h.anulado && !h.guiaDespacho).sort((a, b) => Number(b.clienteId === em.contraparteId) - Number(a.clienteId === em.contraparteId))
    : [];

  if (editable) {
    const clientes = await clientesParaDte(ctx.empresa.id);
    return (
      <div className="space-y-4">
        <Link href={`${RUTA}?ver=borradores`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Borradores</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-xl font-extrabold text-tinta">{NOMBRE_DTE[em.tipoDte]} · {em.estado === "error" ? "con error" : "borrador"}</h1>
          <BotonAccion accion={descartarBorradorAction.bind(null, em.id)} motivo="¿Por qué se descarta este borrador?" volverA={`${RUTA}?ver=borradores`}>Descartar</BotonAccion>
        </div>
        {em.error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/[0.08] px-3.5 py-2.5 text-[13px] text-alerta"><IconAlertTriangle size={16} className="mt-px shrink-0" /> <span><strong>SimpleFactura lo rechazó:</strong> {em.error} Corrige y vuelve a emitir: no salió nada al SII.</span></p>}
        <EditorDte
          inicial={d}
          clientes={clientes}
          clienteInicial={em.contraparteId}
          tasaIva={cfg.tasaIva}
          hoy={v.hoy}
          ambiente={em.ambiente}
          activo={cfg.configurado && cfg.emisionHabilitada && cfg.activo}
          tipoFijo={Boolean(em.hitoIds.length || em.documentoReferenciadoId)}
          contexto={hitos.length ? `Hitos ${hitos.map((h) => h.codigo).join(", ")}` : ref ? `Corrige la factura N° ${ref.folio}` : null}
          guardar={guardarBorradorDteAction.bind(null, em.id, origenJson)}
          emitir={emitirDteAction.bind(null, em.id, origenJson)}
          bloqueado={avisoBloqueo(cfg) ?? (em.ambiente !== cfg.ambiente ? "Este borrador es de otro ambiente: cópialo como uno nuevo." : null)}
        />
      </div>
    );
  }

  const estadoSii = em.estadoSii ?? "pendiente";
  const esFactura = em.tipoDte === 33 || em.tipoDte === 34;
  const ncHref = em.documentoId ? `${RUTA}/nuevo?tipo=61&ref=${em.documentoId}` : `${RUTA}/nuevo?tipo=61&refEmision=${em.id}`;
  const ndHref = em.documentoId ? `${RUTA}/nuevo?tipo=56&ref=${em.documentoId}` : `${RUTA}/nuevo?tipo=56&refEmision=${em.id}`;

  return (
    <div className="space-y-5">
      <Link href={em.tipoDte === 52 ? `${RUTA}?ver=guias` : RUTA} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Facturación electrónica</Link>

      <header className={`${TARJETA} flex flex-wrap items-start gap-4 p-5`}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{NOMBRE_DTE[em.tipoDte]}</p>
          <h1 className="text-2xl font-extrabold text-tinta">{em.folio ? `N° ${em.folio}` : "Sin folio"}</h1>
          <p className="text-sm text-gris">{em.receptorNombre} · <span className="font-mono">{em.receptorRut}</span> · {fechaCl(em.fechaEmision)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {em.estado === "emitido" ? <Chip texto={ETIQUETA_ESTADO_SII[estadoSii]} tono={TONO_SII[estadoSii]} /> : <Chip texto={em.estado === "enviando" ? "En duda: revisar" : em.estado} tono={TONO_EMISION[em.estado]} />}
            {em.ambiente === "certificacion" && <Chip texto="Prueba (sin valor tributario)" tono="bg-violet-500/10 text-violet-700" />}
            {em.estadoSiiDetalle && <span className="text-[11px] text-gris">{em.estadoSiiDetalle}</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-condensed text-3xl font-bold tabular-nums text-tinta">{clp(em.tipoDte === 61 ? -em.total : em.total)}</p>
          <p className="text-xs text-gris">{em.tipoDte === 34 ? "exento" : `neto ${clp(em.neto)} · IVA ${clp(em.iva)}${em.exento ? ` · exento ${clp(em.exento)}` : ""}`}</p>
        </div>
      </header>

      {em.estado === "enviando" && (
        <section className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] p-4 text-[13px] text-aviso">
          <p className="flex items-start gap-2"><IconAlertTriangle size={17} className="mt-px shrink-0" /> <span><strong>No hubo respuesta clara de SimpleFactura.</strong> El documento pudo haber salido al SII. Para no emitirlo dos veces, primero verifica. {em.error}</span></p>
          <div className="flex flex-wrap gap-2">
            <BotonAccion accion={verificarEnvioAction.bind(null, em.id)} className={BOTON}>Verificar en SimpleFactura</BotonAccion>
            <BotonAccion accion={resolverEnvioAction.bind(null, em.id)} motivo="¿Con qué folio salió? (míralo en SimpleFactura)">Sí salió: indicar folio</BotonAccion>
            <BotonAccion accion={resolverEnvioAction.bind(null, em.id, "")} confirmar="¿Confirmas que NO salió (revisado en SimpleFactura)? Quedará para reintentar.">No salió</BotonAccion>
          </div>
        </section>
      )}

      {em.estado === "emitido" && (
        <div className="flex flex-wrap gap-2">
          <a href={`/api/finanzas/dte/${em.id}/pdf`} target="_blank" className={BOTON}>Ver PDF</a>
          <a href={`/api/finanzas/dte/${em.id}/xml`} className={BOTON_SEC}>Descargar XML</a>
          <BotonAccion accion={consultarEstadoDteAction.bind(null, em.id)}>Consultar estado en el SII</BotonAccion>
          {(esFactura || em.tipoDte === 56) && <Link href={ncHref} className={BOTON_SEC}><IconFileMinus size={15} /> Nota de crédito</Link>}
          {esFactura && <Link href={ndHref} className={BOTON_SEC}><IconFilePlus size={15} /> Nota de débito</Link>}
          {em.tipoDte === 33 && <Link href={`${RUTA}?ver=cesiones`} className={BOTON_SEC}><IconArrowsExchange size={15} /> Ceder</Link>}
          <Link href={`${RUTA}/nuevo?desde=${em.id}`} className={BOTON_SEC}><IconCopy size={15} /> Copiar como nuevo</Link>
          {em.documentoId && <Link href="/finanzas/ventas?ver=facturas" className={BOTON_SEC}>Ver en Ventas</Link>}
          {em.tipoDte === 52 && em.hitoIds.length === 0 && (
            <ConVentana boton="Ligar a un hito" titulo="Ligar la guía a una venta o arriendo" descripcion={`Guía N° ${em.folio} · ${em.receptorNombre ?? ""}`} className={BOTON_SEC}>
              {candidatos.length === 0 ? (
                <p className="text-sm text-gris">No hay hitos sin guía para ligar. Los hitos nacen al aceptar la cotización en Leads.</p>
              ) : (
                <FormAccion accion={ligarGuiaAction} textoBoton="Ligar">
                  <input type="hidden" name="emisionId" value={em.id} />
                  <Campo etiqueta="Hito (venta o arriendo)" ayuda="Primero los del mismo cliente. Al facturar ese hito, la factura referenciará esta guía.">
                    <select name="hitoId" className={CAMPO} required>
                      {candidatos.map((h) => <option key={h.id} value={h.id}>{h.codigo} · {h.periodo ?? h.descripcion} · {h.clienteNombre ?? "sin cliente"}{h.clienteId === em.contraparteId ? " ✓" : ""}</option>)}
                    </select>
                  </Campo>
                </FormAccion>
              )}
            </ConVentana>
          )}
        </div>
      )}
      {em.estado === "emitido" && em.error && <p className="rounded-xl bg-amber-500/[0.08] px-3.5 py-2.5 text-[13px] text-aviso">{em.error}</p>}
      {em.ambiente === "certificacion" && <p className="flex items-center gap-2 text-[12px] text-violet-700"><IconFlask size={15} /> Documento de prueba: no está en Ventas ni afecta saldos.</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Seccion titulo="Detalle">
            <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
              <table className="w-full min-w-[40rem] text-sm">
                <thead><tr className="border-b border-borde text-left text-[11px] uppercase tracking-wide text-gris"><th className="px-3 py-2">Ítem</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Dcto</th><th className="px-3 py-2 text-right">Monto</th></tr></thead>
                <tbody className="divide-y divide-borde">
                  {d.lineas.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2"><span className="font-semibold text-tinta">{l.nombre}</span>{(l.exento || em.tipoDte === 34) && <Chip texto="Exento" tono="ml-1 bg-slate-500/10 text-slate-600" />}{l.descripcion && <span className="block text-[11px] text-gris">{l.descripcion}</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.cantidad} {l.unidad}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{clp(l.precio)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.descuentoPct ? `${l.descuentoPct}%` : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{clp(montoLinea(l))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t border-borde"><td colSpan={4} className="px-3 py-2 text-right text-gris">Total</td><td className="px-3 py-2 text-right font-extrabold tabular-nums">{clp(tot.total)}</td></tr></tfoot>
              </table>
            </div>
          </Seccion>
          {d.referencias.length > 0 && (
            <Seccion titulo="Referencias">
              <ul className={`${TARJETA} divide-y divide-borde text-sm`}>
                {d.referencias.map((r, i) => (
                  <li key={i} className="px-4 py-2.5"><span className="font-semibold">{TIPOS_REFERENCIA.find((x) => x.codigo === r.tipo)?.texto ?? r.tipo} N° {r.folio}</span> <span className="text-xs text-gris">· {fechaCl(r.fecha)}{r.codRef ? ` · ${COD_REF.find((x) => x.codigo === r.codRef)?.texto}` : ""}{r.razon ? ` · ${r.razon}` : ""}</span></li>
                ))}
              </ul>
            </Seccion>
          )}
          {em.tipoDte === 52 && (
            <Seccion titulo="Traslado">
              <dl className={`${TARJETA} grid gap-2 p-4 text-sm sm:grid-cols-2`}>
                <div><dt className="text-[11px] text-gris">Motivo</dt><dd>{IND_TRASLADO.find((x) => x.codigo === d.indTraslado)?.texto ?? "—"}</dd></div>
                <div><dt className="text-[11px] text-gris">Transporta</dt><dd>{TIPO_DESPACHO.find((x) => x.codigo === d.tipoDespacho)?.texto ?? "—"}</dd></div>
                <div><dt className="text-[11px] text-gris">Patente / chofer</dt><dd>{[d.transporte?.patente, d.transporte?.nombreChofer, d.transporte?.rutChofer].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt className="text-[11px] text-gris">Destino</dt><dd>{[d.transporte?.direccionDestino, d.transporte?.comunaDestino].filter(Boolean).join(", ") || "—"}</dd></div>
              </dl>
            </Seccion>
          )}
        </div>
        <aside className="space-y-5">
          {(hitos.length > 0 || ref) && (
            <Seccion titulo="Nace de">
              <ul className={`${TARJETA} divide-y divide-borde text-sm`}>
                {hitos.map((h) => <li key={h.id} className="px-4 py-2"><Link href={`/finanzas/ventas/hito/${h.id}`} className="font-semibold hover:text-naranjo">{h.codigo}</Link> <span className="text-xs text-gris">· {h.periodo ?? h.descripcion}</span></li>)}
                {ref && <li className="px-4 py-2">Factura N° {ref.folio} <span className="text-xs text-gris">· {ref.razonSocial}</span></li>}
              </ul>
            </Seccion>
          )}
          <Seccion titulo="Historial" icono={<IconHistory size={15} />}>
            <ul className={`${TARJETA} space-y-2 p-4 text-[12px]`}>
              {historial.map((h) => <li key={h.id}><span className="font-semibold text-tinta">{h.accion}</span> · {new Date(h.creadoEn).toLocaleString("es-CL", { timeZone: "America/Santiago" })} · {h.usuario?.split("@")[0]}{h.detalle && <span className="block text-gris">{h.detalle}</span>}{h.motivo && <span className="block text-gris">Motivo: {h.motivo}</span>}</li>)}
              {historial.length === 0 && <li className="text-gris">Sin movimientos.</li>}
            </ul>
          </Seccion>
        </aside>
      </div>
    </div>
  );
}
