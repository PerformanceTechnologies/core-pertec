import type { Metadata } from "next";
import { IconAlertTriangle, IconCircleCheck, IconFileTypePdf, IconPencil } from "@tabler/icons-react";
import { cotizacionPublica, marcarVistoCotizacion } from "@/lib/fin/cotizacion-enlace";
import { vigenteHasta } from "@/lib/fin/cotizacion-documento";
import { lineaNeta, totalesCotizacion } from "@/lib/fin/modelo";
import { clp } from "@/lib/fin/reglas";
import RespuestaCotizacion from "@/components/fin/RespuestaCotizacion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cotización", robots: { index: false, follow: false } };

const fechaCl = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("-") : "—");
const HOJA = "rounded-[22px] border border-borde/60 bg-superficie shadow-[0_1px_2px_rgba(23,20,17,0.04),0_14px_36px_-18px_rgba(23,20,17,0.18)]";

/**
 * Lo que ve el cliente al abrir el botón del correo de la cotización: la cotización, su PDF y dos caminos: aceptarla o
 * pedir una modificación a quien la envió. Pública (sin sesión): lo que autoriza es el código del enlace.
 * Ver lib/fin/cotizacion-enlace.ts.
 */
export default async function CotizacionPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cot = await cotizacionPublica(token);

  if (!cot) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
        <div className={`${HOJA} w-full p-8 text-center`}>
          <IconAlertTriangle size={32} className="mx-auto text-aviso" />
          <h1 className="mt-3 text-lg font-bold text-tinta">Este enlace no es válido</h1>
          <p className="mt-1 text-sm text-gris">Revisa que el enlace esté completo, o pide a quien te envió la cotización que te la reenvíe.</p>
        </div>
      </main>
    );
  }

  await marcarVistoCotizacion(cot.enlace);
  const d = cot.documento;
  const t = totalesCotizacion(d.lineas, d.tasaIva, d.descuentoGeneral);
  const aceptada = cot.estadoCotizacion === "aceptada";
  const cerrada = !["borrador", "enviada", "aceptada"].includes(cot.estadoCotizacion);
  const pidioCambio = cot.enlace.respuesta === "modificacion";
  const hasta = vigenteHasta(d.fecha, d.validezDias);
  const vencida = hasta < new Date().toISOString().slice(0, 10);
  const puedeResponder = !aceptada && !cerrada && cot.estado === "vigente";
  const numero = `${d.numero}${d.version > 1 ? ` V${d.version}` : ""}`;
  const arriendo = d.tipo === "arriendo";

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
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-naranjo">Cotización</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-tinta">{numero}</h1>
          <p className="text-sm text-gris">{d.empresa.nombre}{d.empresa.rut ? ` · RUT ${d.empresa.rut}` : ""} · emitida el {fechaCl(d.fecha)} · válida hasta el {fechaCl(hasta)}</p>
        </div>
        <a href={`/cotizacion/${token}/pdf`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-tinta/[0.06] px-4 text-sm font-semibold text-tinta transition hover:bg-tinta/[0.1]">
          <IconFileTypePdf size={17} /> Ver PDF
        </a>
      </header>

      {aceptada && <Aviso tono="ok" titulo="Cotización aceptada">Aceptada el {fechaCl(cot.fechaAceptacion)}. Gracias: quien te la envió se pondrá en contacto para coordinar.</Aviso>}
      {cerrada && <Aviso tono="alerta" titulo="Esta cotización ya no está vigente">Contacta a quien te la envió si necesitas una nueva.</Aviso>}
      {pidioCambio && !aceptada && (
        <Aviso tono="aviso" titulo="Pediste una modificación">
          {cot.enlace.respuestaNombre} la pidió el {fechaCl(cot.enlace.respondidoEn)}: «{cot.enlace.respuestaComentario}». Quien te envió la cotización la va a revisar y te enviará una versión corregida.
        </Aviso>
      )}
      {!aceptada && !cerrada && !pidioCambio && cot.estado === "vencido" && (
        <Aviso tono="aviso" titulo="Este enlace ya no está vigente">Hay una versión más nueva de esta cotización, o el enlace venció. Revisa el último correo que te llegó o pide que te la reenvíen.</Aviso>
      )}
      {puedeResponder && vencida && <Aviso tono="aviso" titulo="La vigencia de esta cotización ya pasó">Igual puedes aceptarla o pedir una modificación: quien te la envió confirmará los valores.</Aviso>}

      <section className={`${HOJA} p-5 sm:p-6`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Dato titulo="Cliente" valor={d.cliente ? `${d.cliente.nombre}${d.cliente.rut ? ` · ${d.cliente.rut}` : ""}` : "—"} />
          <Dato titulo="Atención" valor={d.atencion ?? "—"} />
          <Dato titulo="Descripción" valor={d.titulo} />
          <Dato titulo="Cotiza" valor={`${d.emisor.nombre} · ${d.emisor.correo}`} />
          {d.plazoEntrega && <Dato titulo="Plazo de entrega o inicio" valor={d.plazoEntrega} />}
          {(d.formaPago || d.condicionPagoDias !== null) && <Dato titulo="Pago" valor={d.formaPago || (d.condicionPagoDias === 0 ? "Contado" : `A ${d.condicionPagoDias} días`)} />}
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-borde/60">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="bg-tinta/[0.035] text-left text-[11px] font-bold uppercase tracking-wide text-gris">
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                {arriendo && <th className="px-3 py-2 text-right">{d.arriendoUnidad === "dia" ? "Días" : "Meses"}</th>}
                <th className="px-3 py-2 text-right">Precio unit.</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/60">
              {d.lineas.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-tinta">{l.descripcion}</span>
                    {l.exento && <span className="ml-1 text-xs text-gris">(exento)</span>}
                    {l.nota && <span className="mt-0.5 block whitespace-pre-line text-xs text-gris">{l.nota}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.cantidad.toLocaleString("es-CL")}{l.unidad ? ` ${l.unidad}` : ""}</td>
                  {arriendo && <td className="px-3 py-2.5 text-right tabular-nums">{l.meses ?? "—"}</td>}
                  <td className="px-3 py-2.5 text-right tabular-nums">{clp(l.precioUnitario)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{clp(lineaNeta(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-xl bg-tinta/[0.03] px-4 py-3 text-sm">
          {t.descuento > 0 && <><dt className="text-gris">Descuento</dt><dd className="text-right tabular-nums">−{clp(t.descuento)}</dd></>}
          <dt className="text-gris">{t.exento > 0 ? "Neto afecto" : "Neto"}</dt><dd className="text-right tabular-nums">{clp(t.neto)}</dd>
          {t.exento > 0 && <><dt className="text-gris">Exento</dt><dd className="text-right tabular-nums">{clp(t.exento)}</dd></>}
          <dt className="text-gris">IVA {Math.round(d.tasaIva * 100)}%</dt><dd className="text-right tabular-nums">{clp(t.iva)}</dd>
          <dt className="font-bold text-tinta">Total</dt><dd className="text-right text-lg font-extrabold tabular-nums text-tinta">{clp(t.total)}</dd>
        </dl>
        {d.condicionesGenerales && <p className="mt-4 whitespace-pre-line text-xs leading-relaxed text-gris"><span className="font-semibold text-tinta">Condiciones generales: </span>{d.condicionesGenerales}</p>}
        {d.notas && <p className="mt-3 whitespace-pre-line text-sm text-tinta/80"><span className="font-semibold text-tinta">Observaciones: </span>{d.notas}</p>}
      </section>

      {puedeResponder && (
        <section className={`${HOJA} p-5 sm:p-6`}>
          <h2 className="flex items-center gap-2 text-base font-bold text-tinta"><IconCircleCheck size={19} className="text-naranjo" /> ¿Aceptas esta cotización?</h2>
          <p className="mt-1 text-sm text-gris">
            Al aceptarla le avisamos a quien te la envió{d.requiereOc ? "; si ya tienes tu orden de compra, escribe su número" : ""}. Si algo no calza (valores, cantidades, plazos), usa <IconPencil size={13} className="inline" /> «Pedir modificación» y cuéntanos qué cambiar.
          </p>
          <RespuestaCotizacion token={token} pideOc={d.requiereOc} />
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
