"use client";

import { useMemo, useState } from "react";
import { money, pct, fechaCl } from "@/lib/cotizador/formato";
import { PASTILLA_ESTADO } from "@/lib/estilos";
import type { FilaLead } from "@/lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  ESTADO_FILTROS,
  GRUPOS_DE_ESTADO,
  diasDesde,
  estaAtrasada,
  estaEstancada,
  filtrarLeads,
  hoyEnChileIso,
  ordenarLeads,
  resumirLeads,
  type CampoOrden,
  type Criterios,
} from "@/lib/panel-odoo/crm-filtro";
import {
  antiguedadDelPipeline,
  avisosDeCalidad,
  embudo,
  motivosDePerdida,
  porEstado,
  porVendedor,
  rangoDelMes,
  tendenciaMensual,
} from "@/lib/panel-odoo/crm-series";
import { traducir, ETAPAS_CRM } from "@/lib/panel-odoo/traducciones";
import ModalDetalleLead from "./ModalDetalleLead";
import {
  GraficoAntiguedad,
  GraficoEmbudo,
  GraficoTendenciaCrm,
  GraficoTortaCrm,
  GraficoVendedores,
} from "./graficos-crm";

// Cuántas filas se dibujan de una vez. Filtrar y ordenar se hace sobre TODAS.
const POR_TANDA = 40;

const COLUMNAS: { campo: CampoOrden; etiqueta: string; alinear?: "derecha" }[] = [
  { campo: "partner_nombre", etiqueta: "Cliente" },
  { campo: "etapa_secuencia", etiqueta: "Etapa" },
  { campo: "fecha_creacion", etiqueta: "Creada" },
  { campo: "fecha_cierre_estimada", etiqueta: "Cierre est." },
  { campo: "monto_esperado", etiqueta: "Esperado", alinear: "derecha" },
  { campo: "probabilidad", etiqueta: "Prob.", alinear: "derecha" },
];

const CLASES_ESTADO: Record<string, string> = {
  ganada: "bg-teal/10 text-teal",
  perdida: "bg-red-500/10 text-red-600",
  abierta: "bg-naranjo-suave/15 text-naranjo",
};
const ETIQUETAS_ESTADO: Record<string, string> = {
  ganada: "Ganada",
  perdida: "Perdida",
  abierta: "Abierta",
};

export default function DetalleCrm({ leads }: { leads: FilaLead[] }) {
  const [criterios, setCriterios] = useState<Criterios>(CRITERIOS_INICIALES);
  const [mostradas, setMostradas] = useState(POR_TANDA);
  const [seleccionado, setSeleccionado] = useState<FilaLead | null>(null);
  const [verGraficos, setVerGraficos] = useState(true);

  const hoy = useMemo(() => hoyEnChileIso(), []);

  const visibles = useMemo(
    () => ordenarLeads(filtrarLeads(leads, criterios, hoy), criterios.orden, criterios.sentido),
    [leads, criterios, hoy],
  );
  const resumen = useMemo(() => resumirLeads(visibles, hoy), [visibles, hoy]);

  // Los gráficos se calculan sobre lo FILTRADO, igual que el resumen: la tabla y los
  // gráficos contestan la misma pregunta.
  const series = useMemo(
    () => ({
      embudo: embudo(visibles),
      tendencia: tendenciaMensual(visibles),
      estado: porEstado(visibles),
      motivos: motivosDePerdida(visibles),
      vendedores: porVendedor(visibles),
      antiguedad: antiguedadDelPipeline(visibles, hoy),
    }),
    [visibles, hoy],
  );

  // Los avisos se calculan sobre TODO y no sobre lo filtrado: son la tarea pendiente del
  // CRM completo, y esconderlos al filtrar los volvería inútiles.
  const avisos = useMemo(() => avisosDeCalidad(leads, hoy), [leads, hoy]);

  // Las etapas y los vendedores que existen de verdad, para los desplegables: una lista
  // fija se desactualiza en cuanto alguien agrega una etapa en Odoo ("Propuesta 2").
  const etapas = useMemo(
    () =>
      [...new Map(leads.filter((l) => l.etapa).map((l) => [l.etapa!, l.etapa_secuencia ?? 999])).entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([etapa]) => etapa),
    [leads],
  );
  const vendedores = useMemo(
    () => [...new Set(leads.map((l) => l.vendedor ?? "Sin asignar"))].sort((a, b) => a.localeCompare(b, "es")),
    [leads],
  );

  const mesElegido = useMemo(() => {
    if (!criterios.desde || !criterios.hasta) return null;
    const mes = criterios.desde.slice(0, 7);
    const rango = rangoDelMes(mes);
    return rango.desde === criterios.desde && rango.hasta === criterios.hasta ? mes : null;
  }, [criterios.desde, criterios.hasta]);

  function cambiar(parcial: Partial<Criterios>) {
    setCriterios((previos) => ({ ...previos, ...parcial }));
    setMostradas(POR_TANDA);
  }

  function alElegirMes(mes: string) {
    if (mesElegido === mes) return cambiar({ desde: "", hasta: "" });
    cambiar(rangoDelMes(mes));
  }
  const alternarEstado = (filtro: string) => cambiar({ estado: criterios.estado === filtro ? "" : filtro });
  const alternarEtapa = (etapa: string) => cambiar({ etapa: criterios.etapa === etapa ? "" : etapa });
  const alternarVendedor = (v: string) => cambiar({ vendedor: criterios.vendedor === v ? "" : v });

  function ordenarPor(campo: CampoOrden) {
    cambiar(
      criterios.orden === campo
        ? { sentido: criterios.sentido === "asc" ? "desc" : "asc" }
        : { orden: campo, sentido: "desc" },
    );
  }

  const hayFiltro =
    criterios.texto !== "" ||
    criterios.estado !== "" ||
    criterios.etapa !== "" ||
    criterios.vendedor !== "" ||
    criterios.desde !== "" ||
    criterios.hasta !== "";

  return (
    <div>
      {/* Lo que hay que arreglar, arriba y contado. En el CRM de verdad la mayoría de las
          oportunidades no tiene monto ni fecha de cierre, así que sin este aviso los
          gráficos de monto parecen un error del panel en vez de un dato que falta. */}
      {avisos.length > 0 && (
        <div className="mb-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-tinta/70">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">Por revisar en Odoo</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {avisos.map((a) => (
              <button
                key={a.filtro}
                type="button"
                onClick={() => alternarEstado(a.filtro)}
                className="text-left underline decoration-dotted underline-offset-2 transition hover:text-naranjo"
              >
                <strong className="font-semibold text-tinta">{a.cantidad}</strong> {a.texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buscador y filtros */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          type="search"
          value={criterios.texto}
          onChange={(e) => cambiar({ texto: e.target.value })}
          placeholder="Buscar por cliente, contacto, etiqueta…"
          aria-label="Buscar oportunidades"
          className="col-span-2 rounded-lg border border-borde px-3 py-2 text-xs text-tinta placeholder:text-tinta/40 focus:border-teal focus:outline-none"
        />
        <select
          value={criterios.estado}
          onChange={(e) => cambiar({ estado: e.target.value })}
          aria-label="Estado"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los estados</option>
          {GRUPOS_DE_ESTADO.map((grupo) => (
            <optgroup key={grupo} label={grupo}>
              {ESTADO_FILTROS.filter((e) => e.grupo === grupo).map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.etiqueta}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={criterios.etapa}
          onChange={(e) => cambiar({ etapa: e.target.value })}
          aria-label="Etapa"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todas las etapas</option>
          {etapas.map((etapa) => (
            <option key={etapa} value={etapa}>
              {traducir(ETAPAS_CRM, etapa)}
            </option>
          ))}
        </select>
        <select
          value={criterios.vendedor}
          onChange={(e) => cambiar({ vendedor: e.target.value })}
          aria-label="Vendedor"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          Creada desde
          <input
            type="date"
            value={criterios.desde}
            onChange={(e) => cambiar({ desde: e.target.value })}
            aria-label="Creada desde"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          hasta
          <input
            type="date"
            value={criterios.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            aria-label="Creada hasta"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
      </div>

      {/* Lo que está filtrado, y cómo sacarlo */}
      {hayFiltro && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-tinta/40">Filtrando por</span>
          {criterios.texto && <Chip texto={`"${criterios.texto}"`} onQuitar={() => cambiar({ texto: "" })} />}
          {criterios.estado && (
            <Chip
              texto={ESTADO_FILTROS.find((e) => e.valor === criterios.estado)?.etiqueta ?? criterios.estado}
              onQuitar={() => cambiar({ estado: "" })}
            />
          )}
          {criterios.etapa && (
            <Chip texto={traducir(ETAPAS_CRM, criterios.etapa)} onQuitar={() => cambiar({ etapa: "" })} />
          )}
          {criterios.vendedor && <Chip texto={criterios.vendedor} onQuitar={() => cambiar({ vendedor: "" })} />}
          {(criterios.desde || criterios.hasta) && (
            <Chip
              texto={
                mesElegido
                  ? mesElegido
                  : `${criterios.desde ? fechaCl(criterios.desde) : "…"} a ${criterios.hasta ? fechaCl(criterios.hasta) : "…"}`
              }
              onQuitar={() => cambiar({ desde: "", hasta: "" })}
            />
          )}
          <button
            type="button"
            onClick={() => cambiar(CRITERIOS_INICIALES)}
            className="rounded-full border border-borde px-2 py-0.5 text-[11px] font-semibold text-tinta/50 transition hover:bg-crema hover:text-tinta"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Resumen de lo que quedó a la vista */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-crema/60 px-3 py-2 text-[11px] text-tinta/60">
        <span>
          <strong className="text-tinta">{resumen.cantidad}</strong> oportunidad{resumen.cantidad === 1 ? "" : "es"}
        </span>
        <span>
          Abiertas <strong className="text-naranjo">{resumen.abiertas}</strong> ({money(resumen.montoAbierto)})
        </span>
        <span>
          Ponderado <strong className="text-tinta">{money(resumen.montoPonderado)}</strong>
        </span>
        <span>
          Ganadas <strong className="text-teal">{resumen.ganadas}</strong> ({money(resumen.montoGanado)})
        </span>
        <span>
          Perdidas <strong className="text-red-600">{resumen.perdidas}</strong>
        </span>
        <span>
          Conversión{" "}
          <strong className="text-tinta">
            {resumen.tasaDeConversion === null ? "—" : pct(resumen.tasaDeConversion, 0)}
          </strong>
        </span>
      </div>

      {/* Gráficos */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
          Gráficos <span className="font-normal normal-case text-tinta/35">— hacé clic para filtrar</span>
        </p>
        <button
          type="button"
          onClick={() => setVerGraficos((v) => !v)}
          aria-expanded={verGraficos}
          className="rounded-lg border border-borde px-2 py-1 text-[11px] font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta"
        >
          {verGraficos ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {verGraficos && (
        <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Panel titulo="Embudo: abiertas por etapa" ancho>
            <GraficoEmbudo escalones={series.embudo} onElegirEtapa={alternarEtapa} etapaElegida={criterios.etapa} />
          </Panel>
          <Panel titulo="Creadas, ganadas y perdidas por mes" ancho>
            <GraficoTendenciaCrm datos={series.tendencia} onElegirMes={alElegirMes} mesElegido={mesElegido} />
          </Panel>
          <Panel titulo="Cómo terminaron">
            <GraficoTortaCrm porciones={series.estado} onElegir={alternarEstado} titulo="Total" porCantidad />
          </Panel>
          <Panel titulo="Por qué se pierden">
            {series.motivos.length > 0 ? (
              <GraficoTortaCrm
                porciones={series.motivos}
                onElegir={alternarEstado}
                titulo="Perdidas"
                paleta="motivos"
                porCantidad
              />
            ) : (
              <p className="py-16 text-center text-xs text-tinta/40">
                Ninguna oportunidad perdida en lo que está a la vista.
              </p>
            )}
          </Panel>
          <Panel titulo="Por vendedor" ancho>
            <GraficoVendedores vendedores={series.vendedores} onElegir={alternarVendedor} />
          </Panel>
          <Panel titulo="Antigüedad de las abiertas (desde el último movimiento)" ancho>
            <GraficoAntiguedad tramos={series.antiguedad} onElegirEstancadas={() => alternarEstado("estancadas")} />
          </Panel>
        </div>
      )}

      {/* Tabla */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead>
            <tr className="border-b border-borde text-[10px] uppercase tracking-wide text-tinta/45">
              {COLUMNAS.map((c) => {
                const activa = criterios.orden === c.campo;
                return (
                  <th key={c.campo} scope="col" className={`py-2 font-semibold ${c.alinear === "derecha" ? "text-right" : ""}`}>
                    <button
                      type="button"
                      onClick={() => ordenarPor(c.campo)}
                      aria-label={`Ordenar por ${c.etiqueta}`}
                      className={`transition hover:text-tinta ${activa ? "text-teal" : ""}`}
                    >
                      {c.etiqueta}
                      {activa && <span aria-hidden> {criterios.sentido === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="py-2 pl-3 font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.slice(0, mostradas).map((l) => {
              const estancada = estaEstancada(l, hoy);
              const atrasada = estaAtrasada(l, hoy);
              const dias = diasDesde(l.fecha_ultimo_movimiento ?? l.fecha_creacion, hoy);
              return (
                <tr
                  key={l.odoo_id}
                  onClick={() => setSeleccionado(l)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSeleccionado(l);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-crema/60"
                >
                  <td className="max-w-[220px] py-2 pr-3">
                    <p title={l.partner_nombre ?? l.nombre} className="truncate text-tinta/80">
                      {l.partner_nombre ?? "Sin cliente"}
                    </p>
                    <p title={l.nombre} className="truncate text-[10px] text-tinta/40">
                      {l.nombre}
                      {l.vendedor ? ` · ${l.vendedor}` : ""}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-tinta/55">{traducir(ETAPAS_CRM, l.etapa)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-tinta/55">
                    {l.fecha_creacion ? fechaCl(l.fecha_creacion) : "-"}
                    {/* Los días solo cuando ya son unos cuantos: en una creada ayer es
                        ruido, y en una de hace tres meses es el dato. */}
                    {l.estado === "abierta" && dias !== null && dias >= 7 && (
                      <span className={`ml-1 text-[10px] ${estancada ? "text-red-600" : "text-tinta/35"}`}>
                        ({dias} d)
                      </span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap py-2 pr-3 ${atrasada ? "font-semibold text-red-600" : "text-tinta/55"}`}>
                    {l.fecha_cierre_estimada ? fechaCl(l.fecha_cierre_estimada) : "-"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold text-tinta">
                    {(l.monto_esperado ?? 0) > 0 ? money(l.monto_esperado) : <span className="text-tinta/30">sin monto</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-tinta/60">
                    {Math.round(l.probabilidad ?? 0)}%
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`${PASTILLA_ESTADO} ${CLASES_ESTADO[l.estado ?? ""] ?? "bg-gris/15 text-gris"}`}>
                        {ETIQUETAS_ESTADO[l.estado ?? ""] ?? "—"}
                      </span>
                      {estancada && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Estancada
                        </span>
                      )}
                      {l.estado === "abierta" && !l.actividad_proxima && (
                        <span className="rounded-full border border-borde bg-crema px-1.5 py-0.5 text-[10px] text-tinta/50">
                          Sin actividad
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibles.length === 0 && (
        <p className="mt-4 text-center text-xs text-tinta/40">Ninguna oportunidad calza con los filtros.</p>
      )}

      {visibles.length > mostradas && (
        <button
          type="button"
          onClick={() => setMostradas((n) => n + POR_TANDA)}
          className="mt-3 w-full rounded-lg border border-borde py-2 text-xs font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta"
        >
          Ver {Math.min(POR_TANDA, visibles.length - mostradas)} más (de {visibles.length})
        </button>
      )}

      {seleccionado && <ModalDetalleLead lead={seleccionado} onCerrar={() => setSeleccionado(null)} />}
    </div>
  );
}

/** Un filtro activo, con su × para sacarlo. */
function Chip({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
      {texto}
      <button type="button" onClick={onQuitar} aria-label={`Quitar filtro ${texto}`} className="text-teal/70 hover:text-teal">
        ✕
      </button>
    </span>
  );
}

function Panel({ titulo, ancho, children }: { titulo: string; ancho?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-borde bg-crema/40 p-3 ${ancho ? "xl:col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold text-tinta/55">{titulo}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
