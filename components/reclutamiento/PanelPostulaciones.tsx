"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostulacionGuardada } from "@/lib/reclutamiento";
import { exportarPostulacionesAExcel } from "@/lib/exportarCsv";
import ModalPostulante from "./ModalPostulante";

const INTERVALO_ACTUALIZACION_MS = 30_000;

const RANGOS = [
  { valor: "todos", etiqueta: "Todo el periodo" },
  { valor: "24h", etiqueta: "Últimas 24 horas" },
  { valor: "7d", etiqueta: "Últimos 7 días" },
  { valor: "30d", etiqueta: "Últimos 30 días" },
] as const;

type Rango = (typeof RANGOS)[number]["valor"];

const MS_POR_RANGO: Record<Rango, number | null> = {
  todos: null,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

interface Filtros {
  busqueda: string;
  cargo: string;
  region: string;
  turno: string;
  rango: Rango;
}

const FILTROS_VACIOS: Filtros = { busqueda: "", cargo: "", region: "", turno: "", rango: "todos" };

function contarPor(lista: PostulacionGuardada[], clave: keyof PostulacionGuardada) {
  const conteo = new Map<string, number>();
  for (const item of lista) {
    const valor = item[clave] || "Sin especificar";
    conteo.set(valor, (conteo.get(valor) ?? 0) + 1);
  }
  return Array.from(conteo.entries())
    .map(([etiqueta, total]) => ({ etiqueta, total }))
    .sort((a, b) => b.total - a.total);
}

function opcionesUnicas(lista: PostulacionGuardada[], clave: keyof PostulacionGuardada) {
  return Array.from(new Set(lista.map((p) => p[clave]).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

function formatearFecha(iso: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function hace(segundos: number) {
  if (segundos < 5) return "recién";
  if (segundos < 60) return `hace ${segundos}s`;
  return `hace ${Math.floor(segundos / 60)} min`;
}

const inputFiltro =
  "w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta outline-none transition focus:border-naranjo focus:ring-2 focus:ring-naranjo/15";

export default function PanelPostulaciones({ esAdmin }: { esAdmin: boolean }) {
  const [postulaciones, setPostulaciones] = useState<PostulacionGuardada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);
  const [segundosDesde, setSegundosDesde] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [postulanteActivo, setPostulanteActivo] = useState<PostulacionGuardada | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/postulaciones", { cache: "no-store" });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      setPostulaciones(cuerpo.postulaciones);
      setActualizadoEn(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los datos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const primeraCarga = setTimeout(cargar, 0);
    const intervalo = setInterval(cargar, INTERVALO_ACTUALIZACION_MS);
    return () => {
      clearTimeout(primeraCarga);
      clearInterval(intervalo);
    };
  }, [cargar]);

  useEffect(() => {
    if (!actualizadoEn) return;
    const tick = setInterval(() => {
      setSegundosDesde(Math.round((Date.now() - actualizadoEn.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [actualizadoEn]);

  useEffect(() => {
    const tick = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const opcionesCargo = useMemo(() => opcionesUnicas(postulaciones ?? [], "cargo"), [postulaciones]);
  const opcionesRegion = useMemo(() => opcionesUnicas(postulaciones ?? [], "region"), [postulaciones]);
  const opcionesTurno = useMemo(() => opcionesUnicas(postulaciones ?? [], "turno"), [postulaciones]);

  const filtradas = useMemo(() => {
    if (!postulaciones) return [];
    const busqueda = filtros.busqueda.trim().toLowerCase();
    const limiteMs = MS_POR_RANGO[filtros.rango];
    const momentoActual = ahora ?? 0;

    return postulaciones.filter((p) => {
      if (filtros.cargo && p.cargo !== filtros.cargo) return false;
      if (filtros.region && p.region !== filtros.region) return false;
      if (filtros.turno && p.turno !== filtros.turno) return false;
      if (limiteMs && (!p.creadaEn || momentoActual - new Date(p.creadaEn).getTime() > limiteMs))
        return false;
      if (busqueda) {
        const texto = `${p.nombreCompleto} ${p.rut} ${p.correo}`.toLowerCase();
        if (!texto.includes(busqueda)) return false;
      }
      return true;
    });
  }, [postulaciones, filtros, ahora]);

  const hayFiltrosActivos =
    filtros.busqueda !== "" || filtros.cargo !== "" || filtros.region !== "" || filtros.turno !== "" || filtros.rango !== "todos";

  const todasSeleccionadas = filtradas.length > 0 && filtradas.every((p) => seleccionados.has(p.id));

  const alternarSeleccion = (id: string) => {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const alternarSeleccionTodos = () => {
    setSeleccionados((actual) => {
      if (todasSeleccionadas) {
        const nuevo = new Set(actual);
        filtradas.forEach((p) => nuevo.delete(p.id));
        return nuevo;
      }
      const nuevo = new Set(actual);
      filtradas.forEach((p) => nuevo.add(p.id));
      return nuevo;
    });
  };

  const exportarSeleccionadas = () => {
    const lista = filtradas.filter((p) => seleccionados.has(p.id));
    if (lista.length > 0) exportarPostulacionesAExcel(lista);
  };

  const porCargo = useMemo(() => contarPor(filtradas, "cargo"), [filtradas]);
  const porRegion = useMemo(() => contarPor(filtradas, "region"), [filtradas]);

  const ultimas24h = useMemo(() => {
    const momentoActual = ahora ?? 0;
    return filtradas.filter(
      (p) => p.creadaEn && momentoActual - new Date(p.creadaEn).getTime() < 24 * 60 * 60 * 1000
    ).length;
  }, [filtradas, ahora]);

  const maxCargo = porCargo[0]?.total ?? 1;
  const maxRegion = porRegion[0]?.total ?? 1;

  if (error && !postulaciones) {
    return (
      <div className="rounded-2xl border border-borde bg-white p-8 text-center">
        <p className="text-sm font-medium text-red-600">{error}</p>
        <button
          onClick={cargar}
          className="mt-4 rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40 hover:text-naranjo"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="etiqueta-seccion">Postulaciones</span>
        <span className="flex items-center gap-2 text-xs text-tinta/45">
          <span className={`h-1.5 w-1.5 rounded-full ${cargando ? "bg-naranjo animate-pulse" : "bg-teal"}`} />
          {actualizadoEn ? `Actualizado ${hace(segundosDesde)}` : "Cargando..."}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TarjetaResumen titulo="Postulaciones (filtro)" valor={filtradas.length} />
        <TarjetaResumen titulo="Últimas 24 horas" valor={ultimas24h} />
        <TarjetaResumen titulo="Cargo más solicitado" valor={porCargo[0]?.etiqueta ?? "—"} pequeno />
        <TarjetaResumen titulo="Región líder" valor={porRegion[0]?.etiqueta ?? "—"} pequeno />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BarrasDesglose titulo="Por cargo" datos={porCargo} maximo={maxCargo} />
        <BarrasDesglose titulo="Por región" datos={porRegion} maximo={maxRegion} />
      </div>

      <div className="rounded-2xl border border-borde bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-1">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/35"
            >
              <path
                d="M9 16a7 7 0 100-14 7 7 0 000 14zM18 18l-3.6-3.6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={filtros.busqueda}
              onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
              placeholder="Buscar nombre, RUT o correo"
              className={`${inputFiltro} pl-9`}
            />
          </div>

          <select
            value={filtros.cargo}
            onChange={(e) => setFiltros((f) => ({ ...f, cargo: e.target.value }))}
            className={inputFiltro}
          >
            <option value="">Todos los cargos</option>
            {opcionesCargo.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filtros.region}
            onChange={(e) => setFiltros((f) => ({ ...f, region: e.target.value }))}
            className={inputFiltro}
          >
            <option value="">Todas las regiones</option>
            {opcionesRegion.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            value={filtros.turno}
            onChange={(e) => setFiltros((f) => ({ ...f, turno: e.target.value }))}
            className={inputFiltro}
          >
            <option value="">Todos los turnos</option>
            {opcionesTurno.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={filtros.rango}
            onChange={(e) => setFiltros((f) => ({ ...f, rango: e.target.value as Rango }))}
            className={inputFiltro}
          >
            {RANGOS.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-tinta/45">
            Mostrando <span className="font-semibold text-tinta/70">{filtradas.length}</span> de{" "}
            {postulaciones?.length ?? 0} postulaciones
          </p>
          {hayFiltrosActivos && (
            <button
              onClick={() => setFiltros(FILTROS_VACIOS)}
              className="text-xs font-medium text-naranjo hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-borde bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-6 py-4">
          <h2 className="font-condensed text-lg font-bold uppercase text-tinta">
            Postulaciones {hayFiltrosActivos ? "filtradas" : "recientes"}
          </h2>
          <button
            onClick={exportarSeleccionadas}
            disabled={seleccionados.size === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-borde px-3 py-1.5 text-xs font-semibold text-tinta/70 transition hover:border-teal/40 hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
              <path
                d="M10 3v9m0 0l-3-3m3 3l3-3M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Exportar a Excel {seleccionados.size > 0 && `(${seleccionados.size})`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-xs uppercase tracking-wide text-tinta/45">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todasSeleccionadas}
                    onChange={alternarSeleccionTodos}
                    className="h-4 w-4 accent-naranjo"
                    aria-label="Seleccionar todas"
                  />
                </th>
                <th className="px-2 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">RUT</th>
                <th className="px-4 py-3 font-medium">Cargo</th>
                <th className="px-4 py-3 font-medium">Región</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">CV</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setPostulanteActivo(p)}
                  className="cursor-pointer border-b border-borde/60 transition hover:bg-crema/60 last:border-b-0"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(p.id)}
                      onChange={() => alternarSeleccion(p.id)}
                      className="h-4 w-4 accent-naranjo"
                      aria-label={`Seleccionar ${p.nombreCompleto}`}
                    />
                  </td>
                  <td className="px-2 py-3 font-medium text-tinta">{p.nombreCompleto}</td>
                  <td className="px-4 py-3 text-tinta/70">{p.rut}</td>
                  <td className="px-4 py-3 text-tinta/70">{p.cargo}</td>
                  <td className="px-4 py-3 text-tinta/70">{p.region}</td>
                  <td className="px-4 py-3 text-tinta/70">{p.telefono}</td>
                  <td className="px-4 py-3 text-tinta/50">{formatearFecha(p.creadaEn)}</td>
                  <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                    {p.cvUrl ? (
                      <a
                        href={p.cvUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-naranjo hover:underline"
                      >
                        Ver
                      </a>
                    ) : (
                      <span className="text-tinta/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-tinta/45">
                    {postulaciones && postulaciones.length > 0
                      ? "Ningún resultado coincide con los filtros."
                      : "Aún no hay postulaciones registradas."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {postulanteActivo && (
        <ModalPostulante
          postulante={postulanteActivo}
          onClose={() => setPostulanteActivo(null)}
          esAdmin={esAdmin}
          onEliminado={(id) => {
            setPostulaciones((actual) => actual?.filter((p) => p.id !== id) ?? null);
            setSeleccionados((actual) => {
              const nuevo = new Set(actual);
              nuevo.delete(id);
              return nuevo;
            });
          }}
        />
      )}
    </div>
  );
}

function TarjetaResumen({
  titulo,
  valor,
  pequeno,
}: {
  titulo: string;
  valor: string | number;
  pequeno?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-borde bg-white p-4">
      <p className="text-xs font-medium text-tinta/50">{titulo}</p>
      <p className={`mt-1 font-condensed font-bold text-tinta ${pequeno ? "text-base" : "text-2xl"}`}>
        {valor}
      </p>
    </div>
  );
}

function BarrasDesglose({
  titulo,
  datos,
  maximo,
}: {
  titulo: string;
  datos: { etiqueta: string; total: number }[];
  maximo: number;
}) {
  return (
    <div className="rounded-2xl border border-borde bg-white p-5">
      <h3 className="mb-4 font-condensed text-sm font-bold uppercase text-tinta/70">{titulo}</h3>
      <div className="flex flex-col gap-3">
        {datos.length === 0 && <p className="text-sm text-tinta/40">Sin datos aún.</p>}
        {datos.map((d) => (
          <div key={d.etiqueta}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-tinta/75">{d.etiqueta}</span>
              <span className="text-tinta/45">{d.total}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-crema">
              <div
                className="h-full rounded-full bg-teal"
                style={{ width: `${Math.max(6, (d.total / maximo) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
