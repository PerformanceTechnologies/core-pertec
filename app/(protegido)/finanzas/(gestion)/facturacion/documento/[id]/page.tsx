import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconDownload, IconFileTypePdf } from "@tabler/icons-react";
import { contextoFin } from "@/lib/fin/datos";
import { filaDelArchivo } from "@/lib/fin/dte/archivo";
import { vistaDesdeXml, type ParteDte, type VistaDte } from "@/lib/fin/dte/xml-vista";
import { textoXml } from "@/lib/fin/dte/leer-documento";
import { bajarDeSharePoint } from "@/lib/archivos/sharepoint-core";
import { NOMBRE_DTE } from "@/lib/fin/dte/modelo";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { BOTON_SEC } from "@/components/fin/estilos";
import { TARJETA } from "@/lib/estilos";
import BotonImprimir from "@/components/fin/dte/BotonImprimir";

export const dynamic = "force-dynamic";

const RUTA = "/finanzas/facturacion";
const TIPO_REF: Record<string, string> = { "33": "Factura", "34": "Factura exenta", "52": "Guía de despacho", "56": "Nota de débito", "61": "Nota de crédito", "801": "Orden de compra", HES: "HES", "802": "Nota de pedido", "803": "Contrato" };
const COD_REF: Record<string, string> = { "1": "Anula documento", "2": "Corrige texto", "3": "Corrige montos" };
const TRASLADO: Record<string, string> = { "1": "Operación constituye venta", "2": "Ventas por efectuar", "3": "Consignaciones", "4": "Entrega gratuita", "5": "Traslado interno", "6": "Otros traslados no venta", "7": "Guía de devolución", "8": "Traslado para exportación", "9": "Venta para exportación" };

function Parte({ titulo, p }: { titulo: string; p: ParteDte }) {
  return (
    <div className="space-y-0.5 text-[13px]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gris">{titulo}</p>
      <p className="font-bold text-tinta">{p.nombre ?? "—"}</p>
      {p.rut && <p className="font-mono text-[12px]">RUT {p.rut}</p>}
      {p.giro && <p className="text-gris">{p.giro}</p>}
      {(p.direccion || p.comuna) && <p className="text-gris">{[p.direccion, p.comuna, p.ciudad].filter(Boolean).join(", ")}</p>}
      {p.correo && <p className="text-gris">{p.correo}</p>}
      {p.contacto && <p className="text-gris">Contacto: {p.contacto}</p>}
    </div>
  );
}

function Documento({ v }: { v: VistaDte }) {
  const t = v.totales;
  return (
    <article className={`${TARJETA} space-y-5 p-6 print:border-0 print:shadow-none`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Parte titulo="Emisor" p={v.emisor} />
        <div className="rounded-xl border-2 border-naranjo/70 px-5 py-3 text-center">
          {v.emisor.rut && <p className="font-mono text-[13px] font-bold text-naranjo">R.U.T. {v.emisor.rut}</p>}
          <p className="text-[15px] font-bold uppercase text-naranjo">{(v.tipoDte && NOMBRE_DTE[v.tipoDte]) ?? `DTE ${v.tipoDte ?? ""}`}</p>
          <p className="text-[15px] font-bold text-naranjo">N° {v.folio ?? "—"}</p>
        </div>
      </header>
      <div className="grid gap-4 border-y border-borde py-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <Parte titulo="Receptor" p={v.receptor} />
        <dl className="space-y-1 text-[13px]">
          <div className="flex justify-between gap-2"><dt className="text-gris">Fecha de emisión</dt><dd className="font-semibold">{v.fechaEmision ? fechaCl(v.fechaEmision) : "—"}</dd></div>
          {v.fechaVencimiento && <div className="flex justify-between gap-2"><dt className="text-gris">Vencimiento</dt><dd className="font-semibold">{fechaCl(v.fechaVencimiento)}</dd></div>}
          {v.formaPago && <div className="flex justify-between gap-2"><dt className="text-gris">Forma de pago</dt><dd className="font-semibold">{v.formaPago}</dd></div>}
          {v.indTraslado && <div className="flex justify-between gap-2"><dt className="text-gris">Traslado</dt><dd className="text-right font-semibold">{TRASLADO[v.indTraslado] ?? v.indTraslado}</dd></div>}
          {v.transporte?.patente && <div className="flex justify-between gap-2"><dt className="text-gris">Patente</dt><dd className="font-semibold">{v.transporte.patente}</dd></div>}
          {v.transporte?.destino && <div className="flex justify-between gap-2"><dt className="text-gris">Destino</dt><dd className="text-right font-semibold">{v.transporte.destino}</dd></div>}
        </dl>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-[13px]">
          <thead>
            <tr className="border-b border-borde text-left text-[10.5px] uppercase tracking-wide text-gris">
              <th className="py-1.5 pr-2">Código</th><th className="py-1.5 pr-2">Descripción</th><th className="py-1.5 pr-2 text-right">Cant.</th><th className="py-1.5 pr-2 text-right">Precio</th><th className="py-1.5 pr-2 text-right">Desc.</th><th className="py-1.5 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {v.detalle.map((d) => (
              <tr key={d.linea} className="align-top">
                <td className="py-1.5 pr-2 font-mono text-[11px] text-gris">{d.codigo ?? ""}</td>
                <td className="py-1.5 pr-2">
                  <span className="font-semibold">{d.nombre}</span>
                  {d.exento && <span className="ml-1 text-[10px] text-gris">(exento)</span>}
                  {d.descripcion && <span className="block whitespace-pre-line text-[12px] text-gris">{d.descripcion}</span>}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{d.cantidad !== null ? d.cantidad.toLocaleString("es-CL") : ""}{d.unidad ? ` ${d.unidad}` : ""}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{d.precio !== null ? clp(d.precio) : ""}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{d.descuentoPct ? `${d.descuentoPct}%` : ""}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{d.monto !== null ? clp(d.monto) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-2 text-[12px]">
          {v.descuentosGlobales.length > 0 && (
            <p className="text-gris">Descuentos/recargos globales: {v.descuentosGlobales.map((g) => `${g.glosa ?? ""} ${g.tipo === "%" ? `${g.valor}%` : clp(g.valor ?? 0)}`).join(" · ")}</p>
          )}
          {v.referencias.length > 0 && (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gris">Referencias</p>
              <ul className="mt-1 space-y-0.5">
                {v.referencias.map((r, i) => (
                  <li key={i}>
                    {TIPO_REF[r.tipo ?? ""] ?? r.tipo ?? "Documento"} N° {r.folio ?? "—"}
                    {r.fecha ? ` del ${fechaCl(r.fecha)}` : ""}
                    {r.codigo && COD_REF[r.codigo] ? ` · ${COD_REF[r.codigo]}` : ""}
                    {r.razon ? ` · ${r.razon}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <dl className="space-y-1 text-[13px]">
          {t.neto !== null && <div className="flex justify-between"><dt className="text-gris">Neto</dt><dd className="tabular-nums">{clp(t.neto)}</dd></div>}
          {t.exento !== null && t.exento !== 0 && <div className="flex justify-between"><dt className="text-gris">Exento</dt><dd className="tabular-nums">{clp(t.exento)}</dd></div>}
          {t.iva !== null && <div className="flex justify-between"><dt className="text-gris">IVA{t.tasaIva ? ` ${t.tasaIva}%` : ""}</dt><dd className="tabular-nums">{clp(t.iva)}</dd></div>}
          {t.otros.map((o, i) => <div key={i} className="flex justify-between"><dt className="text-gris">Impuesto {o.tipo}{o.tasa ? ` ${o.tasa}%` : ""}</dt><dd className="tabular-nums">{clp(o.monto ?? 0)}</dd></div>)}
          <div className="flex justify-between border-t border-borde pt-1 text-[15px] font-bold"><dt>Total</dt><dd className="tabular-nums">{clp(t.total ?? 0)}</dd></div>
        </dl>
      </div>
      <p className="text-[10.5px] text-gris">Vista generada desde el XML del documento tributario. El documento con valor legal es el XML firmado (y su representación impresa con timbre).</p>
    </article>
  );
}

/** Visor de un documento del archivo: el PDF tal cual, o el XML dibujado como documento. */
export default async function DocumentoArchivoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ como?: string; volver?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contextoFin();
  const f = await filaDelArchivo(ctx.empresa.id, id);
  if (!f) notFound();
  const comoXml = sp.como === "xml" || !f.pdfRef;
  let vista: VistaDte | null = null;
  let error: string | null = null;
  if (comoXml && f.xmlRef) {
    try {
      vista = vistaDesdeXml(textoXml((await bajarDeSharePoint(f.xmlRef)).contenido));
      if (!vista) error = "El XML no trae un documento tributario legible.";
    } catch (e) {
      error = `No se pudo leer el XML desde SharePoint: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const volver = sp.volver && sp.volver.startsWith(RUTA) ? sp.volver : `${RUTA}?ver=${f.clase === "recibido" ? "recibidos&modo=historial" : f.tipoDte === 52 ? "guias" : "emitidos"}`;
  const titulo = `${(f.tipoDte && NOMBRE_DTE[f.tipoDte]) ?? "Documento"} N° ${f.folio ?? "—"}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={volver} className={BOTON_SEC}><IconArrowLeft size={15} /> Volver</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-tinta">{titulo}</h1>
          <p className="truncate text-[12px] text-gris">
            {f.clase === "emitido" ? "Emitido a" : "Recibido de"} {f.nombre ?? f.rut ?? "—"} · {f.fecha ? fechaCl(f.fecha) : "sin fecha"}
            {f.total !== null ? ` · ${clp(f.total)}` : ""}
          </p>
        </div>
        {f.pdfRef && f.xmlRef && (
          <div className="flex rounded-full bg-tinta/[0.05] p-1 text-[13px] font-semibold">
            <Link href={`?como=pdf${sp.volver ? `&volver=${encodeURIComponent(sp.volver)}` : ""}`} className={`rounded-full px-3 py-1 ${!comoXml ? "bg-superficie text-tinta shadow-sm" : "text-tinta/60"}`}>PDF</Link>
            <Link href={`?como=xml${sp.volver ? `&volver=${encodeURIComponent(sp.volver)}` : ""}`} className={`rounded-full px-3 py-1 ${comoXml ? "bg-superficie text-tinta shadow-sm" : "text-tinta/60"}`}>Desde el XML</Link>
          </div>
        )}
        {f.pdfRef && <a href={`/api/finanzas/dte/archivo/${f.id}/pdf`} target="_blank" rel="noreferrer" className={BOTON_SEC}><IconFileTypePdf size={15} /> Abrir PDF</a>}
        {f.xmlRef && <a href={`/api/finanzas/dte/archivo/${f.id}/xml`} className={BOTON_SEC}><IconDownload size={15} /> XML</a>}
        {comoXml && vista && <BotonImprimir className={BOTON_SEC} />}
      </div>
      {!comoXml ? (
        <iframe src={`/api/finanzas/dte/archivo/${f.id}/pdf`} title={titulo} className="h-[80vh] w-full rounded-xl border border-borde bg-white" />
      ) : vista ? (
        <Documento v={vista} />
      ) : (
        <div className={`${TARJETA} p-6 text-sm text-gris`}>
          {error ?? "Este documento llegó del Registro de Compras y Ventas del SII sin PDF ni XML. Se puede subir desde «Subir documento», o lo traerá SimpleFactura cuando esté conectado."}
          <dl className="mt-4 grid max-w-md grid-cols-2 gap-1 text-[13px] text-tinta">
            <dt className="text-gris">RUT</dt><dd>{f.rut ?? "—"}</dd>
            <dt className="text-gris">Neto</dt><dd>{f.neto !== null ? clp(f.neto) : "—"}</dd>
            <dt className="text-gris">IVA</dt><dd>{f.iva !== null ? clp(f.iva) : "—"}</dd>
            <dt className="text-gris">Exento</dt><dd>{f.exento !== null ? clp(f.exento) : "—"}</dd>
            <dt className="text-gris">Total</dt><dd className="font-semibold">{f.total !== null ? clp(f.total) : "—"}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
