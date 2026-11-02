// Pruebas puras de Flota: vencimientos, alertas, odómetro, costos de contratos y patentes.
import assert from "node:assert/strict";
import {
  alertasDeFlota,
  costoDeContrato,
  estadoVencimiento,
  formatearPatente,
  normalizarPatente,
  resumirCostos,
  revisarLectura,
  type Contrato,
  type Servicio,
  type Vehiculo,
} from "../lib/flota-modelo";

const hoy = new Date(2026, 10, 2); // 2 nov 2026

// Vencimientos: vencido, por vencer (≤30 días), vigente y sin fecha.
assert.equal(estadoVencimiento("2026-11-01", hoy), "vencido");
assert.equal(estadoVencimiento("2026-11-02", hoy), "por_vencer");
assert.equal(estadoVencimiento("2026-12-02", hoy), "por_vencer");
assert.equal(estadoVencimiento("2026-12-03", hoy), "vigente");
assert.equal(estadoVencimiento(null, hoy), "sin_fecha");

// Patentes chilenas.
assert.equal(normalizarPatente(" ab-cd 12 "), "ABCD12");
assert.equal(formatearPatente("abcd12"), "AB·CD·12");
assert.equal(formatearPatente("AB1234"), "AB·12·34");
assert.equal(formatearPatente("AS11EWW"), "AS·11·EWW"); // fuera de formato: corta entre letras y números

// El odómetro no retrocede.
assert.equal(revisarLectura(1000, null), null);
assert.equal(revisarLectura(1000, 1000), null);
assert.match(revisarLectura(999, 1000) ?? "", /menor/);
assert.match(revisarLectura(-1, null) ?? "", /positivo/);

const base: Vehiculo = {
  id: "v1", patente: "ABCD12", modeloId: null, anio: 2022, color: null, numeroChasis: null, numeroMotor: null,
  combustible: "diesel", unidadOdometro: "km", estado: "disponible", conductor: null, faena: null, propiedad: "propio",
  fechaAdquisicion: null, valorCompra: 0, revisionTecnicaVence: "2026-10-30", permisoCirculacionVence: "2027-03-31",
  soapVence: "2026-11-20", notas: null, activo: true,
};
const baja: Vehiculo = { ...base, id: "v2", patente: "ZZZZ99", estado: "baja", soapVence: "2020-01-01" };

const contrato = (c: Partial<Contrato>): Contrato => ({
  id: "c", vehiculoId: "v1", tipo: "seguro", proveedor: "HDI", referencia: null, inicio: "2026-01-15", fin: null,
  costoInicial: 0, costoRecurrente: 0, frecuencia: "mensual", cerrado: false, notas: null, ...c,
});

// Alertas: documentos del activo (la de baja no avisa) y contratos que terminan pronto.
{
  const a = alertasDeFlota([base, baja], [contrato({ fin: "2026-11-15" }), contrato({ fin: "2026-11-10", cerrado: true })], hoy);
  assert.deepEqual(a.map((x) => x.que), ["Revisión técnica", "Contrato seguro (HDI)", "SOAP"]);
  assert.ok(a.every((x) => x.patente === "ABCD12"));
  assert.equal(a[0].estado, "vencido");
}

// Costo de contrato: inicial dentro del período + cuotas mensuales/anuales cumplidas.
{
  const c = contrato({ costoInicial: 100, costoRecurrente: 50 });
  assert.equal(costoDeContrato(c, "2026-01-01", "2026-03-31"), 100 + 3 * 50); // 15-ene, 15-feb, 15-mar
  assert.equal(costoDeContrato(c, "2026-02-01", "2026-02-28"), 50);
  assert.equal(costoDeContrato({ ...c, fin: "2026-02-20" }, "2026-01-01", "2026-12-31"), 100 + 2 * 50);
  assert.equal(costoDeContrato({ ...c, frecuencia: "anual" }, "2026-01-01", "2027-12-31"), 100 + 2 * 50);
  assert.equal(costoDeContrato({ ...c, frecuencia: "unico" }, "2026-01-01", "2026-12-31"), 100);
}

// Resumen: solo servicios hechos, por vehículo, tipo y mes.
{
  const s = (x: Partial<Servicio>): Servicio => ({
    id: "s", vehiculoId: "v1", tipo: "mantencion", estado: "hecho", fecha: "2026-02-10", descripcion: null, proveedor: null,
    costo: 0, odometro: null, ...x,
  });
  const r = resumirCostos(
    [base, baja],
    [s({ costo: 200 }), s({ tipo: "combustible", costo: 80, fecha: "2026-03-05" }), s({ costo: 999, estado: "programado" }), s({ costo: 7, fecha: "2025-12-01" })],
    [contrato({ costoRecurrente: 50 })],
    "2026-02-01",
    "2026-03-31",
  );
  assert.equal(r.servicios, 280);
  assert.equal(r.contratos, 100);
  assert.equal(r.total, 380);
  assert.deepEqual(r.porVehiculo.map((f) => [f.patente, f.total]), [["ABCD12", 380]]);
  assert.deepEqual(r.porTipo.map((t) => t.tipo), ["mantencion", "combustible"]);
  assert.deepEqual(r.porMes, [{ mes: "2026-02", servicios: 200, contratos: 50 }, { mes: "2026-03", servicios: 80, contratos: 50 }]);
}

console.log("Flota verificada: vencimientos, alertas, odómetro, costos de contratos, resumen y patentes.");
