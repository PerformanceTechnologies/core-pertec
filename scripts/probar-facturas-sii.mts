/**
 * El estado real de una factura, y el aviso de las reclamadas.
 *
 * Correr con:  npm run probar-facturas
 *
 * El panel mostraba TODAS las ventas como "Registro", y no por un error de la pantalla:
 * el RCV de ventas no tiene sub-pestañas de estado —el acuse y el reclamo son actos de
 * quien RECIBE el documento— así que el scraper guardaba "registro" a mano para cada
 * venta. Una columna que siempre dice lo mismo no dice nada, y un cliente que reclama una
 * factura de cien millones no aparecía en ninguna parte.
 *
 * Lo que sí trae el CSV de ventas son las fechas de acuse y de reclamo. De ahí se deriva
 * el estado, y eso es lo que se prueba acá: el parseo de esas dos columnas —que pueden
 * faltar, venir vacías o venir con hora— y el correo que se le manda a Finanzas.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avisoDeReclamos } from "../lib/finanzas-reclamos";
import { parsearCsvRcv, type FacturaSii } from "../lib/sii-rcv";

// ── El estado de una venta sale del CSV, y esto se prueba CON un CSV ───────
//
// La primera versión de estas pruebas comprobaba que lib/sii-rcv.ts contuviera ciertas
// palabras —idx("Fecha Acuse Recibo"), etc.— y pasó en verde mientras el scraper leía
// dos columnas que el SII no manda: se releyeron tres períodos y las 174 filas quedaron
// con las dos fechas en NULL. Una prueba sobre el texto del archivo no puede notar eso.
//
// Ahora el parser está exportado y se le pasan CSVs armados a mano. No prueban qué manda
// el SII —eso no se puede saber desde acá— pero sí que CADA forma que pueda venir se
// derive bien, y que la que no viene no se invente.
const scraper = readFileSync(new URL("../lib/sii-rcv.ts", import.meta.url), "utf8");

/** Un CSV del RCV con las columnas que se le pidan y una fila. */
function csv(columnas: Record<string, string>): string {
  const base: Record<string, string> = {
    "Tipo Doc": "33",
    "Rut cliente": "76929210-1",
    "Razon Social": "SALFA SA",
    Folio: "198",
    "Fecha Docto": "12/08/2026",
    "Monto Neto": "35595432",
    "Monto IVA": "6763132",
    "Monto total": "42358564",
  };
  const todas = { ...base, ...columnas };
  return `${Object.keys(todas).join(";")}\n${Object.values(todas).join(";")}`;
}

const unaVenta = (columnas: Record<string, string>): FacturaSii => {
  const filas = parsearCsvRcv(csv(columnas), "venta", "registro", "202608");
  assert.equal(filas.length, 1, "el CSV de ejemplo tiene que parsearse");
  return filas[0];
};

// El evento del receptor, que es lo que el RCV de ventas trae de verdad. Viene como
// código, como código con leyenda o solo como leyenda: las tres formas se vieron en
// pantallas del SII y ninguna se puede descartar.
for (const valor of ["RFT", "RFT - Reclamo por Falta Total de Mercaderias", "Reclamo al Contenido"]) {
  assert.equal(
    unaVenta({ "Evento Receptor": valor }).estado,
    "reclamado",
    `"${valor}" es un reclamo`,
  );
}
for (const valor of ["RCD", "RFP"]) {
  assert.equal(unaVenta({ "Evento Receptor": valor }).estado, "reclamado", `${valor} es reclamo`);
}
for (const valor of ["ACD", "ERM", "ACD - Acepta Contenido del Documento"]) {
  assert.equal(
    unaVenta({ "Evento Receptor": valor }).estado,
    "aceptado",
    `"${valor}" es una aceptación, que es distinto de que nadie la haya mirado`,
  );
}
assert.equal(
  unaVenta({ "Evento Receptor": "" }).estado,
  "registro",
  "sin evento la venta queda en registro: nadie respondió todavía",
);
assert.equal(
  unaVenta({ "Evento Receptor": "XYZ - algo nuevo" }).estado,
  "registro",
  "un evento que no se reconoce NO se interpreta: mejor 'registro' que un estado inventado",
);

// El nombre de la columna cambia entre vistas del RCV, y el header viene con mayúsculas
// inconsistentes. Si ninguna variante coincide, el estado se pierde en silencio: fue
// exactamente lo que pasó.
for (const nombre of ["Evento Receptor", "EVENTO RECEPTOR", "Estado Evento Receptor", "Estado Acuse"]) {
  assert.equal(unaVenta({ [nombre]: "RFT" }).estado, "reclamado", `columna "${nombre}"`);
}

// Y sin NINGUNA columna de estado, el documento se guarda igual: se pierde el detalle,
// no la factura.
const sinColumnas = unaVenta({});
assert.equal(sinColumnas.estado, "registro");
assert.equal(sinColumnas.folio, 198);
assert.equal(sinColumnas.montoTotal, 42_358_564, "los montos se leen igual");
assert.equal(sinColumnas.fechaAcuse, null);
assert.equal(sinColumnas.fechaReclamo, null);

// Las fechas se siguen leyendo por si algún día vienen, con o sin hora.
assert.equal(unaVenta({ "Fecha Acuse Recibo": "13/08/2026" }).estado, "aceptado");
assert.equal(unaVenta({ "Fecha Reclamado": "14/08/2026" }).fechaReclamo, "2026-08-14");
assert.equal(
  unaVenta({ "Fecha Reclamado": "" }).estado,
  "registro",
  "una columna presente pero vacía es el caso normal: nadie reclamó nada",
);

// El reclamo le gana al acuse: un documento acusado y después reclamado es un documento
// reclamado, y es el que hay que ir a mirar.
assert.equal(
  unaVenta({ "Fecha Acuse Recibo": "13/08/2026", "Fecha Reclamado": "14/08/2026" }).estado,
  "reclamado",
);
assert.equal(unaVenta({ "Evento Receptor": "ERM", "Fecha Reclamado": "14/08/2026" }).estado, "reclamado");

// En COMPRA el estado es la sub-pestaña de la que se bajó el CSV, y el evento del
// receptor no lo pisa: ahí el que acusa o reclama es PERTEC, y el SII ya lo separó en
// pestañas. Derivarlo dos veces sería contradecirse a sí mismo.
const compra = parsearCsvRcv(
  csv({ "Evento Receptor": "RFT", "RUT Proveedor": "77590822-K" }),
  "compra",
  "pendiente",
  "202608",
);
assert.equal(compra[0].estado, "pendiente");

// La ventana de sincronización tiene que cubrir el plazo de reclamo (8 días corridos).
const ventana = /const ventanaDias = opciones\.ventanaDias \?\? (\d+);/.exec(scraper);
assert.ok(ventana, "no se encontró la ventana de días del scraper");
assert.ok(
  Number(ventana[1]) >= 15,
  `la ventana es de ${ventana[1]} días y el cliente tiene 8 corridos para reclamar: con 7 ` +
    "—lo que había— un reclamo del octavo día caía afuera y el estado quedaba viejo para siempre",
);
const cron = readFileSync(new URL("../app/api/cron/finanzas-sii/route.ts", import.meta.url), "utf8");
assert.ok(
  /ventanaDias: (1[5-9]|[2-9]\d)/.test(cron),
  "y el cron pide esa ventana explícitamente, no la que venga por omisión",
);

// ── Releer un período completo ──────────────────────────────────────────────
//
// La corrida diaria mira 15 días, así que una factura más vieja que eso no se vuelve a
// consultar nunca y se queda con el estado que tenía el día que se leyó. Al cambiar cómo
// se deriva el estado de una venta, todo el historial quedó con el dato viejo —"registro"
// en cada una— y sin esto no había forma de actualizarlo.
assert.ok(
  /periodos\?: string\[\]/.test(scraper),
  "se pueden pedir períodos completos para releer",
);
assert.ok(
  /relectura\.length === 0[\s\S]{0,400}filas = filas\.filter/.test(scraper) ||
    /!opciones\.cargaInicial && relectura\.length === 0/.test(scraper),
  "y una relectura NO filtra por día: se pide justamente para lo más viejo que la ventana",
);
assert.ok(
  cron.includes('searchParams.get("meses")') && cron.includes('searchParams.get("periodos")'),
  "el cron acepta pedirlo a mano, que es lo que arregla el historial ya guardado",
);

// ── El aviso a Finanzas ─────────────────────────────────────────────────────
const reclamada = (parte: Partial<FacturaSii>): FacturaSii => ({
  tipoDocumento: "venta",
  codigoDte: 33,
  estado: "reclamado",
  rutContraparte: "76.929.210-1",
  razonSocial: "SALFA SA",
  folio: 198,
  fechaDocto: "2026-08-12",
  fechaRecepcion: null,
  montoExento: null,
  montoNeto: 35_595_432,
  montoIvaRecuperable: 6_763_132,
  montoIvaNoRecuperable: null,
  montoTotal: 42_358_564,
  periodo: "202608",
  fechaAcuse: null,
  fechaReclamo: "2026-08-14",
  ...parte,
});

assert.equal(avisoDeReclamos([]), null, "sin reclamos no hay correo: un aviso vacío se aprende a ignorar");

const una = avisoDeReclamos([reclamada({})]);
assert.ok(una);
assert.ok(una.asunto.includes("198") && una.asunto.includes("SALFA SA"), "el asunto dice cuál es");
for (const dato of ["76.929.210-1", "2026-08-14", "$42.358.564", "202608"]) {
  assert.ok(una.cuerpo.includes(dato), `el detalle incluye ${dato}`);
}
assert.ok(
  una.cuerpo.includes("nota de crédito"),
  "y dice qué hacer: el aviso sirve para actuar, no para enterarse",
);

// Con varias, el asunto trae la cuenta y el monto total: es lo que se lee en la bandeja
// sin abrir el correo.
const varias = avisoDeReclamos([
  reclamada({}),
  reclamada({ folio: 201, razonSocial: "Minera Las Cenizas S.A.", montoTotal: 11_394_250 }),
]);
assert.ok(varias);
assert.ok(varias.asunto.includes("2 facturas") && varias.asunto.includes("$53.752.814"));
assert.ok(varias.cuerpo.includes("198") && varias.cuerpo.includes("201"), "y las dos en el detalle");

// Un monto ausente no puede romper el correo ni sumar como cero disfrazado.
const sinMonto = avisoDeReclamos([reclamada({ montoTotal: null, razonSocial: null })]);
assert.ok(sinMonto);
assert.ok(sinMonto.cuerpo.includes("—"), "un monto que no vino se dice, no se inventa");
assert.ok(sinMonto.cuerpo.includes("(sin razón social)"));

// ── Que el aviso salga de la corrida, una sola vez ──────────────────────────
const finanzas = readFileSync(new URL("../lib/finanzas.ts", import.meta.url), "utf8");
assert.ok(
  finanzas.includes("export async function reclamosNuevosDeVenta"),
  "los reclamos nuevos se detectan comparando con lo guardado",
);
// Sobre el CUERPO del handler y no sobre el archivo: en los imports los nombres van en
// otro orden y la comprobación pasaría (o fallaría) por eso.
const cuerpoCron = cron.slice(cron.indexOf("export async function GET"));

/**
 * Que `antes` esté, que `despues` esté, y en ese orden.
 *
 * Los dos tienen que ENCONTRARSE: comparar índices a secas daba por bueno el caso en que
 * el primero no estaba —indexOf devuelve -1, que es menor que cualquier posición— y esta
 * prueba lo dejó pasar en su primera versión, con la llamada sacada del cron.
 */
const enOrden = (donde: string, antes: string, despues: string): boolean => {
  const i = donde.indexOf(antes);
  const j = donde.indexOf(despues);
  return i !== -1 && j !== -1 && i < j;
};

assert.ok(
  enOrden(cuerpoCron, "reclamosNuevosDeVenta", "guardarFacturasSii"),
  "y se detectan ANTES de guardar: después ya no se puede saber si el reclamo es nuevo, y " +
    "avisar de uno viejo en cada corrida es la forma más rápida de que nadie abra el correo",
);
assert.ok(
  cron.includes("enviarCorreoFinanzas"),
  "el aviso va a Finanzas, que es quien emite la nota de crédito",
);
assert.ok(
  enOrden(cuerpoCron, "guardarFacturasSii", "enviarCorreoFinanzas"),
  "y se manda después de guardar: si el correo falla, el dato ya está en el panel",
);

// ── "No hay reclamos" tiene que ser distinto de "el SII no dijo nada" ───────
//
// Esto es lo que faltaba: al releer septiembre, el botón informó "Ninguna venta
// reclamada" cuando en realidad el CSV no traía ninguna columna de estado. Sonaba a
// respuesta. Ahora, si hubo ventas y ninguna trajo estado, se devuelven las columnas que
// el CSV sí trajo, y eso es con lo que se arregla.
const accion = readFileSync(
  new URL("../app/(protegido)/finanzas/sii/acciones.ts", import.meta.url),
  "utf8",
);
assert.ok(accion.includes("alLeerCsv"), "la acción pide las columnas del CSV que se bajó");
assert.ok(
  /sinEstado[\s\S]{0,300}columnasVenta/.test(accion),
  "y las devuelve solo cuando ninguna venta trajo estado",
);
const boton = readFileSync(
  new URL("../components/finanzas/BotonSincronizarSii.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  boton.includes("columnasVenta") && /no trajo el estado de ninguna venta/.test(boton),
  "y el botón lo dice con esas palabras en vez de 'ninguna venta reclamada'",
);

console.log("Todas las verificaciones pasaron.");
