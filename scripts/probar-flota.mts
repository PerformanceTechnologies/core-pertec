// Pruebas puras de Flota: vencimientos, alertas, odómetro, costos de contratos y patentes.
import assert from "node:assert/strict";
import {
  alertasDeFlota,
  armarDocumentos,
  avanceDocumentos,
  estadoDocumento,
  costoDeContrato,
  estadoVencimiento,
  formatearPatente,
  normalizarPatente,
  resumirCostos,
  revisarLectura,
  type Contrato,
  type Documento,
  type TipoDocumento,
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

const doc = (d: Partial<Documento>): Documento => ({
  id: "d", vehiculoId: "v1", tipoId: null, seccion: "base", nombre: "Doc", vence: null, archivoNombre: null,
  tieneArchivo: false, noAplica: false, ...d,
});

// Alertas: documentos con fecha vencida o por vencer (no los «no aplica» ni los de un vehículo
// dado de baja) y contratos abiertos que terminan pronto. Lo sin fecha no es alerta.
{
  const a = alertasDeFlota(
    [base, baja],
    [contrato({ fin: "2026-11-15" }), contrato({ fin: "2026-11-10", cerrado: true })],
    [
      doc({ nombre: "Revisión técnica", vence: "2026-10-30" }),
      doc({ nombre: "SOAP", vence: "2026-11-20" }),
      doc({ nombre: "Pase minero", vence: "2026-10-01", noAplica: true }),
      doc({ nombre: "Padrón", vence: null }),
      doc({ nombre: "Permiso", vence: "2027-03-31" }),
      doc({ vehiculoId: "v2", nombre: "SOAP", vence: "2020-01-01" }),
    ],
    hoy,
  );
  assert.deepEqual(a.map((x) => x.que), ["Revisión técnica", "Contrato seguro (HDI)", "SOAP"]);
  assert.ok(a.every((x) => x.patente === "ABCD12"));
  assert.equal(a[0].estado, "vencido");
}

// Estado de un documento.
{
  const e = (d: Partial<{ noAplica: boolean; tieneArchivo: boolean; vence: string | null; pideFecha: boolean }>) =>
    estadoDocumento({ noAplica: false, tieneArchivo: false, vence: null, pideFecha: true, ...d }, hoy);
  assert.equal(e({}), "falta");
  assert.equal(e({ tieneArchivo: true }), "sin_fecha");
  assert.equal(e({ tieneArchivo: true, pideFecha: false }), "vigente"); // el padrón no vence
  assert.equal(e({ tieneArchivo: true, vence: "2027-01-01" }), "vigente");
  assert.equal(e({ tieneArchivo: true, vence: "2026-11-10" }), "por_vencer");
  assert.equal(e({ vence: "2026-10-01" }), "vencido"); // vencido manda aunque falte el archivo
  assert.equal(e({ noAplica: true, vence: "2026-10-01" }), "no_aplica");
}

// La documentación: los tipos en su orden (con o sin fila), los inactivos solo si hay fila,
// y los agregados a mano al final de su sección.
{
  const tipos: TipoDocumento[] = [
    { id: "t2", nombre: "SOAP", seccion: "base", vence: true, orden: 2, activo: true },
    { id: "t1", nombre: "Padrón", seccion: "base", vence: false, orden: 1, activo: true },
    { id: "t3", nombre: "Viejo", seccion: "base", vence: true, orden: 3, activo: false },
    { id: "t4", nombre: "Pase", seccion: "acreditacion", vence: true, orden: 1, activo: true },
  ];
  const s = armarDocumentos(tipos, [
    doc({ id: "d1", tipoId: "t1", nombre: "Padrón", tieneArchivo: true }),
    doc({ id: "d2", nombre: "Extra", seccion: "acreditacion", tieneArchivo: true, vence: "2027-05-01" }),
    doc({ id: "d3", tipoId: "t4", nombre: "Pase", seccion: "acreditacion", noAplica: true }),
  ], hoy);
  assert.deepEqual(s.base.map((f) => [f.nombre, f.estado]), [["Padrón", "vigente"], ["SOAP", "falta"]]);
  assert.deepEqual(s.acreditacion.map((f) => [f.nombre, f.estado]), [["Pase", "no_aplica"], ["Extra", "vigente"]]);
  assert.equal(s.base[1].documentoId, null); // SOAP aún no tiene fila: se crea al tocarla
  assert.deepEqual(avanceDocumentos([...s.base, ...s.acreditacion]), { listos: 2, total: 3 });
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
