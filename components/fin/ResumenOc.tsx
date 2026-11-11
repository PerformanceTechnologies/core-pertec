import { formatoMonto, netoLineaOc, aPesos, totalesOc } from "@/lib/fin/oc-modelo";
import type { ResumenCompra } from "@/lib/fin/oc-resumen";
import { fechaCl } from "@/lib/fin/reglas";
import { Chip, tonoPaso } from "./piezas";
import type { PasoCompra } from "@/lib/fin/reglas";

const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }) : null);

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-gris">{etiqueta}</dt>
      <dd className="text-sm text-tinta [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/**
 * El resumen completo de una solicitud con formato de OC: lo que se pide comprar, a quién, cuánto, cómo y dónde se entrega,
 * y en qué punto va. Es lo que ve quien aprueba o visa (en el popup) y lo que muestra el detalle. En el celular los ítems se
 * apilan como tarjetas; desde tablet son una tabla.
 */
export default function ResumenOc({ r }: { r: ResumenCompra }) {
  const m = r.moneda;
  const t = totalesOc(r.lineas, r.tasaIva, m);
  const pago = r.condicionPagoDias === null ? r.formaPago : [r.condicionPagoDias === 0 ? "Contado" : `${r.condicionPagoDias} días`, r.formaPago].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gris">{r.codigo}{r.ocNumero ? ` · ${r.ocNumero}` : " · OC sin número aún"}</span>
        <Chip texto={r.anulada ? "Anulada" : r.paso} tono={tonoPaso((r.anulada ? "Anulada" : r.paso) as PasoCompra)} />
      </div>
      <h3 className="text-base font-extrabold leading-snug text-tinta [overflow-wrap:anywhere]">{r.titulo}</h3>

      {r.devuelta && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-xs text-alerta">
          <strong>Devuelta{r.devuelta.por ? ` por ${r.devuelta.por}` : ""}:</strong> {r.devuelta.motivo}
        </p>
      )}
      {r.anulada && r.motivoAnulacion && <p className="rounded-lg border border-borde bg-tinta/[0.04] px-3 py-2 text-xs text-gris">Anulada: {r.motivoAnulacion}</p>}

      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Dato etiqueta="Proveedor">{r.proveedor ? <>{r.proveedor.nombre}{r.proveedor.rut ? <span className="text-gris"> · {r.proveedor.rut}</span> : null}</> : <span className="text-gris">Sin proveedor</span>}</Dato>
        <Dato etiqueta="Proyecto">{r.proyecto ?? "General"}</Dato>
        <Dato etiqueta="Solicita">{r.solicitante}</Dato>
        {r.atencion && <Dato etiqueta="Atención del proveedor">{r.atencion}{r.proveedorCorreo ? <span className="text-gris"> · {r.proveedorCorreo}</span> : null}</Dato>}
        {r.fechaRequerida && <Dato etiqueta="Se necesita para">{fechaCl(r.fechaRequerida)}</Dato>}
        {(r.entregaLugar || r.entregaPlazo) && <Dato etiqueta="Entrega">{[r.entregaLugar, r.entregaPlazo].filter(Boolean).join(" · ")}</Dato>}
        {pago && <Dato etiqueta="Pago">{pago}</Dato>}
        <Dato etiqueta="Moneda">{m}{m !== "CLP" ? <span className="text-gris"> · {formatoMonto(r.tipoCambio, "CLP")} por {m}</span> : null}</Dato>
      </dl>

      {/* Ítems: tarjetas en el celular, tabla desde tablet. */}
      <div className="sm:hidden">
        <ul className="space-y-2">
          {r.lineas.map((l, i) => (
            <li key={i} className="rounded-xl border border-borde bg-superficie px-3 py-2">
              <p className="font-semibold text-tinta [overflow-wrap:anywhere]">{l.descripcion}</p>
              {l.nota && <p className="text-xs text-gris [overflow-wrap:anywhere]">{l.nota}</p>}
              <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-gris">
                <span>{l.cantidad.toLocaleString("es-CL", { maximumFractionDigits: 2 })}{l.unidad ? ` ${l.unidad}` : ""} × {formatoMonto(l.precioUnitario, m)}{l.descuentoPct > 0 ? ` (−${Math.round(l.descuentoPct * 1000) / 10}%)` : ""}{l.exento ? " · exento" : ""}</span>
                <b className="text-sm tabular-nums text-tinta">{formatoMonto(netoLineaOc(l, m), m)}</b>
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-borde sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde text-left text-[10px] font-bold uppercase tracking-wide text-gris">
              <th className="px-3 py-2">Descripción</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {r.lineas.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2 align-top [overflow-wrap:anywhere]">{l.descripcion}{l.nota && <span className="block text-xs text-gris">{l.nota}</span>}{l.exento && <span className="block text-[11px] text-gris">Exento de IVA</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">{l.cantidad.toLocaleString("es-CL", { maximumFractionDigits: 2 })}{l.unidad ? ` ${l.unidad}` : ""}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">{formatoMonto(l.precioUnitario, m)}{l.descuentoPct > 0 && <span className="block text-[11px] text-gris">−{Math.round(l.descuentoPct * 1000) / 10}%</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top font-semibold tabular-nums">{formatoMonto(netoLineaOc(l, m), m)}</td>
              </tr>
            ))}
            {r.lineas.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-gris">Sin ítems todavía.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-xs space-y-1 rounded-xl bg-tinta/[0.04] px-4 py-3 text-sm">
        <p className="flex justify-between"><span className="text-gris">{t.exento > 0 ? "Neto afecto" : "Neto"}</span><span className="tabular-nums">{formatoMonto(t.neto, m)}</span></p>
        {t.exento > 0 && <p className="flex justify-between"><span className="text-gris">Exento</span><span className="tabular-nums">{formatoMonto(t.exento, m)}</span></p>}
        <p className="flex justify-between"><span className="text-gris">IVA {Math.round(r.tasaIva * 1000) / 10}%</span><span className="tabular-nums">{formatoMonto(t.iva, m)}</span></p>
        <p className="flex justify-between border-t border-borde pt-1 text-base font-extrabold text-tinta"><span>Total</span><span className="tabular-nums">{formatoMonto(t.total, m)}</span></p>
        {m !== "CLP" && <p className="flex justify-between text-xs text-gris"><span>En pesos</span><span className="tabular-nums">{formatoMonto(aPesos(t.total, m, r.tipoCambio), "CLP")}</span></p>}
      </div>

      {r.observaciones && <div><p className="text-[10px] font-bold uppercase tracking-wide text-gris">Observaciones</p><p className="whitespace-pre-line text-sm text-tinta [overflow-wrap:anywhere]">{r.observaciones}</p></div>}

      {(r.enviadaPor || r.aprobadoPor || r.visadoPor) && (
        <ul className="space-y-0.5 border-t border-borde pt-3 text-xs text-gris">
          {r.enviadaPor && <li>Enviada a aprobación por <strong className="text-tinta">{r.enviadaPor.split("@")[0]}</strong> · {cuando(r.enviadaEn)}</li>}
          {r.aprobadoPor && <li>Aprobada por <strong className="text-tinta">{r.aprobadoPor}</strong>{r.fechaAprobacion ? ` · ${fechaCl(r.fechaAprobacion)}` : ""}</li>}
          {r.visadoPor && <li>Visada por <strong className="text-tinta">{r.visadoPor}</strong>{r.fechaVisado ? ` · ${fechaCl(r.fechaVisado)}` : ""}</li>}
        </ul>
      )}
    </div>
  );
}
