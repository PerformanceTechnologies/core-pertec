"use client";

import { useMemo, useState } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import { PASTILLA_ESTADO } from "@/lib/estilos";
import type { FilaFondo, FilaGasto } from "@/lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  ESTADO_FILTROS,
  GRUPOS_DE_ESTADO,
  diasDesde,
  filtrarGastos,
  hoyEnChileIso,
  marcadoDuplicado,
  olvidado,
  ordenarGastos,
  porReembolsar,
  resumirGastos,
  sinRespaldo,
  type CampoOrden,
  type Criterios,
} from "@/lib/panel-odoo/gastos-filtro";
import {
  antiguedadSinRendir,
  avisos as avisosDeGastos,
  porCategoria,
  porEmpleado,
  porProveedor,
  porTipoDeDocumento,
  rangoDelMes,
  resumirFondos,
  tendenciaMensual,
} from "@/lib/panel-odoo/gastos-series";
import {
  traducir,
  CATEGORIAS_GASTO,
  ESTADOS_GASTO,
  ESTADOS_FONDO,
  TIPOS_DOCUMENTO_GASTO,
} from "@/lib/panel-odoo/traducciones";
import ModalDetalleGasto from "./ModalDetalleGasto";
import {
  GraficoAntiguedadSinRendir,
  GraficoPorCategoria,
  GraficoPorEmpleado,
  GraficoPorProveedor,
  GraficoPorTipoDeDocumento,
  GraficoTendenciaGastos,
} from "./graficos-gastos";

const POR_TANDA = 40;

const COLUMNAS: { campo: CampoOrden; etiqueta: string; alinear?: "derecha" }[] = [
  { campo: "fecha", etiqueta: "Fecha" },
  { campo: "empleado", etiqueta: "Quién" },
  { campo: "categoria", etiqueta: "Categoría" },
  { campo: "proveedor", etiqueta: "Proveedor" },
  { campo: "monto_total", etiqueta: "Total", alinear: "derecha" },
  { campo: "monto_pendiente", etiqueta: "Pendiente", alinear: "derecha" },
];

const CLASES_ESTADO: Record<string, string> = {
  draft: "bg-gris/15 text-gris",
  submitted: "bg-naranjo-suave/15 text-naranjo",
  approved: "bg-teal/10 text-teal",
  in_report: "bg-teal/10 text-teal",
  posted: "bg-teal/10 text-teal",
  paid: "bg-teal/10 text-teal",
};

export default function DetalleGastos({ gastos, fondos }: { gastos: FilaGasto[]; fondos: FilaFondo[] }) {
  const [criterios, setCriterios] = useState<Criterios>(CRITERIOS_INICIALES);
  const [mostrados, setMostrados] = useState(POR_TANDA);
  const [seleccionado, setSeleccionado] = useState<FilaGasto | null>(null);
  const [verGraficos, setVerGraficos] = useState(true);

  const hoy = useMemo(() => hoyEnChileIso(), []);

  const visibles = useMemo(
    () => ordenarGastos(filtrarGastos(gastos, criterios, hoy), criterios.orden, criterios.sentido),
    [gastos, criterios, hoy],
  );
  const resumen = useMemo(() => resumirGastos(visibles, hoy), [visibles, hoy]);
  const plataAfuera = useMemo(() => resumirFondos(fondos), [fondos]);

  // Los gráficos se calculan sobre lo FILTRADO: la tabla y los gráficos contestan la
  // misma pregunta.
  const series = useMemo(
    () => ({
      tendencia: tendenciaMensual(visibles),
      categorias: porCategoria(visibles),
      empleados: porEmpleado(visibles),
      documentos: porTipoDeDocumento(visibles),
      proveedores: porProveedor(visibles),
      antiguedad: antiguedadSinRendir(visibles, hoy),
    }),
    [visibles, hoy],
  );

  // Los avisos van sobre TODO y no sobre lo filtrado: son la tarea pendiente completa, y
  // esconderlos al filtrar los volvería inútiles.
  const avisos = useMemo(() => avisosDeGastos(gastos, hoy), [gastos, hoy]);

  const empleados = useMemo(
    () => [...new Set(gastos.map((g) => g.empleado ?? "Sin asignar"))].sort((a, b) => a.localeCompare(b, "es")),
    [gastos],
  );

  const mesElegido = useMemo(() => {
    if (!criterios.desde || !criterios.hasta) return null;
    const mes = criterios.desde.slice(0, 7);
    const rango = rangoDelMes(mes);
    return rango.desde === criterios.desde && rango.hasta === criterios.hasta ? mes : null;
  }, [criterios.desde, criterios.hasta]);

  function cambiar(parcial: Partial<Criterios>) {
    setCriterios((previos) => ({ ...previos, ...parcial }));
    setMostrados(POR_TANDA);
  }

  function alElegirMes(mes: string) {
    if (mesElegido === mes) return cambiar({ desde: "", hasta: "" });
    cambiar(rangoDelMes(mes));
  }
  const alternarEstado = (filtro: string) => cambiar({ estado: criterios.estado === filtro ? "" : filtro });
  const alternarEmpleado = (e: string) => cambiar({ empleado: criterios.empleado === e ? "" : e });
  const alternarCategoria = (c: string) =>
    cambiar(c === "" ? { estado: alternarValor(criterios.estado, "sin_categoria") } : { categoria: criterios.categoria === c ? "" : c });
  const alternarDocumento = (d: string) => cambiar({ tipoDocumento: criterios.tipoDocumento === d ? "" : d });
  const alternarProveedor = (p: string) => cambiar({ proveedor: criterios.proveedor === p ? "" : p });

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
    criterios.empleado !== "" ||
    criterios.categoria !== "" ||
    criterios.tipoDocumento !== "" ||
    criterios.proveedor !== "" ||
    criterios.desde !== "" ||
    criterios.hasta !== "";

  return (
    <div>
      {/* Lo que pide una acción hoy, contado y con su plata. */}
      {avisos.length > 0 && (
        <div className="mb-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-tinta/70">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">Requiere atención</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {avisos.map((a) => (
              <button
                key={a.filtro}
                type="button"
                onClick={() => alternarEstado(a.filtro)}
                className="text-left underline decoration-dotted underline-offset-2 transition hover:text-naranjo"
              >
                <strong className="font-semibold text-tinta">{a.cantidad}</strong> {a.texto}
                {a.monto > 0 && <span className="text-tinta/50"> ({money(a.monto)})</span>}
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
          placeholder="Buscar por descripción, persona, proveedor…"
          aria-label="Buscar gastos"
          className="col-span-2 rounded-lg border border-borde px-3 py-2 text-xs text-tinta placeholder:text-tinta/40 focus:border-teal focus:outline-none"
        />
        <select
          value={criterios.estado}
          onChange={(e) => cambiar({ estado: e.target.value })}
          aria-label="Estado"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los gastos</option>
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
          value={criterios.empleado}
          onChange={(e) => cambiar({ empleado: e.target.value })}
          aria-label="Empleado"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todas las personas</option>
          {empleados.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          Desde
          <input
            type="date"
            value={criterios.desde}
            onChange={(e) => cambiar({ desde: e.target.value })}
            aria-label="Desde"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          hasta
          <input
            type="date"
            value={criterios.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            aria-label="Hasta"
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
          {criterios.empleado && <Chip texto={criterios.empleado} onQuitar={() => cambiar({ empleado: "" })} />}
          {criterios.categoria && (
            <Chip
              texto={traducir(CATEGORIAS_GASTO, criterios.categoria)}
              onQuitar={() => cambiar({ categoria: "" })}
            />
          )}
          {criterios.tipoDocumento && (
            <Chip
              texto={traducir(TIPOS_DOCUMENTO_GASTO, criterios.tipoDocumento)}
              onQuitar={() => cambiar({ tipoDocumento: "" })}
            />
          )}
          {criterios.proveedor && <Chip texto={criterios.proveedor} onQuitar={() => cambiar({ proveedor: "" })} />}
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
          <strong className="text-tinta">{resumen.cantidad}</strong> gasto{resumen.cantidad === 1 ? "" : "s"}
        </span>
        <span>
          Total <strong className="text-tinta">{money(resumen.monto)}</strong>
        </span>
        <span>
          Sin rendir <strong className="text-naranjo">{resumen.sinRendir}</strong> ({money(resumen.montoSinRendir)})
        </span>
        <span>
          Por reembolsar <strong className="text-teal">{money(resumen.montoPorReembolsar)}</strong>
        </span>
        <span>
          IVA <strong className="text-tinta">{money(resumen.montoImpuesto)}</strong>
        </span>
        {resumen.sinRespaldo > 0 && (
          <span>
            Sin respaldo <strong className="text-red-600">{resumen.sinRespaldo}</strong>
          </span>
        )}
      </div>

      {/* Los fondos por rendir: plata de la empresa que está afuera. */}
      {fondos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-borde px-3 py-2 text-[11px] text-tinta/60">
          <span className="text-[10px] uppercase tracking-wide text-tinta/40">Fondos por rendir</span>
          <span>
            Entregado <strong className="text-tinta">{money(plataAfuera.entregado)}</strong>
          </span>
          <span>
            Rendido <strong className="text-tinta">{money(plataAfuera.rendido)}</strong>
          </span>
          <span>
            Sin cerrar <strong className="text-naranjo">{plataAfuera.abiertos}</strong> (saldo{" "}
            {money(plataAfuera.saldo)})
          </span>
        </div>
      )}

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
          {/* Primero los de una columna, en pares, y al final el que va a lo ancho: un
              panel de una columna seguido de uno de dos deja la fila con un hueco. */}
          <Panel titulo="En qué se va la plata">
            <GraficoPorCategoria grupos={series.categorias} onElegir={alternarCategoria} />
          </Panel>
          <Panel titulo="Quién gasta">
            <GraficoPorEmpleado grupos={series.empleados} onElegir={alternarEmpleado} />
          </Panel>
          <Panel titulo="Con qué respaldo se gastó">
            <GraficoPorTipoDeDocumento grupos={series.documentos} onElegir={alternarDocumento} />
          </Panel>
          <Panel titulo="En quién se gasta">
            <GraficoPorProveedor grupos={series.proveedores} onElegir={alternarProveedor} />
          </Panel>
          <Panel titulo="Hace cuánto esperan los borradores">
            <GraficoAntiguedadSinRendir
              tramos={series.antiguedad}
              onElegirOlvidados={() => alternarEstado("olvidados")}
            />
          </Panel>
          <Panel titulo="Rendido y sin rendir por mes" ancho>
            <GraficoTendenciaGastos datos={series.tendencia} onElegirMes={alElegirMes} mesElegido={mesElegido} />
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
                  <th
                    key={c.campo}
                    scope="col"
                    className={`py-2 font-semibold ${c.alinear === "derecha" ? "text-right" : ""}`}
                  >
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
            {visibles.slice(0, mostrados).map((g) => {
              const dias = diasDesde(g.fecha, hoy);
              return (
                <tr
                  key={g.odoo_id}
                  onClick={() => setSeleccionado(g)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSeleccionado(g);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-crema/60"
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-tinta/55">
                    {g.fecha ? fechaCl(g.fecha) : "-"}
                    {olvidado(g, hoy) && dias !== null && (
                      <span className="ml-1 text-[10px] text-red-600">({dias} d)</span>
                    )}
                  </td>
                  <td className="max-w-[160px] py-2 pr-3">
                    <p title={g.empleado ?? ""} className="truncate text-tinta/80">
                      {g.empleado ?? "Sin asignar"}
                    </p>
                    <p title={g.descripcion ?? ""} className="truncate text-[10px] text-tinta/40">
                      {g.descripcion ?? `#${g.odoo_id}`}
                    </p>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-tinta/55">
                    {g.categoria ? (
                      traducir(CATEGORIAS_GASTO, g.categoria)
                    ) : (
                      <span className="text-tinta/30">—</span>
                    )}
                  </td>
                  <td className="max-w-[160px] truncate py-2 pr-3 text-tinta/55" title={g.proveedor ?? ""}>
                    {g.proveedor ?? <span className="text-tinta/30">—</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold text-tinta">
                    {money(g.monto_total)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-tinta/70">
                    {(g.monto_pendiente ?? 0) > 0 ? (
                      <span className={porReembolsar(g) ? "text-naranjo" : ""}>{money(g.monto_pendiente ?? 0)}</span>
                    ) : (
                      <span className="text-tinta/30">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`${PASTILLA_ESTADO} ${CLASES_ESTADO[g.estado] ?? "bg-gris/15 text-gris"}`}>
                        {traducir(ESTADOS_GASTO, g.estado)}
                      </span>
                      {sinRespaldo(g) && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Sin respaldo
                        </span>
                      )}
                      {marcadoDuplicado(g) && (
                        <span className="rounded-full border border-naranjo/30 bg-naranjo/10 px-1.5 py-0.5 text-[10px] font-semibold text-naranjo">
                          Repetido
                        </span>
                      )}
                      {g.fondo && (
                        <span className="rounded-full border border-teal/30 bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                          {g.fondo}
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
        <p className="mt-4 text-center text-xs text-tinta/40">Ningún gasto calza con los filtros.</p>
      )}

      {visibles.length > mostrados && (
        <button
          type="button"
          onClick={() => setMostrados((n) => n + POR_TANDA)}
          className="mt-3 w-full rounded-lg border border-borde py-2 text-xs font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta"
        >
          Ver {Math.min(POR_TANDA, visibles.length - mostrados)} más (de {visibles.length})
        </button>
      )}

      {/* Los fondos, en detalle */}
      {fondos.length > 0 && (
        <>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
            Fondos por rendir ({fondos.length})
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-borde">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-crema/60 text-tinta/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Referencia</th>
                  <th className="px-3 py-2 font-medium">Empleado</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 text-right font-medium">Entregado</th>
                  <th className="px-3 py-2 text-right font-medium">Rendido</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {fondos.map((f) => (
                  <tr key={f.odoo_id}>
                    <td className="px-3 py-2 text-tinta" title={f.motivo ?? f.descripcion ?? undefined}>
                      {f.referencia}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-tinta/70" title={f.empleado ?? undefined}>
                      {f.empleado ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{f.fecha ? fechaCl(f.fecha) : "-"}</td>
                    <td className="px-3 py-2 text-right text-tinta/70">{money(f.monto_entregado)}</td>
                    <td className="px-3 py-2 text-right text-tinta/70">{money(f.monto_rendido)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-tinta">{money(f.saldo)}</td>
                    <td className="px-3 py-2 text-tinta/70">{traducir(ESTADOS_FONDO, f.estado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {seleccionado && <ModalDetalleGasto gasto={seleccionado} onCerrar={() => setSeleccionado(null)} />}
    </div>
  );
}

/** Prende o apaga un filtro de estado sin pisar otro que ya estuviera puesto. */
function alternarValor(actual: string, valor: string): string {
  return actual === valor ? "" : valor;
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
