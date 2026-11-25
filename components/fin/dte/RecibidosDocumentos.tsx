import Link from "next/link";
import { IconDownload, IconEye, IconFileSpreadsheet, IconFileTypePdf, IconInbox } from "@tabler/icons-react";
import { ligarConLibros, listarArchivo, todasDelArchivo, type FilaArchivo } from "@/lib/fin/dte/archivo";
import { claveDocumento } from "@/lib/fin/dte/libros";
import { ACCIONES_RECIBIDO } from "@/lib/fin/dte/modelo";
import type { Recibido } from "@/lib/fin/dte/servicio";
import { cargarVista } from "@/lib/fin/datos";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { fechaCl } from "@/lib/fin/reglas";
import { Chip, Monto, TD, Vacio } from "@/components/fin/piezas";
import { CAMPO } from "@/components/fin/estilos";
import { Paginador, ThOrden, conParametros, leerEstado, ordenarYPaginar } from "@/components/fin/TablaOrdenable";
import RespuestaSii from "./RespuestaSii";
import SubirDocumento from "./SubirDocumento";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLUMNAS = ["fecha", "folio", "nombre", "total", "plazo", "respuesta", "conciliacion", "archivos"] as const;
const ESTADOS = [
  { clave: "", texto: "Todos" },
  { clave: "responder", texto: "Por responder" },
  { clave: "reclamados", texto: "Reclamados" },
  { clave: "pendientes", texto: "Pendientes de pago" },
  { clave: "por_conciliar", texto: "Por conciliar" },
  { clave: "conciliados", texto: "Conciliados" },
] as const;

type Conciliacion = "fuera" | "pendiente" | "por_conciliar" | "conciliada" | "registrado";
const ETIQUETA: Record<Conciliacion, { texto: string; tono: string }> = {
  conciliada: { texto: "Conciliada", tono: "bg-emerald-500/12 text-ok" },
  por_conciliar: { texto: "Por conciliar", tono: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  pendiente: { texto: "Pendiente de pago", tono: "bg-amber-500/12 text-aviso" },
  registrado: { texto: "Registrada", tono: "bg-tinta/[0.06] text-tinta/70" },
  fuera: { texto: "Antes de 2026", tono: "bg-tinta/[0.04] text-gris" },
};

interface Fila extends FilaArchivo {
  recibido: Recibido | null;
  /** Fila solo de la bandeja (aún sin archivo): no tiene visor. */
  soloBandeja: boolean;
}

/**
 * Facturación › Recibidos: TODO lo que te facturan (archivo histórico, Registro de Compras del SII y, con SimpleFactura
 * conectado, lo que trae la API cada día) en una sola lista. Cada fila: su PDF, el plazo para responder, Aceptar /
 * Reclamar y si ya está conciliada en los libros.
 */
export default async function RecibidosDocumentos({ empresaId, ruta, sp, recibidos, plazoDias }: {
  empresaId: string;
  ruta: string;
  sp: { anio?: string; mes?: string; q?: string; orden?: string; dir?: string; pag?: string; estado?: string };
  recibidos: Recibido[];
  plazoDias: number;
}) {
  const anio = Number(sp.anio) || null;
  const mes = Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : null;
  const q = (sp.q ?? "").slice(0, 80);
  const estadoFiltro = ESTADOS.some((x) => x.clave === sp.estado) ? sp.estado ?? "" : "";
  const e = leerEstado(sp, COLUMNAS, { orden: "fecha", dir: "desc" });
  const base = conParametros(`${ruta}?ver=recibidos`, { anio, mes, q, estado: estadoFiltro, orden: e.orden !== "fecha" || e.dir !== "desc" ? e.orden : null, dir: e.orden !== "fecha" || e.dir !== "desc" ? e.dir : null });

  const [{ anios }, archivo] = await Promise.all([
    listarArchivo(empresaId, { clase: "recibido", anio: null, mes: null, q: "", limite: 1 }),
    todasDelArchivo(empresaId, { clase: "recibido", anio, mes, q }),
  ]);
  // La bandeja (SII/proveedor) se cruza por tipo + folio + RUT; lo que aún no está en el archivo se agrega igual.
  const deBandeja = new Map(recibidos.filter((r) => !r.descartado).map((r) => [claveDocumento("recibido", r.tipoDte, r.folio, r.rutEmisor), r]));
  const usadas = new Set<string>();
  const filas: Fila[] = archivo.map((f) => {
    const k = claveDocumento("recibido", f.tipoDte ?? 0, f.folio ?? "", f.rut);
    const r = deBandeja.get(k) ?? null;
    if (r) usadas.add(k);
    return { ...f, documentoId: f.documentoId ?? r?.documentoId ?? null, recibido: r, soloBandeja: false };
  });
  const texto = q.toLowerCase().replace(/\./g, "");
  for (const [k, r] of deBandeja) {
    if (usadas.has(k)) continue;
    const fecha = r.fechaEmision;
    if (anio && !(fecha ?? "").startsWith(String(anio))) continue;
    if (mes && (fecha ?? "").slice(5, 7) !== String(mes).padStart(2, "0")) continue;
    if (texto && !`${r.folio} ${r.razonSocial ?? ""} ${r.rutEmisor}`.toLowerCase().replace(/\./g, "").includes(texto)) continue;
    filas.push({
      id: `r-${r.id}`, clase: "recibido", tipoDte: r.tipoDte, folio: r.folio, fecha, rut: r.rutEmisor, nombre: r.razonSocial, neto: r.neto, iva: r.iva, exento: r.exento,
      total: r.total, pdf: false, xml: false, documentoId: r.documentoId, origen: "bandeja", recibido: r, soloBandeja: true,
    });
  }

  const v = filas.some((f) => f.documentoId) ? await cargarVista() : null;
  const docDe = new Map((v?.documentos ?? []).map((d) => [d.id, d]));
  const conciliacion = (f: Fila): Conciliacion => {
    if (!f.documentoId) return "fuera";
    const d = docDe.get(f.documentoId);
    if (!d || [61, 52].includes(d.tipoDte)) return "registrado";
    if (d.porConciliar) return "por_conciliar";
    return d.saldo > 0 ? "pendiente" : "conciliada";
  };
  const porResponder = (f: Fila) => Boolean(f.recibido && !f.recibido.accion && (f.recibido.diasParaResponder ?? -1) >= 0);
  const visibles = filas.filter((f) => {
    switch (estadoFiltro) {
      case "responder": return porResponder(f);
      case "reclamados": return ["RCD", "RFP", "RFT"].includes(f.recibido?.accion ?? "");
      case "pendientes": return conciliacion(f) === "pendiente";
      case "por_conciliar": return conciliacion(f) === "por_conciliar";
      case "conciliados": return conciliacion(f) === "conciliada";
      default: return true;
    }
  });
  const ORDEN_CONC: Record<Conciliacion, number> = { fuera: 0, registrado: 1, pendiente: 2, por_conciliar: 3, conciliada: 4 };
  const { pagina, total, paginas, pag } = ordenarYPaginar(visibles, (f) => {
    switch (e.orden) {
      case "folio": return Number(f.folio) || null;
      case "nombre": return (f.nombre ?? f.rut ?? "").toLowerCase() || null;
      case "total": return f.total === null ? null : f.tipoDte === 61 ? -f.total : f.total;
      case "plazo": return porResponder(f) ? f.recibido!.diasParaResponder : null;
      case "respuesta": return f.recibido?.accion ?? (porResponder(f) ? "~" : null);
      case "conciliacion": return ORDEN_CONC[conciliacion(f)];
      case "archivos": return (f.pdf ? 2 : 0) + (f.xml ? 1 : 0);
      default: return f.fecha;
    }
  }, e);
  await ligarConLibros(empresaId, pagina.filter((f) => !f.soloBandeja));
  const aqui = conParametros(base, { pag: pag > 1 ? pag : null });
  const cuantos = (clave: string) => (clave === "responder" ? filas.filter(porResponder).length : null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ver" value="recibidos" />
          {estadoFiltro && <input type="hidden" name="estado" value={estadoFiltro} />}
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
          <div className="w-60"><input name="q" defaultValue={q} placeholder="Folio, proveedor o RUT…" className={CAMPO} /></div>
          <button className="min-h-11 rounded-xl bg-tinta/[0.06] px-4 text-[13px] font-semibold hover:bg-tinta/[0.1]">Filtrar</button>
        </form>
        <span className="flex-1" />
        <a href={`/api/finanzas/dte/archivo/excel?clase=recibido${anio ? `&anio=${anio}` : ""}${mes ? `&mes=${mes}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-tinta/[0.06] px-3 text-[13px] font-semibold hover:bg-tinta/[0.1]">
          <IconFileSpreadsheet size={15} /> Excel
        </a>
        <SubirDocumento />
      </div>

      <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
        {ESTADOS.map((x) => {
          const n = cuantos(x.clave);
          return (
            <Link key={x.clave} href={conParametros(base, { estado: x.clave || null, pag: null })} className={`rounded-full px-3 py-1 ${estadoFiltro === x.clave ? "bg-tinta text-white" : "bg-tinta/[0.05] text-tinta/70 hover:bg-tinta/[0.1]"}`}>
              {x.texto}{n ? ` (${n})` : ""}
            </Link>
          );
        })}
      </div>

      <p className="text-[12px] text-gris">
        {total.toLocaleString("es-CL")} documento(s). Tienes <strong>{plazoDias} días corridos</strong> desde la recepción en el SII para aceptar o reclamar; después, la factura queda aceptada por ley. Con SimpleFactura conectado, las facturas nuevas llegan solas cada día.
      </p>

      {pagina.length === 0 ? (
        <Vacio titulo="Sin documentos" texto={estadoFiltro || anio || q ? "Nada calza con el filtro." : "Aquí aparece todo lo que te facturan tus proveedores."} icono={<IconInbox size={24} stroke={1.6} />} />
      ) : (
        <>
          <Paginador base={aqui} pag={pag} paginas={paginas} total={total} />
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[68rem] text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <ThOrden base={aqui} columna="folio" e={e}>Documento</ThOrden>
                  <ThOrden base={aqui} columna="fecha" e={e}>Emisión</ThOrden>
                  <ThOrden base={aqui} columna="nombre" e={e}>Proveedor</ThOrden>
                  <ThOrden base={aqui} columna="total" e={e} alinear="right">Total</ThOrden>
                  <ThOrden base={aqui} columna="plazo" e={e}>Plazo SII</ThOrden>
                  <ThOrden base={aqui} columna="respuesta" e={e}>Respuesta</ThOrden>
                  <ThOrden base={aqui} columna="conciliacion" e={e}>Conciliación</ThOrden>
                  <ThOrden base={aqui} columna="archivos" e={e}>Documento</ThOrden>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {pagina.map((f) => {
                  const r = f.recibido;
                  const vence = r?.diasParaResponder ?? null;
                  const ver = !f.soloBandeja ? `${ruta}/documento/${f.id}?volver=${encodeURIComponent(aqui)}` : null;
                  const c = ETIQUETA[conciliacion(f)];
                  return (
                    <tr key={f.id} className="align-top">
                      <td className={TD}>
                        {ver ? (
                          <Link href={ver} className="group">
                            <span className="mr-1 rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold">{(f.tipoDte && DTE_CORTO[f.tipoDte]) ?? f.tipoDte ?? "?"}</span>
                            <span className="font-semibold text-tinta group-hover:text-naranjo">N° {f.folio ?? "—"}</span>
                          </Link>
                        ) : (
                          <span><span className="mr-1 rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold">{(f.tipoDte && DTE_CORTO[f.tipoDte]) ?? f.tipoDte}</span><span className="font-semibold text-tinta">N° {f.folio}</span></span>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-xs text-gris`}>{f.fecha ? fechaCl(f.fecha) : "—"}</td>
                      <td className={`${TD} max-w-[18rem]`}>
                        <span className="block truncate">{f.nombre ?? "—"}</span>
                        {f.rut && <span className="font-mono text-[10px] text-gris">{f.rut}</span>}
                      </td>
                      <td className={`${TD} text-right font-semibold`}>{f.total === null ? "—" : <Monto valor={f.tipoDte === 61 ? -f.total : f.total} />}</td>
                      <td className={`${TD} whitespace-nowrap text-xs`}>
                        {r?.accion ? <span className="text-gris">—</span> : vence === null ? <span className="text-gris">Vencido</span> : vence < 0 ? <span className="text-gris">Vencido</span> : <span className={vence <= 2 ? "font-bold text-alerta" : "text-tinta"}>{vence} día(s)</span>}
                      </td>
                      <td className={`${TD} text-xs`}>
                        {r?.accion ? (
                          <Chip texto={ACCIONES_RECIBIDO.find((a) => a.codigo === r.accion)?.texto ?? r.accion} tono={["RCD", "RFP", "RFT"].includes(r.accion) ? "bg-rose-500/12 text-alerta" : "bg-emerald-500/12 text-ok"} titulo={r.accionMotivo ?? undefined} />
                        ) : r && vence !== null && vence >= 0 ? (
                          <RespuestaSii id={r.id} folio={f.folio ?? ""} proveedor={f.nombre ?? f.rut ?? ""} />
                        ) : (
                          <span className="text-gris">Aceptada por plazo</span>
                        )}
                      </td>
                      <td className={TD}><Chip texto={c.texto} tono={c.tono} /></td>
                      <td className={TD}>
                        <span className="flex flex-wrap gap-2 text-[12px] font-semibold">
                          {ver && (f.pdf || f.xml) && (
                            <Link href={ver} className="inline-flex items-center gap-1 rounded-md bg-naranjo/10 px-2 py-0.5 text-naranjo hover:bg-naranjo/20"><IconEye size={14} /> Ver</Link>
                          )}
                          {f.pdf && <a href={`/api/finanzas/dte/archivo/${f.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-tinta/70 hover:underline"><IconFileTypePdf size={14} /> PDF</a>}
                          {f.xml && <a href={`/api/finanzas/dte/archivo/${f.id}/xml`} className="inline-flex items-center gap-1 text-tinta/70 hover:underline"><IconDownload size={14} /> XML</a>}
                          {!f.pdf && !f.xml && <span className="font-normal text-gris" title="Llegó del SII sin archivo: se puede subir, o lo traerá SimpleFactura">Sin archivo</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginador base={aqui} pag={pag} paginas={paginas} total={total} />
        </>
      )}
    </div>
  );
}
