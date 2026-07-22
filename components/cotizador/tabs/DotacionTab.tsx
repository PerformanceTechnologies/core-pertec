"use client";

import { useState } from "react";
import type { QuotationInput, StaffInput, Turno } from "@/lib/cotizador/motor/types";
import type { QuotationResult } from "@/lib/cotizador/motor/consolidacion";
import { money } from "@/lib/cotizador/formato";
import { nextId } from "@/lib/cotizador/ids";
import { NumInput, TextInput, SelectInput, DeleteButton } from "../campos/Campos";

const TURNO_OPTS: { value: Turno; label: string }[] = [
  { value: "5x2", label: "5x2" },
  { value: "4x3", label: "4x3" },
  { value: "7x7", label: "7x7" },
  { value: "14x14", label: "14x14" },
];

const GRID =
  "grid grid-cols-[minmax(160px,1.5fr)_70px_40px_40px_46px_100px_104px_112px_112px_92px_112px_84px_28px] gap-x-2 items-center";

function DetailColumn({ titulo, filas }: { titulo: string; filas: { k: string; n?: string; v: string; fuerte?: boolean }[] }) {
  return (
    <div>
      <div className="border-b-2 border-tinta pb-1.5 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
        {titulo}
      </div>
      {filas.map((f, i) => (
        <div key={i} className="flex justify-between gap-2 border-b border-borde py-1 text-xs">
          <span className="text-tinta/60">
            {f.k} {f.n && <span className="text-[10px] text-tinta/30">{f.n}</span>}
          </span>
          <span className={`tabular-nums ${f.fuerte ? "font-semibold text-tinta" : "text-tinta"}`}>{f.v}</span>
        </div>
      ))}
    </div>
  );
}

export default function DotacionTab({
  quotation,
  result,
  update,
  disabled,
}: {
  quotation: QuotationInput;
  result: QuotationResult;
  update: (fn: (q: QuotationInput) => QuotationInput) => void;
  disabled: boolean;
}) {
  const [expandido, setExpandido] = useState<string | null>(quotation.staff[0]?.id ?? null);

  const dotTotal = result.staff.reduce((a, s) => a + s.dotacionTotal, 0);
  const hhProm = result.staff.length ? result.staff.reduce((a, s) => a + s.hh70, 0) / result.staff.length : 0;

  const updateStaff = (id: string, patch: Partial<StaffInput>) =>
    update((q) => ({ ...q, staff: q.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const addStaff = () =>
    update((q) => ({
      ...q,
      staff: [
        ...q.staff,
        {
          id: nextId("cargo"),
          cargo: "Nuevo cargo",
          clasificacion: "directo",
          turno: "7x7",
          dotacionA: 1,
          dotacionB: 0,
          dotacionContra: 0,
          tipoContrato: "plazo_fijo",
          modoSueldo: "base",
          base: 800000,
          bonos: [],
          asigMovilizacion: 100000,
          asigColacion: 100000,
          trabajaFestivos: false,
          pctTrabajoPesado: 0,
          horasServicioDia: 14,
        },
      ],
    }));

  const removeStaff = (id: string) => update((q) => ({ ...q, staff: q.staff.filter((s) => s.id !== id) }));

  const addBono = (staffId: string) =>
    update((q) => ({
      ...q,
      staff: q.staff.map((s) => (s.id === staffId ? { ...s, bonos: [...s.bonos, { nombre: "Nuevo bono", monto: 0 }] } : s)),
    }));

  const updateBono = (staffId: string, index: number, patch: Partial<{ nombre: string; monto: number }>) =>
    update((q) => ({
      ...q,
      staff: q.staff.map((s) =>
        s.id === staffId ? { ...s, bonos: s.bonos.map((b, i) => (i === index ? { ...b, ...patch } : b)) } : s,
      ),
    }));

  const removeBono = (staffId: string, index: number) =>
    update((q) => ({
      ...q,
      staff: q.staff.map((s) => (s.id === staffId ? { ...s, bonos: s.bonos.filter((_, i) => i !== index) } : s)),
    }));

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="text-xs text-tinta/60">
          Celdas <span className="rounded border border-borde bg-white px-1.5 py-0.5">blancas</span> editables ·{" "}
          <span className="rounded bg-crema px-1.5 py-0.5">grises</span> calculadas
        </div>
        <div className="flex-1" />
        {!disabled && (
          <button
            type="button"
            onClick={addStaff}
            className="rounded-md border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
          >
            + Agregar cargo
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-borde bg-white">
        <div className={`${GRID} border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40`}>
          <span>Cargo</span>
          <span>Turno</span>
          <span className="text-center">A</span>
          <span className="text-center">B</span>
          <span className="text-center">C.T.</span>
          <span>Contrato</span>
          <span>Modo sueldo</span>
          <span className="text-right">Sueldo base</span>
          <span className="text-right">Líquido</span>
          <span className="text-right">Bonos</span>
          <span className="text-right">Costo total mes</span>
          <span className="text-right">Costo HH</span>
          <span />
        </div>

        {quotation.staff.map((input) => {
          const r = result.staff.find((s) => s.id === input.id)!;
          const abierto = expandido === input.id;
          const bonos = input.bonos.reduce((a, b) => a + b.monto, 0);
          const esLiquido = input.modoSueldo === "liquido";

          return (
            <div key={input.id}>
              <div
                onClick={() => setExpandido(abierto ? null : input.id)}
                className={`${GRID} cursor-pointer border-b border-borde px-4 py-2 ${abierto ? "bg-crema/50" : ""}`}
              >
                <span className="font-medium text-tinta">{input.cargo}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  <SelectInput value={input.turno} onChange={(v) => updateStaff(input.id, { turno: v })} options={TURNO_OPTS} disabled={disabled} />
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <NumInput value={input.dotacionA} onChange={(v) => updateStaff(input.id, { dotacionA: v })} format="plain" align="center" disabled={disabled} />
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <NumInput value={input.dotacionB} onChange={(v) => updateStaff(input.id, { dotacionB: v })} format="plain" align="center" disabled={disabled} />
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <NumInput value={input.dotacionContra} onChange={(v) => updateStaff(input.id, { dotacionContra: v })} format="plain" align="center" disabled={disabled} />
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <SelectInput
                    value={input.tipoContrato}
                    onChange={(v) => updateStaff(input.id, { tipoContrato: v })}
                    options={[
                      { value: "indefinido", label: "Indefinido" },
                      { value: "plazo_fijo", label: "Plazo fijo" },
                    ]}
                    disabled={disabled}
                  />
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => updateStaff(input.id, { modoSueldo: esLiquido ? "base" : "liquido" })}
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      esLiquido ? "bg-naranjo/10 text-naranjo" : "bg-gris/10 text-gris"
                    }`}
                  >
                    {esLiquido ? "Líquido obj." : "Sueldo base"}
                  </button>
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  {esLiquido ? (
                    <span className="block rounded-md bg-crema px-2 py-1 text-right text-sm tabular-nums text-tinta/70">
                      {money(r.baseUsado)}
                    </span>
                  ) : (
                    <NumInput value={input.base ?? 0} onChange={(v) => updateStaff(input.id, { base: v })} disabled={disabled} />
                  )}
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  {esLiquido ? (
                    <NumInput value={input.targetLiquido ?? 0} onChange={(v) => updateStaff(input.id, { targetLiquido: v })} disabled={disabled} />
                  ) : (
                    <span className="block rounded-md bg-crema px-2 py-1 text-right text-sm tabular-nums text-tinta/70">
                      {money(r.primeraPasada.liquida)}
                    </span>
                  )}
                </span>
                <span className="text-right text-sm tabular-nums text-tinta/60">{money(bonos)}</span>
                <span className="rounded-md bg-crema px-2 py-1 text-right text-sm font-semibold tabular-nums text-tinta">
                  {money(r.costoMensualCargo)}
                </span>
                <span className="text-right text-sm tabular-nums text-tinta/60">{money(r.hh70)}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-tinta/40 transition-transform ${abierto ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {abierto && (
                <div className="border-b border-borde bg-crema/40 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-0.5 w-4 bg-naranjo" />
                    <span className="text-xs font-bold uppercase tracking-wide text-tinta/60">Datos del cargo</span>
                    <div className="flex-1" />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeStaff(input.id)}
                        className="rounded-md border border-borde px-2 py-1 text-[11px] font-semibold text-red-600/80 transition hover:border-red-600/40"
                      >
                        Eliminar cargo
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    <div className="col-span-2">
                      <div className="text-[10px] font-semibold uppercase text-tinta/40">Cargo</div>
                      <div className="mt-1">
                        <TextInput value={input.cargo} onChange={(v) => updateStaff(input.id, { cargo: v })} disabled={disabled} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-tinta/40">Clasificación</div>
                      <div className="mt-1">
                        <SelectInput
                          value={input.clasificacion}
                          onChange={(v) => updateStaff(input.id, { clasificacion: v })}
                          options={[
                            { value: "directo", label: "Directo" },
                            { value: "indirecto", label: "Indirecto" },
                          ]}
                          disabled={disabled}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-tinta/40">Movilización</div>
                      <div className="mt-1">
                        <NumInput value={input.asigMovilizacion} onChange={(v) => updateStaff(input.id, { asigMovilizacion: v })} disabled={disabled} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-tinta/40">Colación</div>
                      <div className="mt-1">
                        <NumInput value={input.asigColacion} onChange={(v) => updateStaff(input.id, { asigColacion: v })} disabled={disabled} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-tinta/40">Horas servicio/día</div>
                      <div className="mt-1">
                        <NumInput value={input.horasServicioDia} onChange={(v) => updateStaff(input.id, { horasServicioDia: v })} format="plain" disabled={disabled} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-tinta/40">Trabaja festivos</div>
                      <div className="mt-1">
                        <SelectInput
                          value={input.trabajaFestivos ? "si" : "no"}
                          onChange={(v) => updateStaff(input.id, { trabajaFestivos: v === "si" })}
                          options={[
                            { value: "no", label: "No" },
                            { value: "si", label: "Sí" },
                          ]}
                          disabled={disabled}
                        />
                      </div>
                    </div>

                    <div className="col-span-2 sm:col-span-4 lg:col-span-6">
                      <div className="mb-1.5 flex items-center gap-2">
                        <div className="text-[10px] font-semibold uppercase text-tinta/40">Bonos imponibles</div>
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => addBono(input.id)}
                            className="rounded-md border border-borde bg-white px-2 py-0.5 text-[10px] font-semibold text-tinta transition hover:border-naranjo/50"
                          >
                            + Bono
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {input.bonos.length === 0 && <span className="text-xs text-tinta/40">Sin bonos.</span>}
                        {input.bonos.map((b, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded-md border border-borde bg-white p-1">
                            <TextInput value={b.nombre} onChange={(v) => updateBono(input.id, i, { nombre: v })} disabled={disabled} className="w-36 border-none" />
                            <NumInput value={b.monto} onChange={(v) => updateBono(input.id, i, { monto: v })} disabled={disabled} className="w-28" />
                            <DeleteButton onClick={() => removeBono(input.id, i)} disabled={disabled} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 mt-5 flex items-center gap-2">
                    <div className="h-0.5 w-4 bg-naranjo" />
                    <span className="text-xs font-bold uppercase tracking-wide text-tinta/60">
                      Liquidación proyectada — {input.cargo} · mes promedio con provisiones
                    </span>
                    <span className="text-[10px] text-tinta/40">tramo impuesto {r.segundaPasada.tramoAplicado}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailColumn
                      titulo="Haberes"
                      filas={[
                        { k: "Sueldo base", v: money(r.haberes.base) },
                        ...input.bonos.map((b) => ({ k: b.nombre, v: money(b.monto) })),
                        { k: "Gratificación", n: "con tope", v: money(r.haberes.gratificacion) },
                        { k: "Imponible 1", v: money(r.haberes.imponible1), fuerte: true },
                        { k: "Movilización", n: "no imponible", v: money(r.haberes.movilizacion) },
                        { k: "Colación", n: "no imponible", v: money(r.haberes.colacion) },
                      ]}
                    />
                    <DetailColumn
                      titulo="Descuentos e impuesto"
                      filas={[
                        { k: "AFP", v: money(r.primeraPasada.afp) },
                        { k: "Salud", v: money(r.primeraPasada.salud) },
                        { k: "Copago seguro salud", v: money(r.primeraPasada.copagoSeguroSalud) },
                        { k: "Cesantía trabajador", v: money(r.primeraPasada.cesantiaTrabajador) },
                        { k: "Impuesto único 2ª cat.", n: `tramo ${r.primeraPasada.tramoAplicado}`, v: money(r.primeraPasada.impuesto) },
                      ]}
                    />
                    <div>
                      <DetailColumn
                        titulo="Provisiones · mes promedio"
                        filas={[
                          { k: "Festivos", v: money(r.provisiones.provFestivos) },
                          { k: "Festivos irrenunciable", v: money(r.provisiones.provFestivosIrrenunciable) },
                          { k: "Bono cuatrimestral", v: money(r.provisiones.provBonoCuatrimestral) },
                          { k: "Bono metas", v: money(r.provisiones.provBonoMetas) },
                          { k: "Bonos festivos", v: money(r.provisiones.provBonosFestivos) },
                          { k: "Aguinaldos", n: "/12", v: money(r.provisiones.provAguinaldos) },
                        ]}
                      />
                      <div className="mt-2 flex justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-teal">Líquido mensual</span>
                        <span className="text-sm font-bold tabular-nums text-teal">{money(r.primeraPasada.liquida)}</span>
                      </div>
                    </div>
                    <DetailColumn
                      titulo="Costo empresa"
                      filas={[
                        { k: "Seguro vida", v: money(r.costoEmpresa.seguroVida) },
                        { k: "Prov. vacaciones", v: money(r.costoEmpresa.provVacaciones) },
                        { k: "Prov. indemnización", v: money(r.costoEmpresa.provIndemnizacion) },
                        { k: "SIS", v: money(r.costoEmpresa.sis) },
                        { k: "Capacitación", v: money(r.costoEmpresa.capacitacion) },
                        { k: "EPP persona", v: money(r.costoEmpresa.eppPersona) },
                        { k: "Cesantía empleador", v: money(r.costoEmpresa.cesantiaEmpleador) },
                        { k: "Seguro salud empleador", v: money(r.costoEmpresa.seguroSaludEmpleador) },
                        { k: "Mutual", v: money(r.costoEmpresa.mutual) },
                        { k: "Aporte reforma previsional", n: "Ley 21.735", v: money(r.costoEmpresa.aporteReforma) },
                      ]}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex items-center justify-between rounded-lg bg-tinta px-4 py-3 text-white">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Costo unitario mes</span>
                      <span className="text-base font-bold tabular-nums">{money(r.costoUnitarioMes)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-tinta px-4 py-3 text-white">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Costo total mes × {r.dotacionTotal}</span>
                      <span className="text-base font-bold tabular-nums text-naranjo-suave">{money(r.costoMensualCargo)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-tinta px-4 py-3 text-white">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Costo HH</span>
                      <span className="text-base font-bold tabular-nums">{money(r.hh70)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-4 bg-tinta px-4 py-3 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Totales dotación</span>
          <span className="text-sm">
            <b className="text-naranjo-suave">{dotTotal}</b> personas · {result.staff.length} cargos
          </span>
          <div className="flex-1" />
          <span className="text-xs text-white/70">
            Tarifa cuadrilla/día <b className="tabular-nums text-white">{money(result.tarifaCuadrillaDia)}</b>
          </span>
          <span className="text-xs text-white/70">
            Costo personal SPOT/mes <b className="tabular-nums text-naranjo-suave">{money(result.costoPersonalSpot)}</b>
          </span>
          <span className="text-xs text-white/70">
            Costo HH promedio <b className="tabular-nums text-white">{money(hhProm)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
