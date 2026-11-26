import Link from "next/link";
import { IconArrowsExchange, IconFileInvoice, IconRefresh, IconSettings, IconTruckDelivery } from "@tabler/icons-react";
import { cargarVista, contextoFin } from "@/lib/fin/datos";
import { cedibles, configuracionDte, listarCesionesElectronicas, listarEmisiones, listarRecibidos } from "@/lib/fin/dte/servicio";
import { ETIQUETA_ESTADO_SII, NOMBRE_DTE } from "@/lib/fin/dte/modelo";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { avisoBloqueo } from "@/components/fin/dte/aviso";
import {
  cederFacturaAction, guardarConfigDteAction,
} from "@/app/(protegido)/gestion-financiera/acciones-dte";
import { Chip, Monto, Pestanas, TD, TH, Vacio } from "@/components/fin/piezas";
import { Campo, ConVentana, FormAccion } from "@/components/fin/ui";
import { BOTON, BOTON_SEC, CAMPO } from "@/components/fin/estilos";
import { TARJETA } from "@/lib/estilos";
import ProbarConexion from "@/components/fin/dte/ProbarConexion";
import ArchivoDocumentos, { TIPOS_FILTRO_DTE } from "@/components/fin/dte/ArchivoDocumentos";
import RecibidosDocumentos from "@/components/fin/dte/RecibidosDocumentos";
import EncabezadoFacturacion from "@/components/fin/dte/EncabezadoFacturacion";
import MenuNuevo from "@/components/fin/dte/MenuNuevo";
import { Paginador, ThOrden, conParametros, leerEstado, ordenarYPaginar } from "@/components/fin/TablaOrdenable";
import { contarArchivo } from "@/lib/fin/dte/archivo";
import { TONO_EMISION, TONO_SII } from "@/components/fin/dte/tonos";
import { COMUNAS_ORDENADAS } from "@/lib/contactos-modelo";

export const dynamic = "force-dynamic";

const RUTA = "/finanzas/facturacion";

/** El tipo de documento del filtro (?tipo=61), solo si es uno de los que ofrece la lista. */
const tipoDeFiltro = (x: string | undefined) => (TIPOS_FILTRO_DTE.some((t) => t.codigo === Number(x)) ? Number(x) : null);

type Params = { ver?: string; q?: string; clase?: string; anio?: string; mes?: string; vista?: string; modo?: string; orden?: string; dir?: string; pag?: string; estado?: string; tipo?: string };

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoFin();
  const [v, cfg, emisiones, cesiones] = await Promise.all([cargarVista(), configuracionDte(ctx.empresa.id), listarEmisiones(ctx.empresa.id), listarCesionesElectronicas(ctx.empresa.id)]);
  const [recibidos, enArchivo] = await Promise.all([listarRecibidos(ctx.empresa.id, cfg.ambiente, v.hoy, v.p.plazoReclamoFacturaDias), contarArchivo(ctx.empresa.id)]);
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

  return (
    <div className="space-y-3">
      <EncabezadoFacturacion
        valor={clp(facturadoMes)}
        detalle={`Emitido este mes${prueba ? " (pruebas)" : ""}, neto de notas de crédito`}
        info={`Facturas, notas, guías y cesión se emiten aquí y van al SII vía ${cfg.proveedorNombre}. Lo que te facturan llega a Recibidos.`}
        prueba={prueba}
        bloqueo={bloqueo}
        urgentes={urgentes.length}
        sinRegistrar={sinRegistrar.length}
        pasos={[
          { titulo: "Lista para facturar", ayuda: "Hitos de Ventas", n: listaParaFacturar.length, href: `/finanzas/ventas?etapa=Lista para facturar`, alerta: listaParaFacturar.length > 0 },
          { titulo: "Borradores", ayuda: "Por emitir o corregir", n: pendientes.length, href: `${RUTA}?ver=borradores`, alerta: pendientes.some((e) => e.estado !== "borrador") },
          { titulo: "Emitidos", ayuda: "Con folio del SII", n: emitidos.length, href: RUTA },
          { titulo: "Recibidos por responder", ayuda: "8 días para aceptar o reclamar", n: porResponder.length, href: `${RUTA}?ver=recibidos&estado=responder`, alerta: urgentes.length > 0 },
          { titulo: "Cesiones", ayuda: "Factoring electrónico", n: cesiones.filter((c) => c.estado === "cedida").length, href: `${RUTA}?ver=cesiones` },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pestanas
          base={RUTA}
          actual={ver}
          opciones={[
            { clave: "emitidos", etiqueta: "Emitidos", n: enArchivo.emitidos + emitidos.filter((e) => e.ambiente === "certificacion").length },
            { clave: "borradores", etiqueta: "Borradores", n: pendientes.length },
            { clave: "guias", etiqueta: "Guías de despacho", n: enArchivo.guias + guias.filter((e) => e.ambiente === "certificacion").length },
            { clave: "recibidos", etiqueta: "Recibidos", n: enArchivo.recibidos },
            { clave: "cesiones", etiqueta: "Cesiones", n: cesiones.length },
            { clave: "archivo", etiqueta: "Archivo y consultas" },
            { clave: "configuracion", etiqueta: "Configuración" },
          ]}
        />
        <span className="flex-1" />
        <MenuNuevo ruta={RUTA} />
      </div>

      {(ver === "emitidos" || ver === "guias") && (
        <ArchivoDocumentos
          empresaId={ctx.empresa.id}
          ruta={RUTA}
          clase="emitido"
          tipos={ver === "guias" || tipoDeFiltro(sp.tipo) === 52 ? "guias" : "sin_guias"}
          tipoDte={ver === "guias" ? null : tipoDeFiltro(sp.tipo)}
          pestana={ver}
          conClase={false}
          anio={Number(sp.anio) || null}
          mes={Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : null}
          q={(sp.q ?? "").slice(0, 80)}
          vista={sp.vista === "resumen" ? "resumen" : "lista"}
          orden={{ orden: sp.orden, dir: sp.dir, pag: sp.pag }}
        />
      )}

      {(ver === "emitidos" || ver === "guias" || ver === "borradores") && (
        <>
          {ver === "borradores" && <form className="max-w-md"><input type="hidden" name="ver" value={ver} /><input name="q" defaultValue={sp.q} placeholder="Buscar por folio, cliente o RUT…" className={CAMPO} /></form>}
          {(() => {
            // En Emitidos y Guías, el historial completo viene del archivo (arriba); aquí solo lo emitido por el Core en
            // pruebas, que no se archiva (lo de producción ya está en el archivo).
            const filas = ver === "borradores" ? filtra(pendientes) : (ver === "emitidos" ? emitidos : guias).filter((e) => e.ambiente === "certificacion");
            if (filas.length === 0 && ver !== "borradores") return null;
            // Orden y páginas solo en Borradores (aquí la URL es de esta tabla; en Emitidos/Guías la usa el historial).
            const eE = ver === "borradores" ? leerEstado(sp, ["folio", "nombre", "fecha", "total", "estado"], { orden: "fecha", dir: "desc" }) : { orden: "fecha", dir: "desc" as const, pag: 1 };
            const aquiE = conParametros(`${RUTA}?ver=${ver}`, { q: sp.q, orden: eE.orden !== "fecha" || eE.dir !== "desc" ? eE.orden : null, dir: eE.orden !== "fecha" || eE.dir !== "desc" ? eE.dir : null });
            const { pagina: paginaE, total: totalE, paginas: paginasE, pag: pagE } = ordenarYPaginar(filas, (e) => {
              switch (eE.orden) {
                case "folio": return Number(e.folio) || null;
                case "nombre": return (e.receptorNombre ?? e.receptorRut).toLowerCase();
                case "total": return e.tipoDte === 61 ? -e.total : e.total;
                case "estado": return e.estado;
                default: return e.fechaEmision;
              }
            }, eE);
            if (filas.length === 0)
              return ver === "guias" ? (
                <Vacio titulo="Sin guías de despacho" texto="La guía respalda el traslado de bienes: venta con despacho, arriendo de equipos a faena, traslado entre bodegas o envío a reparación. Se crea desde «Nueva factura ▾ › Guía de despacho», o desde un hito de arriendo (primer mes)." icono={<IconTruckDelivery size={24} stroke={1.6} />}>
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
              <div className="space-y-2">
              {ver !== "borradores" && <p className="pt-2 text-sm font-bold text-tinta">Emitidos desde el Core en pruebas (sin valor tributario)</p>}
              <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
                <table className="w-full min-w-[60rem] text-sm">
                  <thead><tr className="border-b border-borde">
                    <ThOrden base={aquiE} columna="folio" e={eE}>Documento</ThOrden>
                    <ThOrden base={aquiE} columna="nombre" e={eE}>{ver === "guias" ? "Destinatario" : "Cliente"}</ThOrden>
                    <ThOrden base={aquiE} columna="fecha" e={eE}>Emisión</ThOrden>
                    <ThOrden base={aquiE} columna="total" e={eE} alinear="right">Total</ThOrden>
                    <ThOrden base={aquiE} columna="estado" e={eE}>Estado</ThOrden>
                    <th className={TH} />
                  </tr></thead>
                  <tbody className="divide-y divide-borde">
                    {paginaE.map((e) => (
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
                          {e.folio ? <a href={`/api/finanzas/dte/${e.id}/pdf`} target="_blank" className={BOTON_SEC}>PDF</a> : <a href={`/api/finanzas/dte/${e.id}/vista-previa`} target="_blank" rel="noopener" className={BOTON_SEC} title="Vista previa del borrador (sin folio ni valor tributario)">PDF</a>}{" "}
                          <Link href={`${RUTA}/${e.id}`} className={BOTON_SEC}>{e.estado === "emitido" ? "Ver" : "Abrir"}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ver === "borradores" && <Paginador base={aquiE} pag={pagE} paginas={paginasE} total={totalE} />}
              </div>
            );
          })()}
        </>
      )}

      {ver === "recibidos" && (
        <RecibidosDocumentos empresaId={ctx.empresa.id} ruta={RUTA} sp={sp} recibidos={recibidos} plazoDias={v.p.plazoReclamoFacturaDias} />
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
          ) : (() => {
            const eC = leerEstado(sp, ["folio", "nombre", "total", "estado", "fecha"], { orden: "fecha", dir: "desc" });
            const aquiC = conParametros(`${RUTA}?ver=cesiones`, { orden: eC.orden !== "fecha" || eC.dir !== "desc" ? eC.orden : null, dir: eC.orden !== "fecha" || eC.dir !== "desc" ? eC.dir : null });
            const { pagina: paginaC, total: totalC, paginas: paginasC, pag: pagC } = ordenarYPaginar(cesiones, (c) => {
              switch (eC.orden) {
                case "folio": return Number(c.folio) || null;
                case "nombre": return c.cesionarioNombre.toLowerCase();
                case "total": return c.monto;
                case "estado": return c.estado;
                default: return c.creadoEn;
              }
            }, eC);
            return (
            <div className="space-y-2">
            <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
              <table className="w-full min-w-[56rem] text-sm">
                <thead><tr className="border-b border-borde">
                  <ThOrden base={aquiC} columna="folio" e={eC}>Factura</ThOrden>
                  <ThOrden base={aquiC} columna="nombre" e={eC}>Cesionario</ThOrden>
                  <ThOrden base={aquiC} columna="total" e={eC} alinear="right">Monto</ThOrden>
                  <ThOrden base={aquiC} columna="estado" e={eC}>Estado</ThOrden>
                  <ThOrden base={aquiC} columna="fecha" e={eC}>Cuándo</ThOrden>
                </tr></thead>
                <tbody className="divide-y divide-borde">
                  {paginaC.map((c) => (
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
            <Paginador base={aquiC} pag={pagC} paginas={paginasC} total={totalC} />
            </div>
            );
          })()}
        </div>
      )}

      {ver === "archivo" && (
        <ArchivoDocumentos
          empresaId={ctx.empresa.id}
          ruta={RUTA}
          clase={sp.clase === "recibido" ? "recibido" : "emitido"}
          tipoDte={tipoDeFiltro(sp.tipo)}
          anio={Number(sp.anio) || null}
          mes={Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : null}
          q={(sp.q ?? "").slice(0, 80)}
          vista={sp.vista === "resumen" ? "resumen" : "lista"}
          orden={{ orden: sp.orden, dir: sp.dir, pag: sp.pag }}
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
