import type { Metadata } from "next";
import { IconAlertTriangle, IconCircleCheck, IconFileTypePdf, IconPencil } from "@tabler/icons-react";
import { marcarVistoOc, ocPublica } from "@/lib/fin/oc-enlace";
import { formatoMonto, netoLineaOc, totalesOc } from "@/lib/fin/oc-modelo";
import RespuestaOc from "@/components/fin/RespuestaOc";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orden de compra", robots: { index: false, follow: false } };

const fechaCl = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("-") : "—");
const HOJA = "rounded-[22px] border border-borde/60 bg-superficie shadow-[0_1px_2px_rgba(23,20,17,0.04),0_14px_36px_-18px_rgba(23,20,17,0.18)]";

/**
 * Lo que ve el proveedor al abrir el botón del correo de la OC: la orden, su PDF y dos caminos: confirmarla o pedir
 * una modificación a quien la envió. Pública (sin sesión): lo que autoriza es el código del enlace. Ver lib/fin/oc-enlace.ts.
 */
export default async function OcPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const oc = await ocPublica(token);

  if (!oc) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
        <div className={`${HOJA} w-full p-8 text-center`}>
          <IconAlertTriangle size={32} className="mx-auto text-aviso" />
          <h1 className="mt-3 text-lg font-bold text-tinta">Este enlace no es válido</h1>
          <p className="mt-1 text-sm text-gris">Revisa que el enlace esté completo, o pide a quien te envió la orden de compra que te la reenvíe.</p>
        </div>
      </main>
    );
  }

  await marcarVistoOc(oc.enlace);
  const d = oc.documento;
  const t = totalesOc(d.lineas, d.tasaIva, d.moneda);
  const confirmada = oc.respuestaOc.respuesta === "aceptada";
  const pidioCambio = oc.enlace.respuesta === "modificacion";
  const puedeResponder = !oc.anulada && !oc.respuestaOc.respuesta && oc.estado === "vigente";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-8 sm:py-12">
      <header className={`${HOJA} flex flex-wrap items-center gap-4 p-5 sm:p-6`}>
        {d.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URI del logo de la empresa, armado por el servidor
          <img src={d.logo} alt={d.empresa.nombre} className="h-12 w-auto max-w-[10rem] object-contain" />
        ) : (
          <span className="text-lg font-extrabold text-tinta">{d.empresa.nombre}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-naranjo">Orden de compra</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-tinta">{d.numero}</h1>
          <p className="text-sm text-gris">{d.empresa.nombre}{d.empresa.rut ? ` · RUT ${d.empresa.rut}` : ""} · emitida el {fechaCl(d.fecha)}</p>
        </div>
        <a href={`/oc/${token}/pdf`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-tinta/[0.06] px-4 text-sm font-semibold text-tinta transition hover:bg-tinta/[0.1]">
          <IconFileTypePdf size={17} /> Ver PDF
        </a>
      </header>

      {oc.anulada && <Aviso tono="alerta" titulo="Esta orden de compra fue anulada">Ya no es necesario responderla. Si tienes dudas, contacta a quien te la envió.</Aviso>}
      {confirmada && (
        <Aviso tono="ok" titulo="Orden de compra confirmada">
          Confirmada el {fechaCl(oc.respuestaOc.fecha)}{oc.respuestaOc.por ? ` por ${oc.respuestaOc.por.replace(/ \(proveedor, por enlace\)$/, "")}` : ""}. Gracias.
        </Aviso>
      )}
      {pidioCambio && !confirmada && (
        <Aviso tono="aviso" titulo="Pediste una modificación">
          {oc.enlace.respuestaNombre} la pidió el {fechaCl(oc.enlace.respondidoEn)}: «{oc.enlace.respuestaComentario}». Quien te envió la orden la va a revisar y te enviará una versión corregida.
        </Aviso>
      )}
      {!oc.anulada && !confirmada && !pidioCambio && oc.estado === "vencido" && (
        <Aviso tono="aviso" titulo="Este enlace ya no está vigente">Hay una versión más nueva de esta orden de compra, o el enlace venció. Revisa el último correo que te llegó o pide que te la reenvíen.</Aviso>
      )}

      <section className={`${HOJA} p-5 sm:p-6`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Dato titulo="Proveedor" valor={d.proveedor ? `${d.proveedor.nombre}${d.proveedor.rut ? ` · ${d.proveedor.rut}` : ""}` : "—"} />
          <Dato titulo="Atención" valor={d.atencion ?? "—"} />
          <Dato titulo="Descripción" valor={d.titulo} />
          <Dato titulo="Se necesita para" valor={d.fechaRequerida ? fechaCl(d.fechaRequerida) : "—"} />
          {d.entregaLugar && <Dato titulo="Lugar de entrega" valor={d.entregaLugar} />}
          {d.entregaPlazo && <Dato titulo="Plazo de entrega" valor={d.entregaPlazo} />}
          {(d.formaPago || d.condicionPagoDias !== null) && <Dato titulo="Pago" valor={[d.formaPago, d.condicionPagoDias !== null ? (d.condicionPagoDias === 0 ? "contado" : `a ${d.condicionPagoDias} días`) : null].filter(Boolean).join(" · ")} />}
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-borde/60">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="bg-tinta/[0.035] text-left text-[11px] font-bold uppercase tracking-wide text-gris">
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2 text-right">Precio unit.</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/60">
              {d.lineas.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-tinta">{l.descripcion}</span>
                    {l.nota && <span className="mt-0.5 block whitespace-pre-line text-xs text-gris">{l.nota}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.cantidad.toLocaleString("es-CL")}</td>
                  <td className="px-3 py-2.5 text-gris">{l.unidad ?? ""}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatoMonto(l.precioUnitario, d.moneda)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatoMonto(netoLineaOc(l, d.moneda), d.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-xl bg-tinta/[0.03] px-4 py-3 text-sm">
          <dt className="text-gris">{t.exento > 0 ? "Neto afecto" : "Neto"}</dt><dd className="text-right tabular-nums">{formatoMonto(t.neto, d.moneda)}</dd>
          {t.exento > 0 && <><dt className="text-gris">Exento</dt><dd className="text-right tabular-nums">{formatoMonto(t.exento, d.moneda)}</dd></>}
          <dt className="text-gris">IVA {Math.round(d.tasaIva * 100)}%</dt><dd className="text-right tabular-nums">{formatoMonto(t.iva, d.moneda)}</dd>
          <dt className="font-bold text-tinta">Total</dt><dd className="text-right text-lg font-extrabold tabular-nums text-tinta">{formatoMonto(t.total, d.moneda)}</dd>
        </dl>
        {d.observaciones && <p className="mt-4 whitespace-pre-line text-sm text-tinta/80"><span className="font-semibold text-tinta">Observaciones: </span>{d.observaciones}</p>}
      </section>

      {puedeResponder && (
        <section className={`${HOJA} p-5 sm:p-6`}>
          <h2 className="flex items-center gap-2 text-base font-bold text-tinta"><IconCircleCheck size={19} className="text-naranjo" /> ¿Confirmas esta orden de compra?</h2>
          <p className="mt-1 text-sm text-gris">
            Al confirmarla le avisamos a quien te la envió. Si algo no calza (precios, cantidades, plazos), usa <IconPencil size={13} className="inline" /> «Pedir modificación» y cuéntanos qué cambiar.
          </p>
          <RespuestaOc token={token} />
        </section>
      )}

      <p className="text-center text-xs text-gris-suave">{d.empresa.nombre}{d.empresa.web ? ` · ${d.empresa.web}` : ""}{d.empresa.telefono ? ` · ${d.empresa.telefono}` : ""}</p>
    </main>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gris-suave">{titulo}</p>
      <p className="text-sm text-tinta">{valor}</p>
    </div>
  );
}

function Aviso({ tono, titulo, children }: { tono: "ok" | "aviso" | "alerta"; titulo: string; children: React.ReactNode }) {
  const estilo = tono === "ok" ? "border-emerald-500/30 bg-emerald-500/[0.07]" : tono === "aviso" ? "border-amber-500/40 bg-amber-500/[0.08]" : "border-rose-500/30 bg-rose-500/[0.07]";
  return (
    <div className={`rounded-2xl border px-5 py-4 ${estilo}`}>
      <p className="font-bold text-tinta">{titulo}</p>
      <p className="mt-0.5 text-sm text-tinta/80">{children}</p>
    </div>
  );
}
