import type { LegalParameterSet, PersonalSpotContratoInput, PersonalSpotContratoResult, StaffInput } from "./types";
import { calcularHaberes, calcularProvisiones, calcularCostoEmpresa, goalSeekBase } from "./remuneraciones";

// Personal SPOT del contrato (contrato_permanente): reutiliza las mismas
// reglas legales de haberes/provisiones/costo empresa que el personal
// permanente (calcularHaberes/calcularProvisiones/calcularCostoEmpresa en
// remuneraciones.ts — mismo AFP/salud/impuesto), pero factura por hora-hombre
// (HH25) en vez de por costo mensual × dotación. Estas funciones compartidas
// esperan un StaffInput; turno/dotación/horas de servicio no existen en este
// modo de facturación, así que se rellenan con valores neutros que no activan
// ninguna regla que dependa de ellos (turno "5x2" no dispara festivos
// automáticos — ver TURNOS_CON_FESTIVOS — y la dotación en 0 es correcta
// porque este modo no se factura por cabeza).
function comoStaffInput(input: PersonalSpotContratoInput): StaffInput {
  return {
    id: input.id,
    cargo: input.cargo,
    clasificacion: input.clasificacion,
    turno: "5x2",
    dotacionA: 0,
    dotacionB: 0,
    dotacionContra: 0,
    tipoContrato: input.tipoContrato,
    modoSueldo: input.modoSueldo,
    base: input.base,
    targetLiquido: input.targetLiquido,
    bonos: input.bonos,
    asigMovilizacion: input.asigMovilizacion,
    asigColacion: input.asigColacion,
    trabajaFestivos: input.trabajaFestivos,
    pctTrabajoPesado: input.pctTrabajoPesado,
    horasServicioDia: 0,
    provisiones: input.provisiones,
    costosFijos: input.costosFijos,
  };
}

export function calcularPersonalSpotContratoResult(
  input: PersonalSpotContratoInput,
  P: LegalParameterSet,
  horasBaseMes = 180,
): PersonalSpotContratoResult {
  const staffShape = comoStaffInput(input);

  let base = input.base ?? 0;
  if (input.modoSueldo === "liquido" && input.targetLiquido) {
    base = goalSeekBase(staffShape, input.targetLiquido, P, horasBaseMes).base;
  }

  const haberes = calcularHaberes(staffShape, base, P);
  const provisiones = calcularProvisiones(staffShape, haberes.imponible1);
  const costoEmpresa = calcularCostoEmpresa(staffShape, provisiones.remTotalPromedio, provisiones.imponible2, P);
  const costoUnitarioMes = provisiones.remTotalPromedio + costoEmpresa.total;
  const costoHH25 = costoUnitarioMes / (horasBaseMes * 0.25);

  return {
    id: input.id,
    cargo: input.cargo,
    costoUnitarioMes,
    costoHH25,
    horasEstimadasMes: input.horasEstimadasMes,
    costoMensual: costoHH25 * input.horasEstimadasMes,
  };
}
