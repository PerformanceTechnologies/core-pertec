// Nóminas del banco cruzadas con el líquido de BUK: ligado al cargo y validación persona por persona.
// Datos INVENTADOS (el repositorio es público: acá no hay RUT, nombres ni sueldos reales).
//   npm run probar-nominas
import assert from "node:assert/strict";
import {
  claveRut,
  estaPagada,
  ligarNominas,
  resumenDeValidacion,
  validarMes,
  type LineaNomina,
  type NominaBanco,
  type PersonaLiquido,
} from "../lib/fin/nominas-modelo";

let n = 0;
const prueba = (nombre: string, f: () => void) => {
  f();
  n++;
  console.log(`  ok  ${nombre}`);
};

// Cuatro personas de BUK con RUT inventados.
const RUT = ["11111111-1", "22222222-2", "33333333-3", "44444444-4"];
const buk = (liquidos: number[]): PersonaLiquido[] => liquidos.map((liquido, i) => ({ rut: RUT[i], liquido }));
const linea = (i: number, monto: number, estado = "Pagado", rut = RUT[i]): LineaNomina => ({ idLinea: String(i + 1), rut, nombre: `Persona ${i + 1}`, monto, moneda: "CLP", estado });
const nomina = (idNomina: string, fechaPago: string | null, lineas: LineaNomina[], p: Partial<NominaBanco> = {}): NominaBanco => ({
  idNomina,
  fechaPago,
  fechaCreacion: p.fechaCreacion ?? fechaPago ?? "2026-09-01",
  descripcion: null,
  estado: fechaPago ? "Pagada" : "Rechazada Sin Autorización",
  moneda: "CLP",
  monto: lineas.reduce((s, l) => s + l.monto, 0),
  lineas,
  movimientoId: null,
  movimiento: null,
  ...p,
});
const HOY = "2026-11-23";

console.log("Utilidades");
prueba("el RUT se compara sin puntos ni guion", () => {
  assert.equal(claveRut("11.111.111-k"), "11111111K");
  assert.equal(claveRut("11111111K"), claveRut("11.111.111-K"));
  assert.equal(claveRut(null), "");
});
prueba("solo «Pagada»/«Pagado» cuenta como pagado", () => {
  assert.ok(estaPagada("Pagada") && estaPagada("Pagado"));
  assert.ok(!estaPagada("Rechazada Sin Autorización") && !estaPagada("En proceso de aplicación") && !estaPagada("Validada Sin Error"));
});

console.log("Ligar la nómina con su cargo del banco");
prueba("liga por monto exacto aunque el cargo llegue días después", () => {
  // Pagada el viernes 30, el cargo aparece el lunes 2 (+3 días).
  const r = ligarNominas([{ idNomina: "A", fechaPago: "2026-10-30", monto: 7_654_321, estado: "Pagada", movimientoId: null }], [{ id: "m1", fecha: "2026-11-02", monto: -7_654_321 }]);
  assert.equal(r.ligas.get("A"), "m1");
});
prueba("no liga un cargo de otro monto, anterior al pago o muy posterior", () => {
  const nom = [{ idNomina: "A", fechaPago: "2026-10-30", monto: 1000, estado: "Pagada", movimientoId: null }];
  assert.deepEqual(ligarNominas(nom, [{ id: "x", fecha: "2026-10-30", monto: -1001 }]).sinCargo, ["A"]);
  assert.deepEqual(ligarNominas(nom, [{ id: "x", fecha: "2026-10-29", monto: -1000 }]).sinCargo, ["A"]);
  assert.deepEqual(ligarNominas(nom, [{ id: "x", fecha: "2026-11-05", monto: -1000 }]).sinCargo, ["A"]);
});
prueba("un abono (monto positivo) del mismo valor no calza", () => {
  assert.deepEqual(ligarNominas([{ idNomina: "A", fechaPago: "2026-10-30", monto: 1000, estado: "Pagada", movimientoId: null }], [{ id: "x", fecha: "2026-10-30", monto: 1000 }]).sinCargo, ["A"]);
});
prueba("dos cargos iguales: no se adivina", () => {
  const r = ligarNominas([{ idNomina: "A", fechaPago: "2026-10-30", monto: 1000, estado: "Pagada", movimientoId: null }], [{ id: "x", fecha: "2026-10-30", monto: -1000 }, { id: "y", fecha: "2026-11-02", monto: -1000 }]);
  assert.deepEqual(r.ambiguas, ["A"]);
  assert.equal(r.ligas.size, 0);
});
prueba("un cargo ya ligado a otra nómina no se reutiliza", () => {
  const r = ligarNominas(
    [{ idNomina: "A", fechaPago: "2026-10-30", monto: 1000, estado: "Pagada", movimientoId: "x" }, { idNomina: "B", fechaPago: "2026-10-30", monto: 1000, estado: "Pagada", movimientoId: null }],
    [{ id: "x", fecha: "2026-10-30", monto: -1000 }],
  );
  assert.deepEqual(r.sinCargo, ["B"]);
});
prueba("las rechazadas y las ya ligadas no se tocan", () => {
  const r = ligarNominas([{ idNomina: "A", fechaPago: null, monto: 1000, estado: "Rechazada Sin Autorización", movimientoId: null }], [{ id: "x", fecha: "2026-10-30", monto: -1000 }]);
  assert.equal(r.ligas.size + r.ambiguas.length + r.sinCargo.length, 0);
});

console.log("Validar el líquido del mes");
const septiembre = [1_000_000, 1_500_000, 2_000_000, 500_000];
prueba("septiembre: cuadra exacto, persona por persona", () => {
  const v = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("N1", "2026-09-30", septiembre.map((m, i) => linea(i, m)), { movimiento: { fecha: "2026-10-01", glosa: "PAGO SUELDOS", monto: -5_000_000 } })] });
  assert.equal(v.estado, "Cuadra");
  assert.equal(v.nomina?.idNomina, "N1");
  assert.deepEqual([v.igual, v.difieren, v.sinPago], [4, 0, 0]);
  assert.equal(v.diferenciaNeta, 0);
  assert.equal(v.totalBuk, 5_000_000);
  assert.deepEqual(v.alertas, []);
});
prueba("octubre: se pagó un poco de más en algunas personas y se ve cuánto", () => {
  // BUK recalculó: a tres personas les toca menos de lo que se pagó.
  const liquidos = [1_000_000, 1_498_766, 1_999_433, 499_110];
  const pagado = [1_000_000, 1_500_000, 2_000_000, 500_000];
  const v = validarMes({ periodo: "2026-10", fechaPagoBuk: "2026-10-31", cerrado: true, personas: buk(liquidos), hoy: HOY, nominas: [nomina("N2", "2026-10-30", pagado.map((m, i) => linea(i, m)), { movimiento: { fecha: "2026-11-02", glosa: "PAGO SUELDOS", monto: -5_000_000 } })] });
  assert.equal(v.estado, "Diferencias");
  assert.deepEqual([v.igual, v.difieren], [1, 3]);
  assert.equal(v.diferenciaNeta, 5_000_000 - liquidos.reduce((a, b) => a + b, 0));
  assert.deepEqual(v.personas.map((p) => p.diferencia), [0, 1_234, 567, 890]);
});
prueba("un peso de redondeo no es una diferencia; dos pesos sí", () => {
  const ok = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk([1_000_001]), hoy: HOY, nominas: [nomina("N", "2026-09-30", [linea(0, 1_000_000)])] });
  assert.equal(ok.estado, "Cuadra");
  const mal = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk([1_000_002]), hoy: HOY, nominas: [nomina("N", "2026-09-30", [linea(0, 1_000_000)])] });
  assert.equal(mal.estado, "Diferencias");
});
prueba("los pagos extra a las mismas personas no ensucian el líquido y se informan aparte", () => {
  const nominas = [
    nomina("EXTRA1", "2026-09-22", [linea(0, 50_000), linea(0, 300_000, "Pagado", "99999999-9")]), // mixta: un bono y un proveedor
    nomina("LIQ", "2026-09-30", septiembre.map((m, i) => linea(i, m))),
    nomina("EXTRA2", "2026-09-16", septiembre.map((_, i) => linea(i, 50_000))), // un bono de $50.000 a cada uno
  ];
  const v = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas });
  assert.equal(v.estado, "Cuadra");
  assert.equal(v.nomina?.idNomina, "LIQ");
  assert.deepEqual(v.otros.map((o) => [o.idNomina, o.personas, o.monto, o.mixta]), [["EXTRA2", 4, 200_000, false], ["EXTRA1", 1, 50_000, true]]);
});
prueba("sin pago a una persona, o pago rechazado: diferencias", () => {
  const sinPago = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("N", "2026-09-30", septiembre.slice(0, 3).map((m, i) => linea(i, m)))] });
  assert.equal(sinPago.estado, "Diferencias");
  assert.equal(sinPago.sinPago, 1);
  const rechazado = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("N", "2026-09-30", septiembre.map((m, i) => linea(i, m, i === 2 ? "Rechazado" : "Pagado")))] });
  assert.equal(rechazado.estado, "Diferencias");
  assert.equal(rechazado.noPagados, 1);
  assert.equal(rechazado.sinPago, 1);
});
prueba("alguien pagado en la nómina que no está en el libro de BUK ese mes", () => {
  const v = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("N", "2026-09-30", [...septiembre.map((m, i) => linea(i, m)), linea(0, 70_000, "Pagado", "55555555-5")])] });
  assert.equal(v.estado, "Diferencias");
  assert.deepEqual(v.extras, { personas: 1, monto: 70_000 });
});
prueba("elige la nómina que cubre más gente, no la primera ni la más grande", () => {
  const v = validarMes({
    periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY,
    nominas: [nomina("GRANDE", "2026-09-29", [linea(0, 9_000_000), linea(0, 1, "Pagado", "99999999-9")]), nomina("LIQ", "2026-09-30", septiembre.map((m, i) => linea(i, m)))],
  });
  assert.equal(v.nomina?.idNomina, "LIQ");
});
prueba("una nómina que cubre a menos de la mitad no es la del líquido", () => {
  const v = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("POCA", "2026-09-30", [linea(0, 1_000_000)]), nomina("ANTES", "2026-09-01", [linea(0, 1)])] });
  assert.equal(v.estado, "Sin nómina");
  assert.equal(v.nomina, null);
});
prueba("una nómina rechazada con pagos a personas de BUK se avisa", () => {
  const v = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("LIQ", "2026-09-30", septiembre.map((m, i) => linea(i, m))), nomina("RECH", null, [linea(0, 5_000_000, "Rechazado")], { fechaCreacion: "2026-09-29" })] });
  assert.equal(v.estado, "Cuadra");
  assert.ok(v.alertas.some((a) => /rechazada/.test(a)));
});
prueba("mes todavía por pagar no es un atraso", () => {
  const v = validarMes({ periodo: "2026-11", fechaPagoBuk: "2026-11-30", cerrado: false, personas: buk(septiembre), hoy: HOY, nominas: [nomina("OTRA", "2026-11-17", [linea(0, 1_450_000)], { fechaCreacion: "2026-11-17" })] });
  assert.equal(v.estado, "Por pagar");
  assert.ok(v.alertas.some((a) => /abierto/.test(a)));
});
prueba("pasada la fecha y sin nómina: «Sin nómina»", () => {
  const v = validarMes({ periodo: "2026-10", fechaPagoBuk: "2026-10-31", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("SEP", "2026-09-30", septiembre.map((m, i) => linea(i, m))), nomina("OTRA", "2026-10-02", [linea(0, 10)])] });
  assert.equal(v.estado, "Sin nómina");
});
prueba("antes de que existan nóminas cargadas: «Sin datos», no «Sin nómina»", () => {
  const v = validarMes({ periodo: "2026-08", fechaPagoBuk: "2026-08-31", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("SEP", "2026-09-30", septiembre.map((m, i) => linea(i, m)))] });
  assert.equal(v.estado, "Sin datos");
  assert.equal(validarMes({ periodo: "2026-08", fechaPagoBuk: "2026-08-31", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [] }).estado, "Sin datos");
});
prueba("sin cargo en Tesorería se avisa, pero la validación sigue", () => {
  const v = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("N", "2026-09-30", septiembre.map((m, i) => linea(i, m)))] });
  assert.equal(v.estado, "Cuadra");
  assert.ok(v.alertas.some((a) => /cargo en Tesorería/.test(a)));
});
prueba("el resumen para la pestaña no lleva a las personas (ni sus RUT)", () => {
  const v = validarMes({ periodo: "2026-09", fechaPagoBuk: "2026-09-30", cerrado: true, personas: buk(septiembre), hoy: HOY, nominas: [nomina("N", "2026-09-30", septiembre.map((m, i) => linea(i, m)))] });
  const r = resumenDeValidacion(v);
  assert.ok(!("personas" in r));
  assert.ok(!JSON.stringify(r).includes("11111111"));
});

console.log(`\n${n} pruebas ok`);
