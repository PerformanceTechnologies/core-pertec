import Link from "@/components/contratos/Enlace";
import { IconCalendarEvent, IconShieldCheck, IconAlertTriangle, IconCircleDashed, IconActivity, IconUsers } from "@tabler/icons-react";
import { Anillo } from "./graficos";
import InsigniaDeSalud from "./InsigniaDeSalud";
import type { Atencion, ModuloDelTablero, SaludDelContrato, Tono } from "@/lib/contratos/dashboard-modelo";
import { resumirResponsables, textoDePlazo } from "@/lib/contratos/plazos-modelo";

const ICONO_DE_SALUD: Record<Tono, React.ReactNode> = {
  ok: <IconShieldCheck size={15} />,
  curso: <IconActivity size={15} />,
  aviso: <IconAlertTriangle size={15} />,
  critico: <IconAlertTriangle size={15} />,
  neutro: <IconCircleDashed size={15} />,
  marca: <IconActivity size={15} />,
};

/** El color del punto y de la pastilla de salud sobre el azul: tienen que leerse en fondo oscuro. */
const COLOR_DE_SALUD: Record<Tono, string> = {
  ok: "bg-emerald-400/20 text-emerald-200 ring-emerald-300/40",
  curso: "bg-orange-300/20 text-orange-100 ring-orange-200/40",
  aviso: "bg-amber-300/20 text-amber-100 ring-amber-200/40",
  critico: "bg-rose-400/25 text-rose-100 ring-rose-300/50",
  neutro: "bg-white/10 text-white/80 ring-white/25",
  marca: "bg-white/10 text-white/80 ring-white/25",
};

/** El tono del texto de un plazo sobre el azul. */
function colorDePlazo(estado: string | undefined): string {
  if (estado === "vencido") return "text-rose-200";
  if (estado === "hoy" || estado === "por_vencer") return "text-amber-200";
  return "text-white/70";
}

/**
 * El bloque de arriba del dashboard: cómo va el contrato en una mirada.
 *
 * A la izquierda el avance general en un anillo grande; al lado, el semáforo con una frase, y
 * a la derecha cada módulo con su barra y su fecha límite. Es lo único que se lee si uno solo
 * mira tres segundos, así que dice tres cosas: cuánto llevamos, si hay algo urgente, y cuál
 * módulo tira para abajo.
 *
 * Es azul de marca con texto claro en los dos temas: el gráfico usa el tono «marca», que se ve
 * sobre fondo oscuro.
 */
export default function HeroDelTablero({
  contrato,
  logo,
  administrador,
  inicio,
  general,
  salud,
  atenciones,
  modulos,
}: {
  contrato: string;
  /** La URL del logo de la empresa del contrato, si tiene. */
  logo: string | null;
  administrador: string | null;
  /** «Inicia en 27 días» o «Día 12 del contrato»; null si no hay fecha de inicio. */
  inicio: string | null;
  general: { porcentaje: number; medidos: number };
  salud: SaludDelContrato;
  /** Todo lo que pide atención, para el cuadro que abre el semáforo. */
  atenciones: Atencion[];
  modulos: ModuloDelTablero[];
}) {
  return (
    <section className="dash-hero rounded-2xl p-5 sm:p-7" aria-label="Estado general del contrato">
      <div className="grid items-center gap-6 lg:grid-cols-[auto_1fr_minmax(0,22rem)] lg:gap-8">
        <div className="flex justify-center lg:justify-start">
          <Anillo
            id="anillo-general"
            valor={general.porcentaje}
            tono="marca"
            tamano={172}
            grosor={14}
            etiqueta={`Avance general del contrato: ${general.porcentaje}%`}
          >
            <span className="text-[44px] font-extrabold leading-none tracking-tight tabular-nums">
              {general.medidos === 0 ? "—" : general.porcentaje}
              {general.medidos > 0 && <span className="text-xl font-bold text-white/70">%</span>}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65">
              Avance general
            </span>
          </Anillo>
        </div>

        <div className="min-w-0 text-center lg:text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-200">Así vamos</p>
          {/* El logo de la empresa junto al nombre, sobre una placa clara con un resplandor que lo
              despega del fondo oscuro (como el de Codelco en core-ih). */}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 lg:justify-start">
            <h2 className="titular text-2xl text-white sm:text-3xl">{contrato}</h2>
            {logo && (
              <span className="logo-resplandor inline-flex h-11 shrink-0 items-center overflow-hidden rounded-lg bg-white px-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen chica servida por el propio core */}
                <img src={logo} alt="" className="h-9 w-auto max-w-[8rem] object-contain" />
              </span>
            )}
          </div>

          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/70 lg:justify-start">
            {inicio && (
              <span className="inline-flex items-center gap-1">
                <IconCalendarEvent size={13} />
                {inicio}
              </span>
            )}
            {administrador && <span>Administra {administrador}</span>}
            {general.medidos > 0 && (
              <span>
                Promedio de {general.medidos} {general.medidos === 1 ? "módulo" : "módulos"}
              </span>
            )}
          </p>

          <div className="mt-4 flex flex-col items-center gap-2 lg:items-start">
            <InsigniaDeSalud
              salud={salud}
              atenciones={atenciones}
              clases={COLOR_DE_SALUD[salud.tono]}
              icono={ICONO_DE_SALUD[salud.tono]}
            />
            <p className="max-w-md text-sm leading-relaxed text-white/80">{salud.frase}</p>
          </div>
        </div>

        <ul className="space-y-2">
          {modulos.length === 0 ? (
            <li className="rounded-xl bg-white/8 px-3 py-4 text-center text-xs text-white/70">
              Todavía no hay módulos con datos para medir.
            </li>
          ) : (
            modulos.map((m) => (
              <li key={m.clave}>
                <Link
                  href={m.href}
                  className="group block rounded-xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10 transition hover:bg-white/[0.14] hover:ring-white/25"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{m.nombre}</span>
                    <span className="shrink-0 text-sm font-extrabold tabular-nums">
                      {m.avance.total === 0 ? "—" : `${m.avance.porcentaje}%`}
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
                    <span
                      className="dash-relleno block h-full rounded-full"
                      data-tono="marca"
                      style={{ width: `${m.avance.porcentaje}%` }}
                    />
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-white/60">
                      {m.avance.total === 0 ? "Sin datos" : `${m.avance.subidos} de ${m.avance.total} ${m.unidad}`}
                    </span>
                    {m.plazo && (
                      <span className={`shrink-0 font-semibold ${colorDePlazo(m.plazo.estado)}`}>
                        {textoDePlazo(m.plazo)}
                      </span>
                    )}
                  </span>
                  {/* Quién responde, en una línea: es el resumen chico. Sin nadie lo dice, porque un
                      módulo sin responsable es un plazo que nadie va a ver venir. */}
                  {m.responsables && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-white/60">
                      <IconUsers size={12} aria-hidden className="shrink-0" />
                      <span className="truncate">
                        {m.responsables.length > 0 ? resumirResponsables(m.responsables, 2) : "Sin responsable"}
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
