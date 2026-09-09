/**
 * La sincronización de Flota contra un Odoo que cambia de campos.
 *
 * Correr con:  npm run probar-flota
 *
 * Lo que pasó: en Odoo cambiaron el modelo custom de documentos de vehículo —el tipo de
 * documento dejó de ser una selection `document_type` y pasó a un `document_type_id` que
 * apunta a pertec.document.type— y la sincronización se cayó tres días seguidos con
 * "Invalid field 'document_type' on 'pertec.fleet.vehicle.document'". En la tarjeta eso se
 * veía como "error hace 3 h" y los datos congelados, sin decir por qué.
 *
 * El arreglo es no pedir nombres fijos: preguntarle a Odoo qué campos tiene y usar el
 * primero de cada lista que exista. Esto prueba las tres situaciones que importan, y
 * ninguna se puede reproducir tocando Odoo de verdad: el modelo viejo, el nuevo, y uno
 * donde falta algo imprescindible.
 */

import assert from "node:assert/strict";
import {
  MODELO_DOCUMENTOS,
  camposAPedir,
  documentoAFila,
  resolverCamposDocumento,
} from "../lib/panel-odoo/sincronizar-flota";

/** Lo que devuelve fields_get, en lo único que se le mira: qué claves trae. */
const comoFieldsGet = (...nombres: string[]) =>
  Object.fromEntries(nombres.map((n) => [n, { type: "char" }]));

// ── El modelo VIEJO: sigue funcionando ──────────────────────────────────
const viejo = resolverCamposDocumento(
  comoFieldsGet("name", "category", "document_type", "expiration_date", "vehicle_id"),
);
assert.equal(viejo.tipo, "document_type", "con el modelo viejo se sigue usando la selection");
assert.equal(viejo.categoria, "category");
assert.deepEqual(camposAPedir(viejo).sort(), ["category", "document_type", "expiration_date", "name", "vehicle_id"]);

// ── El modelo NUEVO: el que rompía ──────────────────────────────────────
const nuevo = resolverCamposDocumento(
  comoFieldsGet("name", "document_type_id", "document_type_name", "expiration_date", "vehicle_id", "is_valid"),
);
assert.equal(
  nuevo.tipo,
  "document_type_name",
  "el texto ya resuelto va primero: es lo que se muestra, y ahorra leer la tupla del many2one",
);
assert.equal(nuevo.categoria, null, "el modelo nuevo no tiene categoría, y eso NO corta la sincronización");
assert.ok(
  !camposAPedir(nuevo).includes("document_type"),
  "y sobre todo: ya no se le pide a Odoo el campo que no existe, que es lo que tumbaba todo",
);
assert.ok(!camposAPedir(nuevo).includes("category"));
assert.ok(!camposAPedir(nuevo).includes("is_valid"), "no se piden campos que no se usan");

// Si solo estuviera el many2one, se lee ese.
assert.equal(
  resolverCamposDocumento(comoFieldsGet("name", "document_type_id", "expiration_date", "vehicle_id")).tipo,
  "document_type_id",
);

// ── Lo imprescindible que falta: error legible ──────────────────────────
for (const [falta, campos] of [
  ["vehiculo", comoFieldsGet("name", "document_type_name", "expiration_date")],
  ["vencimiento", comoFieldsGet("name", "document_type_name", "vehicle_id")],
] as const) {
  assert.throws(
    () => resolverCamposDocumento(campos),
    (e: Error) => {
      assert.ok(e.message.includes(MODELO_DOCUMENTOS), "el error dice de qué modelo habla");
      assert.ok(e.message.includes(falta), `y qué dato falta (${falta})`);
      // Y qué campos tiene hoy: sin esto hay que ir a Odoo a mirar a ciegas.
      assert.ok(e.message.includes("name"), "y la lista de los que sí están");
      return true;
    },
    `faltando ${falta} tiene que cortar con un error que se entienda`,
  );
}

// ── Leer el valor, venga como venga ─────────────────────────────────────
const empresas = new Map([[7, 2]]);
const nombres = new Map([[7, "Camioneta Maxus VPWF87"]]);

// Modelo nuevo: el tipo llega como texto y el vehículo como tupla.
const filaNueva = documentoAFila(
  {
    id: 41,
    name: "Permiso de circulación 2026",
    document_type_name: "Permiso de circulación",
    expiration_date: "2026-03-31",
    vehicle_id: [7, "Maxus/T60 4x4 DX"],
  },
  nuevo,
  empresas,
  nombres,
);
assert.equal(filaNueva?.tipo_documento, "Permiso de circulación");
assert.equal(filaNueva?.fecha_vencimiento, "2026-03-31");
assert.equal(filaNueva?.vehiculo_odoo_id, 7);
assert.equal(filaNueva?.company_id, 2, "la empresa se hereda del vehículo, el documento no la tiene");
assert.equal(filaNueva?.vehiculo_nombre, "Camioneta Maxus VPWF87", "gana el nombre del vehículo ya sincronizado");
assert.equal(filaNueva?.categoria, null);

// Un many2one como tipo: se guarda el NOMBRE, no el id ni "7,Permiso".
const conMany2one = resolverCamposDocumento(comoFieldsGet("name", "document_type_id", "expiration_date", "vehicle_id"));
assert.equal(
  documentoAFila(
    { id: 42, name: "SOAP", document_type_id: [3, "SOAP"], expiration_date: "2026-04-01", vehicle_id: [7, "x"] },
    conMany2one,
    empresas,
    nombres,
  )?.tipo_documento,
  "SOAP",
);

// Vacíos de Odoo: `false` es "no hay", no el texto "false".
const conVacios = documentoAFila(
  { id: 43, name: false, document_type_name: false, expiration_date: false, vehicle_id: [9, "Sin sincronizar"] },
  nuevo,
  empresas,
  nombres,
);
assert.equal(conVacios?.tipo_documento, null);
assert.equal(conVacios?.fecha_vencimiento, null);
assert.equal(conVacios?.nombre, "Documento", "un documento sin nombre no se guarda con el nombre vacío");
assert.equal(conVacios?.company_id, 1, "un vehículo que no está en la cache cae a la empresa 1");
assert.equal(conVacios?.vehiculo_nombre, "Sin sincronizar", "y usa el nombre que vino en la tupla");

// Sin vehículo no hay fila: no se puede mostrar ni saber de qué empresa es.
assert.equal(
  documentoAFila({ id: 44, name: "Huérfano", expiration_date: "2026-01-01", vehicle_id: false }, nuevo, empresas, nombres),
  null,
);

console.log(
  "Flota: la sincronización lee los campos que Odoo dice tener (modelo viejo y nuevo), " +
    "y si falta uno imprescindible corta con un error que dice qué falta y qué hay.",
);
