import type {
  CostoEmpresaDesglose,
  DescuentosDesglose,
  HaberesDesglose,
  LegalParameterSet,
  ProvisionesDesglose,
  StaffInput,
  StaffResult,
  TaxBracket,
  TipoContrato,
} from "./types";
import { negRound0, round0 } from "./round";

/** Módulo A.1 — Gratificación legal con tope (02_REGLAS_DE_CALCULO.md, hoja '1. Personal' J17). */
export function calcularGratificacion(imponibleSinGrat: number, P: LegalParameterSet) {
  const topeMensual = (P.ingresoMinimo * P.topeGratificacionImmAnual) / 12;
  const umbral = topeMensual / 0.25;
  const gratificacion = round0(
    imponibleSinGrat < umbral ? imponibleSinGrat * 0.25 : topeMensual,
  );
  return { topeMensual, umbral, gratificacion };
}

/** Módulo A.0-A.2 — Haberes (imponible1, remuneración total) para un `base` dado. */
export function calcularHaberes(input: StaffInput, base: number, P: LegalParameterSet): HaberesDesglose {
  const sumaBonos = input.bonos.reduce((acc, b) => acc + b.monto, 0);
  const imponibleSinGrat = base + sumaBonos;
  const { gratificacion } = calcularGratificacion(imponibleSinGrat, P);
  const imponible1 = imponibleSinGrat + gratificacion;
  const remTotal = imponible1 + input.asigMovilizacion + input.asigColacion;
  return {
    base,
    bonos: input.bonos,
    imponibleSinGrat,
    gratificacion,
    imponible1,
    movilizacion: input.asigMovilizacion,
    colacion: input.asigColacion,
    remTotal,
  };
}

function tasaCesantia(tipoContrato: TipoContrato, P: LegalParameterSet, lado: "trab" | "emp") {
  if (lado === "trab") {
    return tipoContrato === "indefinido" ? P.tasaCesantiaTrabIndefinido : P.tasaCesantiaTrabPlazoFijo;
  }
  return tipoContrato === "indefinido" ? P.tasaCesantiaEmpIndefinido : P.tasaCesantiaEmpPlazoFijo;
}

/** Módulo A.4 — lookup genérico en la tabla de tramos vigente (corrección C-01). */
export function buscarTramo(tributable: number, taxBrackets: TaxBracket[]): TaxBracket {
  for (const t of taxBrackets) {
    if (tributable <= t.desde) continue;
    if (t.hasta === null || tributable <= t.hasta) return t;
  }
  return taxBrackets[0];
}

/** Módulo A.3-A.5 — descuentos e impuesto sobre un imponible (1ª o 2ª pasada). */
export function calcularDescuentos(
  imponible: number,
  movilizacion: number,
  colacion: number,
  pctTrabajoPesado: number,
  tipoContrato: TipoContrato,
  P: LegalParameterSet,
): DescuentosDesglose {
  const topeAfp = P.topeImponibleAfpUF * P.uf;
  const topeCes = P.topeImponibleCesantiaUF * P.uf;

  const afp = negRound0(Math.min(imponible, topeAfp) * P.tasaAfp);
  const salud = negRound0(Math.min(imponible, topeAfp) * P.tasaSaludLegal);
  const copagoSeguroSalud = round0(-0.81753 * P.uf) * 0.125;
  const cesantiaTrabajador = negRound0(Math.min(imponible, topeCes) * tasaCesantia(tipoContrato, P, "trab"));

  const tributable = imponible + afp + salud + copagoSeguroSalud + cesantiaTrabajador;
  const tramo = buscarTramo(tributable, P.taxBrackets);
  const impuesto = -(tributable * tramo.factor - tramo.rebaja);

  const cotizTrabajoPesado = imponible * pctTrabajoPesado;
  const liquida = tributable + movilizacion + colacion + impuesto - cotizTrabajoPesado;

  return {
    afp,
    salud,
    copagoSeguroSalud,
    cesantiaTrabajador,
    tributable,
    tramoAplicado: tramo.tramoN,
    impuesto,
    cotizTrabajoPesado,
    liquida,
  };
}

const TURNOS_CON_FESTIVOS = new Set(["4x3", "7x7", "14x14"]);

/** Módulo A.7 — Provisiones e Imponible N°2 (corrección C-02: flag único por turno). */
export function calcularProvisiones(input: StaffInput, imponible1: number): ProvisionesDesglose {
  const trabajaFestivos = input.trabajaFestivos || TURNOS_CON_FESTIVOS.has(input.turno);

  const factorFestivo = ((1 / 30) * 7) / 45 * 1.5;
  const factorIrrenunciable = ((1 / 30) * 7) / 45 * 2;

  const provFestivos = trabajaFestivos ? round0(imponible1 * factorFestivo * 12) * 2 : 0;
  const provFestivosIrrenunciable = trabajaFestivos ? round0(imponible1 * factorIrrenunciable * 8) : 0;
  const provBonoCuatrimestral = input.provisiones?.bonoCuatrimestralMensual ?? 0;
  const provBonoMetas = input.provisiones?.bonoMetasMensual ?? 0;
  const provBonosFestivos = trabajaFestivos ? 5 * 2000 : 0;
  const aguinaldoNavidad = input.provisiones?.aguinaldoNavidad ?? 10000;
  const aguinaldoFFPP = input.provisiones?.aguinaldoFiestasPatrias ?? 0;
  const bonoNegociacion = input.provisiones?.bonoNegociacion ?? 0;
  const provAguinaldos = (aguinaldoNavidad + aguinaldoFFPP + bonoNegociacion) / 12;

  const imponible2 =
    imponible1 +
    provFestivos +
    provFestivosIrrenunciable +
    provBonoCuatrimestral +
    provBonoMetas +
    provBonosFestivos +
    provAguinaldos;
  const remTotalPromedio = imponible2 + input.asigMovilizacion + input.asigColacion;

  return {
    provFestivos,
    provFestivosIrrenunciable,
    provBonoCuatrimestral,
    provBonoMetas,
    provBonosFestivos,
    provAguinaldos,
    imponible2,
    remTotalPromedio,
  };
}

/** Módulo A.9 — Costo empresa. */
export function calcularCostoEmpresa(
  input: StaffInput,
  remTotalPromedio: number,
  imponible2: number,
  P: LegalParameterSet,
): CostoEmpresaDesglose {
  const topeAfp = P.topeImponibleAfpUF * P.uf;
  const topeCes = P.topeImponibleCesantiaUF * P.uf;

  const seguroVida = round0(P.uf * 0.324725);
  const provVacaciones = round0(remTotalPromedio * (25 / 12 / 30));
  const provIndemnizacion = round0(remTotalPromedio * (30 / 12 / 30) * 1);
  const sis = P.tasaSisEmpleador * imponible2;
  const capacitacion = round0(remTotalPromedio * 0.01);
  const eppPersona = input.costosFijos?.eppPersona ?? 35000;
  const cesantiaEmpleador = round0(Math.min(imponible2, topeCes) * tasaCesantia(input.tipoContrato, P, "emp"));
  const seguroSaludEmpleador = round0(0.81753 * P.uf) * 0.875;
  const mutual = round0(Math.min(imponible2, topeAfp) * P.tasaMutualBase);
  const aporteReforma = imponible2 * P.aporteReformaPrevisionalEmp;
  const lavado = input.costosFijos?.lavado ?? 0;
  const traslado = input.costosFijos?.traslado ?? 0;
  const seguroRc = input.costosFijos?.seguroRc ?? 0;
  const celebraciones = input.costosFijos?.celebraciones ?? 0;
  const alojamiento = input.costosFijos?.alojamiento ?? 0;
  const examenPreocupacional = (input.examenPreocupacionalTotal ?? 0) / (input.mesesAmortizacionExamen ?? 12);

  const total =
    seguroVida +
    provVacaciones +
    provIndemnizacion +
    sis +
    capacitacion +
    eppPersona +
    cesantiaEmpleador +
    seguroSaludEmpleador +
    mutual +
    aporteReforma +
    lavado +
    traslado +
    seguroRc +
    celebraciones +
    alojamiento +
    examenPreocupacional;

  return {
    seguroVida,
    provVacaciones,
    provIndemnizacion,
    sis,
    capacitacion,
    eppPersona,
    cesantiaEmpleador,
    seguroSaludEmpleador,
    mutual,
    aporteReforma,
    lavado,
    traslado,
    seguroRc,
    celebraciones,
    alojamiento,
    examenPreocupacional,
    total,
  };
}

/** Pipeline completo del cargo para un `base` dado (sin goal-seek). */
function calcularCargo(input: StaffInput, base: number, P: LegalParameterSet, horasBaseMes: number) {
  const haberes = calcularHaberes(input, base, P);
  const primeraPasada = calcularDescuentos(
    haberes.imponible1,
    input.asigMovilizacion,
    input.asigColacion,
    input.pctTrabajoPesado,
    input.tipoContrato,
    P,
  );
  const provisiones = calcularProvisiones(input, haberes.imponible1);
  const segundaPasada = calcularDescuentos(
    provisiones.imponible2,
    input.asigMovilizacion,
    input.asigColacion,
    input.pctTrabajoPesado,
    input.tipoContrato,
    P,
  );
  const costoEmpresa = calcularCostoEmpresa(input, provisiones.remTotalPromedio, provisiones.imponible2, P);

  const costoUnitarioMes = provisiones.remTotalPromedio + costoEmpresa.total;
  const dotacionTotal = input.dotacionA + input.dotacionB + input.dotacionContra;
  const costoMensualCargo = costoUnitarioMes * dotacionTotal;

  const hh70 = costoUnitarioMes / (horasBaseMes * 0.7);
  const hh25 = costoUnitarioMes / (horasBaseMes * 0.25);
  const costoCargoServicio = hh70 * input.horasServicioDia;

  return {
    haberes,
    primeraPasada,
    segundaPasada,
    provisiones,
    costoEmpresa,
    costoUnitarioMes,
    dotacionTotal,
    costoMensualCargo,
    hh70,
    hh25,
    costoCargoServicio,
  };
}

/** Módulo A.6 — goal-seek de sueldo base por bisección para alcanzar el líquido objetivo. */
export function goalSeekBase(
  input: StaffInput,
  targetLiquido: number,
  P: LegalParameterSet,
  horasBaseMes: number,
): { base: number; iteraciones: number } {
  let lo = 0;
  let hi = Math.max(targetLiquido * 3, 10_000_000);
  let iteraciones = 0;
  const liquidaDe = (base: number) => calcularCargo(input, base, P, horasBaseMes).primeraPasada.liquida;

  while (liquidaDe(hi) < targetLiquido) hi *= 2;

  let mid = (lo + hi) / 2;
  for (; iteraciones < 100; iteraciones++) {
    mid = (lo + hi) / 2;
    const liquida = liquidaDe(mid);
    if (Math.abs(liquida - targetLiquido) < 0.01) break;
    if (liquida < targetLiquido) lo = mid;
    else hi = mid;
  }
  return { base: mid, iteraciones };
}

/** Punto de entrada Módulo A: liquidación completa de un cargo. */
export function calcularStaffResult(
  input: StaffInput,
  P: LegalParameterSet,
  horasBaseMes = 180,
): StaffResult {
  let base = input.base ?? 0;
  let goalSeekIterations: number | undefined;

  if (input.modoSueldo === "liquido" && input.targetLiquido) {
    const r = goalSeekBase(input, input.targetLiquido, P, horasBaseMes);
    base = r.base;
    goalSeekIterations = r.iteraciones;
  }

  const c = calcularCargo(input, base, P, horasBaseMes);

  return {
    id: input.id,
    cargo: input.cargo,
    dotacionTotal: c.dotacionTotal,
    baseUsado: base,
    haberes: c.haberes,
    primeraPasada: c.primeraPasada,
    segundaPasada: c.segundaPasada,
    provisiones: c.provisiones,
    costoEmpresa: c.costoEmpresa,
    costoUnitarioMes: c.costoUnitarioMes,
    costoMensualCargo: c.costoMensualCargo,
    hh70: c.hh70,
    hh25: c.hh25,
    costoCargoServicio: c.costoCargoServicio,
    goalSeekIterations,
  };
}
