"use client";

import { useState } from "react";
import type { CostItemInput, QuotationInput } from "@/lib/cotizador/motor/types";
import { calcularDepreciacionEquipo, calcularCostoVehiculo } from "@/lib/cotizador/motor/costos";
import type { QuotationResult } from "@/lib/cotizador/motor/consolidacion";
import { money } from "@/lib/cotizador/formato";
import { nextId } from "@/lib/cotizador/ids";
import { NumInput, TextInput, SelectInput, DeleteButton, Badge } from "../campos/Campos";

type CostTab =
  | "insumo_material"
  | "insumo_oficina"
  | "util_aseo"
  | "epp"
  | "equipo_herramienta"
  | "vehiculo"
  | "puesta_en_marcha";

const CHIPS: { key: CostTab; label: string }[] = [
  { key: "insumo_material", label: "Insumos y Materiales" },
  { key: "insumo_oficina", label: "Insumos de Oficina" },
  { key: "util_aseo", label: "Útiles de Aseo" },
  { key: "epp", label: "EPP" },
  { key: "equipo_herramienta", label: "Equipos y Herramientas" },
  { key: "vehiculo", label: "Vehículos" },
  { key: "puesta_en_marcha", label: "Puesta en Marcha" },
];

const ASIG_OPTS = [
  { value: "directo" as const, label: "Directo" },
  { value: "indirecto" as const, label: "Indirecto" },
];
const MODO_OPTS = [
  { value: "mensual" as const, label: "Mensual" },
  { value: "unico_prorrateado" as const, label: "Único prorrateado" },
  { value: "unico" as const, label: "Único" },
];

export default function CostosTab({
  quotation,
  result,
  update,
  disabled,
  uf,
}: {
  quotation: QuotationInput;
  result: QuotationResult;
  update: (fn: (q: QuotationInput) => QuotationInput) => void;
  disabled: boolean;
  uf: number;
}) {
  const [tab, setTab] = useState<CostTab>("insumo_material");
  const chip = CHIPS.find((c) => c.key === tab)!;
  const categoria = result.categorias.find((c) => c.categoria === tab);

  const isEquipo = tab === "equipo_herramienta";
  const isVehiculo = tab === "vehiculo";
  const genericos = quotation.costItems.filter((i) => i.categoria === tab);
  const nItems = isEquipo ? quotation.equipos.length : isVehiculo ? quotation.vehiculos.length : genericos.length;

  const updateItem = (id: string, patch: Partial<CostItemInput>) =>
    update((q) => ({ ...q, costItems: q.costItems.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const addItem = () =>
    update((q) => ({
      ...q,
      costItems: [
        ...q.costItems,
        {
          id: nextId("ci"),
          categoria: tab as CostItemInput["categoria"],
          descripcion: "Nueva línea",
          unidad: "un",
          cantidad: 1,
          precioUnitario: 0,
          modoCosto: "mensual",
          asignacion: tab === "insumo_material" || tab === "epp" ? "directo" : "indirecto",
        },
      ],
    }));

  const removeItem = (id: string) => update((q) => ({ ...q, costItems: q.costItems.filter((i) => i.id !== id) }));

  const updateEquipo = (id: string, patch: Partial<QuotationInput["equipos"][number]>) =>
    update((q) => ({ ...q, equipos: q.equipos.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const addEquipo = () =>
    update((q) => ({
      ...q,
      equipos: [
        ...q.equipos,
        { id: nextId("eq"), descripcion: "Nuevo equipo", cantBase: 1, nCuadrillas: 1, valorUnit: 0, vidaUtilAnios: 1, asignacion: "directo" },
      ],
    }));

  const removeEquipo = (id: string) => update((q) => ({ ...q, equipos: q.equipos.filter((e) => e.id !== id) }));

  const updateVehiculo = (id: string, patch: Partial<QuotationInput["vehiculos"][number]>) =>
    update((q) => ({ ...q, vehiculos: q.vehiculos.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));

  const addVehiculo = () =>
    update((q) => ({
      ...q,
      vehiculos: [
        ...q.vehiculos,
        {
          id: nextId("veh"),
          descripcion: "Nuevo vehículo",
          ufMes: 20,
          unidades: 1,
          diasUsoMes: 7,
          kmDia: 50,
          rendimientoKmL: 10,
          precioLitro: 1250,
          incluyeGps: true,
          asignacion: "directo",
        },
      ],
    }));

  const removeVehiculo = (id: string) => update((q) => ({ ...q, vehiculos: q.vehiculos.filter((v) => v.id !== id) }));

  const addLinea = () => {
    if (isEquipo) addEquipo();
    else if (isVehiculo) addVehiculo();
    else addItem();
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => {
          const activo = c.key === tab;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setTab(c.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activo ? "border-tinta bg-tinta text-white" : "border-borde bg-white text-tinta/70 hover:border-naranjo/40"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {tab === "epp" && (
        <div className="mt-3 rounded-lg border border-naranjo/30 bg-naranjo/5 px-4 py-3 text-xs text-tinta/70">
          El costo de personal (Módulo A) ya incluye $35.000/persona de EPP en costo empresa. Active esta categoría como
          costo propio SOLO si desactiva ese componente — nunca ambos a la vez.
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-borde bg-white">
        <div className="flex items-center gap-3 border-b border-borde px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-tinta">{chip.label}</span>
          <Badge>{nItems} ítems</Badge>
          <div className="flex-1" />
          {!disabled && (
            <button
              type="button"
              onClick={addLinea}
              className="rounded-md border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
            >
              + Agregar línea
            </button>
          )}
        </div>

        {isEquipo && (
          <>
            <div className="grid grid-cols-[minmax(180px,2fr)_76px_90px_120px_80px_110px_110px_28px] gap-x-3 border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
              <span>Descripción</span>
              <span className="text-right">Cant. base</span>
              <span className="text-right">N° cuadrillas</span>
              <span className="text-right">Valor unit.</span>
              <span className="text-right">Vida (años)</span>
              <span className="text-right">Dep. mensual</span>
              <span>Asignación</span>
              <span />
            </div>
            {quotation.equipos.map((e) => {
              const dep = calcularDepreciacionEquipo(e, quotation.metodoDepreciacionEquipos);
              return (
                <div key={e.id} className="grid grid-cols-[minmax(180px,2fr)_76px_90px_120px_80px_110px_110px_28px] items-center gap-x-3 border-b border-borde px-4 py-2">
                  <TextInput value={e.descripcion} onChange={(v) => updateEquipo(e.id, { descripcion: v })} disabled={disabled} />
                  <NumInput value={e.cantBase} onChange={(v) => updateEquipo(e.id, { cantBase: v })} format="plain" disabled={disabled} />
                  <NumInput value={e.nCuadrillas} onChange={(v) => updateEquipo(e.id, { nCuadrillas: v })} format="plain" disabled={disabled} />
                  <NumInput value={e.valorUnit} onChange={(v) => updateEquipo(e.id, { valorUnit: v })} disabled={disabled} />
                  <NumInput value={e.vidaUtilAnios} onChange={(v) => updateEquipo(e.id, { vidaUtilAnios: v })} format="plain" disabled={disabled} />
                  <span className="rounded-md bg-crema px-2 py-1 text-right text-sm font-semibold tabular-nums">{money(dep.mensual)}</span>
                  <SelectInput value={e.asignacion} onChange={(v) => updateEquipo(e.id, { asignacion: v })} options={ASIG_OPTS} disabled={disabled} />
                  <DeleteButton onClick={() => removeEquipo(e.id)} disabled={disabled} />
                </div>
              );
            })}
          </>
        )}

        {isVehiculo && (
          <>
            <div className="grid grid-cols-[minmax(160px,2fr)_66px_58px_66px_58px_66px_74px_100px_100px_28px] gap-x-2 border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
              <span>Descripción</span>
              <span className="text-right">UF/mes</span>
              <span className="text-right">Unid.</span>
              <span className="text-right">Días/mes</span>
              <span className="text-right">Km/día</span>
              <span className="text-right">Km/L</span>
              <span className="text-right">$/L</span>
              <span className="text-right">Total mensual</span>
              <span>Asignación</span>
              <span />
            </div>
            {quotation.vehiculos.map((v) => {
              const c = calcularCostoVehiculo(v, uf);
              return (
                <div key={v.id} className="grid grid-cols-[minmax(160px,2fr)_66px_58px_66px_58px_66px_74px_100px_100px_28px] items-center gap-x-2 border-b border-borde px-4 py-2">
                  <TextInput value={v.descripcion} onChange={(val) => updateVehiculo(v.id, { descripcion: val })} disabled={disabled} />
                  <NumInput value={v.ufMes} onChange={(val) => updateVehiculo(v.id, { ufMes: val })} format="plain" disabled={disabled} />
                  <NumInput value={v.unidades} onChange={(val) => updateVehiculo(v.id, { unidades: val })} format="plain" disabled={disabled} />
                  <NumInput value={v.diasUsoMes} onChange={(val) => updateVehiculo(v.id, { diasUsoMes: val })} format="plain" disabled={disabled} />
                  <NumInput value={v.kmDia} onChange={(val) => updateVehiculo(v.id, { kmDia: val })} format="plain" disabled={disabled} />
                  <NumInput value={v.rendimientoKmL} onChange={(val) => updateVehiculo(v.id, { rendimientoKmL: val })} format="plain" disabled={disabled} />
                  <NumInput value={v.precioLitro} onChange={(val) => updateVehiculo(v.id, { precioLitro: val })} disabled={disabled} />
                  <span className="rounded-md bg-crema px-2 py-1 text-right text-sm font-semibold tabular-nums">{money(c.total)}</span>
                  <SelectInput value={v.asignacion} onChange={(val) => updateVehiculo(v.id, { asignacion: val })} options={ASIG_OPTS} disabled={disabled} />
                  <DeleteButton onClick={() => removeVehiculo(v.id)} disabled={disabled} />
                </div>
              );
            })}
          </>
        )}

        {!isEquipo && !isVehiculo && (
          <>
            <div className="grid grid-cols-[minmax(200px,2fr)_70px_66px_116px_150px_120px_110px_28px] gap-x-2 border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
              <span>Descripción</span>
              <span>Unidad</span>
              <span className="text-right">Cant.</span>
              <span className="text-right">Precio unit.</span>
              <span>Modo costo</span>
              <span className="text-right">Total mensual</span>
              <span>Asignación</span>
              <span />
            </div>
            {genericos.map((i) => {
              const total =
                i.modoCosto === "unico_prorrateado"
                  ? (i.cantidad * i.precioUnitario) / (i.vidaUtilMeses ?? quotation.duracionMeses)
                  : i.cantidad * i.precioUnitario;
              return (
                <div key={i.id} className="grid grid-cols-[minmax(200px,2fr)_70px_66px_116px_150px_120px_110px_28px] items-center gap-x-2 border-b border-borde px-4 py-2">
                  <TextInput value={i.descripcion} onChange={(v) => updateItem(i.id, { descripcion: v })} disabled={disabled} />
                  <TextInput value={i.unidad} onChange={(v) => updateItem(i.id, { unidad: v })} disabled={disabled} />
                  <NumInput value={i.cantidad} onChange={(v) => updateItem(i.id, { cantidad: v })} format="plain" disabled={disabled} />
                  <NumInput value={i.precioUnitario} onChange={(v) => updateItem(i.id, { precioUnitario: v })} disabled={disabled} />
                  <SelectInput value={i.modoCosto} onChange={(v) => updateItem(i.id, { modoCosto: v })} options={MODO_OPTS} disabled={disabled} />
                  <span className="rounded-md bg-crema px-2 py-1 text-right text-sm font-semibold tabular-nums">{money(total)}</span>
                  <SelectInput value={i.asignacion} onChange={(v) => updateItem(i.id, { asignacion: v })} options={ASIG_OPTS} disabled={disabled} />
                  <DeleteButton onClick={() => removeItem(i.id)} disabled={disabled} />
                </div>
              );
            })}
          </>
        )}

        {nItems === 0 && (
          <div className="px-4 py-5 text-sm text-tinta/40">Sin líneas en esta categoría. Use “+ Agregar línea”.</div>
        )}

        <div className="flex items-center justify-between bg-tinta px-4 py-3 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Total {chip.label} · mensual</span>
          <span className="text-base font-bold tabular-nums text-naranjo-suave">{money(categoria?.monto ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}
