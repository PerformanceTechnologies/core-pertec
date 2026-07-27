"use client";

import { useState } from "react";
import Link from "next/link";
import type { CatalogoCargo, DatosCargoCatalogo } from "@/lib/cotizador/catalogo-cargos-tipos";
import { money } from "@/lib/cotizador/formato";
import {
  crearCargoCatalogoAction,
  actualizarCargoCatalogoAction,
  desactivarCargoCatalogoAction,
} from "@/app/(protegido)/cotizador/catalogos/acciones";
import { NumInput, TextInput, SelectInput, DeleteButton } from "./campos/Campos";

// Contenido ilustrativo restante (aún no hay tabla propia en Supabase) —
// mismo comentario que antes, fuera de alcance por ahora.
const CARDS = [
  { n: 34, label: "Insumos y materiales" },
  { n: 19, label: "EPP" },
  { n: 12, label: "Equipos y herramientas" },
  { n: 5, label: "Vehículos" },
  { n: 4, label: "Baterías de exámenes" },
];

const LOCACIONES = [
  { nombre: "Minera Antucoya", cliente: "Antofagasta Minerals", dias: 20, racion: "$9.850", examenes: "GES + altura física", casino: "Compass" },
  { nombre: "Centinela", cliente: "Antofagasta Minerals", dias: 20, racion: "$10.240", examenes: "GES + MES", casino: "Sodexo" },
];

function nuevoCargoVacio(): DatosCargoCatalogo {
  return {
    cargo: "Nuevo cargo",
    area: null,
    clasificacion: "directo",
    turnoTipico: null,
    modoSueldoTipico: "base",
    baseReferencial: 800000,
    liquidoReferencial: null,
    bonosDefault: [],
    asigMovilizacionReferencial: 0,
    asigColacionReferencial: 0,
    horasServicioDiaReferencial: null,
  };
}

export default function PanelCatalogos({
  cargosIniciales,
  puedeEditar,
}: {
  cargosIniciales: CatalogoCargo[];
  puedeEditar: boolean;
}) {
  const [cargos, setCargos] = useState(cargosIniciales);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actualizarLocal = (id: string, patch: Partial<CatalogoCargo>) =>
    setCargos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const aDatos = (c: CatalogoCargo): DatosCargoCatalogo => ({
    cargo: c.cargo,
    area: c.area,
    clasificacion: c.clasificacion,
    turnoTipico: c.turnoTipico,
    modoSueldoTipico: c.modoSueldoTipico,
    baseReferencial: c.baseReferencial,
    liquidoReferencial: c.liquidoReferencial,
    bonosDefault: c.bonosDefault,
    asigMovilizacionReferencial: c.asigMovilizacionReferencial,
    asigColacionReferencial: c.asigColacionReferencial,
    horasServicioDiaReferencial: c.horasServicioDiaReferencial,
  });

  const guardarCargo = async (c: CatalogoCargo) => {
    setError(null);
    setGuardando(c.id);
    try {
      await actualizarCargoCatalogoAction(c.id, aDatos(c));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cargo.");
    } finally {
      setGuardando(null);
    }
  };

  const agregarCargo = async () => {
    setError(null);
    setGuardando("nuevo");
    try {
      const creado = await crearCargoCatalogoAction(nuevoCargoVacio());
      setCargos((prev) => [...prev, creado]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cargo.");
    } finally {
      setGuardando(null);
    }
  };

  const eliminarCargo = async (id: string) => {
    if (!window.confirm("¿Ocultar este cargo del catálogo? Ya no aparecerá como opción al agregar dotación.")) return;
    setError(null);
    setGuardando(id);
    try {
      await desactivarCargoCatalogoAction(id);
      setCargos((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ocultar el cargo.");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div>
      <Link href="/cotizador" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Cotizaciones
      </Link>

      <div className="mt-2">
        <span className="etiqueta-seccion">Cotizador</span>
      </div>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Catálogos de precios</h1>
      <p className="mt-1 max-w-2xl text-sm text-tinta/60">
        Biblioteca de referencia — los cargos se pueden agregar, editar y ocultar aquí, y sirven como punto de
        partida al agregar dotación en una cotización nueva (siempre editable por proyecto después).
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-red-600/20 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-borde bg-white p-3.5">
          <div className="font-condensed text-2xl font-bold tabular-nums text-naranjo">{cargos.length}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-tinta/60">Cargos</div>
        </div>
        {CARDS.map((c) => (
          <div key={c.label} className="rounded-xl border border-borde bg-white p-3.5">
            <div className="font-condensed text-2xl font-bold tabular-nums text-naranjo">{c.n}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-tinta/60">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_.85fr] lg:items-start">
        <div className="overflow-x-auto rounded-xl border border-borde bg-white">
          <div className="flex items-center justify-between border-b border-borde px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-tinta/50">
              Cargos — sueldos referenciales
            </span>
            {puedeEditar && (
              <button
                type="button"
                onClick={agregarCargo}
                disabled={guardando !== null}
                className="rounded-md border border-borde bg-white px-2.5 py-1 text-[11px] font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
              >
                + Agregar cargo
              </button>
            )}
          </div>
          <div className="grid grid-cols-[minmax(150px,1.5fr)_100px_120px_90px_88px_28px] gap-x-2 border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
            <span>Cargo</span>
            <span>Clasificación</span>
            <span className="text-right">Base referencial</span>
            <span className="text-right">Bonos default</span>
            <span />
            <span />
          </div>
          {cargos.map((c) => {
            const bonos = c.bonosDefault.reduce((a, b) => a + b.monto, 0);
            return (
              <div
                key={c.id}
                className="grid grid-cols-[minmax(150px,1.5fr)_100px_120px_90px_88px_28px] items-center gap-x-2 border-b border-borde px-4 py-2 text-sm"
              >
                {puedeEditar ? (
                  <TextInput value={c.cargo} onChange={(v) => actualizarLocal(c.id, { cargo: v })} />
                ) : (
                  <span className="text-tinta">{c.cargo}</span>
                )}
                {puedeEditar ? (
                  <SelectInput
                    value={c.clasificacion}
                    onChange={(v) => actualizarLocal(c.id, { clasificacion: v })}
                    options={[
                      { value: "directo", label: "Directo" },
                      { value: "indirecto", label: "Indirecto" },
                    ]}
                  />
                ) : (
                  <span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        c.clasificacion === "directo" ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                      }`}
                    >
                      {c.clasificacion.toUpperCase()}
                    </span>
                  </span>
                )}
                {puedeEditar ? (
                  <NumInput
                    value={c.baseReferencial ?? 0}
                    onChange={(v) => actualizarLocal(c.id, { baseReferencial: v })}
                  />
                ) : (
                  <span className="text-right tabular-nums text-tinta">{money(c.baseReferencial ?? 0)}</span>
                )}
                <span className="text-right tabular-nums text-tinta/60">{money(bonos)}</span>
                {puedeEditar ? (
                  <button
                    type="button"
                    onClick={() => guardarCargo(c)}
                    disabled={guardando === c.id}
                    className="rounded-md border border-borde bg-white px-2 py-1 text-[10px] font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
                  >
                    {guardando === c.id ? "Guardando…" : "Guardar"}
                  </button>
                ) : (
                  <span />
                )}
                {puedeEditar ? (
                  <DeleteButton onClick={() => eliminarCargo(c.id)} disabled={guardando === c.id} />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          <div className="px-4 py-2.5 text-xs text-tinta/40">
            clasificación directo/indirecto definida una sola vez aquí
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {LOCACIONES.map((l) => (
            <div key={l.nombre} className="rounded-xl border border-borde bg-white p-4">
              <div className="flex items-baseline gap-2.5">
                <span className="text-sm font-semibold uppercase tracking-wide text-tinta">{l.nombre}</span>
                <span className="text-xs text-tinta/50">{l.cliente}</span>
                <div className="flex-1" />
                <span className="rounded-full bg-crema px-2 py-0.5 text-[10px] font-semibold text-tinta/60">
                  {l.dias} días alim./mes
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-tinta/60">
                <span>
                  Ración día persona <b className="font-semibold text-tinta">{l.racion}</b>
                </span>
                <span>
                  Batería exámenes <b className="font-semibold text-tinta">{l.examenes}</b>
                </span>
                <span>
                  Casino <b className="font-semibold text-tinta">{l.casino}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
