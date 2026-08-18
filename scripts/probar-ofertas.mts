/**
 * Los controles de una oferta técnica, con los errores que de verdad traen los
 * borradores.
 *
 * Correr con:  npm run probar-ofertas
 */

import assert from "node:assert/strict";
import { calcularTotales, detectarInconsistencias, mismoNumeroDeOferta } from "../lib/ofertas/verificar";
import type { OfertaCanonica } from "../lib/ofertas/tipos";

/** La OS 010-2026 real, bien transcrita. */
function os10(): OfertaCanonica {
  return {
    titulo: "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7",
    identificacion: {
      numeroOferta: "OS 010-2026",
      fecha: "11 de agosto de 2026",
      validez: "31 de agosto de 2026",
      cliente: "AXINNTUS SERVICIOS INDUSTRIALES",
      atencion: "Sr. Alan Muñoz G.",
      copia: "Sres. Rodrigo Moraga / Alejandro Tapia",
      referencia: "Servicio de reemplazo de correa transportadora: traslado de rollos a CT-6 y CT-7.",
      faena: "Central Eléctrica Angamos — AES Andes",
    },
    alcance: {
      introduccion: "La oferta consiste en el traslado de 06 rollos nuevos.",
      actividades: ["Traslado de 06 rollos desde bodega", "Maniobras de izaje"],
      trabajosPrevios: ["Traslado de equipos móviles", "Posicionamiento de grúa"],
      personalEspecialista: [],
    },
    metodologia: null,
    especificaciones: null,
    organizacion: {
      cuadroPersonal: [
        { cargo: "Planificador logístico", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "Supervisor", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "APR", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "Rigger", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "Especialista vulcanizador", dotacion: 3, regimen: "Turno de día — 10 h" },
      ],
      responsabilidades: [{ cargo: "Supervisor", descripcion: "Dirige la maniobra." }],
      nota: "El servicio se ejecuta con una cuadrilla en 01 turno de trabajo.",
    },
    programa: {
      introduccion: "Duración total de 10 horas.",
      turnos: [{ turno: "T1", jornada: "Día 1 — día", horas: 10 }],
      nota: null,
    },
    precio: {
      lineas: [
        {
          cantidad: 1,
          cargo: "Traslado de rollos desde bodega a puntos de trabajo CT-6 y CT-7.",
          unidad: "Global",
          valorUnitario: 15_885_200,
          valorTotalImpreso: 15_885_200,
        },
      ],
      totalNetoImpreso: 15_885_200,
      nota: "Valores en pesos chilenos, netos.",
    },
    condicionesComerciales: ["La validez de esta oferta es de 21 días."],
    aportes: {
      pertec: ["Personal especializado para las maniobras"],
      cliente: ["Carretes de cinta nueva"],
    },
    cierre: {
      texto: "Quedamos a disposición.",
      firmantes: [
        { nombre: "Alfonso Hachim Fulgeri", cargo: "Gerente General", empresa: "Performance Technologies SpA" },
      ],
      cc: "CC: Gcia. Gral. / Archivo.",
    },
    anexo: { respaldoInstitucional: ["PERTEC es una empresa nacional…"], mandantes: ["Minera Franke"], notaEquipo: null },
    porConfirmar: [],
    omitidas: [{ seccion: "4 Especificaciones técnicas", motivo: "El servicio es un traslado, no un empalme." }],
  };
}

// ── Los totales los calcula el servidor ─────────────────────────────────────
const buena = os10();
const totales = calcularTotales(buena);
assert.equal(totales.dotacionTotal, 7, "7 personas en el cuadro de personal");
assert.equal(totales.horasPrograma, 10);
assert.equal(totales.cantidadTurnos, 1);
assert.equal(totales.totalNetoCalculado, 15_885_200);

// Un borrador bien transcrito no genera ruido: si una oferta correcta levantara
// avisos, nadie leería la lista.
const sinProblemas = detectarInconsistencias(buena, totales, "Propuesta Técnica_OS10.docx");
assert.deepEqual(sinProblemas, [], `una oferta correcta no debe reportar nada:\n${JSON.stringify(sinProblemas, null, 1)}`);

// El nombre del archivo casi nunca trae el año: "OS10" es el mismo que "OS 010-2026".
assert.ok(mismoNumeroDeOferta("OS 010-2026", "OS10"));
assert.ok(mismoNumeroDeOferta("OS 010-2026", "OS 010 – 2026"));
assert.ok(!mismoNumeroDeOferta("OS 010-2026", "OS 009-2026"));

// ── El borrador copiado al que le cambiaron el número a medias ──────────────
const numeroMezclado = os10();
numeroMezclado.titulo = "OS 009-2026 · Reemplazo de correas CT-6 y CT-7";
const p1 = detectarInconsistencias(numeroMezclado, calcularTotales(numeroMezclado), "OS10.docx");
assert.ok(
  p1.some((p) => p.tipo === "numero_oferta"),
  "el número del título que no coincide con la tabla tiene que detectarse",
);

// ── La suma que no da ───────────────────────────────────────────────────────
const totalMalo = os10();
totalMalo.precio!.totalNetoImpreso = 15_000_000;
const p2 = detectarInconsistencias(totalMalo, calcularTotales(totalMalo), "os10.docx");
const suma = p2.find((p) => p.tipo === "suma_precios");
assert.ok(suma, "un TOTAL NETO que no coincide con la suma de las líneas tiene que detectarse");
assert.ok(suma!.detalle.includes("885.200"), "el aviso tiene que decir la diferencia");
assert.equal(suma!.origen, "aritmetica");

// ── La línea cuyo total impreso no es cantidad × unitario ───────────────────
const lineaMala = os10();
lineaMala.precio!.lineas[0].valorTotalImpreso = 12_000_000;
const p3 = detectarInconsistencias(lineaMala, calcularTotales(lineaMala), "os10.docx");
assert.ok(p3.some((p) => p.tipo === "linea_precio"));

// ── Una celda de fórmula sin recalcular llega en 0 ──────────────────────────
const enCero = os10();
enCero.precio!.lineas[0].valorUnitario = 0;
enCero.precio!.lineas[0].valorTotalImpreso = null;
enCero.precio!.totalNetoImpreso = null;
const p4 = detectarInconsistencias(enCero, calcularTotales(enCero), "os10.xlsx");
assert.ok(
  p4.some((p) => p.tipo === "linea_precio" && p.detalle.includes("fórmula")),
  "un valor unitario en 0 tiene que explicar de dónde suele venir",
);

// ── Los dos cuadros de dotación que no coinciden ────────────────────────────
const dotacionMezclada = os10();
dotacionMezclada.alcance!.personalEspecialista = [{ cargo: "Especialista vulcanizador", dotacion: 9 }];
const p5 = detectarInconsistencias(dotacionMezclada, calcularTotales(dotacionMezclada), "os10.docx");
assert.ok(
  p5.some((p) => p.tipo === "dotacion" && p.detalle.includes("9") && p.detalle.includes("7")),
  "los dos cuadros son el mismo dato contado dos veces y tienen que coincidir",
);

// ── Una sección heredada de otra oferta ─────────────────────────────────────
const heredada = os10();
heredada.organizacion!.responsabilidades.push({
  cargo: "Jefe de terreno",
  descripcion: "Coordina el frente de trabajo.",
});
const p6 = detectarInconsistencias(heredada, calcularTotales(heredada), "os10.docx");
assert.ok(
  p6.some((p) => p.tipo === "contenido_ajeno" && p.detalle.includes("Jefe de terreno")),
  "un cargo con responsabilidades que no está en el cuadro es rastro de copiar y pegar",
);

// ── Un aporte del cliente que nombra a otra empresa ─────────────────────────
const otroCliente = os10();
otroCliente.aportes!.cliente.push("Acreditación según los estándares de Codelco Chuquicamata");
const p7 = detectarInconsistencias(otroCliente, calcularTotales(otroCliente), "os10.docx");
assert.ok(
  p7.some((p) => p.tipo === "contenido_ajeno" && p.detalle.toLowerCase().includes("codelco")),
  "un aporte que nombra a otro mandante tiene que reportarse",
);

// ── Lo que el modelo no pudo leer llega como aviso de lectura ───────────────
const conDudas = os10();
conDudas.porConfirmar = ["La tabla de identificación no trae la validez de la oferta"];
const p8 = detectarInconsistencias(conDudas, calcularTotales(conDudas), "os10.docx");
assert.ok(p8.some((p) => p.origen === "lectura" && p.detalle.includes("validez")));

// ── Corregir un dato limpia su propio aviso ─────────────────────────────────
const corregida = os10();
corregida.titulo = "OS 009-2026 · otra cosa";
assert.ok(detectarInconsistencias(corregida, calcularTotales(corregida), "os10.docx").length > 0);
corregida.titulo = "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7";
assert.deepEqual(
  detectarInconsistencias(corregida, calcularTotales(corregida), "os10.docx"),
  [],
  "al corregir el dato, el aviso tiene que desaparecer solo",
);

console.log(`
Controles de una oferta técnica — OS 010-2026

  dotación total        ${totales.dotacionTotal} personas
  programa              ${totales.cantidadTurnos} turno · ${totales.horasPrograma} h
  total neto calculado  $${totales.totalNetoCalculado.toLocaleString("es-CL")}
  avisos en la correcta ${sinProblemas.length}

Detectados en los ocho borradores defectuosos: número mezclado, suma que no da,
línea mal multiplicada, celda sin recalcular, dotación doble, sección heredada,
aporte de otro mandante y dato sin confirmar.
`);
console.log("Todas las verificaciones pasaron.");
