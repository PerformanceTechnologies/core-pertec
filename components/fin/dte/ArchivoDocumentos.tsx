import Link from "next/link";
import { IconDownload, IconEye, IconFileSpreadsheet, IconFileTypePdf, IconFolder } from "@tabler/icons-react";
import { listarArchivo, resumirArchivo, todasDelArchivo, type ClaseDte, type TiposArchivo } from "@/lib/fin/dte/archivo";
import { cargarVista } from "@/lib/fin/datos";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { marcarPorConciliarAction } from "@/app/(protegido)/gestion-financiera/acciones-tesoreria";
import { Monto, TD, TH, Vacio } from "@/components/fin/piezas";
import { BotonAccion } from "@/components/fin/ui";
import { CAMPO } from "@/components/fin/estilos";
import { TARJETA } from "@/lib/estilos";
import SubirDocumento from "./SubirDocumento";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const BOTON_MINI = "rounded-md bg-tinta/[0.06] px-2 py-0.5 text-[11px] font-semibold text-tinta/75 hover:bg-tinta/[0.1]";

/**
 * Archivo de documentos tributarios: todo lo emitido y recibido (histórico y nuevo) con su PDF y XML en SharePoint.
 * Lista o resumen por periodo y contraparte, Excel con el mismo filtro, subida manual y, para lo que está en los
 * libros, su estado de pago (pagado por conciliar / pendiente).
 */
export default async function ArchivoDocumentos({
  empresaId, ruta, clase, anio, mes, q, vista, tipos = "todos", pestana = "archivo", modo, conClase = true,
}: {
  empresaId: string; ruta: string; clase: ClaseDte; anio: number | null; mes: number | null; q: string; vista: "lista" | "resumen";
  /** Qué tipos muestra (la pestaña Guías solo las guías; Emitidos, todo menos guías). */
  tipos?: TiposArchivo;
  /** La pestaña de Facturación donde vive (para que los filtros y enlaces no la cambien). */
  pestana?: string;
  modo?: string;
  /** Muestra el cambio Emitidos / Recibidos (solo en «Archivo y consultas»). */
  conClase?: boolean;
}) {
  const base = `${ruta}?ver=${pestana}${modo ? `&modo=${modo}` : ""}`;
  const filtro = `clase=${clase}&tipos=${tipos}${anio ? `&anio=${anio}` : ""}${mes ? `&mes=${mes}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const aqui = `${base}&vista=${vista}&${filtro}`;
  const { filas, total, anios } = await listarArchivo(empresaId, { clase, tipos, anio, mes, q });
  const resumen = vista === "resumen" ? resumirArchivo(await todasDelArchivo(empresaId, { clase, tipos, anio, mes, q }), Boolean(anio), tipos === "guias") : null;
  const v = vista === "lista" && filas.some((f) => f.documentoId) ? await cargarVista() : null;
  const docDe = new Map((v?.documentos ?? []).map((d) => [d.id, d]));
  const soloGuias = tipos === "guias";
  const suma = filas.reduce((s, f) => s + (f.tipoDte === 61 ? -(f.total ?? 0) : f.tipoDte === 52 && !soloGuias ? 0 : f.total ?? 0), 0);
  const quien = clase === "emitido" ? "Cliente" : "Proveedor";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {conClase && <div className="flex rounded-full bg-tinta/[0.05] p-1 text-[13px] font-semibold">
          {(["emitido", "recibido"] as const).map((c) => (
            <Link key={c} href={`${base}&vista=${vista}&clase=${c}${anio ? `&anio=${anio}` : ""}`} className={`rounded-full px-3 py-1 ${clase === c ? "bg-superficie text-tinta shadow-sm" : "text-tinta/60"}`}>
              {c === "emitido" ? "Emitidos" : "Recibidos (proveedores)"}
            </Link>
          ))}
        </div>}
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ver" value={pestana} />
          {modo && <input type="hidden" name="modo" value={modo} />}
          <input type="hidden" name="vista" value={vista} />
          <input type="hidden" name="clase" value={clase} />
          <input type="hidden" name="tipos" value={tipos} />
          <div className="w-36">
            <select name="anio" defaultValue={anio ?? ""} className={CAMPO}>
              <option value="">Todos los años</option>
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="w-28">
            <select name="mes" defaultValue={mes ?? ""} className={CAMPO}>
              <option value="">Mes</option>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="w-60"><input name="q" defaultValue={q} placeholder={clase === "emitido" ? "Folio, cliente o RUT…" : "Folio, proveedor o RUT…"} className={CAMPO} /></div>
          <button className="min-h-11 rounded-xl bg-tinta/[0.06] px-4 text-[13px] font-semibold hover:bg-tinta/[0.1]">Filtrar</button>
        </form>
        <span className="flex-1" />
        <div className="flex rounded-full bg-tinta/[0.05] p-1 text-[13px] font-semibold">
          {(["lista", "resumen"] as const).map((x) => (
            <Link key={x} href={`${base}&vista=${x}&${filtro}`} className={`rounded-full px-3 py-1 ${vista === x ? "bg-superficie text-tinta shadow-sm" : "text-tinta/60"}`}>
              {x === "lista" ? "Lista" : "Resumen"}
            </Link>
          ))}
        </div>
        <a href={`/api/finanzas/dte/archivo/excel?${filtro}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-tinta/[0.06] px-3 text-[13px] font-semibold hover:bg-tinta/[0.1]">
          <IconFileSpreadsheet size={15} /> Excel
        </a>
        <SubirDocumento />
      </div>

      {resumen ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${TARJETA} overflow-x-auto p-0`}>
            <h3 className="px-4 pt-4 text-sm font-bold text-tinta">Por {anio ? "mes" : "año"}</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>{anio ? "Mes" : "Año"}</th><th className={`${TH} text-right`}>Docs.</th><th className={`${TH} text-right`}>{soloGuias ? "Valor" : "Facturado"}</th><th className={`${TH} text-right`}>Notas de crédito</th><th className={`${TH} text-right`}>Neto</th></tr></thead>
              <tbody className="divide-y divide-borde">
                {resumen.periodos.map((p) => (
                  <tr key={p.periodo}>
                    <td className={`${TD} font-semibold`}>{anio && p.periodo.length === 7 ? `${MESES[Number(p.periodo.slice(5)) - 1]} ${p.periodo.slice(0, 4)}` : p.periodo}</td>
                    <td className={`${TD} text-right`}>{p.documentos}</td>
                    <td className={`${TD} text-right`}><Monto valor={p.facturas} /></td>
                    <td className={`${TD} text-right text-gris`}>{p.notasCredito ? <Monto valor={-p.notasCredito} /> : "—"}</td>
                    <td className={`${TD} text-right font-semibold`}><Monto valor={p.neto} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className={`${TARJETA} overflow-x-auto p-0`}>
            <h3 className="px-4 pt-4 text-sm font-bold text-tinta">{clase === "emitido" ? "Principales clientes" : "Principales proveedores"}</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>{quien}</th><th className={`${TH} text-right`}>Docs.</th><th className={`${TH} text-right`}>Neto de NC</th></tr></thead>
              <tbody className="divide-y divide-borde">
                {resumen.contrapartes.map((c) => (
                  <tr key={`${c.rut}-${c.nombre}`}>
                    <td className={`${TD} max-w-[18rem]`}>
                      <Link href={`${base}&vista=lista&clase=${clase}&tipos=${tipos}${anio ? `&anio=${anio}` : ""}&q=${encodeURIComponent(c.rut ?? c.nombre)}`} className="block truncate hover:text-naranjo">{c.nombre}</Link>
                      {c.rut && <span className="font-mono text-[10px] text-gris">{c.rut}</span>}
                    </td>
                    <td className={`${TD} text-right`}>{c.documentos}</td>
                    <td className={`${TD} text-right font-semibold`}><Monto valor={c.neto} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-[11px] text-gris lg:col-span-2">{soloGuias ? "Valor declarado en las guías (no es venta: respalda el traslado)." : "Montos totales (con IVA). No incluye guías de despacho. Las notas de crédito restan."}</p>
        </div>
      ) : filas.length === 0 ? (
        <Vacio
          titulo="Sin documentos en el archivo"
          texto={anio || q ? "Nada calza con el filtro." : "Aquí aparecen los documentos emitidos y recibidos con su PDF y XML: el histórico ordenado, lo que llega del SII y lo que se emita o se suba."}
          icono={<IconFolder size={24} stroke={1.6} />}
        >
          {(anio || q) && <Link href={`${base}&clase=${clase}&tipos=${tipos}`} className="text-[13px] font-semibold text-naranjo">Quitar filtro</Link>}
        </Vacio>
      ) : (
        <>
          <p className="text-[12px] text-gris">
            {total.toLocaleString("es-CL")} documento(s){filas.length < total ? `, se muestran los ${filas.length} más recientes (el Excel trae todos)` : ""} · {soloGuias ? "valor trasladado" : "total neto de NC"}{filas.length < total ? " (de los mostrados)" : ""} <strong className="text-tinta"><Monto valor={suma} /></strong>
          </p>
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[58rem] text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <th className={TH}>Documento</th>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>{clase === "emitido" && tipos === "guias" ? "Destinatario" : quien}</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={TH}>En los libros</th>
                  <th className={TH}>Archivos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.map((f) => {
                  const d = f.documentoId ? docDe.get(f.documentoId) : undefined;
                  const conSaldo = d && ![61, 52].includes(d.tipoDte);
                  return (
                    <tr key={f.id}>
                      <td className={TD}>
                        <Link href={`${ruta}/documento/${f.id}?volver=${encodeURIComponent(aqui)}`} className="group">
                          <span className="mr-1 rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold">{(f.tipoDte && DTE_CORTO[f.tipoDte]) ?? f.tipoDte ?? "?"}</span>
                          <span className="font-semibold text-tinta group-hover:text-naranjo">N° {f.folio ?? "—"}</span>
                        </Link>
                      </td>
                      <td className={`${TD} text-xs text-gris`}>{f.fecha ? fechaCl(f.fecha) : "—"}</td>
                      <td className={`${TD} max-w-[20rem]`}>
                        <span className="block truncate">{f.nombre ?? "—"}</span>
                        {f.rut && <span className="font-mono text-[10px] text-gris">{f.rut}</span>}
                      </td>
                      <td className={`${TD} text-right font-semibold`}>{f.total === null ? "—" : <Monto valor={f.tipoDte === 61 ? -f.total : f.total} />}</td>
                      <td className={`${TD} text-xs`}>
                        {!d ? (
                          <span className="text-gris">{f.documentoId ? "Registrado" : "Solo archivo"}</span>
                        ) : !conSaldo ? (
                          <span className="text-gris">Registrado</span>
                        ) : d.porConciliar ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-violet-700 dark:text-violet-300">{clase === "emitido" ? "Cobrado" : "Pagado"} · por conciliar</span>
                            <BotonAccion accion={marcarPorConciliarAction.bind(null, d.id, false)} confirmar={`¿Marcar el documento ${d.folio} como pendiente? Volverá a contar como ${clase === "emitido" ? "por cobrar" : "por pagar"}.`} className={BOTON_MINI}>Marcar pendiente</BotonAccion>
                          </span>
                        ) : d.saldo > 0 ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-aviso">Pendiente {clp(d.saldo)}</span>
                            {d.aplicado === 0 && <BotonAccion accion={marcarPorConciliarAction.bind(null, d.id, true)} className={BOTON_MINI}>Ya está {clase === "emitido" ? "cobrado" : "pagado"}</BotonAccion>}
                          </span>
                        ) : (
                          <span className="text-ok">{clase === "emitido" ? "Cobrado" : "Pagado"} y conciliado</span>
                        )}
                      </td>
                      <td className={TD}>
                        <span className="flex gap-2 text-[12px] font-semibold">
                          {(f.pdf || f.xml) && (
                            <Link href={`${ruta}/documento/${f.id}?volver=${encodeURIComponent(aqui)}`} className="inline-flex items-center gap-1 rounded-md bg-naranjo/10 px-2 py-0.5 text-naranjo hover:bg-naranjo/20">
                              <IconEye size={14} /> Ver
                            </Link>
                          )}
                          {f.pdf && (
                            <a href={`/api/finanzas/dte/archivo/${f.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-naranjo hover:underline">
                              <IconFileTypePdf size={14} /> PDF
                            </a>
                          )}
                          {f.xml && (
                            <a href={`/api/finanzas/dte/archivo/${f.id}/xml`} className="inline-flex items-center gap-1 text-tinta/70 hover:underline">
                              <IconDownload size={14} /> XML
                            </a>
                          )}
                          {!f.pdf && !f.xml && <span className="text-gris" title="Llegó del SII sin archivo: súbelo o se traerá con SimpleFactura">—</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
