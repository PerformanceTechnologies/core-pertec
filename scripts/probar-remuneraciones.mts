// Remuneraciones: el resumen del libro de BUK, el estado de pago contra el banco y la sugerencia para el flujo de caja.
// Datos INVENTADOS (el repositorio es público: acá no hay sueldos, nombres ni RUT reales).
//   npm run probar-remuneraciones
import assert from "node:assert/strict";
import {
  clasificarHaber,
  esAporteEmpleador,
  movimientosDePrevired,
  movimientosDeSueldos,
  plazoPrevired,
  resultadoPago,
  resumirCentralizacion,
  sugerirFlujo,
  sumarMeses,
  ultimoDiaDelMes,
  type BloqueContable,
  type FilaMes,
  type ItemContable,
  type MovimientoBanco,
} from "../lib/fin/remuneraciones-modelo";

let n = 0;
const prueba = (nombre: string, f: () => void) => {
  f();
  n++;
  console.log(`  ok  ${nombre}`);
};

const item = (description: string, amount: number, entry_type: "debit" | "credit", account: string | null, rut: string, cost_center = "CC-A"): ItemContable => ({
  description, amount, entry_type, account, cost_center, employee_rut: rut,
});

const RUT_1 = "11.111.111-1";
const RUT_2 = "22.222.222-2";

// Dos personas: A con AFP Uno e isapre; B con AFP Dos y Fonasa y otro centro de costo.
const bloques: BloqueContable[] = [
  {
    id: 1,
    items: [
      item("Sueldo Base", 1_000_000, "debit", "8210001", RUT_1),
      item("Gratificación", 100_000, "debit", "8210002", RUT_1),
      item("Mutual", 9_000, "debit", "8210004", RUT_1),
      item("Cesantía Empleador", 24_000, "debit", "8210004", RUT_1),
      item("Líquido a Recibir", 800_000, "credit", "2110018", RUT_1),
      item("Prevision (Uno)", 110_000, "credit", "2110016", RUT_1),
      item("Isapre (Salud Sa)", 80_000, "credit", "2110016", RUT_1),
      item("Impuesto", 60_000, "credit", "2120004", RUT_1),
      item("Mutual", 9_000, "credit", "2110016", RUT_1),
      item("Cesantía Empleador", 24_000, "credit", "2110016", RUT_1),
      item("Seguro Invalidez (Uno)", 10_000, "credit", "2110016", RUT_1),
    ],
  },
  {
    id: 2,
    items: [
      item("Sueldo Base", 500_000, "debit", "8210001", RUT_2, "CC-B"),
      item("Colación", 50_000, "debit", "8210007", RUT_2, "CC-B"),
      item("Líquido a Recibir", 440_000, "credit", "2110018", RUT_2),
      item("Prevision (Dos)", 55_000, "credit", "2110016", RUT_2),
      item("Fonasa (2.8%)", 40_000, "credit", "2110016", RUT_2),
      item("Anticipo", 15_000, "credit", null, RUT_2),
    ],
  },
];
// debe = 1.000.000+100.000+9.000+24.000+500.000+50.000 = 1.683.000
// haber = 800.000+110.000+80.000+60.000+9.000+24.000+10.000+440.000+55.000+40.000+15.000 = 1.643.000 → no cuadra a propósito
// para que el segundo caso (libro que cuadra) se arme abajo.

console.log("Clasificación");
prueba("el líquido, el impuesto y lo previsional se reconocen por descripción o cuenta", () => {
  assert.equal(clasificarHaber({ description: "Líquido a Recibir", account: "2110018" }), "liquido");
  assert.equal(clasificarHaber({ description: "Impuesto", account: "2120004" }), "impuesto");
  assert.equal(clasificarHaber({ description: "Impuesto Único", account: null }), "impuesto");
  assert.equal(clasificarHaber({ description: "Isapre (X)", account: "2110016" }), "previred");
  assert.equal(clasificarHaber({ description: "Valor a pagar caja (4.2%)", account: null }), "previred");
  assert.equal(clasificarHaber({ description: "Anticipo", account: null }), "otro");
});
prueba("los aportes del empleador se separan de los haberes", () => {
  assert.equal(esAporteEmpleador({ description: "Mutual", account: "8210004" }), true);
  assert.equal(esAporteEmpleador({ description: "Seguro Invalidez", account: null }), true);
  assert.equal(esAporteEmpleador({ description: "Sueldo Base", account: "8210001" }), false);
});

console.log("Resumen del mes");
const r = resumirCentralizacion("2026-10", bloques);
prueba("totales: líquido, Previred, impuesto, otros y costo empresa", () => {
  assert.equal(r.liquido, 1_240_000);
  assert.equal(r.previred, 110_000 + 80_000 + 9_000 + 24_000 + 10_000 + 55_000 + 40_000);
  assert.equal(r.impuesto, 60_000);
  assert.equal(r.otros, 15_000);
  assert.equal(r.costoEmpresa, 1_683_000);
});
prueba("cuenta personas distintas y detecta un libro que no cuadra", () => {
  assert.equal(r.personas, 2);
  assert.equal(r.cuadra, false);
  assert.equal(r.diferencia, 40_000);
});
prueba("un libro con debe = haber cuadra", () => {
  const ok = resumirCentralizacion("2026-10", [{ id: 9, items: [item("Sueldo Base", 100, "debit", null, RUT_1), item("Líquido a Recibir", 100, "credit", null, RUT_1)] }]);
  assert.equal(ok.cuadra, true);
});
prueba("haberes y aportes del empleador no se mezclan", () => {
  assert.deepEqual(r.haberes.map((l) => l.concepto), ["Sueldo Base", "Gratificación", "Colación"]);
  assert.equal(r.haberes[0].monto, 1_500_000);
  assert.equal(r.haberes[0].personas, 2);
  assert.deepEqual(r.aportes.map((l) => l.concepto).sort(), ["Cesantía Empleador", "Mutual"]);
});
prueba("Previred se agrupa por AFP, salud, cesantía y mutual, con el detalle por institución", () => {
  const por = Object.fromEntries(r.previsional.map((g) => [g.grupo, g]));
  assert.equal(por["AFP"].monto, 110_000 + 10_000 + 55_000);
  assert.deepEqual(por["AFP"].detalle.map((d) => d.concepto), ["Uno", "Dos"]);
  assert.equal(por["Salud"].monto, 120_000);
  assert.deepEqual(por["Salud"].detalle.map((d) => d.concepto).sort(), ["Fonasa", "Salud Sa"]);
  assert.equal(por["Seguro de cesantía"].monto, 24_000);
  assert.equal(por["Mutual de seguridad"].monto, 9_000);
  assert.equal(r.previsional.reduce((s, g) => s + g.monto, 0), r.previred);
});
prueba("por centro de costo: el costo empresa suma lo mismo", () => {
  assert.equal(r.centros.reduce((s, c) => s + c.costo, 0), r.costoEmpresa);
  assert.deepEqual(r.centros.map((c) => c.centro), ["CC-A", "CC-B"]);
});
prueba("el resumen NO contiene ningún RUT de persona", () => {
  const texto = JSON.stringify(r);
  assert.equal(texto.includes(RUT_1), false);
  assert.equal(texto.includes(RUT_2), false);
  assert.equal(/\d{1,2}\.\d{3}\.\d{3}-[\dkK]/.test(texto), false);
});

console.log("Fechas");
prueba("sumarMeses y último día del mes", () => {
  assert.equal(sumarMeses("2026-11", 1), "2026-12");
  assert.equal(sumarMeses("2026-12", 1), "2027-01");
  assert.equal(sumarMeses("2026-01", -1), "2025-12");
  assert.equal(ultimoDiaDelMes("2026-02"), "2026-02-28");
  assert.equal(ultimoDiaDelMes("2028-02"), "2028-02-29");
});
prueba("el plazo de Previred es el 13 del mes siguiente y, si es fin de semana, el lunes", () => {
  assert.equal(plazoPrevired("2026-10"), "2026-11-13"); // viernes
  assert.equal(plazoPrevired("2026-11"), "2026-12-14"); // el 13 es domingo
  assert.equal(plazoPrevired("2026-12"), "2027-01-13"); // miércoles
  assert.equal(plazoPrevired("2027-01"), "2027-02-15"); // el 13 es sábado
});

console.log("Estado de pago");
const mov = (id: string, fecha: string, glosa: string, monto: number, categoria: string | null = null): MovimientoBanco => ({ id, fecha, glosa, monto, categoria, cuenta: "Banco 1" });
const FECHA_PAGO = "2026-10-31";
const COB = { desde: "2026-09-01", hasta: "2026-11-04" };
prueba("reconoce el pago de sueldos por categoría o por glosa, solo salidas y solo cerca de la fecha", () => {
  const movs = [
    mov("a", "2026-10-30", "Transferencia nómina", -1_000_000),
    mov("b", "2026-10-31", "TEF varios", -240_000, "Remuneraciones"),
    mov("c", "2026-10-31", "Nómina cliente", 500_000), // entrada: no
    mov("d", "2026-09-01", "Nómina septiembre", -900_000), // lejos de la fecha: no
    mov("e", "2026-11-13", "Pago Previred", -300_000, "Remuneraciones"), // Previred: no es de sueldos
    mov("f", "2026-10-31", "Pago proveedor", -50_000, "Compras"),
  ];
  assert.deepEqual(movimientosDeSueldos(movs, FECHA_PAGO).map((m) => m.id), ["a", "b"]);
});
prueba("reconoce el pago de Previred desde el 1 del mes siguiente hasta 10 días después del plazo", () => {
  const movs = [
    mov("p1", "2026-11-12", "PAGO PREVIRED OCT", -300_000),
    mov("p2", "2026-10-30", "Previred septiembre", -280_000), // del mes anterior: no
    mov("p3", "2026-12-20", "Previred", -300_000), // demasiado tarde: no
    mov("p4", "2026-11-12", "Previred devolución", 5_000), // entrada: no
  ];
  assert.deepEqual(movimientosDePrevired(movs, "2026-10").map((m) => m.id), ["p1"]);
});
prueba("Pagado cuando lo del banco cubre lo esperado (con tolerancia)", () => {
  const p = resultadoPago({ esperado: 1_240_000, fecha: FECHA_PAGO, hoy: "2026-11-05", movimientos: [mov("a", "2026-10-30", "nómina", -1_240_000)], cobertura: COB });
  assert.equal(p.estado, "Pagado");
  assert.equal(p.saldo, 0);
  const casi = resultadoPago({ esperado: 1_240_000, fecha: FECHA_PAGO, hoy: "2026-11-05", movimientos: [mov("a", "2026-10-30", "nómina", -1_239_000)], cobertura: COB });
  assert.equal(casi.estado, "Pagado"); // $1.000 de diferencia está dentro de la tolerancia
});
prueba("Parcial cuando falta una parte", () => {
  const p = resultadoPago({ esperado: 1_240_000, fecha: FECHA_PAGO, hoy: "2026-11-05", movimientos: [mov("a", "2026-10-30", "nómina", -1_000_000)], cobertura: COB });
  assert.equal(p.estado, "Parcial");
  assert.equal(p.saldo, 240_000);
});
prueba("Por pagar antes de la fecha; Pendiente si ya pasó con el banco al día; Sin cartola si el banco no llega a esa fecha", () => {
  assert.equal(resultadoPago({ esperado: 100, fecha: FECHA_PAGO, hoy: "2026-10-20", movimientos: [], cobertura: { desde: "2026-09-01", hasta: "2026-10-19" } }).estado, "Por pagar");
  assert.equal(resultadoPago({ esperado: 100, fecha: FECHA_PAGO, hoy: "2026-11-05", movimientos: [], cobertura: COB }).estado, "Pendiente");
  assert.equal(resultadoPago({ esperado: 100, fecha: FECHA_PAGO, hoy: "2026-11-05", movimientos: [], cobertura: { desde: "2026-09-01", hasta: "2026-10-20" } }).estado, "Sin cartola");
  assert.equal(resultadoPago({ esperado: 100, fecha: FECHA_PAGO, hoy: "2026-11-05", movimientos: [], cobertura: null }).estado, "Sin cartola");
  // Un banco que EMPIEZA después de la fecha tampoco permite decir que no se pagó.
  assert.equal(resultadoPago({ esperado: 100, fecha: FECHA_PAGO, hoy: "2026-11-05", movimientos: [], cobertura: { desde: "2026-11-02", hasta: "2026-11-04" } }).estado, "Sin cartola");
});

console.log("Sugerencia para el flujo de caja");
// Hoy = 17-11-2026. Octubre cerrado (sueldos pagados el 31-10; Previred pendiente, vence el 13-11 y no aparece),
// noviembre abierto (sueldos se pagan el 30-11).
const resumen = (periodo: string, liquido: number, previred: number) => ({ ...r, periodo, liquido, previred });
const fila = (periodo: string, liquido: number, previred: number, cerrado: boolean, fechaPago: string, sueldos: ReturnType<typeof resultadoPago>["estado"], previredEstado: ReturnType<typeof resultadoPago>["estado"]): FilaMes => {
  const res = resumen(periodo, liquido, previred);
  const plazo = plazoPrevired(periodo);
  const base = (esperado: number, fecha: string, estado: typeof sueldos) => ({ estado, esperado, pagado: estado === "Pagado" ? esperado : 0, saldo: estado === "Pagado" ? 0 : esperado, fecha, movimientos: [] });
  return { periodo, resumen: res, cerrado, nombreProceso: null, sueldos: base(liquido, fechaPago, sueldos), previred: base(previred, plazo, previredEstado) };
};
const filas = [
  fila("2026-10", 1_000_000, 300_000, true, "2026-10-31", "Pagado", "Pendiente"),
  fila("2026-11", 1_100_000, 320_000, false, "2026-11-30", "Por pagar", "Por pagar"),
];
const HOY = "2026-11-17";
const MESES = ["2026-11-01", "2026-12-01", "2027-01-01"];
const sug = sugerirFlujo(MESES, filas, HOY);
prueba("noviembre: sueldos de noviembre + el Previred de octubre atrasado (mes 1 incluye lo atrasado)", () => {
  assert.equal(sug[0].mes, "2026-11-01");
  assert.equal(sug[0].monto, 1_100_000 + 300_000);
  assert.equal(sug[0].estimado, false);
  assert.ok(sug[0].partes.some((p) => p.concepto === "Previred de 2026-10" && p.nota.startsWith("Atrasado")));
});
prueba("diciembre: sueldos estimados como el último libro + el Previred de noviembre que ya existe", () => {
  assert.equal(sug[1].monto, 1_100_000 + 320_000);
  assert.equal(sug[1].estimado, true);
  assert.ok(sug[1].partes.some((p) => p.concepto === "Sueldos (estimado)"));
});
prueba("enero: todo estimado con el último libro", () => {
  assert.equal(sug[2].monto, 1_100_000 + 320_000);
  assert.equal(sug[2].estimado, true);
});
prueba("lo ya pagado según el banco no se suma (el flujo parte de la caja real)", () => {
  const pagadas = [
    fila("2026-10", 1_000_000, 300_000, true, "2026-10-31", "Pagado", "Pagado"),
    fila("2026-11", 1_100_000, 320_000, false, "2026-11-30", "Por pagar", "Por pagar"),
  ];
  assert.equal(sugerirFlujo(MESES, pagadas, HOY)[0].monto, 1_100_000); // el Previred de octubre ya salió del banco
});
prueba("un Previred sin cartola al día NO se trata como atrasado", () => {
  const sinCartola = [fila("2026-10", 1_000_000, 300_000, true, "2026-10-31", "Pagado", "Sin cartola"), fila("2026-11", 1_100_000, 320_000, false, "2026-11-30", "Por pagar", "Por pagar")];
  assert.ok(sugerirFlujo(MESES, sinCartola, HOY)[0].partes.every((p) => !p.nota.startsWith("Atrasado")));
});
prueba("un pago pendiente de hace más de 45 días no se arrastra al flujo (suele ser un pago no reconocido, no una deuda)", () => {
  const viejas = [
    fila("2026-08", 900_000, 250_000, true, "2026-08-31", "Pendiente", "Pendiente"),
    fila("2026-10", 1_000_000, 300_000, true, "2026-10-31", "Pagado", "Pagado"),
    fila("2026-11", 1_100_000, 320_000, false, "2026-11-30", "Por pagar", "Por pagar"),
  ];
  assert.equal(sugerirFlujo(MESES, viejas, HOY)[0].monto, 1_100_000);
});
prueba("sin libros no hay nada que sugerir, y sin meses tampoco", () => {
  assert.equal(sugerirFlujo(MESES, [], HOY)[0].monto, 0);
  assert.deepEqual(sugerirFlujo([], filas, HOY), []);
});

console.log(`\n${n} pruebas de Remuneraciones: todo bien.`);
