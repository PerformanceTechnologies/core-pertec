// Remuneraciones: el resumen del libro de BUK, el estado de pago contra el banco y la sugerencia para el flujo de caja.
// Datos INVENTADOS (el repositorio es público: acá no hay sueldos, nombres ni RUT reales).
//   npm run probar-remuneraciones
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { generarLibroExcel, nombreDelArchivo } from "../lib/fin/remuneraciones-excel";
import {
  centralizar,
  clasificarHaber,
  conFichas,
  desglosarPorPersona,
  esAporteEmpleador,
  periodoValido,
  tipoDescuento,
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
const pruebaAsync = async (nombre: string, f: () => Promise<void>) => {
  await f();
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

console.log("Libro por persona");
// Dos personas con el libro CUADRADO (haberes = descuentos + líquido). X aparece en dos bloques de BUK, como pasa en
// la realidad (se parten por AFP e isapre): sus líneas se juntan por RUT.
const RUT_X = "33.333.333-3";
const RUT_Y = "44.444.444-4";
const libro: BloqueContable[] = [
  {
    id: 11,
    items: [
      item("Sueldo Base", 1_000_000, "debit", "8210001", RUT_X, "CC-A"),
      item("Gratificación", 100_000, "debit", "8210002", RUT_X, "CC-A"),
      item("Mutual", 9_000, "debit", "8210004", RUT_X, "CC-A"),
      item("Cesantía Empleador", 24_000, "debit", "8210004", RUT_X, "CC-A"),
      item("Seguro Invalidez", 10_000, "debit", "8210004", RUT_X, "CC-A"),
      item("Prevision (Uno)", 110_000, "credit", "2110016", RUT_X),
      item("Isapre (Salud Sa)", 90_000, "credit", "2110016", RUT_X),
      item("Salud Voluntaria (Salud Sa)", 0, "credit", "2110016", RUT_X),
      // Lo del empleador también está en el haber, pero NO es un descuento de la persona:
      item("Mutual", 9_000, "credit", "2110016", RUT_X),
      item("Cesantía Empleador", 24_000, "credit", "2110016", RUT_X),
      item("Seguro Invalidez (Uno)", 10_000, "credit", "2110016", RUT_X),
    ],
  },
  {
    id: 12,
    items: [
      item("Líquido a Recibir", 800_000, "credit", "2110018", RUT_X),
      item("Cesantía", 6_000, "credit", "2110016", RUT_X),
      item("Impuesto", 94_000, "credit", "2120004", RUT_X),
      item("Sueldo Base", 500_000, "debit", "8210001", RUT_Y, "CC-B"),
      item("Colación", 50_000, "debit", "8210007", RUT_Y, "CC-B"),
      item("Líquido a Recibir", 440_000, "credit", "2110018", RUT_Y),
      item("Prevision (Dos)", 55_000, "credit", "2110016", RUT_Y),
      item("Fonasa (2.8%)", 40_000, "credit", "2110016", RUT_Y),
      item("Valor a pagar caja (4.2%)", 15_000, "credit", "2110016", RUT_Y),
    ],
  },
];
const personas = desglosarPorPersona(libro);
const X = personas.find((p) => p.rut === RUT_X)!;
const Y = personas.find((p) => p.rut === RUT_Y)!;
prueba("reconoce a qué descuento va cada línea del haber", () => {
  assert.equal(tipoDescuento({ description: "Prevision (Uno)", account: "2110016" }), "afp");
  assert.equal(tipoDescuento({ description: "Isapre (Salud Sa)", account: "2110016" }), "salud");
  assert.equal(tipoDescuento({ description: "Fonasa (2.8%)", account: "2110016" }), "salud");
  assert.equal(tipoDescuento({ description: "Valor a pagar caja (4.2%)", account: null }), "salud");
  assert.equal(tipoDescuento({ description: "Cesantía", account: "2110016" }), "cesantia");
  assert.equal(tipoDescuento({ description: "Impuesto", account: "2120004" }), "impuesto");
  assert.equal(tipoDescuento({ description: "Anticipo", account: null }), "otros");
});
prueba("junta en una sola fila a la persona repartida en varios bloques de BUK", () => {
  assert.equal(personas.length, 2);
  assert.equal(X.totalHaberes, 1_100_000);
  assert.equal(X.liquido, 800_000);
  assert.deepEqual(X.centros, ["CC-A"]);
});
prueba("haberes = descuentos + líquido en cada persona (control en 0)", () => {
  for (const p of [X, Y]) assert.equal(p.diferencia, 0, `no cuadra ${p.rut}`);
  assert.deepEqual(X.descuentos, { afp: 110_000, salud: 90_000, cesantia: 6_000, impuesto: 94_000, otros: 0 });
  assert.deepEqual(Y.descuentos, { afp: 55_000, salud: 55_000, cesantia: 0, impuesto: 0, otros: 0 });
});
prueba("los aportes del empleador no se cuentan como descuentos ni como haberes; sí en el costo empresa", () => {
  assert.deepEqual(X.aportes, { Mutual: 9_000, "Cesantía Empleador": 24_000, "Seguro Invalidez": 10_000 });
  assert.equal(X.totalAportes, 43_000);
  assert.equal(X.costoEmpresa, 1_143_000);
  assert.deepEqual(Object.keys(X.haberes).sort(), ["Gratificación", "Sueldo Base"]);
});
prueba("nombra la AFP y la salud de cada persona (isapre, o Fonasa)", () => {
  assert.equal(X.afp, "Uno");
  assert.equal(X.salud, "Salud Sa");
  assert.equal(Y.afp, "Dos");
  assert.equal(Y.salud, "Fonasa");
});
prueba("los totales del desglose calzan con el resumen del mes", () => {
  const r2 = resumirCentralizacion("2026-10", libro);
  assert.equal(personas.reduce((s, p) => s + p.liquido, 0), r2.liquido);
  assert.equal(personas.reduce((s, p) => s + p.costoEmpresa, 0), r2.costoEmpresa);
});
prueba("agrega nombre y cargo y ordena alfabéticamente (sin nombre, al final)", () => {
  const f = new Map([[RUT_Y, { nombre: "Ana Ejemplo", cargo: "Analista" }], [RUT_X, { nombre: "Zoe Ejemplo", cargo: null }]]);
  const con = conFichas(personas, f);
  assert.deepEqual(con.map((p) => p.nombre), ["Ana Ejemplo", "Zoe Ejemplo"]);
  assert.equal(con[0].cargo, "Analista");
  const sin = conFichas(personas, new Map([[RUT_Y, { nombre: "Ana Ejemplo", cargo: null }]]));
  assert.deepEqual(sin.map((p) => p.rut), [RUT_Y, RUT_X]);
});
prueba("un concepto que no se sabe clasificar se ve en el control, no se pierde", () => {
  const raro: BloqueContable[] = [{ id: 1, items: [item("Sueldo Base", 100, "debit", null, RUT_X), item("Líquido a Recibir", 90, "credit", null, RUT_X)] }];
  assert.equal(desglosarPorPersona(raro)[0].diferencia, 10);
});
prueba("el mes pedido por la URL se valida antes de consultar BUK", () => {
  assert.equal(periodoValido("2026-10", "2026-11-17"), true);
  assert.equal(periodoValido("2026-11", "2026-11-17"), true);
  assert.equal(periodoValido("2026-12", "2026-11-17"), false); // futuro
  assert.equal(periodoValido("2019-12", "2026-11-17"), false);
  assert.equal(periodoValido("2026-13", "2026-11-17"), false);
  assert.equal(periodoValido("2026-1", "2026-11-17"), false);
  assert.equal(periodoValido("2026-10/../x", "2026-11-17"), false);
  assert.equal(periodoValido(null, "2026-11-17"), false);
});

console.log("Centralización contable");
const asiento = centralizar(libro);
prueba("el debe y el haber del asiento cuadran y suman lo mismo que el libro", () => {
  assert.equal(asiento.reduce((s, l) => s + l.debe, 0), asiento.reduce((s, l) => s + l.haber, 0));
  assert.equal(asiento.reduce((s, l) => s + l.debe, 0), 1_100_000 + 43_000 + 550_000);
});
prueba("se suma por cuenta, glosa y centro de costo, con el debe primero", () => {
  const sueldo = asiento.filter((l) => l.glosa === "Sueldo Base");
  assert.deepEqual(sueldo.map((l) => [l.centro, l.debe]).sort(), [["CC-A", 1_000_000], ["CC-B", 500_000]]);
  assert.ok(asiento[0].debe > 0 && asiento[asiento.length - 1].haber > 0);
});

console.log("Excel del libro");
const personasConNombre = conFichas(personas, new Map([[RUT_X, { nombre: "Zoe Ejemplo", cargo: "Jefa" }], [RUT_Y, { nombre: "Ana Ejemplo", cargo: "Analista" }]]));
const entradaExcel = {
  empresa: "Empresa de Ejemplo", periodo: "2026-10", cerrado: true, fechaPago: "2026-10-31", plazoPrevired: "2026-11-13", hoy: "2026-11-17",
  resumen: resumirCentralizacion("2026-10", libro), personas: personasConNombre, centralizacion: asiento,
};
const leer = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
};
await pruebaAsync("el Excel tiene las tres hojas y es un xlsx válido", async () => {
  const buf = await generarLibroExcel(entradaExcel);
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  const wb = await leer(buf);
  assert.deepEqual(wb.worksheets.map((h) => h.name), ["Libro", "Resumen", "Centralización"]);
});
await pruebaAsync("el libro tiene una fila por persona, en orden alfabético, y una de totales", async () => {
  const hoja = (await leer(await generarLibroExcel(entradaExcel))).getWorksheet("Libro")!;
  const titulos = (hoja.getRow(1).values as unknown[]).slice(1).map(String);
  const col = (t: string) => titulos.indexOf(t) + 1;
  assert.ok(col("RUT") > 0 && col("Nombre") > 0 && col("LÍQUIDO A PAGAR") > 0 && col("COSTO EMPRESA") > 0 && col("Total haberes") > 0);
  assert.equal(hoja.getRow(2).getCell(col("Nombre")).value, "Ana Ejemplo");
  assert.equal(hoja.getRow(3).getCell(col("Nombre")).value, "Zoe Ejemplo");
  assert.equal(hoja.rowCount, 4); // encabezado + 2 personas + total
  assert.equal(String(hoja.getRow(4).getCell(3).value).startsWith("TOTAL (2"), true);
});
await pruebaAsync("los montos son NÚMEROS (se pueden sumar) y los totales calzan", async () => {
  const hoja = (await leer(await generarLibroExcel(entradaExcel))).getWorksheet("Libro")!;
  const titulos = (hoja.getRow(1).values as unknown[]).slice(1).map(String);
  const col = (t: string) => titulos.indexOf(t) + 1;
  const liquido = [2, 3].map((f) => hoja.getRow(f).getCell(col("LÍQUIDO A PAGAR")).value);
  assert.ok(liquido.every((v) => typeof v === "number"));
  assert.deepEqual([...(liquido as number[])].sort((a, b) => a - b), [440_000, 800_000]);
  assert.equal(hoja.getRow(4).getCell(col("LÍQUIDO A PAGAR")).value, 1_240_000);
  assert.equal(hoja.getRow(4).getCell(col("COSTO EMPRESA")).value, 1_143_000 + 550_000);
  // La columna de control solo aparece si algo no cuadra:
  assert.equal(titulos.includes("Control (debe ser 0)"), false);
});
await pruebaAsync("si algo no cuadra, aparece la columna de control", async () => {
  const roto = personasConNombre.map((p, i) => (i === 0 ? { ...p, diferencia: 5_000 } : p));
  const hoja = (await leer(await generarLibroExcel({ ...entradaExcel, personas: roto }))).getWorksheet("Libro")!;
  assert.ok((hoja.getRow(1).values as unknown[]).map(String).includes("Control (debe ser 0)"));
});
await pruebaAsync("el resumen avisa si el libro está abierto, y el archivo se nombra PROVISORIO", async () => {
  const abierto = await leer(await generarLibroExcel({ ...entradaExcel, cerrado: false }));
  const textos: string[] = [];
  abierto.getWorksheet("Resumen")!.eachRow((fila) => fila.eachCell((c) => textos.push(String(c.value))));
  assert.ok(textos.some((t) => t.startsWith("PROVISORIO")));
  assert.equal(nombreDelArchivo("2026-10", false), "Libro-de-remuneraciones-2026-10-PROVISORIO");
  assert.equal(nombreDelArchivo("2026-10", true), "Libro-de-remuneraciones-2026-10");
  const cerrado: string[] = [];
  (await leer(await generarLibroExcel(entradaExcel))).getWorksheet("Resumen")!.eachRow((fila) => fila.eachCell((c) => cerrado.push(String(c.value))));
  assert.equal(cerrado.some((t) => t.startsWith("PROVISORIO")), false);
});
await pruebaAsync("la hoja de centralización suma debe = haber", async () => {
  const hoja = (await leer(await generarLibroExcel(entradaExcel))).getWorksheet("Centralización")!;
  const ultima = hoja.getRow(hoja.rowCount);
  assert.equal(ultima.getCell(4).value, ultima.getCell(5).value);
  assert.equal(ultima.getCell(4).value, 1_693_000);
});

console.log(`\n${n} pruebas de Remuneraciones: todo bien.`);
