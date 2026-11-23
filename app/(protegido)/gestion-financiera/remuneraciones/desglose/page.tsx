import Link from "next/link";
import { redirect } from "next/navigation";
import { IconAlertTriangle, IconArrowLeft, IconFileSpreadsheet, IconLock } from "@tabler/icons-react";
import { RUTA_FIN, auditar, contextoFin } from "@/lib/fin/datos";
import { clp, fechaCl, mesLargo } from "@/lib/fin/reglas";
import { cargarLibroDelMes, MESES_EN_PANTALLA } from "@/lib/fin/remuneraciones";
import { puedeVerRemuneraciones } from "@/lib/fin/remuneraciones-acceso";
import { periodoValido, sumarMeses, type PersonaLibro } from "@/lib/fin/remuneraciones-modelo";
import { TARJETA } from "@/lib/estilos";
import { Chip, Vacio } from "@/components/fin/piezas";
import { DetallePersonas } from "@/components/fin/ValidacionNomina";
import { claveRut } from "@/lib/fin/nominas-modelo";
import { BOTON, BOTON_SEC } from "@/components/fin/estilos";

export const dynamic = "force-dynamic";

const DESCUENTOS: [keyof PersonaLibro["descuentos"], string][] = [
  ["afp", "AFP"],
  ["salud", "Salud"],
  ["cesantia", "Seguro de cesantía"],
  ["impuesto", "Impuesto único"],
  ["otros", "Otros descuentos"],
];

/**
 * El libro de un mes persona por persona: nombre, RUT y cómo se llega de su sueldo a su líquido. Es lo más sensible del
 * módulo, así que: mismo permiso que la pestaña (se verifica acá, no solo en el botón), no se precarga desde ningún enlace,
 * y cada vez que se abre queda registrado en la auditoría con quién y qué mes.
 */
export default async function DesglosePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await contextoFin();
  if (!(await puedeVerRemuneraciones(ctx))) redirect(RUTA_FIN);
  const sp = await searchParams;
  if (!periodoValido(sp.mes, ctx.hoy)) redirect(`${RUTA_FIN}/remuneraciones`);
  const periodo = sp.mes;
  const volver = `${RUTA_FIN}/remuneraciones?mes=${periodo}`;
  const nombreMes = mesLargo(`${periodo}-01`);

  const r = await cargarLibroDelMes(ctx, periodo);
  if (r.estado !== "ok") {
    const texto = r.estado === "sin-configurar" ? "BUK no está configurado." : r.estado === "error" ? r.mensaje : `BUK no tiene liquidaciones en ${nombreMes}.`;
    return (
      <div className="space-y-4">
        <Link href={volver} className={`${BOTON_SEC} w-fit`}><IconArrowLeft size={14} /> Volver a Remuneraciones</Link>
        <Vacio titulo="No hay desglose para mostrar" texto={texto} />
      </div>
    );
  }
  const { libro } = r;
  await auditar(ctx, "remuneraciones", null, "consultar", `Desglose por persona ${periodo} (${libro.personas.length} personas)`);

  const ps = libro.personas;
  const suma = (f: (p: PersonaLibro) => number) => ps.reduce((s, p) => s + f(p), 0);
  const conControl = ps.filter((p) => Math.abs(p.diferencia) > 1);
  const meses = Array.from({ length: MESES_EN_PANTALLA }, (_, i) => sumarMeses(ctx.hoy.slice(0, 7), -i));
  const excel = `/api/gestion-financiera/remuneraciones/libro?mes=${periodo}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={volver} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-gris hover:text-tinta"><IconArrowLeft size={13} /> Volver a Remuneraciones</Link>
          <h2 className="text-lg font-bold capitalize tracking-tight text-tinta">Desglose por persona · {nombreMes}</h2>
          <p className="text-xs text-gris">
            {libro.empresaBuk} · {ps.length} {ps.length === 1 ? "persona" : "personas"} · pago de sueldos {fechaCl(libro.fechaPago)} ·{" "}
            <Chip texto={libro.cerrado ? "Libro cerrado en BUK" : "Abierto en BUK (provisorio)"} tono={libro.cerrado ? "bg-slate-500/10 text-slate-500 dark:text-slate-300" : "bg-amber-500/12 text-aviso dark:text-amber-300"} />
          </p>
        </div>
        <a href={excel} className={BOTON}><IconFileSpreadsheet size={15} /> Libro en Excel</a>
      </div>

      <nav aria-label="Mes" className="flex flex-wrap items-center gap-1.5">
        {meses.map((m) => (
          <Link key={m} href={`${RUTA_FIN}/remuneraciones/desglose?mes=${m}`} prefetch={false} aria-current={m === periodo ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${m === periodo ? "bg-tinta text-superficie" : "border border-borde bg-superficie text-gris hover:text-tinta"}`}>
            {mesLargo(`${m}-01`)}
          </Link>
        ))}
      </nav>

      {!libro.cerrado && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/[0.10] px-3 py-2.5 text-[13px] font-medium text-aviso">
          <IconAlertTriangle size={16} className="mt-px shrink-0" /> El libro de este mes sigue abierto en BUK: las cifras son provisorias y el Excel sale marcado como PROVISORIO.
        </p>
      )}
      {libro.fichasFaltantes > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/[0.10] px-3 py-2.5 text-[13px] font-medium text-aviso">
          <IconAlertTriangle size={16} className="mt-px shrink-0" /> No se pudo leer el nombre de {libro.fichasFaltantes} {libro.fichasFaltantes === 1 ? "persona" : "personas"} en BUK: salen solo con su RUT.
        </p>
      )}
      {conControl.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/[0.08] px-3 py-2.5 text-[13px] font-medium text-alerta">
          <IconAlertTriangle size={16} className="mt-px shrink-0" /> En {conControl.length} {conControl.length === 1 ? "persona" : "personas"} los haberes no cuadran con descuentos + líquido (aparecen marcadas): hay un concepto de BUK que no se supo clasificar. Revisa su centralización antes de enviar el libro.
        </p>
      )}

      <DetallePersonas v={libro.validacion} fechaPago={libro.fechaPago} nombres={new Map(ps.map((p) => [claveRut(p.rut), p.nombre ?? p.rut]))} />

      <div className={`${TARJETA} overflow-hidden`}>
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_repeat(4,minmax(0,1fr))] gap-3 border-b border-borde bg-tinta/[0.03] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gris md:grid">
          <span>Persona</span><span>Centro de costo</span><span className="text-right">Total haberes</span><span className="text-right">Descuentos</span><span className="text-right">Líquido</span><span className="text-right">Costo empresa</span>
        </div>
        <ul className="divide-y divide-borde">
          {ps.map((p) => (
            <li key={p.rut}>
              <details className="group">
                <summary className="grid cursor-pointer list-none grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[13px] hover:bg-tinta/[0.03] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_repeat(4,minmax(0,1fr))] md:items-center [&::-webkit-details-marker]:hidden">
                  <span className="col-span-2 min-w-0 md:col-span-1">
                    <span className="block truncate font-semibold text-tinta">{p.nombre ?? "(sin nombre en BUK)"}</span>
                    <span className="block truncate text-[11px] text-gris">{p.rut}{p.cargo ? ` · ${p.cargo}` : ""}</span>
                  </span>
                  <span className="truncate text-xs text-gris">{p.centros.join(" / ") || "—"}</span>
                  <span className="text-right tabular-nums">{clp(p.totalHaberes)}</span>
                  <span className="text-right tabular-nums">{clp(p.totalDescuentos)}</span>
                  <span className="text-right font-semibold tabular-nums text-tinta">{clp(p.liquido)}</span>
                  <span className="text-right tabular-nums">{clp(p.costoEmpresa)}</span>
                </summary>
                <div className="grid gap-4 border-t border-borde/70 bg-tinta/[0.02] px-3 py-3 text-xs sm:grid-cols-3">
                  <Lista titulo="Haberes" total={p.totalHaberes} filas={Object.entries(p.haberes).sort((a, b) => b[1] - a[1])} />
                  <Lista titulo="Descuentos" total={p.totalDescuentos} filas={DESCUENTOS.map(([k, t]) => [t, p.descuentos[k]] as [string, number]).filter(([, m]) => m !== 0)} nota={[p.afp && `AFP ${p.afp}`, p.salud && `Salud ${p.salud}`].filter(Boolean).join(" · ")} />
                  <Lista titulo="Aportes del empleador" total={p.totalAportes} filas={Object.entries(p.aportes).sort((a, b) => b[1] - a[1])} />
                  {Math.abs(p.diferencia) > 1 && <p className="col-span-full font-semibold text-alerta">Control: los haberes no cuadran con descuentos + líquido (diferencia {clp(p.diferencia)}).</p>}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-x-3 border-t border-borde bg-tinta/[0.04] px-3 py-2 text-[13px] font-bold md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_repeat(4,minmax(0,1fr))]">
          <span className="col-span-2 md:col-span-1">Total ({ps.length})</span>
          <span className="hidden md:block" />
          <span className="text-right tabular-nums">{clp(suma((p) => p.totalHaberes))}</span>
          <span className="text-right tabular-nums">{clp(suma((p) => p.totalDescuentos))}</span>
          <span className="text-right tabular-nums">{clp(suma((p) => p.liquido))}</span>
          <span className="text-right tabular-nums">{clp(suma((p) => p.costoEmpresa))}</span>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-gris">
        <IconLock size={13} /> Información confidencial: nombre, RUT y sueldo de cada persona. Cada vez que se abre este desglose o se baja el Excel queda registrado quién y cuándo.
      </p>
    </div>
  );
}

function Lista({ titulo, total, filas, nota }: { titulo: string; total: number; filas: [string, number][]; nota?: string }) {
  return (
    <div>
      <p className="mb-1 flex items-baseline justify-between font-semibold text-tinta"><span>{titulo}</span><span className="tabular-nums">{clp(total)}</span></p>
      {nota && <p className="mb-1 text-[11px] text-gris">{nota}</p>}
      <ul className="space-y-0.5">
        {filas.map(([c, m]) => <li key={c} className="flex justify-between gap-2"><span className="truncate text-gris">{c}</span><span className="tabular-nums">{clp(m)}</span></li>)}
        {filas.length === 0 && <li className="text-gris">—</li>}
      </ul>
    </div>
  );
}
