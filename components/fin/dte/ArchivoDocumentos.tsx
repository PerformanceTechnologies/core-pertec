import Link from "next/link";
import { IconDownload, IconFileTypePdf, IconFolder } from "@tabler/icons-react";
import { listarArchivo, type ClaseDte } from "@/lib/fin/dte/archivo";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { fechaCl } from "@/lib/fin/reglas";
import { Monto, TD, TH, Vacio } from "@/components/fin/piezas";
import { CAMPO } from "@/components/fin/estilos";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Archivo de documentos tributarios: todo lo emitido y recibido que está guardado en SharePoint (histórico y nuevo),
 * con su PDF y XML. Servidor: lee fin_dte_archivo de la empresa activa.
 */
export default async function ArchivoDocumentos({ empresaId, ruta, clase, anio, mes, q }: { empresaId: string; ruta: string; clase: ClaseDte; anio: number | null; mes: number | null; q: string }) {
  const { filas, total, anios } = await listarArchivo(empresaId, { clase, anio, mes, q });
  const base = `${ruta}?ver=archivo&clase=${clase}`;
  const suma = filas.reduce((s, f) => s + (f.tipoDte === 61 ? -(f.total ?? 0) : f.tipoDte === 52 ? 0 : f.total ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-tinta/[0.05] p-1 text-[13px] font-semibold">
          {(["emitido", "recibido"] as const).map((c) => (
            <Link key={c} href={`${ruta}?ver=archivo&clase=${c}${anio ? `&anio=${anio}` : ""}`} className={`rounded-full px-3 py-1 ${clase === c ? "bg-superficie text-tinta shadow-sm" : "text-tinta/60"}`}>
              {c === "emitido" ? "Emitidos" : "Recibidos (proveedores)"}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ver" value="archivo" />
          <input type="hidden" name="clase" value={clase} />
          <div className="w-36"><select name="anio" defaultValue={anio ?? ""} className={CAMPO}>
            <option value="">Todos los años</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select></div>
          <div className="w-28"><select name="mes" defaultValue={mes ?? ""} className={CAMPO}>
            <option value="">Mes</option>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select></div>
          <div className="w-60"><input name="q" defaultValue={q} placeholder={clase === "emitido" ? "Folio, cliente o RUT…" : "Folio, proveedor o RUT…"} className={CAMPO} /></div>
          <button className="min-h-11 rounded-xl bg-tinta/[0.06] px-4 text-[13px] font-semibold hover:bg-tinta/[0.1]">Filtrar</button>
        </form>
      </div>
      {filas.length === 0 ? (
        <Vacio
          titulo="Sin documentos en el archivo"
          texto={anio || q ? "Nada calza con el filtro." : "Aquí aparecen los PDF y XML guardados en SharePoint: el histórico ordenado y, desde ahora, cada documento que se emita o se reciba."}
          icono={<IconFolder size={24} stroke={1.6} />}
        >
          {(anio || q) && <Link href={base} className="text-[13px] font-semibold text-naranjo">Quitar filtro</Link>}
        </Vacio>
      ) : (
        <>
          <p className="text-[12px] text-gris">
            {total.toLocaleString("es-CL")} documento(s){filas.length < total ? `, se muestran los ${filas.length} más recientes` : ""} · total neto de NC <strong className="text-tinta"><Monto valor={suma} /></strong>
          </p>
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <th className={TH}>Documento</th>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>{clase === "emitido" ? "Cliente" : "Proveedor"}</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={TH}>En el Core</th>
                  <th className={TH}>Archivos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className={TD}>
                      <span className="mr-1 rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold">{(f.tipoDte && DTE_CORTO[f.tipoDte]) ?? f.tipoDte ?? "?"}</span>
                      <span className="font-semibold text-tinta">N° {f.folio ?? "—"}</span>
                    </td>
                    <td className={`${TD} text-xs text-gris`}>{f.fecha ? fechaCl(f.fecha) : "—"}</td>
                    <td className={`${TD} max-w-[20rem]`}>
                      <span className="block truncate">{f.nombre ?? "—"}</span>
                      {f.rut && <span className="font-mono text-[10px] text-gris">{f.rut}</span>}
                    </td>
                    <td className={`${TD} text-right font-semibold`}>{f.total === null ? "—" : <Monto valor={f.tipoDte === 61 ? -f.total : f.total} />}</td>
                    <td className={`${TD} text-xs`}>{f.documentoId ? <span className="text-ok">Registrado</span> : <span className="text-gris">Solo archivo</span>}</td>
                    <td className={TD}>
                      <span className="flex gap-2 text-[12px] font-semibold">
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
                        {!f.pdf && !f.xml && <span className="text-gris">—</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
