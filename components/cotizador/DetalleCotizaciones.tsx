"use client";

import { useEffect, useMemo, useState } from "react";
import type { CotizacionResumen } from "@/lib/cotizador";
import { fechaCl, money, pct } from "@/lib/cotizador/formato";

/**
 * El detalle del portafolio de cotizaciones, en un modal.
 *
 * La cinta de tres KPI de arriba responde "cuánto hay". Esto responde las
 * preguntas que esa cinta no puede: dónde está trabado, quién concentra el
 * monto, qué tiene el margen más flaco y qué se está enfriando.
 *
 * No consulta nada: recibe las mismas cotizaciones que ya cargó el listado y
 * hace las agrupaciones en el navegador. Un modal que dispara consultas al
 * abrirse se siente lento justo cuando la persona quiere mirar rápido.
 *
 * Sin recharts a propósito. Ese paquete pesa 112 KB y esta ruta hoy no lo carga;
 * las barras son divs con un ancho porcentual, que es lo que ya hace Gastos de
 * Proyectos y alcanza de sobra para comparar magnitudes en una lista.
 */

/** Cotizaciones sin tocar más de esto pasan a contar como frías. */
const DIAS_PARA_ENFRIARSE = 21;

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  adjudicada: "Adjudicada",
  perdida: "Perdida",
};

const ETIQUETA_TIPO: Record<string, string> = {
  spot: "SPOT",
  spot_turnos: "Obra por turnos",
  contrato_permanente: "Contrato permanente",
};

/** El orden del ciclo de vida, no el alfabético: dice por dónde va el trabajo. */
const ORDEN_ESTADO = ["borrador", "emitida", "adjudicada", "perdida"];

interface Grupo {
  clave: string;
  rotulo: string;
  cantidad: number;
  monto: number;
  margenPromedio: number;
}

function agrupar(
  cotizaciones: CotizacionResumen[],
  clave: (c: CotizacionResumen) => string,
  rotulo: (clave: string) => string,
): Grupo[] {
  const mapa = new Map<string, CotizacionResumen[]>();
  for (const c of cotizaciones) {
    const k = clave(c);
    mapa.set(k, [...(mapa.get(k) ?? []), c]);
  }

  return [...mapa.entries()]
    .map(([k, lista]) => ({
      clave: k,
      rotulo: rotulo(k),
      cantidad: lista.length,
      monto: lista.reduce((t, c) => t + (c.summary?.ecoTotalNeto ?? 0), 0),
      margenPromedio:
        lista.reduce((t, c) => t + (c.summary?.margenEfectivoTotal ?? 0), 0) / (lista.length || 1),
    }))
    .sort((a, b) => b.monto - a.monto);
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function DetalleCotizaciones({ cotizaciones }: { cotizaciones: CotizacionResumen[] }) {
  const [abierto, setAbierto] = useState(false);

  // Escape cierra: es lo que espera cualquiera con un modal abierto, y con el
  // foco en el fondo no hay ningún botón que apretar con el teclado.
  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [abierto]);

  // El fondo no scrollea detrás del modal.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  const datos = useMemo(() => {
    // Mismo criterio que los KPI de arriba: las de ejemplo quedan fuera, porque
    // sus cifras son ilustrativas y ensucian cualquier agrupación.
    const reales = cotizaciones.filter((c) => !c.esDemo);
    const monto = (c: CotizacionResumen) => c.summary?.ecoTotalNeto ?? 0;
    const margen = (c: CotizacionResumen) => c.summary?.margenEfectivoTotal ?? 0;

    const porEstado = agrupar(
      reales,
      (c) => c.estado,
      (k) => ETIQUETA_ESTADO[k] ?? k,
    ).sort((a, b) => ORDEN_ESTADO.indexOf(a.clave) - ORDEN_ESTADO.indexOf(b.clave));

    return {
      reales,
      total: reales.reduce((t, c) => t + monto(c), 0),
      porEstado,
      porTipo: agrupar(
        reales,
        (c) => c.tipoServicio,
        (k) => ETIQUETA_TIPO[k] ?? k,
      ),
      porEmpresa: agrupar(
        reales,
        (c) => c.empresa,
        (k) => k,
      ),
      porCliente: agrupar(
        reales,
        (c) => c.cliente?.trim() || "Sin cliente",
        (k) => k,
      ),
      // Las de margen más flaco primero: son las que hay que mirar antes de
      // emitir, y el promedio de la cinta de arriba las esconde.
      masFlacas: [...reales].sort((a, b) => margen(a) - margen(b)).slice(0, 5),
      // Borradores que se están enfriando. Una emitida vieja está esperando al
      // cliente; un borrador viejo está esperando a alguien de la casa.
      frias: reales
        .filter((c) => c.estado === "borrador" && diasDesde(c.actualizadoEn) >= DIAS_PARA_ENFRIARSE)
        .sort((a, b) => a.actualizadoEn.localeCompare(b.actualizadoEn)),
      // Las obras se cotizan una vez, no por mes. Sumarlas con los contratos en
      // un mismo "neto/mes" mezcla dos unidades distintas, así que el modal las
      // separa en vez de repetir el número de arriba sin decirlo.
      montoRecurrente: reales
        .filter((c) => c.tipoServicio !== "spot_turnos")
        .reduce((t, c) => t + monto(c), 0),
      montoPorObra: reales.filter((c) => c.tipoServicio === "spot_turnos").reduce((t, c) => t + monto(c), 0),
    };
  }, [cotizaciones]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        Ver detalle del portafolio
        <span aria-hidden="true">→</span>
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detalle del portafolio de cotizaciones"
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/70 p-4 backdrop-blur-sm sm:p-8"
        >
          <div
            // El clic dentro no cierra; solo el del fondo.
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-borde bg-superficie shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-borde px-5 py-4">
              <div>
                <span className="etiqueta-seccion">Cotizador</span>
                <h2 className="mt-1.5 font-condensed text-xl font-bold uppercase leading-none tracking-tight text-tinta">
                  Detalle del portafolio
                </h2>
                <p className="mt-1.5 text-xs text-tinta/50">
                  {datos.reales.length} cotizaci{datos.reales.length === 1 ? "ón" : "ones"} ·{" "}
                  {money(datos.total)} en total
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-tinta/40 transition-colors hover:bg-crema hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
              >
                ×
              </button>
            </div>

            <div className="flex max-h-[75vh] flex-col gap-6 overflow-y-auto px-5 py-5">
              {datos.reales.length === 0 ? (
                <p className="text-sm text-tinta/50">
                  Todavía no hay cotizaciones reales que analizar. Las de ejemplo quedan fuera a propósito:
                  sus cifras son ilustrativas.
                </p>
              ) : (
                <>
                  {/* Recurrente vs por obra: lo que la cinta de arriba mezcla. */}
                  <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Cifra
                      rotulo="Contratos y SPOT · neto por mes"
                      valor={money(datos.montoRecurrente)}
                      nota="se factura cada mes mientras dure el servicio"
                      tono="naranjo"
                    />
                    <Cifra
                      rotulo="Obras · neto por una vez"
                      valor={money(datos.montoPorObra)}
                      nota="se cobra una sola vez al terminar la obra"
                      tono="teal"
                    />
                  </section>

                  <Bloque
                    titulo="Por estado"
                    ayuda="En orden del ciclo de vida: dice por dónde va el trabajo."
                  >
                    <ListaGrupos grupos={datos.porEstado} total={datos.total} />
                  </Bloque>

                  <Bloque titulo="Por tipo de servicio">
                    <ListaGrupos grupos={datos.porTipo} total={datos.total} conMargen />
                  </Bloque>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Bloque titulo="Por empresa">
                      <ListaGrupos grupos={datos.porEmpresa} total={datos.total} />
                    </Bloque>
                    <Bloque
                      titulo="Por cliente"
                      ayuda={
                        datos.porCliente.length > 0 && datos.porCliente[0].monto / datos.total > 0.5
                          ? `${datos.porCliente[0].rotulo} concentra más de la mitad del portafolio.`
                          : undefined
                      }
                    >
                      <ListaGrupos grupos={datos.porCliente.slice(0, 6)} total={datos.total} />
                    </Bloque>
                  </div>

                  <Bloque
                    titulo="Margen más flaco"
                    ayuda="Las de menor margen efectivo. El promedio de arriba las esconde."
                  >
                    <ul className="flex flex-col divide-y divide-borde">
                      {datos.masFlacas.map((c) => (
                        <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-tinta">{c.nombre}</span>
                            <span className="block truncate text-[11px] text-tinta/45">
                              {c.cliente ?? "Sin cliente"} · {ETIQUETA_ESTADO[c.estado] ?? c.estado}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span
                              className={`block font-condensed text-base font-bold leading-none tabular-nums ${
                                (c.summary?.margenEfectivoTotal ?? 0) < 0.15 ? "text-red-600" : "text-teal"
                              }`}
                            >
                              {pct(c.summary?.margenEfectivoTotal ?? 0)}
                            </span>
                            <span className="mt-0.5 block text-[11px] tabular-nums text-tinta/45">
                              {money(c.summary?.ecoTotalNeto ?? 0)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Bloque>

                  <Bloque
                    titulo={`Borradores sin tocar hace ${DIAS_PARA_ENFRIARSE} días o más`}
                    ayuda="Una emitida vieja espera al cliente; un borrador viejo espera a alguien de la casa."
                  >
                    {datos.frias.length === 0 ? (
                      <p className="text-sm text-tinta/50">
                        Ninguno: todos los borradores se movieron en las últimas {DIAS_PARA_ENFRIARSE}{" "}
                        semanas.
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-borde">
                        {datos.frias.map((c) => (
                          <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm text-tinta">{c.nombre}</span>
                            <span className="shrink-0 text-right text-[11px] text-tinta/50">
                              {fechaCl(c.actualizadoEn)}
                              <span className="ml-2 tabular-nums text-naranjo">
                                {diasDesde(c.actualizadoEn)} días
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Bloque>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Cifra({
  rotulo,
  valor,
  nota,
  tono,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  tono: "naranjo" | "teal";
}) {
  return (
    <div
      className={`rounded-xl border border-borde px-4 py-3 ${
        tono === "naranjo" ? "bg-naranjo/[0.06]" : "bg-teal/[0.06]"
      }`}
    >
      <p className="text-xs font-medium text-tinta/55">{rotulo}</p>
      <p className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-tinta">
        {valor}
      </p>
      <p className="mt-1.5 text-[11px] text-pretty text-tinta/45">{nota}</p>
    </div>
  );
}

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-condensed text-sm font-bold uppercase tracking-wide text-tinta">{titulo}</h3>
      {ayuda && <p className="mt-0.5 text-[11px] text-pretty text-tinta/45">{ayuda}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Una lista con barra proporcional, monto y cantidad. */
function ListaGrupos({
  grupos,
  total,
  conMargen = false,
}: {
  grupos: Grupo[];
  total: number;
  conMargen?: boolean;
}) {
  if (grupos.length === 0) return <p className="text-sm text-tinta/50">Nada que mostrar.</p>;

  return (
    <ul className="flex flex-col gap-2.5">
      {grupos.map((g) => {
        // Sobre el total del portafolio, no sobre el grupo más grande: así la
        // barra dice qué porción del portafolio es, que es la pregunta.
        const porcion = total > 0 ? g.monto / total : 0;
        return (
          <li key={g.clave}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-tinta">
                {g.rotulo}
                <span className="ml-1.5 text-[11px] text-tinta/40">
                  {g.cantidad} cotizaci{g.cantidad === 1 ? "ón" : "ones"}
                  {conMargen && ` · ${pct(g.margenPromedio)} de margen`}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-tinta">{money(g.monto)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-crema">
              <div
                className="h-full rounded-full bg-naranjo/70"
                style={{ width: `${Math.max(porcion * 100, 1)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
