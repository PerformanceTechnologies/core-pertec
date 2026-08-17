/**
 * Prueba del cálculo de obra (SPOT por turnos) contra una oferta real.
 *
 * La oferta es OS 009-2026, cambio de correa CT-6 en Central Angamos para
 * Axinntus: 4 turnos de 12 h, 18 personas, y una tabla de 8 líneas que suma
 * $137.117.960 neto.
 *
 * Lo que se verifica NO es que el modelo reproduzca ese total —el precio de una
 * oferta lo decide una persona, no una fórmula— sino tres cosas que sí son
 * verificables:
 *
 *   1. Las horas-hombre que sale del programa: 9 por turno × 4 turnos × 12 h.
 *   2. Que la tabla de equipos y fletes sume lo mismo que el documento.
 *   3. Que la cadena de márgenes sea la del motor, con un ejemplo a mano.
 *
 * Correr con:  npx tsx scripts/probar-obra.mts
 */

import assert from "node:assert/strict";
import { calcularObra } from "../lib/cotizador/obra/calculo";
import { DIVISOR_HH_DEFECTO, type ObraInput } from "../lib/cotizador/obra/tipos";
import type { LegalParameterSet } from "../lib/cotizador/motor/types";

// Parámetros legales de referencia (agosto 2026). Se fijan acá para que la
// prueba no dependa de la base: lo que se prueba es la aritmética del modelo.
const P: LegalParameterSet = {
  vigenteDesde: "2026-08-01",
  uf: 39_500,
  utm: 68_000,
  ingresoMinimo: 500_000,
  topeImponibleAfpUF: 87.8,
  topeImponibleCesantiaUF: 131.9,
  tasaAfp: 0.1149,
  tasaSaludLegal: 0.07,
  tasaSisEmpleador: 0.0188,
  tasaCesantiaTrabIndefinido: 0.006,
  tasaCesantiaEmpIndefinido: 0.024,
  tasaCesantiaTrabPlazoFijo: 0,
  tasaCesantiaEmpPlazoFijo: 0.03,
  tasaMutualBase: 0.0093,
  aporteReformaPrevisionalEmp: 0.001,
  topeGratificacionImmAnual: 4.75,
  taxBrackets: [
    { tramoN: 1, desde: 0, hasta: 13.5, factor: 0, rebaja: 0 },
    { tramoN: 2, desde: 13.5, hasta: 30, factor: 0.04, rebaja: 0.54 },
    { tramoN: 3, desde: 30, hasta: 50, factor: 0.08, rebaja: 1.74 },
    { tramoN: 4, desde: 50, hasta: 70, factor: 0.135, rebaja: 4.49 },
    { tramoN: 5, desde: 70, hasta: 90, factor: 0.23, rebaja: 11.14 },
    { tramoN: 6, desde: 90, hasta: 120, factor: 0.304, rebaja: 17.8 },
    { tramoN: 7, desde: 120, hasta: 310, factor: 0.35, rebaja: 23.32 },
    { tramoN: 8, desde: 310, hasta: null, factor: 0.4, rebaja: 38.82 },
  ],
};

function cargo(id: string, nombre: string, personasPorTurno: number, base: number) {
  return {
    id,
    cargo: nombre,
    personasPorTurno,
    remuneracion: {
      clasificacion: "directo" as const,
      tipoContrato: "plazo_fijo" as const,
      modoSueldo: "base" as const,
      base,
      bonos: [],
      asigMovilizacion: 0,
      asigColacion: 0,
      trabajaFestivos: true,
      pctTrabajoPesado: 0,
    },
  };
}

// Sección 6: 18 personas en cuadrilla día y noche, 1 supervisor y 1 APR por
// turno. O sea 9 por turno: 1 + 1 + 2 + 2 + 3.
const DOTACION = [
  cargo("sup", "Supervisor", 1, 1_800_000),
  cargo("apr", "APR", 1, 1_400_000),
  cargo("m1", "M1 vulcanizador", 2, 1_250_000),
  cargo("m2", "M2 vulcanizador", 2, 1_050_000),
  cargo("ayu", "Ayudante vulcanizador", 3, 750_000),
];

// Sección 8.1, ítems 2 a 8: todo lo que no es la cuadrilla. Los montos son los
// del documento, tomados como COSTO para esta prueba.
const ITEMS = [
  { id: "i2", descripcion: "Enrollador + pesos muertos y retención", unidad: "dia" as const, cantidad: 4, precioUnitario: 2_583_750, categoria: "equipo_mayor" as const },
  { id: "i3", descripcion: "Movilización y desmovilización enrollador", unidad: "unidad" as const, cantidad: 2, precioUnitario: 1_050_000, categoria: "transporte" as const },
  { id: "i4", descripcion: "Grúa 50 ton, operador y rigger", unidad: "dia" as const, cantidad: 7, precioUnitario: 1_530_000, categoria: "equipo_mayor" as const },
  { id: "i5", descripcion: "Traslado grúa Antofagasta-Mejillones", unidad: "unidad" as const, cantidad: 2, precioUnitario: 1_250_000, categoria: "transporte" as const },
  { id: "i6", descripcion: "Núcleos metálicos para enrollar cinta", unidad: "unidad" as const, cantidad: 3, precioUnitario: 500_000, categoria: "insumo" as const },
  { id: "i7", descripcion: "Generador eléctrico 200 KVA", unidad: "dia" as const, cantidad: 8, precioUnitario: 195_000, categoria: "equipo_mayor" as const },
  { id: "i8", descripcion: "Camas bajas, traslado de 3 rollos a Calama", unidad: "unidad" as const, cantidad: 3, precioUnitario: 3_730_000, categoria: "transporte" as const },
];

const ENTRADA: ObraInput = {
  tipoServicio: "spot_turnos",
  turnos: { cantidad: 4, horas: 12 },
  dotacion: DOTACION,
  // Sección 4.1: plegado de 900 m y 4 empalmes a piso, antes de la parada. El
  // documento no los cuantifica en HH; se estiman dos turnos de la cuadrilla de
  // vulcanizadores para tener algo que valorizar.
  trabajosPrevios: [
    { id: "p1", descripcion: "Plegado 900 m y 4 empalmes a piso", cargoId: "m1", hh: 2 * 12 * 2 },
    { id: "p2", descripcion: "Plegado 900 m y 4 empalmes a piso", cargoId: "ayu", hh: 2 * 12 * 3 },
  ],
  items: ITEMS,
  divisorHH: DIVISOR_HH_DEFECTO,
  margenes: {
    mobPct: 0.014,
    ggPct: 0.07,
    utilidadPct: 0.1,
    ggEcoPct: 0.2,
    utilidadEcoPct: 0.2,
    ivaPct: 0.19,
    baseCalculoEco: "costo_puro",
  },
};

const r = calcularObra(ENTRADA, P);

// ── 1. Horas-hombre del programa ────────────────────────────────────────────
const HH_TURNOS = 9 * 4 * 12; // 432
const HH_PREVIOS = 2 * 12 * 2 + 2 * 12 * 3; // 120
assert.equal(
  r.lineasCargo.reduce((t, l) => t + l.hhTurnos, 0),
  HH_TURNOS,
  "las HH de los turnos no son 9 × 4 × 12",
);
assert.equal(r.hhTotal, HH_TURNOS + HH_PREVIOS, "el total de HH no suma turnos + previos");
assert.equal(r.personasTotales, 18, "la dotación total no da 18 personas");

// ── 2. La tabla de equipos y fletes ─────────────────────────────────────────
// $39.895.000 es la suma de los ítems 2 a 8 del cuadro de precios.
assert.equal(r.costoItems, 39_895_000, "los ítems no suman lo mismo que el documento");

// ── 3. La cadena de márgenes ────────────────────────────────────────────────
const esperadoCargado = r.costoTotal * (1 + 0.014 + 0.07 + 0.1);
assert.ok(Math.abs(r.costoCargado - esperadoCargado) <= 1, "MOB + GG + utilidad mal aplicados");
const esperadoNeto = esperadoCargado + r.costoTotal * 0.4; // GG ECO 20% + utilidad ECO 20%
assert.ok(Math.abs(r.totalNeto - esperadoNeto) <= 2, "el ECO no aplica 20% + 20% sobre el costo puro");
assert.ok(Math.abs(r.iva - r.totalNeto * 0.19) <= 1, "IVA mal calculado");
assert.ok(r.margenEfectivo > 0.55 && r.margenEfectivo < 0.6, `margen efectivo inesperado: ${r.margenEfectivo}`);

// Invariantes: nada negativo ni NaN.
for (const [clave, valor] of Object.entries(r)) {
  if (typeof valor === "number") {
    assert.ok(Number.isFinite(valor), `${clave} no es finito`);
    assert.ok(valor >= 0, `${clave} salió negativo`);
  }
}

const clp = (n: number) => "$" + n.toLocaleString("es-CL");

console.log("Obra CT-6 — 4 turnos de 12 h, 9 personas por turno\n");
console.table(
  r.lineasCargo.map((l) => ({
    cargo: l.cargo,
    "pers/turno": l.personasPorTurno,
    HH: l.hhTotal,
    "costo mes": clp(l.costoUnitarioMes),
    "costo HH": clp(l.costoHoraHombre),
    total: clp(l.costoTotal),
  })),
);
console.log(`
  HH totales           ${r.hhTotal}   (${HH_TURNOS} en turnos + ${HH_PREVIOS} previos)
  Costo personal       ${clp(r.costoPersonal)}
  Costo equipos/fletes ${clp(r.costoItems)}
  ─────────────────────
  Costo total          ${clp(r.costoTotal)}
  + MOB 1,4%           ${clp(r.mob)}
  + GG 7%              ${clp(r.gg)}
  + Utilidad 10%       ${clp(r.utilidad)}
  = Costo cargado      ${clp(r.costoCargado)}
  + GG ECO 20%         ${clp(r.ggEco)}
  + Utilidad ECO 20%   ${clp(r.utilidadEco)}
  ─────────────────────
  TOTAL NETO           ${clp(r.totalNeto)}
  Margen efectivo      ${(r.margenEfectivo * 100).toFixed(1)}%

  Oferta OS 009-2026   $137.117.960
  Diferencia           ${clp(r.totalNeto - 137_117_960)}
`);
console.log("Todas las verificaciones pasaron.");
