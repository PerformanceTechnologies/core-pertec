import { calcularPersonalSpotContratoResult } from "@/lib/cotizador/motor/personal-spot-contrato";
import { round0 } from "@/lib/cotizador/motor/round";
import type { LegalParameterSet } from "@/lib/cotizador/motor/types";
import type { LineaCargoObra, ObraInput, ObraResult } from "./tipos";

/**
 * Cálculo de una obra (SPOT por turnos).
 *
 * Dos bloques de costo y una sola cadena de margen:
 *
 *   personal  = Σ (costo hora-hombre del cargo × sus horas-hombre)
 *   items     = Σ (cantidad × precio unitario)      ← arriendos, fletes, insumos
 *   costo     = personal + items
 *   cargado   = costo + MOB + GG + utilidad
 *   neto      = cargado + GG ECO + utilidad ECO      ← sobre la base configurada
 *
 * La cadena es la misma del motor (ver consolidacion.ts, líneas 167-176) a
 * propósito: si el ECO de una obra usara otra fórmula, dos cotizaciones de la
 * misma empresa dejarían de ser comparables.
 *
 * Lo que NO se replica del motor es la movilización automática
 * (`costoTotalServicio / divisorMovilizacion`). En una obra la movilización es
 * una línea explícita y cotizada —traslado de la grúa, movilización del
 * enrollador— y sumarla dos veces es el error más fácil de cometer acá.
 *
 * El costo empresa de cada persona sale de `calcularPersonalSpotContratoResult`,
 * o sea de las mismas reglas legales que el resto del Cotizador: AFP, salud,
 * impuesto por tramos, provisiones. De ahí se usa `costoUnitarioMes` y la
 * conversión a hora-hombre se hace acá con `divisorHH`, porque esa división es
 * una decisión comercial y no una regla legal.
 */
export function calcularObra(input: ObraInput, P: LegalParameterSet): ObraResult {
  const hhPorTurnoPersona = input.turnos.horas;
  const hhPreviosPorCargo = new Map<string, number>();
  for (const previo of input.trabajosPrevios) {
    hhPreviosPorCargo.set(previo.cargoId, (hhPreviosPorCargo.get(previo.cargoId) ?? 0) + previo.hh);
  }

  const divisor = input.divisorHH > 0 ? input.divisorHH : 1;

  const lineasCargo: LineaCargoObra[] = input.dotacion.map((cargo) => {
    const resultado = calcularPersonalSpotContratoResult(
      { ...cargo.remuneracion, id: cargo.id, cargo: cargo.cargo, horasEstimadasMes: 0 },
      P,
    );

    // Personas totales = las de un turno por la cantidad de turnos que hay que
    // cubrir con gente distinta. Con turnos día y noche alternados, cada persona
    // trabaja la mitad de los turnos, y las horas-hombre del cargo son las
    // mismas mirándolo por persona o por turno: personasPorTurno × turnos × horas.
    const hhTurnos = cargo.personasPorTurno * input.turnos.cantidad * hhPorTurnoPersona;
    const hhPrevios = hhPreviosPorCargo.get(cargo.id) ?? 0;
    const hhTotal = hhTurnos + hhPrevios;
    const costoHoraHombre = resultado.costoUnitarioMes / divisor;

    return {
      id: cargo.id,
      cargo: cargo.cargo,
      personasPorTurno: cargo.personasPorTurno,
      personasTotales: cargo.personasPorTurno * Math.min(input.turnos.cantidad, 2),
      hhTurnos,
      hhPrevios,
      hhTotal,
      costoUnitarioMes: round0(resultado.costoUnitarioMes),
      costoHoraHombre: round0(costoHoraHombre),
      costoTotal: round0(costoHoraHombre * hhTotal),
    };
  });

  const costoPersonal = lineasCargo.reduce((total, l) => total + l.costoTotal, 0);
  const costoItems = input.items.reduce((total, i) => total + i.cantidad * i.precioUnitario, 0);
  const costoTotal = costoPersonal + costoItems;

  const mob = costoTotal * input.margenes.mobPct;
  const gg = costoTotal * input.margenes.ggPct;
  const utilidad = costoTotal * input.margenes.utilidadPct;
  const costoCargado = costoTotal + mob + gg + utilidad;

  const baseEco = input.margenes.baseCalculoEco === "costo_puro" ? costoTotal : costoCargado;
  const ggEco = baseEco * input.margenes.ggEcoPct;
  const utilidadEco = baseEco * input.margenes.utilidadEcoPct;

  const totalNeto = costoCargado + ggEco + utilidadEco;
  const iva = totalNeto * input.margenes.ivaPct;

  return {
    hhTotal: lineasCargo.reduce((total, l) => total + l.hhTotal, 0),
    personasTotales: lineasCargo.reduce((total, l) => total + l.personasTotales, 0),
    lineasCargo,
    costoPersonal: round0(costoPersonal),
    costoItems: round0(costoItems),
    costoTotal: round0(costoTotal),
    mob: round0(mob),
    gg: round0(gg),
    utilidad: round0(utilidad),
    costoCargado: round0(costoCargado),
    ggEco: round0(ggEco),
    utilidadEco: round0(utilidadEco),
    totalNeto: round0(totalNeto),
    iva: round0(iva),
    totalConIva: round0(totalNeto + iva),
    margenEfectivo: costoTotal > 0 ? (totalNeto - costoTotal) / costoTotal : 0,
  };
}
