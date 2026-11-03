import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconFileInvoice, IconListDetails, IconMapPin, IconUser } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, cantidad, claveDocumento, fechaCorta, monto, nombrePdf, pct, unidadLegible } from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import { ChipCategoria, EnlacePdf, Seccion, SinRegistro } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

export default async function DocumentoPage({ params }: { params: Promise<{ n: string }> }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const { n } = await params;
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;
  const doc = vista.documentos.find((d) => d.n === Number(n));
  if (!doc) notFound();

  const k = claveDocumento(doc);
  const lineas = vista.datos.lineas.filter((l) => claveDocumento(l) === k).sort((a, b) => a.n - b.n);
  const nc = /cr[eé]dito/i.test(doc.tipo);
  const cuadra = /^cuadra$/i.test(doc.estadoCuadratura);
  const fueraDeAlcance = doc.montoNeto + doc.montoExento - doc.montoAlcance;

  return (
    <div className="space-y-6">
      <Link href={`${RUTA_VH}/documentos`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo">
        <IconArrowLeft size={14} /> Documentos
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Cabecera como la del DTE */}
        <header className={`${TARJETA} overflow-hidden`}>
          <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${nc ? "bg-rose-500/10 text-rose-600" : "bg-naranjo/10 text-naranjo"}`}>
              <IconFileInvoice size={24} stroke={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{doc.tipo}</p>
              <h2 className="font-condensed text-3xl font-bold tabular-nums text-tinta">N° {doc.folio}</h2>
              <p className="text-sm text-gris">Emitida el {fechaCorta(doc.fecha)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {doc.pdf && <EnlacePdf doc={doc.n} texto="Ver PDF" />}
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cuadra ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                {doc.estadoCuadratura || "Sin estado"}
              </span>
            </div>
          </div>
          <div className="grid gap-4 border-t border-borde p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gris">Proveedor</p>
              <Link href={`${RUTA_VH}/proveedores/${encodeURIComponent(doc.rut)}`} className="mt-1 block font-bold text-tinta hover:text-naranjo">{doc.proveedor}</Link>
              <p className="text-xs tabular-nums text-gris">RUT {doc.rut}</p>
              {(doc.direccion || doc.comuna) && (
                <p className="mt-1 flex items-start gap-1 text-xs text-gris">
                  <IconMapPin size={13} className="mt-0.5 shrink-0" /> {[doc.direccion, doc.comuna].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              {doc.contactoPertec && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gris">Recibió en PERTEC</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-tinta"><IconUser size={14} className="text-gris" /> {doc.contactoPertec}</p>
                </div>
              )}
              {doc.referencias && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gris">Referencias (OC, guías, doc. anulado)</p>
                  <p className="mt-1 whitespace-pre-line text-xs text-tinta">{doc.referencias.replace(/\s+-\s+/g, "\n")}</p>
                </div>
              )}
              {doc.pdf && <p className="truncate text-[10px] text-gris" title={doc.pdf}>Archivo: DTE_SII/{doc.pdf}</p>}
            </div>
          </div>
        </header>

        {/* Montos */}
        <aside className={`${TARJETA} p-5`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gris">Montos del documento</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Fila etiqueta="Neto" valor={doc.montoNeto} />
            {doc.montoExento !== 0 && <Fila etiqueta="Exento" valor={doc.montoExento} />}
            <Fila etiqueta="IVA" valor={doc.iva} />
            {doc.impuestoAdicional !== 0 && <Fila etiqueta="Imp. adicional" valor={doc.impuestoAdicional} />}
            <div className="flex items-baseline justify-between border-t border-borde pt-2">
              <dt className="font-bold text-tinta">Total</dt>
              <dd className={`font-condensed text-2xl font-bold tabular-nums ${doc.total < 0 ? "text-rose-600" : "text-tinta"}`}>{monto(doc.total)}</dd>
            </div>
          </dl>
          <div className="mt-5 rounded-xl bg-naranjo/[0.06] p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-naranjo">En alcance (neto)</p>
            <p className="mt-1 font-condensed text-2xl font-bold tabular-nums text-tinta">{monto(doc.montoAlcance)}</p>
            <p className="text-[11px] text-gris">
              {doc.lineasAlcance} {doc.lineasAlcance === 1 ? "línea" : "líneas"}
              {doc.participacion !== null && ` · ${pct(doc.participacion)} del neto`}
            </p>
            {Math.abs(fueraDeAlcance) >= 1 && <p className="mt-1 text-[11px] text-gris">El resto ({monto(fueraDeAlcance)}) es de servicios, fletes u otros fuera del registro.</p>}
          </div>
        </aside>
      </div>

      <Seccion titulo="Líneas de materiales, herramientas y EPP" icono={<IconListDetails size={15} />}>
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Glosa</th>
                  <th className="px-3 py-3 text-right">Cantidad</th>
                  <th className="px-3 py-3 text-right">Precio unit.</th>
                  <th className="px-3 py-3 text-right">Desc.</th>
                  <th className="px-3 py-3 text-right">Valor línea</th>
                  <th className="px-3 py-3 text-right">Costo unit. real</th>
                  <th className="px-4 py-3 text-right">Valor ajustado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {lineas.map((l) => (
                  <tr key={l.n} className="align-top">
                    <td className="max-w-[28rem] px-4 py-3">
                      <Link href={`${RUTA_VH}/item?c=${encodeURIComponent(l.clave)}`} className="font-semibold leading-snug text-tinta hover:text-naranjo">{l.glosa}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <ChipCategoria nombre={l.subcategoria} chico />
                        {l.codigoProveedor && <span className="font-mono text-gris">{l.codigoProveedor}</span>}
                        {l.revisar && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">Revisar</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-tinta">{cantidad(l.cantidad)} <span className="text-[11px] text-gris">{unidadLegible(l.unidad)}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{l.precioUnitario === null ? "—" : monto(l.precioUnitario)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">
                      {l.descuentoLinea && l.descuentoLinea <= 1 ? `${Math.round(l.descuentoLinea * 1000) / 10}%` : l.descuentoLinea ? l.descuentoLinea.toLocaleString("es-CL") : "—"}
                      {l.factorDescuentoGlobal !== 1 && <span className="block text-[10px] text-emerald-600">global ×{l.factorDescuentoGlobal.toLocaleString("es-CL", { maximumFractionDigits: 4 })}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gris">{monto(l.valorLinea)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-tinta">{l.costoUnitario === null ? "—" : monto(l.costoUnitario)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${l.valorAjustado < 0 ? "text-rose-600" : "text-tinta"}`}>{monto(l.valorAjustado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borde font-bold text-tinta">
                  <td className="px-4 py-3" colSpan={6}>Total en alcance</td>
                  <td className="px-4 py-3 text-right tabular-nums">{monto(doc.montoAlcance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        {doc.pdf && <p className="mt-2 px-1 text-[11px] text-gris">El PDF original ({nombrePdf(doc.pdf)}) se abre desde la carpeta DTE_SII de SharePoint.</p>}
      </Seccion>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-gris">{etiqueta}</dt>
      <dd className="tabular-nums text-tinta">{monto(valor)}</dd>
    </div>
  );
}
