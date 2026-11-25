import Link from "next/link";
import { IconAlertTriangle, IconFlask, IconInfoCircle } from "@tabler/icons-react";

// -----------------------------------------------------------------------------
//  Encabezado compacto de Facturación electrónica: una tarjeta de dos líneas (cifra + estado arriba, recorrido abajo)
//  y los avisos en una sola fila. Propio de Facturación: la Banda compartida de Finanzas no cambia.
// -----------------------------------------------------------------------------

export interface PasoFacturacion {
  titulo: string;
  ayuda: string;
  n: number;
  href: string;
  alerta?: boolean;
}

const PILDORA = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold";

export default function EncabezadoFacturacion({
  valor, detalle, info, prueba, bloqueo, urgentes, sinRegistrar, pasos,
}: {
  valor: string;
  detalle: string;
  /** Explicación larga (queda en el icono de información, no ocupa una línea). */
  info: string;
  prueba: boolean;
  /** Por qué no se puede emitir todavía, o null si está listo. */
  bloqueo: string | null;
  urgentes: number;
  sinRegistrar: number;
  pasos: PasoFacturacion[];
}) {
  return (
    <div className="space-y-2">
      <section className="rounded-2xl border border-borde/60 bg-superficie px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-baseline gap-2.5">
            <span className="animar-cifra font-condensed text-3xl font-bold leading-none tabular-nums text-tinta">{valor}</span>
            <span className="text-[11.5px] leading-tight text-gris">{detalle}</span>
            <span title={info} className="cursor-help self-center text-gris-suave" aria-label={info}><IconInfoCircle size={15} /></span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${PILDORA} ${prueba ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-emerald-500/12 text-ok"}`}>Ambiente: {prueba ? "Pruebas" : "Producción"}</span>
            <span className={`${PILDORA} ${bloqueo ? "bg-amber-500/12 text-aviso" : "bg-emerald-500/12 text-ok"}`}>{bloqueo ? "Por configurar" : "Listo para emitir"}</span>
            <span className={`${PILDORA} ${urgentes > 0 ? "bg-naranjo/10 text-naranjo" : "bg-tinta/[0.05] text-tinta/70"}`}>Recibidos urgentes: {urgentes}</span>
            <span className={`${PILDORA} bg-tinta/[0.05] text-tinta/70`}>Sin registrar en Compras: {sinRegistrar}</span>
          </div>
        </div>
        <ol className="mt-2 grid grid-cols-2 gap-x-1 border-t border-borde/60 pt-1.5 sm:grid-cols-3 lg:grid-cols-5" aria-label="Cómo avanza">
          {pasos.map((p, i) => {
            const pendiente = p.n > 0;
            return (
              <li key={p.titulo} className="min-w-0">
                <Link href={p.href} scroll={false} className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-tinta/[0.04]" title={`${p.titulo} · ${p.ayuda}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums ${p.alerta && pendiente ? "bg-naranjo text-white" : pendiente ? "bg-naranjo/12 text-naranjo" : "bg-tinta/[0.05] text-gris"}`}>{i + 1}</span>
                  <span className="min-w-0 leading-tight">
                    <span className="flex items-center gap-1 text-xs font-semibold text-tinta">
                      <span className="truncate">{p.titulo}</span>
                      {pendiente && <span className="rounded-full bg-naranjo px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">{p.n}</span>}
                    </span>
                    <span className="block truncate text-[10.5px] text-gris">{p.ayuda}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {(prueba || bloqueo) && (
        <div className={`grid gap-2 ${prueba && bloqueo ? "lg:grid-cols-2" : ""}`}>
          {prueba && (
            <p className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.06] px-3 py-1.5 text-[12px] leading-snug text-violet-800 dark:text-violet-200">
              <IconFlask size={15} className="mt-px shrink-0" />
              <span><strong>Ambiente de pruebas.</strong> Lo emitido no tiene valor tributario ni toca hitos, saldos, flujo ni contabilidad. Para producción, el administrador cambia el ambiente en Administración › Integraciones.</span>
            </p>
          )}
          {bloqueo && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/[0.08] px-3 py-1.5 text-[12px] leading-snug text-aviso">
              <IconAlertTriangle size={15} className="mt-px shrink-0" />
              <span>{bloqueo}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
