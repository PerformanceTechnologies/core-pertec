import Link from "@/components/contratos/Enlace";
import { IconCalendarEvent, IconTimeline } from "@tabler/icons-react";
import CajaDeWidget from "./CajaDeWidget";
import { Barrita, Pastilla } from "./graficos";
import {
  textoDeRitmo,
  tonoDePlazo,
  type FilaDeCronograma,
  type MarcaDeTiempo,
  type Tono,
} from "@/lib/contratos/dashboard-modelo";
import { fechaCorta } from "@/lib/contratos/acreditacion-modelo";
import { textoDePlazo } from "@/lib/contratos/plazos-modelo";

const ALTO_DE_CARRIL = 38;

/** Cómo se coloca la etiqueta de una marca según hacia dónde crece (ver armarLineaDeTiempo). */
function alineacion(a: MarcaDeTiempo["alineacion"]): { transform: string; textAlign: "left" | "center" | "right" } {
  if (a === "izquierda") return { transform: "translateX(-6px)", textAlign: "left" };
  if (a === "derecha") return { transform: "translateX(calc(-100% + 6px))", textAlign: "right" };
  return { transform: "translateX(-50%)", textAlign: "center" };
}

function textoDeDias(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias < 0) return `venció hace ${-dias} d`;
  return `en ${dias} d`;
}

/**
 * La línea de tiempo desde hoy hasta el último hito.
 *
 * Cada fecha límite está en su posición REAL: dos módulos con fechas a una semana de distancia
 * se ven separados y dos con la misma fecha se ven juntos, que es lo que un calendario no deja
 * ver de un golpe. El inicio del contrato va como un rombo de marca.
 */
function LineaDeTiempo({
  marcas,
  carriles,
}: {
  marcas: MarcaDeTiempo[];
  carriles: number;
}) {
  const alto = 34 + carriles * ALTO_DE_CARRIL;

  return (
    <>
    <div
      className="relative mb-1 mt-1 hidden select-none sm:block"
      style={{ height: alto }}
      role="img"
      aria-label={`Línea de tiempo: ${marcas.map((m) => `${m.etiquetas.join(" y ")} ${textoDeDias(m.dias)}`).join("; ")}`}
    >
      {/* El eje: del cian de hoy al azul del último hito. */}
      <div
        className="absolute inset-x-0 top-[11px] h-[6px] rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-cian), color-mix(in srgb, var(--color-azul-suave) 70%, var(--color-cian)))",
          opacity: 0.35,
        }}
      />

      {/* Hoy */}
      <div className="absolute left-0 top-0" style={{ transform: "translateX(-6px)" }}>
        <span className="relative flex h-7 w-3 items-center justify-center">
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-cian opacity-40 motion-reduce:animate-none" />
          <span className="relative h-3 w-3 rounded-full bg-cian ring-[3px] ring-[var(--color-superficie)]" />
        </span>
      </div>

      {marcas.map((m) => {
        const alinear = alineacion(m.alineacion);
        const arriba = 30 + m.carril * ALTO_DE_CARRIL;
        return (
          <div key={m.clave} data-tono={m.tono}>
            {/* El hilo que une el punto con su etiqueta, para que se lea de quién es. */}
            <span
              className="absolute w-px bg-[var(--tono-1)] opacity-50"
              style={{ left: `${m.posicion}%`, top: 17, height: arriba - 17 }}
              aria-hidden
            />
            {m.tipo === "inicio" ? (
              <span
                className="absolute h-3.5 w-3.5 rotate-45 rounded-[3px] bg-azul ring-[3px] ring-[var(--color-superficie)]"
                style={{ left: `calc(${m.posicion}% - 7px)`, top: 7 }}
                aria-hidden
              />
            ) : (
              <span
                className="absolute h-3.5 w-3.5 rounded-full ring-[3px] ring-[var(--color-superficie)]"
                style={{
                  left: `calc(${m.posicion}% - 7px)`,
                  top: 7,
                  background: "linear-gradient(135deg, var(--tono-1), var(--tono-2))",
                }}
                aria-hidden
              />
            )}
            <div
              className="absolute w-[30%] leading-tight"
              style={{ left: `${m.posicion}%`, top: arriba, ...alinear }}
            >
              <span className="block truncate text-[11px] font-bold text-tinta" title={m.etiquetas.join(" · ")}>
                {m.etiquetas.join(" · ")}
              </span>
              <span className="block truncate text-[10px] font-semibold" style={{ color: "var(--tono-texto)" }}>
                {fechaCorta(m.fecha).slice(0, 5)} · {textoDeDias(m.dias)}
              </span>
            </div>
          </div>
        );
      })}
    </div>

    {/* En el teléfono, los mismos hitos como lista.
        Las etiquetas del eje miden el 30 % del ancho, y ese 30 % es además la
        constante con la que el servidor reparte los carriles para que no se
        pisen: no se puede ensanchar solo acá sin romper ese reparto. Y el 30 %
        de 343 px son 93, donde "Documentos · Acreditación" se queda en
        "Documentos · A…" — una etiqueta que no dice de qué módulo habla no
        sirve de nada. Mismos datos, en vertical, donde sí caben. */}
    <ul className="mb-1 mt-1 space-y-2 sm:hidden">
      {marcas.map((m) => (
        <li key={m.clave} className="flex items-baseline gap-2.5" data-tono={m.tono}>
          <span
            className="h-2.5 w-2.5 shrink-0 translate-y-0.5 rounded-full"
            style={{ background: "linear-gradient(135deg, var(--tono-1), var(--tono-2))" }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 text-xs font-bold leading-tight text-tinta">
            {m.etiquetas.join(" · ")}
          </span>
          <span
            className="shrink-0 text-[11px] font-semibold tabular-nums"
            style={{ color: "var(--tono-texto)" }}
          >
            {fechaCorta(m.fecha).slice(0, 5)} · {textoDeDias(m.dias)}
          </span>
        </li>
      ))}
    </ul>
    </>
  );
}

/** Lo que dice la fila de un módulo sobre lo que falta para llegar. */
function textoDeFila(f: FilaDeCronograma): { texto: string; tono: Tono } {
  if (!f.plazo) return { texto: "Sin fecha límite", tono: "neutro" };
  const r = f.ritmo;
  if (!r) return { texto: textoDePlazo(f.plazo), tono: tonoDePlazo(f.plazo) };
  if (r.estado === "completo") return { texto: "Completo", tono: "ok" };
  if (r.estado === "vencido") return { texto: `Faltan ${r.pendientes} · ${textoDePlazo(f.plazo)}`, tono: "critico" };
  if (r.estado === "hoy") return { texto: `Faltan ${r.pendientes} · vence hoy`, tono: "critico" };
  return {
    texto: `Faltan ${r.pendientes} · ${r.dias} ${r.dias === 1 ? "día" : "días"} · ${textoDeRitmo(r.porDia as number)}`,
    tono: tonoDePlazo(f.plazo),
  };
}

/**
 * Cronograma: cuándo vence cada cosa y qué hay que cerrar para llegar.
 *
 * Arriba, la línea de tiempo con todas las fechas en su lugar; abajo, una fila por módulo con el
 * ritmo necesario («faltan 13 en 18 días · ≈ 5 por semana»). El ritmo no se compara contra el
 * inicio del contrato porque las fechas límite del arranque caen antes de que empiece: se mide
 * contra lo que sí se sabe, cuánto falta y cuánto queda.
 */
export default function CronogramaDelContrato({
  linea,
  filas,
}: {
  linea: { marcas: MarcaDeTiempo[]; carriles: number } | null;
  filas: FilaDeCronograma[];
}) {
  const sinPlazo = filas.filter((f) => !f.plazo);

  return (
    <CajaDeWidget
      titulo="Cronograma"
      subtitulo="Fechas límite y ritmo para llegar a tiempo"
      icono={<IconTimeline size={18} stroke={1.8} />}
    >
      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde bg-fondo/50 px-4 py-8 text-center text-xs text-gris">
          Cuando haya módulos con datos y fecha límite, acá verás cuándo vence cada uno.
        </p>
      ) : (
        <>
          {linea ? (
            <LineaDeTiempo marcas={linea.marcas} carriles={linea.carriles} />
          ) : (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-fondo px-3 py-2 text-xs text-gris">
              <IconCalendarEvent size={14} />
              Ningún módulo tiene fecha límite todavía.
            </p>
          )}

          <ul className="mt-4 divide-y divide-borde">
            {filas.map((f) => {
              const { texto, tono } = textoDeFila(f);
              return (
                <li key={f.clave} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <Link
                      href={f.href}
                      className="min-w-0 truncate text-sm font-semibold text-tinta transition hover:text-azul"
                    >
                      {f.nombre}
                    </Link>
                    <Pastilla tono={tono}>{texto}</Pastilla>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="flex-1">
                      <Barrita
                        valor={f.avance.porcentaje}
                        tono={f.avance.total === 0 ? "neutro" : f.avance.porcentaje >= 100 ? "ok" : tono === "critico" ? "critico" : "curso"}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-gris">
                      {f.avance.total === 0 ? "sin datos" : `${f.avance.subidos} de ${f.avance.total}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {sinPlazo.length > 0 && (
            <p className="mt-4 rounded-lg bg-fondo px-3 py-2 text-[11px] leading-relaxed text-gris">
              Sin fecha límite: {sinPlazo.map((f) => f.nombre).join(", ")}. Se fija en la cabecera de cada módulo.
            </p>
          )}
        </>
      )}
    </CajaDeWidget>
  );
}
