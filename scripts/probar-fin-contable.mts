// Gestión financiera: lectura de cartolas (sin saber el banco) y el motor de asientos (cada
// asiento cuadra; el balance de comprobación suma cero; el resultado sale de 4 − 5).
import assert from "node:assert/strict";
import { fechaCl, leerCartola, numeroCl } from "../lib/fin/cartola";
import { CUENTAS, balanceComprobacion, estadoResultados, generarAsientos, type EntradaContable } from "../lib/fin/contabilidad";

// ─── Números y fechas como vienen de los bancos ─────────────────────────────
assert.equal(numeroCl("$1.234.567"), 1234567);
assert.equal(numeroCl("-1.234"), -1234);
assert.equal(numeroCl("(25.000)"), -25000);
assert.equal(numeroCl("1.234,6"), 1235);
assert.equal(numeroCl("1,234,567"), 1234567);
assert.equal(numeroCl("15000"), 15000);
assert.equal(numeroCl(""), null);
assert.equal(numeroCl("abc"), null);
assert.equal(fechaCl("03/11/2026"), "2026-11-03");
assert.equal(fechaCl("3-11-26"), "2026-11-03");
assert.equal(fechaCl("2026-11-03"), "2026-11-03");
assert.equal(fechaCl("31/02/2026"), null, "fecha imposible");
assert.equal(fechaCl("Saldo inicial"), null);

// ─── Cartola con cargo/abono y encabezado más abajo (Banco de Chile) ────────
{
  const r = leerCartola([
    ["Cartola de cuenta corriente"],
    ["Cuenta", "00-123-45678-09"],
    [],
    ["Fecha", "Descripción", "N° Documento", "Cargos ($)", "Abonos ($)", "Saldo ($)"],
    ["02/11/2026", "TRANSF DE MINERA X", "123", "", "11.900.000", "50.000.000"],
    ["03/11/2026", "COM MANTENCION   PLAN", "", "8.500", "", "49.991.500"],
    ["", "Saldo final", "", "", "", "49.991.500"],
  ]);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.filas, [
    { fecha: "2026-11-02", glosa: "TRANSF DE MINERA X", monto: 11_900_000, documento: "123" },
    { fecha: "2026-11-03", glosa: "COM MANTENCION PLAN", monto: -8_500, documento: null },
  ]);
  assert.equal(r.omitidas, 1, "la fila de saldo se cuenta como omitida, no se importa");
}
// ─── Cartola con una sola columna de monto con signo (tarjeta) ──────────────
{
  const r = leerCartola([["Fecha operación", "Comercio", "Monto"], ["2026-11-01", "COPEC", "-45.000"], ["2026-11-02", "PAGO TARJETA", "300.000"]]);
  assert.deepEqual(r.filas.map((f) => f.monto), [-45_000, 300_000]);
}
// ─── Sin encabezados reconocibles: error claro ──────────────────────────────
assert.ok(leerCartola([["a", "b"], ["1", "2"]]).error);

// ─── Motor de asientos ──────────────────────────────────────────────────────
const e: EntradaContable = {
  documentos: [
    { id: "fv1", direccion: "emitido", tipoDte: 33, folio: "100", fechaEmision: "2026-11-02", neto: 10_000_000, exento: 0, iva: 1_900_000, total: 11_900_000, estado: "vigente", razonSocial: "Minera X", tipoVenta: "arriendo", proyectoId: "p1" },
    { id: "nc1", direccion: "emitido", tipoDte: 61, folio: "5", fechaEmision: "2026-11-05", neto: 1_000_000, exento: 0, iva: 190_000, total: 1_190_000, estado: "vigente", razonSocial: "Minera X", tipoVenta: "servicio" },
    { id: "fc1", direccion: "recibido", tipoDte: 33, folio: "77", fechaEmision: "2026-11-03", neto: 2_000_000, exento: 0, iva: 380_000, total: 2_380_000, estado: "vigente", razonSocial: "Proveedor Y", esGeneral: true },
    { id: "gd1", direccion: "emitido", tipoDte: 52, folio: "9", fechaEmision: "2026-11-03", neto: 1, exento: 0, iva: 0, total: 1, estado: "vigente", razonSocial: null },
    { id: "anulada", direccion: "emitido", tipoDte: 33, folio: "101", fechaEmision: "2026-11-03", neto: 100, exento: 0, iva: 19, total: 119, estado: "anulado", razonSocial: null },
    { id: "fuera", direccion: "emitido", tipoDte: 33, folio: "99", fechaEmision: "2026-10-31", neto: 100, exento: 0, iva: 19, total: 119, estado: "vigente", razonSocial: null },
  ],
  cobros: [{ id: "c1", numero: "COB-1", fecha: "2026-11-10", monto: 5_000_000, estado: "vigente" }, { id: "c2", numero: "COB-2", fecha: "2026-11-10", monto: 9, estado: "anulado" }],
  pagos: [{ id: "p1", numero: "PAG-1", fechaPago: "2026-11-12", monto: 2_380_000, estado: "pagado" }, { id: "p2", numero: "PAG-2", fechaPago: null, monto: 1, estado: "programado" }],
  operaciones: [
    { id: "o1", numero: "7", fechaAnticipo: "2026-11-15", fechaCesion: "2026-11-14", recurso: "con", anticipo: 9_000_000, costo: 150_000, nominal: 10_000_000 },
    { id: "o2", numero: "8", fechaAnticipo: null, fechaCesion: "2026-11-16", recurso: "sin", anticipo: 900_000, costo: 20_000, nominal: 1_000_000 },
  ],
  movimientos: [
    { id: "m1", fecha: "2026-11-03", glosa: "COM MANTENCION", monto: -8_500, cuentaContable: CUENTAS.comisiones, esTarjeta: false, proyectoId: null, estado: "Conciliado" },
    { id: "m2", fecha: "2026-11-04", glosa: "COPEC", monto: -45_000, cuentaContable: "5.1.01", esTarjeta: true, proyectoId: "p1", estado: "Conciliado" },
    { id: "m3", fecha: "2026-11-04", glosa: "¿?", monto: -1_000, cuentaContable: CUENTAS.gastosGenerales, esTarjeta: false, proyectoId: null, estado: "Por aclarar" },
    { id: "m4", fecha: "2026-11-04", glosa: "Sin cuenta", monto: -1_000, cuentaContable: null, esTarjeta: false, proyectoId: null, estado: "Conciliado" },
    // Abono ligado a un cobro: el asiento es del cobro, no del movimiento.
    { id: "m5", fecha: "2026-11-04", glosa: "TRANSF CLIENTE", monto: 2_000_000, cuentaContable: "1.1.03", esTarjeta: false, proyectoId: null, estado: "Conciliado con documento" },
  ],
};
const asientos = generarAsientos(e, "2026-11-01", "2026-11-30");
const ids = asientos.map((a) => a.origenId).sort();
assert.deepEqual(ids, ["c1", "fc1", "fv1", "m1", "m2", "nc1", "o1", "o2", "p1"], "anuladas, guías, fuera de período, por aclarar, sin cuenta y ligados a un documento no generan asiento");
for (const a of asientos) {
  const d = a.lineas.reduce((s, l) => s + l.debe, 0);
  const h = a.lineas.reduce((s, l) => s + l.haber, 0);
  assert.equal(d, h, `el asiento ${a.glosa} cuadra`);
  assert.ok(a.lineas.every((l) => l.debe >= 0 && l.haber >= 0 && (l.debe === 0 || l.haber === 0)));
}
const de = (id: string) => asientos.find((a) => a.origenId === id)!;
// Factura de arriendo: clientes al debe, arriendos e IVA DF al haber, con el proyecto en el ingreso.
assert.deepEqual(de("fv1").lineas.map((l) => [l.cuenta, l.debe, l.haber]), [[CUENTAS.clientes, 11_900_000, 0], [CUENTAS.arriendos, 0, 10_000_000], [CUENTAS.ivaDf, 0, 1_900_000]]);
assert.equal(de("fv1").lineas[1].proyectoId, "p1");
// NC de venta: el reverso.
assert.deepEqual(de("nc1").lineas.map((l) => [l.cuenta, l.debe, l.haber]), [[CUENTAS.clientes, 0, 1_190_000], [CUENTAS.ventasServicios, 1_000_000, 0], [CUENTAS.ivaDf, 190_000, 0]]);
// Factura de proveedor del proyecto General: gasto general.
assert.equal(de("fc1").lineas[0].cuenta, CUENTAS.gastosGenerales);
// Gasto con tarjeta: contra la cuenta de la tarjeta, no bancos.
assert.deepEqual(de("m2").lineas.map((l) => [l.cuenta, l.debe, l.haber]), [["5.1.01", 45_000, 0], [CUENTAS.tarjeta, 0, 45_000]]);
// Factoring sin recurso: sale la cuenta del cliente completa, el excedente queda por cobrar.
assert.deepEqual(de("o2").lineas.map((l) => [l.cuenta, l.debe, l.haber]), [[CUENTAS.bancos, 880_000, 0], [CUENTAS.gastoFactoring, 20_000, 0], ["1.1.04", 100_000, 0], [CUENTAS.clientes, 0, 1_000_000]]);
assert.equal(de("o2").fecha, "2026-11-16", "sin fecha de anticipo, usa la de cesión");

// Un documento que no cuadra (total ≠ neto + exento + IVA) no genera asiento.
assert.equal(generarAsientos({ ...e, documentos: [{ ...e.documentos[0], total: 11_900_001 }], cobros: [], pagos: [], operaciones: [], movimientos: [] }, "2026-11-01", "2026-11-30").length, 0);

// Balance de comprobación: debe total = haber total; resultado = ingresos − gastos.
const saldos = balanceComprobacion(asientos);
assert.equal(saldos.reduce((s, x) => s + x.debe, 0), saldos.reduce((s, x) => s + x.haber, 0));
assert.equal(saldos.reduce((s, x) => s + x.deudor - x.acreedor, 0), 0);
const er = estadoResultados(saldos);
assert.equal(er.ingresos, 10_000_000 - 1_000_000);
assert.equal(er.gastos, 2_000_000 + 150_000 + 20_000 + 8_500 + 45_000);
assert.equal(er.resultado, er.ingresos - er.gastos);

console.log(`Contable verificado: cartolas (cargo/abono, monto con signo, encabezado desplazado, filas de saldo) y ${asientos.length} asientos que cuadran, con balance en cero y resultado ${er.resultado.toLocaleString("es-CL")}.`);
