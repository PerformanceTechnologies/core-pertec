/**
 * Prueba de la corrección de mano de obra al importar (caso OS 010-2026).
 *
 * La oferta tiene UNA sola línea global de $15.885.200 que dice "incluye Operador,
 * Supervisor, Asesor HSEC, Rigger", y un cuadro de personal de 7 personas en 1
 * turno de 10 h. Si esa línea entra como equipo traspasado, el total queda en
 * $17.820.991: la oferta más el costo de esas mismas personas otra vez.
 *
 * Correr con:  npx tsx scripts/probar-importacion.mts
 */

import assert from "node:assert/strict";
import { construirObra } from "../lib/cotizador/obra/importar-construir";
import type { PropuestaLeida } from "../lib/cotizador/obra/importar-tipos";
import type { LegalParameterSet } from "../lib/cotizador/motor/types";

const P: LegalParameterSet = {
  vigenteDesde: "2026-07-01",
  uf: 40855.33,
  utm: 71649,
  ingresoMinimo: 539000,
  topeImponibleAfpUF: 87.8,
  topeImponibleCesantiaUF: 131.9,
  tasaAfp: 0.1144,
  tasaSaludLegal: 0.07,
  tasaSisEmpleador: 0.0153,
  tasaCesantiaTrabIndefinido: 0.006,
  tasaCesantiaEmpIndefinido: 0.024,
  tasaCesantiaTrabPlazoFijo: 0,
  tasaCesantiaEmpPlazoFijo: 0.03,
  tasaMutualBase: 0.0348,
  aporteReformaPrevisionalEmp: 0.01,
  topeGratificacionImmAnual: 4.75,
  taxBrackets: [
    { tramoN: 1, desde: 0, hasta: 967262, factor: 0, rebaja: 0 },
    { tramoN: 2, desde: 967262, hasta: 2149470, factor: 0.04, rebaja: 38690 },
    { tramoN: 3, desde: 2149470, hasta: 3582450, factor: 0.08, rebaja: 124669 },
    { tramoN: 4, desde: 3582450, hasta: 5015430, factor: 0.135, rebaja: 321704 },
    { tramoN: 5, desde: 5015430, hasta: 6448410, factor: 0.23, rebaja: 798170 },
    { tramoN: 6, desde: 6448410, hasta: 8597880, factor: 0.304, rebaja: 1275352 },
    { tramoN: 7, desde: 8597880, hasta: 22211190, factor: 0.35, rebaja: 1670855 },
    { tramoN: 8, desde: 22211190, hasta: null, factor: 0.4, rebaja: 2781414 },
  ],
};

const TOTAL_OS10 = 15_885_200;

// Lo que el modelo transcribió, CON el error: la única línea marcada como equipo.
const OS10_MAL_MARCADA: PropuestaLeida = {
  numeroOferta: "OS 010-2026",
  fecha: "2026-08-11",
  cliente: "AXINNTUS SERVICIOS INDUSTRIALES",
  faena: "Central Eléctrica Angamos — AES Andes",
  descripcionServicio: "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7",
  turnos: { cantidad: 1, horas: 10 },
  dotacion: [
    { cargo: "Planificador logístico", personasPorTurno: 1, personasTotales: 1 },
    { cargo: "Supervisor", personasPorTurno: 1, personasTotales: 1 },
    { cargo: "APR", personasPorTurno: 1, personasTotales: 1 },
    { cargo: "Rigger", personasPorTurno: 1, personasTotales: 1 },
    { cargo: "Especialista vulcanizador", personasPorTurno: 3, personasTotales: 3 },
  ],
  trabajosPrevios: ["Traslado de equipos móviles al lugar de trabajo", "Posicionamiento de grúa"],
  lineasPrecio: [
    {
      descripcion:
        "Traslado de rollos desde bodega a puntos de trabajo CT-6 y CT-7. Incluye: 01 grúa de 30 ton y cama baja, incluye Operador, Supervisor, Asesor HSEC, Rigger, combustible y movilización.",
      unidad: "global",
      cantidad: 1,
      precioUnitario: TOTAL_OS10,
      categoria: "transporte",
      esManoDeObra: false,
    },
  ],
  totalNetoDeclarado: TOTAL_OS10,
  ilegibles: [],
};

const { obra, avisos, verificacion } = construirObra(OS10_MAL_MARCADA, [], P);

// La línea NO puede haber entrado como ítem: ahí estaba el doble conteo.
assert.equal(obra.items.length, 0, "la línea con la cuadrilla adentro no debe entrar como ítem");
assert.equal(obra.precioObjetivo, TOTAL_OS10, "el objetivo tiene que ser el total de la oferta");
assert.ok(
  avisos.some((a) => a.includes("ninguna línea del precio venía marcada como mano de obra")),
  "la corrección tiene que quedar avisada, no silenciosa",
);

// Y el total tiene que dar la oferta, no la oferta + la cuadrilla otra vez.
assert.equal(
  verificacion.totalCalculado,
  TOTAL_OS10,
  `el total calculado dio ${verificacion.totalCalculado} y tiene que dar ${TOTAL_OS10}`,
);
assert.equal(verificacion.diferencia, 0, "tiene que cuadrar exacto al importar");

// Cuadró, pero sin sueldos reales el divisor se va fuera de rango: eso tiene que
// quedar avisado, porque el total sirve y el desglose de costos no.
assert.ok(
  avisos.some((a) => a.includes("fuera de lo razonable")),
  "un divisor fuera de rango tiene que avisarse",
);

// Con la línea BIEN marcada por el modelo, el resultado tiene que ser idéntico:
// la corrección no puede cambiar nada cuando no hace falta.
const bienMarcada: PropuestaLeida = {
  ...OS10_MAL_MARCADA,
  lineasPrecio: [{ ...OS10_MAL_MARCADA.lineasPrecio[0], esManoDeObra: true }],
};
const correcta = construirObra(bienMarcada, [], P);
assert.equal(correcta.verificacion.totalCalculado, TOTAL_OS10);
assert.equal(correcta.obra.items.length, 0);
assert.ok(
  !correcta.avisos.some((a) => a.includes("venía marcada como mano de obra")),
  "sin error del modelo no debe avisar de una corrección que no hizo",
);

const clp = (n: number) => "$" + n.toLocaleString("es-CL");
console.log(`
Caso OS 010-2026 — una sola línea global con la cuadrilla adentro

  Total de la oferta        ${clp(TOTAL_OS10)}
  Ítems traspasados         ${obra.items.length}  (antes: 1, y de ahí el doble conteo)
  Total calculado           ${clp(verificacion.totalCalculado)}
  Diferencia                ${clp(verificacion.diferencia)}
  Divisor aplicado          ${verificacion.divisorAplicado.toFixed(4)}

Avisos:
${avisos.map((a) => "  · " + a).join("\n")}
`);
console.log("Todas las verificaciones pasaron.");
