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
import type { FacturaSii } from "../lib/sii-rcv";

// ── El estado de una venta se deriva de las fechas ──────────────────────────
//
// El parser no está exportado (es un detalle del scraper), así que la regla se comprueba
// sobre el archivo: es la única forma de verificar la derivación sin abrir el SII, y de
// que se note si alguien vuelve a fijar el estado a mano.
const scraper = readFileSync(new URL("../lib/sii-rcv.ts", import.meta.url), "utf8");

assert.ok(
  scraper.includes('idx("Fecha Acuse Recibo"') && scraper.includes('idx("Fecha Reclamado"'),
  "el CSV de ventas se lee buscando las columnas de acuse y de reclamo",
);
assert.ok(
  /tipoDocumento === "venta"[\s\S]{0,200}fechaReclamo[\s\S]{0,80}"reclamado"/.test(scraper),
  "y una venta con fecha de reclamo queda RECLAMADA, no en registro",
);
assert.ok(
  /fechaAcuse[\s\S]{0,60}"aceptado"/.test(scraper),
  "con acuse y sin reclamo queda aceptada: es distinto de que nadie la haya mirado",
);
// El reclamo tiene que ganarle al acuse: un documento acusado y después reclamado es un
// documento reclamado, y es el que hay que ir a mirar.
const ramaVenta = scraper.slice(scraper.indexOf('tipoDocumento === "venta"'));
assert.ok(
  ramaVenta.indexOf("fechaReclamo") !== -1 &&
    ramaVenta.indexOf("fechaReclamo") < ramaVenta.indexOf("fechaAcuse"),
  "el reclamo se evalúa antes que el acuse: manda el reclamo",
);

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

console.log("Todas las verificaciones pasaron.");
