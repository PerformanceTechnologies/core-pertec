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
 *   items     = Σ (cantidad × precio unitario) de los ítems en modo "costo"
 *   costo     = personal + items
 *   cargado   = costo + MOB + GG + utilidad
 *   neto      = cargado + GG ECO + utilidad ECO + ítems en modo "precio"
 *
 * Los ítems en modo "precio" entran al final y sin margen: son el equipo mayor
 * subcontratado, que llega con la cotización del proveedor y se traspasa. Meterlos
 * como costo y aplicarles la cadena completa los deja fuera de mercado, y es la
 * razón por la que un modelo prolijo puede no reproducir nunca la oferta real.
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
  const monto = (i: { cantidad: number; precioUnitario: number }) => i.cantidad * i.precioUnitario;
  const costoItems = input.items.filter((i) => i.modo === "costo").reduce((t, i) => t + monto(i), 0);
  const preciosTraspasados = input.items.filter((i) => i.modo === "precio").reduce((t, i) => t + monto(i), 0);
  const costoTotal = costoPersonal + costoItems;

  const mob = costoTotal * input.margenes.mobPct;
  const gg = costoTotal * input.margenes.ggPct;
  const utilidad = costoTotal * input.margenes.utilidadPct;
  const costoCargado = costoTotal + mob + gg + utilidad;

  const baseEco = input.margenes.baseCalculoEco === "costo_puro" ? costoTotal : costoCargado;
  const ggEco = baseEco * input.margenes.ggEcoPct;
  const utilidadEco = baseEco * input.margenes.utilidadEcoPct;

  const totalNeto = costoCargado + ggEco + utilidadEco + preciosTraspasados;
  const iva = totalNeto * input.margenes.ivaPct;

  // El factor que convierte costo propio en precio, con esta configuración de
  // márgenes. Sirve para responder al revés: cuánto costo cabe dentro de un
  // precio dado.
  const factor =
    1 +
    input.margenes.mobPct +
    input.margenes.ggPct +
    input.margenes.utilidadPct +
    (input.margenes.baseCalculoEco === "costo_puro"
      ? input.margenes.ggEcoPct + input.margenes.utilidadEcoPct
      : (1 + input.margenes.mobPct + input.margenes.ggPct + input.margenes.utilidadPct) *
        (input.margenes.ggEcoPct + input.margenes.utilidadEcoPct));

  const hhTotal = lineasCargo.reduce((total, l) => total + l.hhTotal, 0);

  let cuadre: ObraResult["cuadre"];
  if (input.precioObjetivo && input.precioObjetivo > 0) {
    const objetivo = input.precioObjetivo;
    // Cuánto costo propio admite el objetivo, descontando lo que se traspasa.
    const costoQueCabe = (objetivo - preciosTraspasados) / factor;
    cuadre = {
      objetivo,
      diferencia: round0(objetivo - totalNeto),
      // Contra el objetivo SIN lo traspasado, por lo mismo que margenEfectivo.
      margenEfectivoObjetivo:
        costoTotal > 0 ? (objetivo - preciosTraspasados - costoTotal) / costoTotal : 0,
      costoHoraHombreNecesario: hhTotal > 0 ? round0((costoQueCabe - costoItems) / hhTotal) : 0,
    };
  }

  return {
    cuadre,
    preciosTraspasados: round0(preciosTraspasados),
    hhTotal,
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
    // Margen del trabajo PROPIO: se descuenta lo traspasado del numerador porque
    // no está en el denominador. Sumar al precio los $38 M de la grúa y el
    // enrollador, cuyo costo el modelo no conoce, y dividir por el costo propio,
    // daba un 201% que no significa nada: el margen se calcula sobre lo que la
    // empresa efectivamente carga.
    margenEfectivo: costoTotal > 0 ? (totalNeto - preciosTraspasados - costoTotal) / costoTotal : 0,
  };
}
