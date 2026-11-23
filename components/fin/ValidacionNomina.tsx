import Link from "next/link";
import { IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";
import { RUTA_FIN } from "@/lib/fin/datos";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { claveRut, type EstadoPersona, type EstadoValidacion, type ResumenValidacion, type ValidacionMes } from "@/lib/fin/nominas-modelo";
import { TARJETA } from "@/lib/estilos";
import { Chip, TD, TH } from "@/components/fin/piezas";

// Validación del líquido de BUK contra la nómina que pagó el banco. Dos vistas:
//  · TarjetaValidacion: el resumen de un mes, SIN personas (va en la pestaña Remuneraciones).
//  · DetallePersonas: persona por persona (va solo en el desglose, que exige permiso y deja registro).
// Server Components puros: no hay estado ni hooks.

export const TONO_VALIDACION: Record<EstadoValidacion, string> = {
  Cuadra: "bg-emerald-500/12 text-ok dark:text-emerald-300",
  Diferencias: "bg-rose-500/12 text-alerta dark:text-rose-300",
  "Por pagar": "bg-sky-500/10 text-info dark:text-sky-300",
  "Sin nómina": "bg-amber-500/12 text-aviso dark:text-amber-300",
  "Sin datos": "bg-slate-500/10 text-slate-500 dark:text-slate-300",
};

const TONO_PERSONA: Record<EstadoPersona, string> = {
  igual: "bg-emerald-500/12 text-ok dark:text-emerald-300",
  difiere: "bg-rose-500/12 text-alerta dark:text-rose-300",
  "sin pago": "bg-amber-500/12 text-aviso dark:text-amber-300",
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que significa el estado, en una frase. */
function frase(v: ResumenValidacion, fechaPago: string): string {
  const nom = v.nomina;
  switch (v.estado) {
    case "Cuadra":
      return `El líquido de BUK coincide, persona por persona, con lo que pagó la nómina ${nom?.idNomina} del ${fechaCl(nom?.fechaPago ?? fechaPago)}.`;
    case "Diferencias": {
      const partes = [
        v.difieren > 0 && `${plural(v.difieren, "persona con monto distinto", "personas con monto distinto")}`,
        v.sinPago > 0 && `${plural(v.sinPago, "persona sin pago", "personas sin pago")}`,
        v.extras.personas > 0 && `${plural(v.extras.personas, "pago a alguien que no está en el libro", "pagos a personas que no están en el libro")}`,
        v.noPagados > 0 && `${plural(v.noPagados, "pago que el banco no realizó", "pagos que el banco no realizó")}`,
      ].filter(Boolean);
      return `El líquido de BUK no coincide con lo que pagó la nómina ${nom?.idNomina} del ${fechaCl(nom?.fechaPago ?? fechaPago)}: ${partes.join(", ")}.`;
    }
    case "Por pagar":
      return `Todavía no llega la fecha de pago del líquido (${fechaCl(fechaPago)}): aún no hay nómina que validar.`;
    case "Sin nómina":
      return `Ya pasó la fecha de pago (${fechaCl(fechaPago)}) y el banco no muestra una nómina pagada que cubra a las personas de este libro.`;
    default:
      return "Emisso no tiene nóminas del banco guardadas para este mes, así que no hay con qué validar.";
  }
}

function Dif({ monto }: { monto: number }) {
  if (monto === 0) return <span className="text-ok dark:text-emerald-300">$0</span>;
  return <span className="text-alerta dark:text-rose-300">{monto > 0 ? "+" : "−"}{clp(Math.abs(monto))}</span>;
}

function Alertas({ v }: { v: ResumenValidacion }) {
  if (v.alertas.length === 0) return null;
  return (
    <ul className="space-y-1">
      {v.alertas.map((a) => (
        <li key={a} className="flex items-start gap-1.5 text-xs font-medium text-aviso"><IconAlertTriangle size={14} className="mt-px shrink-0" /> {a}</li>
      ))}
    </ul>
  );
}

function Otros({ v }: { v: ResumenValidacion }) {
  if (v.otros.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-tinta">
        Otros pagos a personas del libro este mes <span className="font-normal text-gris">· anticipos, bonos o reembolsos: no son parte del líquido</span>
      </p>
      <ul className="mt-1 divide-y divide-borde border-t border-borde text-xs">
        {v.otros.map((o) => (
          <li key={o.idNomina} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1">
            <span className="tabular-nums text-gris">{o.fechaPago ? fechaCl(o.fechaPago) : "—"}</span>
            <span className="text-gris">Nómina {o.idNomina}</span>
            <span className="min-w-0 flex-1">{plural(o.personas, "persona", "personas")}{o.mixta ? " · la nómina incluye además otros pagos" : ""}</span>
            <span className="tabular-nums">{clp(o.monto)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** El resumen de un mes, sin personas ni RUT. */
export function TarjetaValidacion({ v, periodo, fechaPago }: { v: ResumenValidacion; periodo: string; fechaPago: string }) {
  const nom = v.nomina;
  return (
    <div className={`${TARJETA} space-y-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-tinta">{frase(v, fechaPago)}</p>
        <Chip texto={v.estado} tono={TONO_VALIDACION[v.estado]} />
      </div>
      {nom && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt className="text-[11px] text-gris">Líquido en BUK</dt><dd className="font-condensed text-xl font-bold tabular-nums text-tinta">{clp(v.totalBuk)}</dd></div>
            <div><dt className="text-[11px] text-gris">Pagado en la nómina</dt><dd className="font-condensed text-xl font-bold tabular-nums text-tinta">{clp(v.totalPagado)}</dd></div>
            <div><dt className="text-[11px] text-gris">Diferencia</dt><dd className="font-condensed text-xl font-bold tabular-nums"><Dif monto={v.diferenciaNeta} /></dd></div>
            <div>
              <dt className="text-[11px] text-gris">Personas</dt>
              <dd className="text-sm tabular-nums text-tinta">{v.igual} igual{v.igual === 1 ? "" : "es"} · {v.difieren} distinto{v.difieren === 1 ? "" : "s"} · {v.sinPago} sin pago</dd>
            </div>
          </dl>
          <p className="text-xs text-gris">
            Nómina <span className="tabular-nums">{nom.idNomina}</span> · {nom.estado} · {nom.fechaPago ? fechaCl(nom.fechaPago) : "sin fecha de pago"} · total {clp(nom.monto)}.{" "}
            {nom.movimiento ? (
              <>Cargo en el banco: <span className="tabular-nums">{fechaCl(nom.movimiento.fecha)}</span> · {nom.movimiento.glosa} · {clp(-nom.movimiento.monto)}.</>
            ) : (
              <span className="text-aviso">Sin cargo ligado en Tesorería.</span>
            )}
          </p>
        </>
      )}
      <Otros v={v} />
      <Alertas v={v} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-2">
        <p className="text-[11px] text-gris">
          Se compara el líquido de cada persona en BUK con lo que pagó la nómina del banco (por RUT). Tolerancia: $1 por persona, por redondeo.
        </p>
        {nom && (
          <Link href={`${RUTA_FIN}/remuneraciones/desglose?mes=${periodo}`} prefetch={false} className="inline-flex items-center gap-1 text-xs font-semibold text-naranjo hover:underline">
            Ver el detalle por persona <IconArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

const ETIQUETA_PERSONA = (p: { estado: EstadoPersona; diferencia: number }) =>
  p.estado === "igual" ? "Igual" : p.estado === "sin pago" ? "Sin pago" : p.diferencia > 0 ? "Pagado de más" : "Pagado de menos";

/** Persona por persona. Muestra nombres: solo en el desglose, que ya exige permiso y deja registro. */
export function DetallePersonas({ v, nombres, fechaPago }: { v: ValidacionMes; nombres: Map<string, string>; fechaPago: string }) {
  const nombreDe = (rut: string) => nombres.get(claveRut(rut)) ?? rut;
  const orden = [...v.personas].sort((a, b) => Number(b.estado !== "igual") - Number(a.estado !== "igual") || nombreDe(a.rut).localeCompare(nombreDe(b.rut), "es"));
  return (
    <div className={`${TARJETA} space-y-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-tinta">Validación contra la nómina del banco</h3>
          <p className="mt-0.5 text-sm text-gris">{frase(v, fechaPago)}</p>
        </div>
        <Chip texto={v.estado} tono={TONO_VALIDACION[v.estado]} />
      </div>
      {v.nomina && (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[34rem]">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Persona</th>
                <th className={`${TH} text-right`}>Líquido en BUK</th>
                <th className={`${TH} text-right`}>Pagado en la nómina</th>
                <th className={`${TH} text-right`}>Diferencia</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {orden.map((p) => (
                <tr key={p.rut}>
                  <td className={`${TD} font-semibold text-tinta`}>{nombreDe(p.rut)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{clp(p.liquido)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p.estado === "sin pago" ? "—" : clp(p.pagado)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p.estado === "sin pago" ? "—" : <Dif monto={p.diferencia} />}</td>
                  <td className={TD}><Chip texto={ETIQUETA_PERSONA(p)} tono={TONO_PERSONA[p.estado]} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-borde bg-tinta/[0.04] text-[13px] font-bold">
                <td className={TD}>Total ({v.personas.length})</td>
                <td className={`${TD} text-right tabular-nums`}>{clp(v.totalBuk)}</td>
                <td className={`${TD} text-right tabular-nums`}>{clp(v.totalPagado)}</td>
                <td className={`${TD} text-right tabular-nums`}><Dif monto={v.diferenciaNeta} /></td>
                <td className={TD} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {v.extras.personas > 0 && (
        <p className="text-xs font-medium text-aviso">
          La misma nómina le pagó además a {plural(v.extras.personas, "persona que no está", "personas que no están")} en el libro de BUK de este mes, por {clp(v.extras.monto)}.
        </p>
      )}
      <Otros v={v} />
      <Alertas v={v} />
    </div>
  );
}
