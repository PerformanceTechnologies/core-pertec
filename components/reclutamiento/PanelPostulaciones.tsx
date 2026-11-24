"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostulacionGuardada } from "@/lib/reclutamiento";
import { exportarPostulacionesAExcel } from "@/lib/exportarCsv";
import ModalPostulante from "./ModalPostulante";
import CargaPertec from "@/components/CargaPertec";
import {
  IconBriefcase,
  IconChevronDown,
  IconChevronRight,
  IconClockHour4,
  IconDownload,
  IconFileText,
  IconMapPin,
  IconSearch,
  IconUsersGroup,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { Avatar, BOTON_SUAVE_C, CAMPO_C, HOJA, IconoTile, type TonoIcono } from "@/components/contactos/Visual";

const INTERVALO_ACTUALIZACION_MS = 30_000;

// "ahora" solo alimenta comparaciones contra ventanas de tiempo medidas en
// horas o dias (el filtro por rango y el contador de ultimas 24h), pero se
// guardaba con precision de milisegundos y se refrescaba cada segundo: como es
// dependencia del useMemo de "filtradas", eso re-corria el filtro completo
// sobre todas las postulaciones -- y con el las 3 agregaciones que dependen de
// su resultado -- 60 veces por minuto, sin que ningun numero en pantalla
// cambiara. Truncando al minuto, el valor de estado solo cambia cuando cambia
// el minuto, asi que React descarta los renders intermedios (setState con un
// valor identico no re-renderiza) y el filtro corre 1 vez por minuto en vez de
// 60. El intervalo sigue en 1s a proposito: asi el primer valor real llega
// enseguida tras montar, igual que antes.
const minutoActual = () => Math.floor(Date.now() / 60_000) * 60_000;

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
    a.localeCompare(b, "es"),
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

/** Los filtros como pastillas, igual que el buscador de Contactos. */
const PASTILLA = `${CAMPO_C} rounded-full`;

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
    const tick = setInterval(() => setAhora(minutoActual()), 1000);
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
    filtros.busqueda !== "" ||
    filtros.cargo !== "" ||
    filtros.region !== "" ||
    filtros.turno !== "" ||
    filtros.rango !== "todos";

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
      (p) => p.creadaEn && momentoActual - new Date(p.creadaEn).getTime() < 24 * 60 * 60 * 1000,
    ).length;
  }, [filtradas, ahora]);

  const maxCargo = porCargo[0]?.total ?? 1;
  const maxRegion = porRegion[0]?.total ?? 1;

  // Este panel tambien carga en el navegador: hasta que llegan las postulaciones
  // se veia el encabezado con "Actualizado Cargando..." y la lista vacia.
  if (!postulaciones && !error) return <CargaPertec modulo="Postulaciones Web" />;

  if (error && !postulaciones) {
    return (
      <div className={`${HOJA} mt-8 p-8 text-center`}>
        <p className="text-sm font-medium text-red-600">{error}</p>
        <button onClick={cargar} className={`${BOTON_SUAVE_C} mt-4`}>
          Reintentar
        </button>
      </div>
    );
  }

  const cifras: { etiqueta: string; detalle: string; Icono: Icon; tono: TonoIcono; valor: string | number }[] = [
    { etiqueta: "Postulaciones", detalle: hayFiltrosActivos ? "con estos filtros" : "en total", Icono: IconUsersGroup, tono: "azul", valor: filtradas.length },
    { etiqueta: "Últimas 24 horas", detalle: "recién llegadas", Icono: IconClockHour4, tono: "verde", valor: ultimas24h },
    { etiqueta: "Cargo más pedido", detalle: porCargo[0] ? `${porCargo[0].total} postulaciones` : "", Icono: IconBriefcase, tono: "ambar", valor: porCargo[0]?.etiqueta ?? "—" },
    { etiqueta: "Región líder", detalle: porRegion[0] ? `${porRegion[0].total} postulaciones` : "", Icono: IconMapPin, tono: "marca", valor: porRegion[0]?.etiqueta ?? "—" },
  ];

  return (
    <div className="animar-entrada mt-6 space-y-3">
      {/* ── Resumen: la misma tarjeta de cifras que Contactos ── */}
      <section className={`${HOJA} grid w-full grid-cols-2 gap-1.5 p-1.5 lg:grid-cols-4`} aria-label="Resumen de postulaciones">
        {cifras.map((c) => (
          <div key={c.etiqueta} className="flex min-w-0 items-center gap-3.5 rounded-[18px] px-3 py-3 sm:px-5">
            <IconoTile Icono={c.Icono} tono={c.tono} tamano="grande" />
            <span className="min-w-0">
              <span
                className={`block truncate font-condensed font-bold leading-none text-tinta ${typeof c.valor === "number" ? "text-[28px] tabular-nums sm:text-4xl" : "text-xl sm:text-2xl"}`}
                title={String(c.valor)}
              >
                {typeof c.valor === "number" ? c.valor.toLocaleString("es-CL") : c.valor}
              </span>
              <span className="mt-1 block truncate text-xs font-semibold text-gris">
                {c.etiqueta}
                {c.detalle && <span className="hidden font-normal text-gris-suave xl:inline"> · {c.detalle}</span>}
              </span>
            </span>
          </div>
        ))}
      </section>

      {/* ── Desglose: tocar una fila filtra por ese cargo o región ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BarrasDesglose
          titulo="Por cargo"
          Icono={IconBriefcase}
          datos={porCargo}
          maximo={maxCargo}
          activo={filtros.cargo}
          alElegir={(v) => setFiltros((f) => ({ ...f, cargo: f.cargo === v ? "" : v }))}
        />
        <BarrasDesglose
          titulo="Por región"
          Icono={IconMapPin}
          datos={porRegion}
          maximo={maxRegion}
          activo={filtros.region}
          alElegir={(v) => setFiltros((f) => ({ ...f, region: f.region === v ? "" : v }))}
        />
      </div>

      {/* ── Buscador y filtros en una fila, exportar a la derecha ── */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <div className="relative w-full sm:w-64">
          <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gris" />
          <input
            value={filtros.busqueda}
            onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
            placeholder="Nombre, RUT o correo…"
            aria-label="Buscar postulaciones"
            className={`${PASTILLA} pl-9`}
          />
        </div>
        <Selector valor={filtros.cargo} alCambiar={(v) => setFiltros((f) => ({ ...f, cargo: v }))} todos="Todos los cargos" opciones={opcionesCargo} />
        <Selector valor={filtros.region} alCambiar={(v) => setFiltros((f) => ({ ...f, region: v }))} todos="Todas las regiones" opciones={opcionesRegion} />
        <Selector valor={filtros.turno} alCambiar={(v) => setFiltros((f) => ({ ...f, turno: v }))} todos="Todos los turnos" opciones={opcionesTurno} />
        <select
          value={filtros.rango}
          onChange={(e) => setFiltros((f) => ({ ...f, rango: e.target.value as Rango }))}
          aria-label="Periodo"
          className={`${PASTILLA} w-auto ${filtros.rango !== "todos" ? "bg-tinta/[0.1] font-semibold" : ""}`}
        >
          {RANGOS.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta}
            </option>
          ))}
        </select>
        {hayFiltrosActivos && (
          <button onClick={() => setFiltros(FILTROS_VACIOS)} className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-naranjo hover:underline">
            <IconX size={13} /> Limpiar
          </button>
        )}
        <button onClick={exportarSeleccionadas} disabled={seleccionados.size === 0} className={`${BOTON_SUAVE_C} ml-auto disabled:cursor-not-allowed`} title={seleccionados.size === 0 ? "Marca postulaciones en la lista para exportarlas" : undefined}>
          <IconDownload size={16} /> Exportar a Excel{seleccionados.size > 0 && ` (${seleccionados.size})`}
        </button>
      </div>

      {/* ── La lista ── */}
      <div className={`${HOJA} overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 border-b border-borde/60 px-4 py-2.5 text-xs text-gris">
          <span>
            <b className="font-semibold text-tinta">{filtradas.length}</b> de {postulaciones?.length ?? 0} postulaciones
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${cargando ? "animate-pulse bg-naranjo" : "bg-emerald-500"}`} />
            {actualizadoEn ? `Actualizado ${hace(segundosDesde)}` : "Cargando…"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde/60 bg-tinta/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                <th className="w-10 py-2.5 pl-4 pr-1">
                  <input type="checkbox" checked={todasSeleccionadas} onChange={alternarSeleccionTodos} className="h-4 w-4 accent-naranjo" aria-label="Seleccionar todas" />
                </th>
                <th className="px-3 py-2.5">Postulante</th>
                <th className="px-4 py-2.5">Cargo</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Región</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Teléfono</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Llegó</th>
                <th className="px-4 py-2.5 text-right">CV</th>
                <th className="w-10 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/60">
              {filtradas.map((p) => (
                <tr key={p.id} onClick={() => setPostulanteActivo(p)} className={`group cursor-pointer transition hover:bg-tinta/[0.025] ${seleccionados.has(p.id) ? "bg-naranjo/[0.04]" : ""}`}>
                  <td className="py-2 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(p.id)}
                      onChange={() => alternarSeleccion(p.id)}
                      className="h-4 w-4 accent-naranjo"
                      aria-label={`Seleccionar ${p.nombreCompleto}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-3">
                      <Avatar nombre={p.nombreCompleto || "?"} tipo="persona" />
                      <span className="min-w-0">
                        <span className="block max-w-[18rem] truncate font-semibold text-tinta group-hover:text-naranjo">{p.nombreCompleto}</span>
                        <span className="block font-mono text-xs tabular-nums text-gris">{p.rut || "Sin RUT"}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-block max-w-[14rem] truncate rounded-full bg-tinta/[0.05] px-2.5 py-0.5 text-xs font-semibold text-tinta">{p.cargo || "Sin cargo"}</span>
                  </td>
                  <td className="hidden px-4 py-2 text-tinta md:table-cell">
                    {p.region || <span className="text-gris-suave">—</span>}
                    {p.turno && <span className="block text-xs text-gris">Turno {p.turno}</span>}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2 tabular-nums text-gris lg:table-cell">{p.telefono || "—"}</td>
                  <td className="hidden whitespace-nowrap px-4 py-2 text-gris sm:table-cell">{formatearFecha(p.creadaEn)}</td>
                  <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {p.cvUrl ? (
                      <a
                        href={p.cvUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-naranjo/10 px-2.5 py-1 text-xs font-semibold text-naranjo transition hover:bg-naranjo hover:text-white"
                      >
                        <IconFileText size={14} /> Ver
                      </a>
                    ) : (
                      <span className="text-xs text-gris-suave">Sin CV</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <IconChevronRight size={18} className="inline text-gris-suave group-hover:text-naranjo" />
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gris">
                    {postulaciones && postulaciones.length > 0 ? "Ninguna postulación coincide con los filtros." : "Aún no hay postulaciones registradas."}
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

/** Un filtro desplegable en pastilla; se oscurece cuando tiene algo elegido. */
function Selector({ valor, alCambiar, todos, opciones }: { valor: string; alCambiar: (v: string) => void; todos: string; opciones: string[] }) {
  return (
    <select value={valor} onChange={(e) => alCambiar(e.target.value)} aria-label={todos} className={`${PASTILLA} w-auto max-w-[13rem] ${valor ? "bg-tinta/[0.1] font-semibold" : ""}`}>
      <option value="">{todos}</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Con mouse se abre al pasar por encima; en una pantalla táctil, al tocar (y se cierra tocando de nuevo). */
const conMouse = () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

/** Los tramos de la barra resumen: del más pedido al menos, y el resto en gris. */
const TRAMOS = ["bg-teal", "bg-teal/70", "bg-teal/50", "bg-teal/35", "bg-teal/20"];

/**
 * Un desglose compacto: en la tarjeta solo el resumen (cuántos hay, cuál lidera y una barra con la
 * proporción de cada uno). El detalle completo aparece al pasar el mouse (o al tocar en el celular)
 * en una ventanita flotante, y tocar una fila filtra la lista por ese valor (de nuevo lo quita).
 */
function BarrasDesglose({
  titulo,
  Icono,
  datos,
  maximo,
  activo,
  alElegir,
}: {
  titulo: string;
  Icono: Icon;
  datos: { etiqueta: string; total: number }[];
  maximo: number;
  activo: string;
  alElegir: (valor: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const total = datos.reduce((s, d) => s + d.total, 0);
  const lider = datos[0];
  const unidad = titulo.toLowerCase().includes("región") ? ["región", "regiones"] : ["cargo", "cargos"];
  const tramos = datos.slice(0, TRAMOS.length);
  const resto = total - tramos.reduce((s, d) => s + d.total, 0);

  return (
    <section
      className={`${HOJA} relative px-5 py-4 ${abierto ? "z-30" : ""}`}
      onMouseEnter={() => conMouse() && setAbierto(true)}
      onMouseLeave={() => conMouse() && setAbierto(false)}
    >
      <button type="button" onClick={() => !conMouse() && setAbierto((v) => !v)} aria-expanded={abierto} className="block w-full text-left">
        <span className="flex items-center gap-2">
          <Icono size={18} className="text-naranjo" />
          <span className="text-sm font-bold text-tinta">{titulo}</span>
          <span className="text-xs text-gris">
            · {datos.length} {datos.length === 1 ? unidad[0] : unidad[1]}
          </span>
          {activo && <span className="ml-1 truncate rounded-full bg-naranjo/10 px-2 py-0.5 text-[11px] font-semibold text-naranjo">{activo}</span>}
          <IconChevronDown size={16} className={`ml-auto shrink-0 text-gris transition ${abierto ? "rotate-180" : ""}`} />
        </span>
        {lider ? (
          <>
            <span className="mt-2 block truncate text-xs text-gris">
              Lidera <b className="font-semibold text-tinta">{lider.etiqueta}</b> con {lider.total} de {total}
            </span>
            {/* La proporción de cada uno en una sola barra, sin nombres: el detalle va en la ventanita. */}
            <span className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
              {tramos.map((d, i) => (
                <span key={d.etiqueta} className={`h-full ${TRAMOS[i]}`} style={{ width: `${(d.total / total) * 100}%` }} />
              ))}
              {resto > 0 && <span className="h-full bg-tinta/[0.08]" style={{ width: `${(resto / total) * 100}%` }} />}
            </span>
          </>
        ) : (
          <span className="mt-2 block text-sm text-gris">Sin datos aún.</span>
        )}
      </button>

      {abierto && datos.length > 0 && (
        // Pegada a la tarjeta (sin hueco) para que el mouse pueda bajar a ella sin que se cierre.
        <div className="absolute inset-x-0 top-full pt-1.5">
          <div className={`${HOJA} max-h-80 overflow-y-auto p-2`}>
            <ul className="space-y-0.5">
              {datos.map((d, i) => {
                const elegido = activo === d.etiqueta;
                return (
                  <li key={d.etiqueta}>
                    <button
                      type="button"
                      onClick={() => alElegir(d.etiqueta)}
                      aria-pressed={elegido}
                      className={`grid w-full grid-cols-[0.5rem_minmax(0,11rem)_1fr_1.75rem] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-tinta/[0.04] ${elegido ? "bg-naranjo/[0.08]" : ""}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${TRAMOS[i] ?? "bg-tinta/[0.15]"}`} />
                      <span className={`truncate font-medium ${elegido ? "text-naranjo" : "text-tinta"}`} title={d.etiqueta}>
                        {d.etiqueta}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
                        <span className={`block h-full rounded-full ${elegido ? "bg-naranjo" : "bg-teal"}`} style={{ width: `${Math.max(6, (d.total / maximo) * 100)}%` }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums text-gris">{d.total}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="px-2 pb-1 pt-2 text-[11px] text-gris-suave">Toca uno para filtrar la lista.</p>
          </div>
        </div>
      )}
    </section>
  );
}
