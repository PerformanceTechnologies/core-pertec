// Banco automático (Emisso → Tesorería): traducción de movimientos y saldos de Itaú Corporate.
// Datos INVENTADOS (el repositorio es público: acá no hay cuentas, montos ni RUT reales).
//   npm run probar-banco-emisso
import assert from "node:assert/strict";
import {
  SISTEMA_ITAU,
  cambiosDeFila,
  claveExterna,
  cuentasConMovimientos,
  horasDesde,
  montoConSigno,
  nombreCuenta,
  numeroEnmascarado,
  origenDe,
  periodosRecientes,
  requierePersona,
  rutNormalizado,
  saldosVigentes,
  traducirMovimiento,
  traducirMovimientos,
  type MovimientoEmisso,
  type SaldoEmisso,
} from "../lib/fin/banco-emisso-modelo";

let n = 0;
const prueba = (nombre: string, f: () => void) => {
  f();
  n++;
  console.log(`  ok  ${nombre}`);
};

const mov = (p: Partial<MovimientoEmisso> = {}): MovimientoEmisso => ({
  id: "a1b2c3",
  numeroCuenta: "0001112223",
  currency: "CLP",
  periodo: "2026-11",
  fecha: "2026-11-16",
  descripcion: "LUZ DEL SUR",
  documento: "000000101",
  monto: 50000,
  type: "credit",
  saldo: 900000,
  oficina: "OPERACIONES CENTRALES",
  contraparte: null,
  superficie: "ultimos_movimientos",
  syncedAt: "2026-11-17T15:00:00.000Z",
  ...p,
});

console.log("Signo (libro del banco)");
prueba("'credit' es plata que SALE: negativo", () => assert.equal(montoConSigno({ monto: 50000, type: "credit" }), -50000));
prueba("'debit' es plata que ENTRA: positivo", () => assert.equal(montoConSigno({ monto: 1, type: "debit" }), 1));
prueba("sin type o sin monto no se adivina", () => {
  assert.equal(montoConSigno({ monto: 10, type: null }), null);
  assert.equal(montoConSigno({ monto: null, type: "debit" }), null);
});

console.log("Identidad");
prueba("la clave es cuenta + N° de movimiento, sin glosa", () => {
  const a = claveExterna(SISTEMA_ITAU, mov({ descripcion: "LUZ DEL SUR" }));
  const b = claveExterna(SISTEMA_ITAU, mov({ descripcion: "LUZ DEL SUR S.A.", id: "otro-id" }));
  assert.equal(a, b);
  assert.equal(a, "itau_corporate:0001112223:000000101");
});
prueba("sin N° de movimiento cae al id de Emisso", () => assert.equal(claveExterna(SISTEMA_ITAU, mov({ documento: null })), "itau_corporate:0001112223:id:a1b2c3"));
prueba("el origen de la cuenta", () => assert.equal(origenDe(SISTEMA_ITAU, "0001112223"), "emisso:itau_corporate:0001112223"));

console.log("Traducción");
prueba("un cargo queda negativo, con glosa limpia y N°", () => {
  const t = traducirMovimiento(SISTEMA_ITAU, mov({ descripcion: "  PAGO   PROVEEDORES " }));
  assert.ok(t.ok);
  assert.deepEqual(t.fila, { clave: "itau_corporate:0001112223:000000101", numeroCuenta: "0001112223", fecha: "2026-11-16", glosa: "PAGO PROVEEDORES", monto: -50000, documento: "000000101", contraparteRut: null });
});
prueba("un abono trae el RUT de la contraparte normalizado", () => {
  const t = traducirMovimiento(SISTEMA_ITAU, mov({ type: "debit", monto: 120000, descripcion: "TRANSF. DE 11111111-1 CLIENTE", contraparte: { rut: "11.111.111-1", nombre: null, banco: null } }));
  assert.ok(t.ok);
  assert.equal(t.fila.monto, 120000);
  assert.equal(t.fila.contraparteRut, "11111111-1");
});
prueba("la cuenta dólar no entra a Tesorería (pesos enteros)", () => assert.deepEqual(traducirMovimiento(SISTEMA_ITAU, mov({ currency: "USD", monto: 12.5 })), { ok: false, motivo: "moneda USD" }));
prueba("sin fecha, sin monto o en cero no entra", () => {
  assert.equal(traducirMovimiento(SISTEMA_ITAU, mov({ fecha: null })).ok, false);
  assert.equal(traducirMovimiento(SISTEMA_ITAU, mov({ type: null })).ok, false);
  assert.equal(traducirMovimiento(SISTEMA_ITAU, mov({ monto: 0 })).ok, false);
});
prueba("el lote junta omitidos por motivo y descarta claves repetidas", () => {
  const r = traducirMovimientos(SISTEMA_ITAU, [
    mov(),
    mov({ descripcion: "LUZ DEL SUR (corregida)" }), // misma clave: se queda la primera
    mov({ documento: "000000102", type: "debit" }),
    mov({ currency: "USD" }),
    mov({ currency: "USD", documento: "9" }),
  ]);
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[0].glosa, "LUZ DEL SUR");
  assert.deepEqual(r.omitidos, [{ motivo: "moneda USD", cantidad: 2 }]);
  assert.deepEqual(cuentasConMovimientos(r.filas), ["0001112223"]);
});

console.log("Actualización de lo ya guardado");
prueba("una glosa corregida se actualiza; monto y fecha nunca", () => {
  const t = traducirMovimiento(SISTEMA_ITAU, mov({ descripcion: "LUZ DEL SUR S.A." }));
  assert.ok(t.ok);
  assert.deepEqual(cambiosDeFila({ glosa: "LUZ DEL SUR", numero_documento: "000000101", contraparte_rut: null }, t.fila), { glosa: "LUZ DEL SUR S.A." });
});
prueba("sin cambios no hay update", () => {
  const t = traducirMovimiento(SISTEMA_ITAU, mov());
  assert.ok(t.ok);
  assert.equal(cambiosDeFila({ glosa: "LUZ DEL SUR", numero_documento: "000000101", contraparte_rut: null }, t.fila), null);
});
prueba("un RUT ya puesto no se borra si el banco deja de informarlo", () => {
  const t = traducirMovimiento(SISTEMA_ITAU, mov());
  assert.ok(t.ok);
  assert.equal(cambiosDeFila({ glosa: "LUZ DEL SUR", numero_documento: "000000101", contraparte_rut: "11111111-1" }, t.fila), null);
});

console.log("Saldos");
const saldo = (p: Partial<SaldoEmisso>): SaldoEmisso => ({
  numeroCuenta: "0001112223", currency: "CLP", observedDay: "2026-11-17", observedAt: "2026-11-17T15:00:00.000Z",
  saldoTotal: 900000, retenciones: 0, saldoDisponible: 900000, saldoDisponibleLineaCredito: null, syncedAt: "2026-11-17T15:00:00.000Z", ...p,
});
prueba("la foto más reciente por cuenta y moneda", () => {
  const v = saldosVigentes([
    saldo({ observedAt: "2026-11-16T15:00:00.000Z", saldoTotal: 1 }),
    saldo({ saldoTotal: 2 }),
    saldo({ currency: "USD", saldoTotal: 10.5 }),
    saldo({ numeroCuenta: "0001112224", saldoTotal: 0, saldoDisponible: 500000 }),
  ]);
  assert.deepEqual(v.map((s) => [s.numeroCuenta, s.currency, s.saldoTotal]), [["0001112223", "CLP", 2], ["0001112223", "USD", 10.5], ["0001112224", "CLP", 0]]);
});

console.log("Varios");
prueba("RUT normalizado", () => {
  assert.equal(rutNormalizado("11.111.111-k"), "11111111-K");
  assert.equal(rutNormalizado(null), null);
});
prueba("nombre y número enmascarado de la cuenta nueva", () => {
  assert.equal(nombreCuenta("Itaú", "0001112223"), "Itaú CC 2223");
  assert.equal(numeroEnmascarado("0001112223"), "•••2223");
});
prueba("clave rechazada o bloqueada exige a una persona; otras fallas no", () => {
  assert.ok(requierePersona("credencial_rechazada"));
  assert.ok(requierePersona("clave_bloqueada"));
  assert.ok(requierePersona("connection_credential_required"));
  assert.ok(!requierePersona("sesion_ocupada"));
  assert.ok(!requierePersona(null));
});
prueba("antigüedad del dato en horas", () => assert.equal(horasDesde("2026-11-17T00:00:00.000Z", new Date("2026-11-18T06:00:00.000Z")), 30));
prueba("este mes y el anterior, en calendario chileno", () => {
  // 1 de diciembre 02:00 UTC = 30 de noviembre 23:00 en Chile (verano, UTC-3).
  assert.deepEqual(periodosRecientes(new Date("2026-12-01T02:00:00.000Z")), ["2026-10", "2026-11"]);
  assert.deepEqual(periodosRecientes(new Date("2027-01-15T12:00:00.000Z")), ["2026-12", "2027-01"]);
});

console.log(`\n${n} pruebas ok`);
