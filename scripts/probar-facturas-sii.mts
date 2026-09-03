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
import {
  ESTADOS_FACTURA,
  hayColumnaDeEstadoDeVenta,
  parsearCsvRcv,
  planDeLectura,
  type FacturaSii,
} from "../lib/sii-rcv";

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

// ── La cabecera REAL del CSV de ventas ─────────────────────────────────────
//
// Estos son los 43 nombres de columna que el SII entregó el 3 de septiembre de 2026,
// leídos de finanzas_sii_ejecuciones.diagnostico. Están acá porque son la única cosa de
// todo esto que no se puede deducir: dos versiones del scraper derivaron el estado de
// nombres inventados —"Fecha Reclamado" cuando el SII dice "Fecha Reclamo"— y ninguna
// prueba lo podía notar. Si el SII cambia una columna, esto falla y se ve por qué.
const CABECERA_VENTA_REAL =
  "Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Fecha Recepcion;" +
  "Fecha Acuse Recibo;Fecha Reclamo;Monto Exento;Monto Neto;Monto IVA;Monto total;" +
  "IVA Retenido Total;IVA Retenido Parcial;IVA no retenido;IVA propio;IVA Terceros;" +
  "RUT Emisor Liquid. Factura;Neto Comision Liquid. Factura;Exento Comision Liquid. Factura;" +
  "IVA Comision Liquid. Factura;IVA fuera de plazo;Tipo Docto. Referencia;" +
  "Folio Docto. Referencia;Num. Ident. Receptor Extranjero;Nacionalidad Receptor Extranjero;" +
  "Credito empresa constructora;Impto. Zona Franca (Ley 18211);Garantia Dep. Envases;" +
  "Indicador Venta sin Costo;Indicador Servicio Periodico;Monto No facturable;" +
  "Total Monto Periodo;Venta Pasajes Transporte Nacional;Venta Pasajes Transporte Internacional;" +
  "Numero Interno;Codigo Sucursal;NCE o NDE sobre Fact. de Compra;Codigo Otro Imp.;" +
  "Valor Otro Imp.;Tasa Otro Imp.";

const columnasReales = CABECERA_VENTA_REAL.split(";");
assert.ok(
  hayColumnaDeEstadoDeVenta(columnasReales),
  "la cabecera real del SII trae de dónde derivar el estado: si esto falla, el panel no " +
    "puede saber si una venta está reclamada",
);
assert.ok(
  !hayColumnaDeEstadoDeVenta(["Nro", "Tipo Doc", "Folio", "Monto total"]),
  "y una cabecera sin esas columnas se reconoce como ciega: es la diferencia entre " +
    "'ninguna reclamada' y 'este CSV no lo dice'",
);

// El reclamo se lee de esa cabecera, en su posición real (la 10ª columna) y por el mismo
// parser que usa el scraper. No de un nombre parecido.
const filaReal: string[] = Array(columnasReales.length).fill("");
const enColumna = (nombre: string, valor: string) => {
  const i = columnasReales.indexOf(nombre);
  assert.notEqual(i, -1, `la cabecera real no tiene "${nombre}"`);
  filaReal[i] = valor;
};
enColumna("Tipo Doc", "33");
enColumna("Folio", "198");
enColumna("Rut cliente", "76929210-1");
enColumna("Fecha Docto", "12/08/2026");
enColumna("Monto total", "42358564");
enColumna("Fecha Reclamo", "14/08/2026");
const desdeElReal = parsearCsvRcv(
  `${CABECERA_VENTA_REAL}\n${filaReal.join(";")}`,
  "venta",
  "registro",
  "202608",
);
assert.equal(desdeElReal.length, 1);
assert.equal(desdeElReal[0].estado, "reclamado", "con la cabecera real, un reclamo se lee");
assert.equal(desdeElReal[0].fechaReclamo, "2026-08-14");
assert.equal(desdeElReal[0].montoTotal, 42_358_564);

// El evento del receptor NO viene en el CSV de ventas —la cabecera real no lo trae— pero
// se sigue leyendo por si aparece. Viene como
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

// ── Qué se lee y qué de eso se guarda ──────────────────────────────────────
//
// Acá estuvo el error que hizo que releer un mes viejo no sirviera para nada, y que se
// tardó días en ver: los períodos pedidos a mano se leían completos, pero al final se
// filtraba TODO por la ventana de 15 días, así que releer julio guardaba cero filas de
// julio. No se notó porque el botón arrancaba en el mes en curso, cuyas facturas caen
// dentro de la ventana y pasan el filtro.
//
// La prueba que había era un regex sobre el archivo, y daba por buena la guarda del
// conjunto de períodos —que sí estaba— en vez del filtro, que era el que faltaba. Ahora
// la decisión es una función pura y se prueba por lo que hace.
const cron = readFileSync(new URL("../app/api/cron/finanzas-sii/route.ts", import.meta.url), "utf8");
const HOY = new Date("2026-09-03T12:00:00Z");

// Releer períodos a mano: completos, sin filtro. Es lo único que puede actualizar el
// estado de algo más viejo que la ventana.
const relectura = planDeLectura({ cargaInicial: false, periodos: ["2026-07", "2026-08"] }, HOY);
assert.deepEqual(relectura.periodos, ["2026-07", "2026-08"]);
assert.equal(
  relectura.desde,
  null,
  "una relectura NO filtra por día: filtrarla la vacía, que es exactamente lo que pasaba " +
    "—releer julio guardaba cero filas de julio y el panel seguía mostrando el dato viejo—",
);

// La corrida diaria: mes en curso más el anterior si la ventana cruza el límite de mes,
// guardando solo la ventana. El 3 de septiembre, 15 días atrás es el 19 de agosto.
const diaria = planDeLectura({ cargaInicial: false, ventanaDias: 15 }, HOY);
assert.deepEqual(diaria.periodos, ["2026-08", "2026-09"], "cruza el límite de mes y lee los dos");
assert.equal(diaria.desde, "2026-08-19");

// La ventana tiene que cubrir el plazo de reclamo: 8 días corridos. Con los 7 que había,
// un reclamo del octavo día caía afuera y el estado quedaba viejo para siempre.
const porOmision = planDeLectura({ cargaInicial: false }, HOY);
assert.ok(porOmision.desde);
const dias = Math.round(
  (HOY.getTime() - new Date(`${porOmision.desde}T12:00:00Z`).getTime()) / 86_400_000,
);
assert.ok(dias >= 15, `la ventana por omisión es de ${dias} días y hacen falta al menos 15`);
assert.ok(
  /ventanaDias: (1[5-9]|[2-9]\d)/.test(cron),
  "y el cron pide esa ventana explícitamente, no la que venga por omisión",
);

// La carga inicial: el mes en curso, completo.
const inicial = planDeLectura({ cargaInicial: true }, HOY);
assert.deepEqual(inicial.periodos, ["2026-09"]);
assert.equal(inicial.desde, null);

// Un período mal escrito no se lee como si fuera válido.
assert.deepEqual(
  planDeLectura({ cargaInicial: false, periodos: ["agosto", "2026-8"] }, HOY).periodos,
  ["2026-08", "2026-09"],
  "un período inválido se descarta y se cae a la corrida diaria, no se lee cualquier cosa",
);

// Y los meses se leen del más viejo al más nuevo: si el tope de tiempo corta el
// recorrido, lo que queda al día es lo que la corrida diaria no vuelve a mirar nunca.
const varios = planDeLectura(
  { cargaInicial: false, periodos: ["2026-09", "2026-06", "2026-08"] },
  HOY,
);
assert.deepEqual(varios.periodos, ["2026-06", "2026-08", "2026-09"]);

assert.ok(
  cron.includes('searchParams.get("meses")') && cron.includes('searchParams.get("periodos")'),
  "el cron acepta pedirlo a mano, que es lo que arregla el historial ya guardado",
);

// Varios meses van en UNA llamada, con un solo navegador: uno por mes agota la instancia
// de Vercel —"ERR_INSUFFICIENT_RESOURCES" a partir del tercer Chromium— y los meses que
// importaban nunca se leyeron. Y se guarda mes por mes, para que el tope de tiempo en el
// último no se lleve los anteriores.
assert.ok(
  /alTerminarPeriodo/.test(scraper),
  "el scraper entrega cada período al terminarlo, para poder guardarlo ahí mismo",
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

// La plantilla es la que pidió Finanzas: un correo formal que se puede reenviar al
// cliente. Asunto fijo, sin folio ni monto —el folio en el asunto no le aporta a quien lo
// recibe reenviado— y el cuerpo con los datos del documento en bloque.
const una = avisoDeReclamos([reclamada({})]);
assert.ok(una);
assert.equal(una.asunto, "Notificación de rechazo de factura");
assert.ok(
  una.cuerpo.startsWith(
    "Se ha registrado un rechazo de factura correspondiente a Performance Technologies SpA.",
  ),
  "el primer párrafo nombra a la empresa que emitió: el correo se lee fuera de contexto",
);
assert.ok(una.cuerpo.includes("Los datos del documento son los siguientes:"));
assert.ok(una.cuerpo.includes("Factura N° 198"));
for (const dato of ["76.929.210-1", "2026-08-14", "$42.358.564", "202608", "SALFA SA"]) {
  assert.ok(una.cuerpo.includes(dato), `el detalle incluye ${dato}`);
}
assert.ok(
  una.cuerpo.includes(
    "Agradecemos revisar los antecedentes y gestionar la regularización del documento a la brevedad.",
  ),
  "y dice qué hacer: el aviso sirve para actuar, no para enterarse",
);
assert.ok(
  una.cuerpo.trimEnd().endsWith("Este es un mensaje automático. Por favor, no responder a este correo."),
  "cierra avisando que es automático: el remitente es un buzón de persona y una respuesta " +
    "se perdería ahí",
);

// El bloque de datos, tal cual, con la sangría de dos espacios y las etiquetas alineadas.
// Se compara completo porque es una plantilla acordada: si alguien mueve una etiqueta o
// cambia una sangría, el correo deja de verse como el que se aprobó.
assert.ok(
  una.cuerpo.includes(
    [
      "Factura N° 198",
      "  Cliente:      SALFA SA · 76.929.210-1",
      "  Emitida:      2026-08-12",
      "  Reclamo:      2026-08-14",
      "  Monto total:  $42.358.564",
      "  Neto / IVA:   $35.595.432 / $6.763.132",
      "  Período RCV:  202608",
    ].join("\n"),
  ),
  "el bloque de datos sale con el formato acordado, etiqueta por etiqueta",
);

// Con varias, todo en plural y el total en el primer párrafo: nueve rechazos sin el total
// obligan a sumar a mano, y es el número por el que se pregunta primero.
const varias = avisoDeReclamos([
  reclamada({}),
  reclamada({ folio: 201, razonSocial: "Minera Las Cenizas S.A.", montoTotal: 11_394_250 }),
]);
assert.ok(varias);
assert.equal(varias.asunto, "Notificación de rechazo de facturas");
assert.ok(
  varias.cuerpo.startsWith(
    "Se han registrado 2 rechazos de facturas correspondientes a Performance Technologies SpA, " +
      "por un total de $53.752.814.",
  ),
);
assert.ok(varias.cuerpo.includes("Los datos de los documentos son los siguientes:"));
assert.ok(varias.cuerpo.includes("198") && varias.cuerpo.includes("201"), "y las dos en el detalle");
assert.ok(varias.cuerpo.includes("de los documentos a la brevedad"));

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
  cron.includes("avisarReclamos"),
  "el aviso va a Finanzas, que es quien emite la nota de crédito",
);
assert.ok(
  enOrden(cuerpoCron, "guardarFacturasSii", "avisarReclamos"),
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
  accion.includes("alMirarVenta") && cron.includes("alMirarVenta"),
  "y también mira qué muestra la pestaña VENTA: si el CSV no trae el estado, la pregunta " +
    "siguiente es si la pantalla sí lo trae, y eso no se puede deducir desde afuera",
);
assert.ok(
  accion.includes("alVerJson") && cron.includes("alVerJson"),
  "y los campos del JSON que llena la tabla: el CSV es una exportación de esa tabla y " +
    "puede traer menos columnas de las que la API devuelve",
);
// El diagnóstico no puede filtrar datos: son nombres de campo y rótulos, nunca valores.
assert.ok(
  /Object\.keys\(primero\)/.test(scraper) && !/Object\.values\(primero\)/.test(scraper),
  "del JSON se guardan las CLAVES del primer objeto, no sus valores: nada de montos, " +
    "RUTs ni folios en la tabla de ejecuciones",
);
// El diagnóstico va a la BASE, no a un log: un log de Vercel se rota y no se puede
// consultar. Y va solo cuando ninguna venta trajo estado, para que la tabla no se llene
// de nombres de columna los días que todo funciona.
for (const [donde, fuente] of [["la acción", accion], ["el cron", cron]] as const) {
  assert.ok(
    /sinEstado\s*\?\s*\{[\s\S]{0,200}csvVenta/.test(fuente),
    `${donde} guarda el diagnóstico cuando el CSV no trae de dónde derivar el estado`,
  );
  // Por FALTA DE COLUMNA, no por falta de reclamos. La primera versión disparaba la
  // alarma cuando ninguna venta traía estado, y septiembre —una sola venta, sin reclamo—
  // hizo que informara "el SII no dijo nada" con las columnas ahí. Alarma al revés.
  assert.ok(
    /!hayColumnaDeEstadoDeVenta\(csvVenta\)/.test(fuente),
    `${donde} decide eso mirando las columnas, no si hay reclamos: un mes sin reclamos ` +
      "es una respuesta, no una anomalía",
  );
}
const finanzasLib = readFileSync(new URL("../lib/finanzas.ts", import.meta.url), "utf8");
assert.ok(
  /registrarEjecucion\([\s\S]{0,1600}diagnostico\?: unknown/.test(finanzasLib) &&
    finanzasLib.includes("diagnostico: extras.diagnostico ?? null"),
  "y registrarEjecucion lo escribe en finanzas_sii_ejecuciones.diagnostico",
);
assert.ok(
  finanzasLib.includes("aviso_reclamos: extras.aviso ?? null"),
  "y la constancia del aviso, en la columna aviso_reclamos de la misma fila",
);
// Los dos extras van en UN objeto: como cuarto y quinto argumento opcionales del mismo
// tipo se pasaron mal —el diagnóstico viajó en el lugar del aviso— y el compilador no
// tenía cómo notarlo.
assert.ok(
  /extras: \{/.test(finanzasLib),
  "los extras van en un objeto con nombre, no como dos argumentos opcionales seguidos",
);
assert.ok(
  /sinEstado[\s\S]{0,300}columnasVenta/.test(accion),
  "y las devuelve solo cuando ninguna venta trajo estado",
);
const boton = readFileSync(
  new URL("../components/finanzas/BotonSincronizarSii.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  boton.includes("columnasVenta") && /ninguna columna de acuse ni de reclamo/.test(boton),
  "y el botón lo dice con esas palabras en vez de 'ninguna venta reclamada'",
);
// Lo que hizo perder dos días: el selector arranca en el mes en curso, que es el único
// que la corrida diaria ya cubre. Se apretó tres veces sobre septiembre —una venta, sin
// reclamo— mientras los folios reclamados de julio no se leían desde antes de que el
// panel supiera derivar el estado.
assert.ok(
  /Poner al día/.test(boton),
  "hay una forma de poner al día los meses anteriores: sin eso el historial nunca se " +
    "actualiza, porque la corrida diaria filtra a los últimos 15 días",
);
// Y los meses van en UNA sola llamada, no una por mes: el bucle en el cliente abría un
// Chromium por mes y a partir del tercero la instancia se quedaba sin recursos, así que
// junio, julio y agosto —los que importaban— nunca se leyeron. El orden lo pone el
// servidor (planDeLectura, probado arriba).
assert.ok(
  /sincronizarSiiAction\(cuales\)/.test(boton) && !/for \(.*of cuales/.test(boton),
  "el cliente pide todos los meses de una vez: un Chromium por mes agota la instancia",
);
assert.ok(
  /ventas \(le[íi]da/.test(boton) || /ventas\b[^\n]*le[íi]da/.test(boton),
  "y el resultado dice CUÁNTAS ventas se miraron: 'ninguna reclamada' sobre una sola " +
    "venta del mes en curso parecía una respuesta y no lo era",
);

// ── Un fallo del SII tiene que poder LEERSE en pantalla ────────────────────
//
// Una Server Action que lanza llega al navegador como "An error occurred in the Server
// Components render", sin el motivo. Pasó dos veces: la primera era el Chromium sin
// declarar en el tracing, la segunda el navegador que se muere cuando la instancia ya
// lanzó dos ("Target page, context or browser has been closed"). En los dos casos el
// mensaje real hubo que ir a buscarlo a finanzas_sii_ejecuciones. Que el SII falle es un
// resultado esperable de esto, así que viaja como dato.
// Desde el try en adelante: el guard de permisos SÍ lanza a propósito —falla cerrado y
// ruidoso, y nadie puede confundirlo con un resultado— pero de ahí para abajo, donde
// todo lo que falla es el SII, no queda ni un throw.
// Solo el cuerpo de sincronizarSiiAction, desde su try: los guards de permisos SÍ lanzan
// a propósito —fallan cerrado y ruidoso, y nadie puede confundirlos con un resultado— y
// hay uno por acción.
const cuerpoAccion = accion.slice(
  accion.indexOf("  try {", accion.indexOf("export async function sincronizarSiiAction")),
  accion.indexOf("export interface ResultadoReenvio"),
);
assert.ok(
  !/\bthrow\b/.test(cuerpoAccion),
  "la acción no lanza por un fallo del SII: devuelve { ok: false, error } para que el " +
    "motivo se vea en pantalla y no haya que ir a buscarlo a la base",
);
assert.ok(
  /ok:\s*false[\s\S]{0,80}error: mensaje/.test(cuerpoAccion),
  "y el mensaje que devuelve es el que dio el SII o Playwright, no uno genérico",
);
assert.ok(
  /registrarEjecucion\(false, 0, mensaje\)/.test(cuerpoAccion),
  "sin dejar de guardarlo en la base: en pantalla se lee ahora, en la base queda después",
);

// Y lo que se cortó por tiempo no se pierde ni se calla: cada mes se guarda al leerlo, y
// el resultado dice cuántos se alcanzaron.
assert.ok(
  /alTerminarPeriodo: async \(periodo, filas\)/.test(accion) &&
    /leidos\.push\(periodo\)/.test(accion),
  "la acción guarda cada mes al terminarlo y anota cuáles: un tope de tiempo en el " +
    "último no puede llevarse los anteriores",
);
assert.ok(
  /reclamosNuevosDeVenta[\s\S]{0,120}guardarFacturasSii/.test(accion),
  "y dentro de cada mes detecta los reclamos ANTES de guardar, igual que el cron",
);
assert.ok(
  /r\.leidos\.length/.test(boton),
  "y el botón dice cuántos meses se leyeron de los pedidos, no solo si salió bien",
);

// ── Reclamada y rechazada son lo mismo, y las dos avisan ───────────────────
//
// En el SII el rechazo del receptor es uno de los tres reclamos (RCD al contenido, RFP y
// RFT por falta de mercadería), no un estado aparte. Se pidió explícitamente que una
// factura rechazada se trate igual que una reclamada, así que se prueba la cadena
// completa: el evento se lee, el estado queda en reclamado, y el aviso lo nombra.
assert.equal(unaVenta({ "Evento Receptor": "RCD" }).estado, "reclamado", "rechazo = reclamo");
assert.equal(
  unaVenta({ "Evento Receptor": "Rechazado por el receptor" }).estado,
  "reclamado",
  "y si el SII lo escribe con la palabra rechazo, también",
);
// Que un rechazo cae en ese estado tiene que decirse en alguna parte. En la tabla, con
// una palabra y el resto en el tooltip: "Reclamada/rechazada" partía la pastilla en dos
// líneas, estiraba la fila y apretaba la columna de RUT hasta cortar el dígito
// verificador. En el detalle, donde es una lista de etiqueta y valor, caben las dos.
const panel = readFileSync(new URL("../components/finanzas/PanelFinanzas.tsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../components/finanzas/ModalFactura.tsx", import.meta.url), "utf8");
assert.ok(
  /reclamado: "Reclamada"/.test(panel),
  "la pastilla de la tabla dice una sola palabra: dos partían la fila en dos líneas",
);
assert.ok(
  /TITULO_ESTADO[\s\S]{0,700}rechazada/.test(panel),
  "y el tooltip explica que un rechazo cuenta acá, que es lo que la etiqueta corta se deja",
);
assert.ok(
  /title=\{TITULO_ESTADO\[f\.estado\]\}/.test(panel),
  "el tooltip está puesto en la pastilla, no solo declarado",
);
// Que la pastilla no se corte y que el RUT tampoco se MIDE en un navegador con el CSS
// real: npm run probar-tabla. Acá solo se comprueba que el panel use esas clases y no una
// copia suelta, que es lo que la otra prueba puede medir.
assert.ok(
  /PASTILLA_ESTADO\} \$\{CLASES_ESTADO\[f\.estado\]\}/.test(panel),
  "la pastilla usa PASTILLA_ESTADO (lib/estilos.ts), que es lo que scripts/probar-tabla-facturas.mts mide",
);
assert.ok(
  /\$\{CELDA_SIN_CORTE\} text-tinta\/60`\}>\{f\.rut_contraparte\}/.test(panel),
  "y el RUT va en una celda que no se parte: partido en dos líneas no se puede leer ni copiar",
);
assert.ok(
  /reclamado: "Reclamada o rechazada"/.test(modal),
  "en el detalle, donde hay lugar, se dice completo",
);

// ── Los estados del código y los de la tabla ───────────────────────────────
//
// facturas_sii.estado tiene un CHECK con estos mismos valores, y los dos lados se
// desincronizaron: "aceptado" se agregó al código y no a la tabla, así que la
// sincronización murió con "violates check constraint facturas_sii_estado_check" en
// cuanto una venta trajo acuse de recibo —que es la mayoría—. Y como el error llegaba
// desde Postgres, no decía qué valor sobraba.
//
// La lista no se puede comparar contra la base desde una prueba, así que lo que se
// verifica es que haya UN solo lugar donde se dice, y que el error sepa explicarse.
assert.deepEqual(
  [...ESTADOS_FACTURA].sort(),
  ["aceptado", "no_incluir", "pendiente", "reclamado", "registro"],
  "si esta lista cambia, hace falta una migración del CHECK de facturas_sii.estado: " +
    "agregar uno solo en el código deja la sincronización cayéndose en producción",
);
assert.ok(
  finanzasLib.includes("estado: EstadoFactura"),
  "la fila de la tabla usa el mismo tipo, no una copia del union que se desincronice",
);
assert.ok(
  /facturas_sii_estado_check[\s\S]{0,600}se intentó guardar/.test(finanzasLib) &&
    /falta la migración del CHECK/.test(finanzasLib),
  "y cuando el CHECK rechaza algo, el error dice qué estados se intentaron guardar y si " +
    "el que falta es la migración: Postgres solo dice el nombre de la restricción",
);

// ── Que lo guardado se VEA ──────────────────────────────────────────────────
//
// Se leyeron cuatro meses, se detectaron 9 ventas reclamadas, salió el correo… y la tabla
// seguía mostrando "Registro" en todas. El dato estaba en la base: lo que faltaba era
// volver a pedirlo. revalidatePath invalida la caché del servidor, pero la tabla la
// dibuja un componente que ya tenía sus props.
assert.ok(
  /router\.refresh\(\)/.test(boton),
  "después de releer, la pantalla vuelve a pedir las facturas: sin esto se lee '9 ventas " +
    "reclamadas' al lado de una tabla que dice 'Registro' en todas",
);

// Y el tope de la consulta no puede recortar en silencio: estaba en 300, la tabla llegó a
// 303 al poner al día cuatro meses, y tres filas desaparecieron del panel —y de los
// totales del encabezado— sin que nada lo dijera.
const tope = /listarFacturasSii\(limite = (\d+)\)/.exec(finanzasLib);
assert.ok(tope, "no se encontró el tope de listarFacturasSii");
assert.ok(
  Number(tope[1]) >= 2000,
  `el tope es ${tope[1]} y la tabla ya tiene más de 300 filas: un tope chico recorta las ` +
    "facturas más viejas, que son justo las que hay que ir a mirar",
);
assert.ok(
  /filas\.length === limite[\s\S]{0,300}console\.warn/.test(finanzasLib),
  "y si algún día se llega al tope, se avisa en vez de recortar callado",
);

// ── ¿Salió el correo? ───────────────────────────────────────────────────────
//
// No se podía contestar: el envío va por Graph, su fallo se atrapaba en un console.error
// que se pierde con los logs de Vercel, y la pantalla igual decía "avisadas por correo a
// Finanzas". Ahora queda constancia en la misma fila de la corrida.
const libAviso = readFileSync(new URL("../lib/finanzas-aviso.ts", import.meta.url), "utf8");
for (const [donde, fuente] of [["la acción", accion], ["el cron", cron]] as const) {
  assert.ok(
    fuente.includes("avisarReclamos"),
    `${donde} manda el aviso por el mismo camino: cada uno con el suyo eran dos ` +
      "comportamientos distintos según por dónde se pidió la relectura",
  );
  assert.ok(
    /aviso: envio \?\? undefined/.test(fuente),
    `${donde} guarda la constancia del envío en la fila de la corrida`,
  );
}
assert.ok(
  /enviado: true/.test(libAviso) && /enviado: false, error: detalle/.test(libAviso),
  "la constancia dice si salió y, si no, por qué",
);
assert.ok(
  /enviarCorreoSoporte/.test(libAviso),
  "y un aviso que no sale se le avisa a soporte, que es quien puede hacer algo: un " +
    "reclamo de decenas de millones que nadie ve porque Graph devolvió 401 es justo lo " +
    "que este correo existe para evitar",
);
assert.ok(
  !/cuerpo:/.test(libAviso.slice(libAviso.indexOf("ConstanciaDeAviso"), libAviso.indexOf("export async function"))),
  "la constancia NO guarda el cuerpo: trae montos y razones sociales que ya están en la " +
    "tabla y en el correo",
);
assert.ok(
  /avisoEnviado/.test(boton) && /NO SALIÓ/.test(boton),
  "y la pantalla dice si el correo salió en vez de afirmarlo siempre",
);

// ── Un aviso que no salió se tiene que poder reintentar ────────────────────
//
// El aviso automático manda solo los reclamos NUEVOS —comparados contra lo guardado— y
// eso es lo correcto: el reclamo se queda en el RCV hasta que el cliente lo revierta, así
// que avisar lo viejo en cada corrida termina en que nadie abre el correo. Pero significa
// que un envío fallido no se puede reintentar releyendo: ya no hay nada nuevo. Pasó, con
// nueve facturas por $121 millones que la pantalla dio por avisadas.
assert.ok(
  finanzasLib.includes("export async function ventasReclamadas"),
  "hay una forma de leer las reclamadas YA guardadas, sin comparar contra nada",
);
assert.ok(
  /estado", "reclamado"/.test(finanzasLib) && !/yaReclamadas/.test(
    finanzasLib.slice(
      finanzasLib.indexOf("export async function ventasReclamadas"),
      finanzasLib.indexOf("export async function registrarEjecucion"),
    ),
  ),
  "y no filtra por 'nuevo': si lo hiciera, tendría el mismo problema que quiere resolver",
);
assert.ok(
  /Number\(valor\)/.test(finanzasLib),
  "los montos pasan por Number(): PostgREST puede devolver un numeric como string, y " +
    "`suma + \"42358564\"` concatena en vez de sumar — el total del correo saldría con " +
    "veinte dígitos",
);
assert.ok(
  accion.includes("export async function reenviarAvisoReclamosAction"),
  "y hay una acción para reenviarlo a mano",
);
assert.ok(
  /registrarEjecucion\(true, 0, undefined, \{ aviso: envio \}\)/.test(accion),
  "el reenvío también deja constancia, con 0 documentos: no leyó el SII, solo avisó",
);
assert.ok(
  /window\.confirm/.test(boton) && /Reenviar aviso a Finanzas/.test(boton),
  "con confirmación, porque manda un correo de verdad a Finanzas",
);

// ── Y que la falta de configuración se lea ─────────────────────────────────
//
// El envío no funcionaba porque MS_TENANT_ID nunca se cargó en Vercel. Lo que se veía en
// pantalla era el mensaje del SDK de Azure: "ClientSecretCredential: tenantId is a
// required parameter" más un link a su troubleshooting — que no dice de qué variable
// habla ni en qué proyecto.
const notif = readFileSync(new URL("../lib/notificaciones.ts", import.meta.url), "utf8");
assert.ok(
  /falta el tenant de Microsoft en el entorno/.test(notif) &&
    /falta MS_CLIENT_SECRET en el entorno/.test(notif),
  "si falta la configuración del correo, el error dice QUÉ variable falta y dónde",
);
// El tenant es UN valor con tres nombres, y así se llegó a que uno esté vacío mientras
// los otros dos funcionan.
assert.ok(
  /MS_TENANT_ID \|\| process\.env\.AZURE_TENANT_ID/.test(notif) &&
    /login\\.microsoftonline\\.com/.test(notif),
  "el tenant se cae a AZURE_TENANT_ID y al del issuer: es el mismo GUID en los tres",
);
assert.ok(
  /MS_CLIENT_ID \|\| CLIENT_ID_CORREO/.test(notif),
  "y el client id tiene predeterminado, así que lo único que hay que cargar es el secreto",
);

// El error de ESA pantalla: en Entra, "Secret ID" y "Value" son dos columnas pegadas de
// la misma fila, y el ID es el que queda a mano. Se cargó el ID y Azure contestó un
// AADSTS7000215 con dos Trace ID y un Correlation ID adentro.
assert.ok(
  /FORMA_DE_GUID\.test\(secreto\.trim\(\)\)/.test(notif) && /Secret ID/.test(notif),
  "si lo cargado tiene forma de GUID se avisa que es el Secret ID y no el Value, antes " +
    "de llamar a Azure",
);
// El VALOR nunca se interpola en ningún mensaje. Su largo sí —es lo que distingue un
// secreto cortado de uno equivocado— y con el largo no se reconstruye nada.
assert.ok(
  !/\$\{secreto\}|\$\{secreto\.trim\(\)\}|\$\{secreto\.slice|secreto\.substring/.test(notif),
  "el valor del secreto NUNCA va en un mensaje de error ni en un log: solo su forma",
);
assert.ok(
  /secreto\.trim\(\),/.test(notif),
  "el secreto se recorta: un espacio o un salto de línea pegado de más da el mismo " +
    "'Invalid client secret provided' sin insinuarlo",
);

// "Invalid client secret provided" no distingue tres cosas que se arreglan distinto: que
// el valor sea otro, que esté incompleto (la pantalla de Entra lo muestra truncado con
// puntos suspensivos), o que sea el correcto pero no haya llegado a ESTE deployment —en
// Vercel las variables son una foto por deployment, así que guardarla no alcanza si no se
// vuelve a desplegar después—. El largo del valor cargado las separa.
assert.ok(
  /7000215\|invalid_client/.test(notif) && /formaDelSecreto\(\)/.test(notif),
  "cuando Azure rechaza el secreto, el error dice qué forma tiene el valor cargado",
);
assert.ok(
  /\$\{secreto\.length\}|secreto\.length\}/.test(notif) && /includes\("~"\)/.test(notif),
  "la forma es el largo y si trae «~»: con 28 caracteres y sin «~» el diagnóstico es " +
    "inmediato, y con eso no se reconstruye nada",
);
assert.ok(
  /TERMINA EN PUNTOS SUSPENSIVOS/.test(notif),
  "y si alguien pegó los puntos suspensivos de la pantalla, se dice explícitamente",
);
// La forma se reconoce de verdad, no solo está escrita en el archivo.
const formaDeGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
assert.ok(formaDeGuid.test("1589ee12-f844-4980-9529-9516d4043900"), "un Secret ID es un GUID");
assert.ok(!formaDeGuid.test("abc8Q~Xk2lM.pQr_sTu-vWxYz1234567890AB"), "un Value no lo es");
// El destinatario sigue sin poder venir de afuera: es lo único de este archivo que no se
// relaja, pase lo que pase con la configuración —ni cuando uno de los usos es una prueba—.
assert.ok(
  /export const CORREO_FINANZAS = "finanzas@pertec\.cl"/.test(notif) &&
    /const CORREO_SOPORTE = "soporte@pertec\.cl"/.test(notif) &&
    /export const CORREO_PRUEBA = "[^"]+"/.test(notif),
  "los TRES destinatarios son constantes de este archivo, no parámetros de nadie",
);
// enviar() recibe el destinatario como parámetro, pero es PRIVADA: no se exporta, y las
// tres funciones que la llaman le pasan su constante. Lo que se comprueba es eso —que
// nadie de afuera pueda elegir a quién— y no cómo la llaman: el primer argumento de las
// tres públicas es el ASUNTO, así que buscar un string ahí acusaba a cualquiera.
assert.ok(
  /^async function enviar\(/m.test(notif) && !/export async function enviar\(/.test(notif),
  "enviar(destinatario, …) es privada de lib/notificaciones.ts",
);
for (const publica of ["enviarCorreoSoporte", "enviarCorreoFinanzas", "enviarCorreoDePrueba"]) {
  const firma = new RegExp(
    `export async function ${publica}\\(asunto: string, cuerpoTexto: string\\)`,
  );
  assert.ok(firma.test(notif), `${publica} no recibe destinatario: solo asunto y cuerpo`);
}
const acciones = readFileSync(
  new URL("../app/(protegido)/finanzas/sii/acciones.ts", import.meta.url),
  "utf8",
);

// La prueba manda el MISMO aviso que recibiría Finanzas, armado por la misma función. Si
// tuviera su propio texto, aprobaría una plantilla y Finanzas recibiría otra.
assert.ok(
  /avisoDeReclamos\(reclamos\)/.test(libAviso.slice(libAviso.indexOf("avisarDePrueba"))),
  "el envío de prueba usa avisoDeReclamos, no un texto de ejemplo",
);
assert.ok(
  !/registrarEjecucion/.test(acciones.slice(acciones.indexOf("export async function probarAvisoAction"))),
  "y no deja constancia como corrida: una prueba anotada así ensucia el registro que se " +
    "usa para saber si el aviso real salió",
);
assert.ok(
  !/enviarCorreoSoporte/.test(libAviso.slice(libAviso.indexOf("avisarDePrueba"))),
  "ni le avisa a soporte si falla: una prueba que no sale es una prueba, no un incidente",
);

console.log("Todas las verificaciones pasaron.");
